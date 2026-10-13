import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { emitLifecycleAndWait } from '../app-lifecycle.mjs'
import { broadcastShellEvent } from '../shell/event-bus.mjs'
import { createKeychainSecrets, resolveKeychainHelperPath } from './keychain-secrets.mjs'

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function resolveUserData() {
  if (process.env.TASKWEAVER_USER_DATA) return path.resolve(process.env.TASKWEAVER_USER_DATA)
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'taskweaver-desktop')
  }
  return path.join(os.homedir(), '.config', 'taskweaver-desktop')
}

function resolveResourcesPath() {
  if (process.env.TASKWEAVER_RESOURCES_PATH) return process.env.TASKWEAVER_RESOURCES_PATH
  return null
}

const isPackaged = process.env.TASKWEAVER_PACKAGED === '1' || process.env.TASKWEAVER_PACKAGED === 'true'

class ShellWebContents extends EventEmitter {
  #destroyed = false

  constructor() {
    super()
  }

  send(channel, payload) {
    if (this.#destroyed) return
    broadcastShellEvent(channel, payload)
  }

  isDestroyed() {
    return this.#destroyed
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.emit('destroyed')
  }
}

class ShellBrowserWindow {
  constructor() {
    this.webContents = new ShellWebContents()
  }

  isDestroyed() {
    return this.webContents.isDestroyed()
  }

  static #windows = []

  static register(win) {
    ShellBrowserWindow.#windows.push(win)
  }

  static getAllWindows() {
    return ShellBrowserWindow.#windows.filter((w) => !w.isDestroyed())
  }

  static getFocusedWindow() {
    const live = ShellBrowserWindow.getAllWindows()
    return live[live.length - 1] ?? null
  }

  static fromWebContents() {
    return ShellBrowserWindow.getFocusedWindow()
  }
}

const mainWindow = new ShellBrowserWindow()
ShellBrowserWindow.register(mainWindow)

/** @type {Map<string, import('electron').IpcMainInvokeHandler>} */
const invokeHandlers = new Map()

/**
 * Minimal Electron-shaped adapters for compose-services + registerIpc.
 * Secrets use the native macOS Keychain helper; safeStorage remains unavailable.
 */
export function createShellPlatform({
  platformName = process.platform,
  openExternal: openExternalOverride,
  showMessageBox: showMessageBoxOverride,
} = {}) {
  const lifecycle = new EventEmitter()
  const app = {
    isPackaged,
    getName: () => 'TaskWeaver',
    getVersion: () => process.env.TASKWEAVER_APP_VERSION || '1.2.1',
    getAppPath: () => (isPackaged && resolveResourcesPath()
      ? path.join(resolveResourcesPath(), 'app')
      : repoRoot),
    getPath: (name) => {
      const userData = resolveUserData()
      switch (name) {
        case 'userData': return userData
        case 'documents': return path.join(os.homedir(), 'Documents')
        case 'home': return os.homedir()
        case 'temp': return os.tmpdir()
        default: return userData
      }
    },
    whenReady: () => Promise.resolve(),
    on: (event, listener) => { lifecycle.on(event, listener) },
    once: (event, listener) => { lifecycle.once(event, listener) },
    emitAndWait: (event, ...args) => emitLifecycleAndWait(lifecycle, event, ...args),
    quit: () => process.exit(0),
    requestSingleInstanceLock: () => true,
  }

  const ipcMain = {
    handle(channel, handler) {
      invokeHandlers.set(channel, handler)
    },
    on() {},
    removeHandler(channel) {
      invokeHandlers.delete(channel)
    },
  }

  function resolveDialogDirectory(defaultPath) {
    if (typeof defaultPath !== 'string' || !defaultPath) return os.homedir()
    try {
      return fs.statSync(defaultPath).isDirectory() ? defaultPath : path.dirname(defaultPath)
    } catch {
      return os.homedir()
    }
  }

  async function macChooseFolder(defaultPath) {
    const location = resolveDialogDirectory(defaultPath)
    const script = [
      'on run argv',
      '  set defaultPath to item 1 of argv as text',
      '  set folderLocation to (POSIX file defaultPath) as alias',
      '  return POSIX path of (choose folder with prompt "选择 TaskWeaver 工作区" default location folderLocation)',
      'end run',
    ].join('\n')
    try {
      const { stdout } = await execFileAsync('osascript', ['-e', script, location], {
        timeout: 0,
        maxBuffer: 1024 * 1024,
      })
      const picked = String(stdout ?? '').replace(/\r?\n$/, '')
      if (!picked) return { canceled: true, filePaths: [] }
      return { canceled: false, filePaths: [picked] }
    } catch {
      return { canceled: true, filePaths: [] }
    }
  }

  async function macChooseFiles(options = {}) {
    const defaultPath = resolveDialogDirectory(options.defaultPath)
    const extensions = [...new Set((Array.isArray(options.filters) ? options.filters : [])
      .flatMap((filter) => Array.isArray(filter?.extensions) ? filter.extensions : [])
      .map((extension) => String(extension).trim().replace(/^\./, ''))
      .filter((extension) => /^[A-Za-z0-9][A-Za-z0-9.+-]*$/.test(extension)))]
    const allowMultiple = Array.isArray(options.properties) && options.properties.includes('multiSelections')
    const script = [
      'on run argv',
      '  set dialogTitle to item 1 of argv as text',
      '  set startPath to item 2 of argv as text',
      '  set extensionText to item 3 of argv as text',
      '  set allowMultiple to (item 4 of argv as text) is "1"',
      '  set acceptedTypes to {}',
      '  if extensionText is not "" then set acceptedTypes to paragraphs of extensionText',
      '  set startLocation to (POSIX file startPath) as alias',
      '  if allowMultiple then',
      '    if (count of acceptedTypes) > 0 then',
      '      set selectedFiles to choose file with prompt dialogTitle default location startLocation of type acceptedTypes with multiple selections allowed',
      '    else',
      '      set selectedFiles to choose file with prompt dialogTitle default location startLocation with multiple selections allowed',
      '    end if',
      '  else',
      '    if (count of acceptedTypes) > 0 then',
      '      set selectedFile to choose file with prompt dialogTitle default location startLocation of type acceptedTypes',
      '    else',
      '      set selectedFile to choose file with prompt dialogTitle default location startLocation',
      '    end if',
      '    set selectedFiles to {selectedFile}',
      '  end if',
      '  set selectedPaths to {}',
      '  repeat with selectedFile in selectedFiles',
      '    set end of selectedPaths to POSIX path of selectedFile',
      '  end repeat',
      '  set previousDelimiters to AppleScript\'s text item delimiters',
      '  set AppleScript\'s text item delimiters to (ASCII character 30)',
      '  set resultText to selectedPaths as text',
      '  set AppleScript\'s text item delimiters to previousDelimiters',
      '  return resultText',
      'end run',
    ].join('\n')
    try {
      const { stdout } = await execFileAsync('osascript', [
        '-e', script,
        String(options.title ?? '选择文件'),
        defaultPath,
        extensions.join('\n'),
        allowMultiple ? '1' : '0',
      ], { timeout: 0, maxBuffer: 4 * 1024 * 1024 })
      const output = String(stdout ?? '').replace(/\r?\n$/, '')
      const filePaths = output ? output.split('\u001e').filter(Boolean) : []
      return filePaths.length
        ? { canceled: false, filePaths }
        : { canceled: true, filePaths: [] }
    } catch {
      return { canceled: true, filePaths: [] }
    }
  }

  const dialog = {
    async showOpenDialog(parentOrOptions, maybeOptions) {
      const options = maybeOptions ?? parentOrOptions ?? {}
      const properties = new Set(Array.isArray(options.properties) ? options.properties : [])
      if (process.platform === 'darwin' && properties.has('openFile')) return macChooseFiles(options)
      if (process.platform === 'darwin' && properties.has('openDirectory')) return macChooseFolder(options.defaultPath)
      return { canceled: true, filePaths: [] }
    },
    async showMessageBox(parentOrOptions, maybeOptions) {
      const options = maybeOptions ?? parentOrOptions ?? {}
      const buttons = Array.isArray(options.buttons) && options.buttons.length
        ? options.buttons.map((button) => String(button))
        : ['确定']
      const normalizeButtonIndex = (value, fallback) => Number.isInteger(value) && value >= 0 && value < buttons.length
        ? value
        : fallback
      const defaultId = normalizeButtonIndex(options.defaultId, 0)
      const cancelId = normalizeButtonIndex(options.cancelId, buttons.length - 1)

      if (showMessageBoxOverride) return showMessageBoxOverride(options)

      if (platformName !== 'darwin') {
        console.warn('[shell] 无法显示本机确认窗口，按取消处理。')
        return { response: cancelId }
      }

      // Pass dialog text as argv instead of interpolating it into AppleScript.
      // This keeps messages (including file paths) from becoming executable script.
      const buttonArgs = buttons.map((_, index) => `item ${index + 3} of argv`).join(', ')
      const script = [
        'on run argv',
        '  set dialogTitle to item 1 of argv as text',
        '  set messageText to item 2 of argv as text',
        `  set buttonNames to {${buttonArgs}}`,
        `  set defaultButton to item ${defaultId + 1} of buttonNames`,
        `  set cancelButton to item ${cancelId + 1} of buttonNames`,
        '  set selectedButton to button returned of (display dialog messageText with title dialogTitle buttons buttonNames default button defaultButton cancel button cancelButton)',
        '  return selectedButton',
        'end run',
      ].join('\n')
      const message = [options.message, options.detail].filter((part) => typeof part === 'string' && part.trim()).join('\n\n')
      const { stdout } = await execFileAsync('osascript', ['-e', script, String(options.title ?? 'TaskWeaver'), message, ...buttons], {
        timeout: 0,
        maxBuffer: 1024 * 1024,
      })
      const selected = String(stdout ?? '').trim()
      const response = buttons.findIndex((button) => button === selected)
      return { response: response >= 0 ? response : cancelId }
    },
  }

  const shell = {
    async openExternal(value) {
      let url
      try {
        url = new URL(value)
      } catch {
        throw new Error('外部链接无效。')
      }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('仅允许打开有效的 HTTP(S) 外部链接。')
      }
      if (openExternalOverride) return openExternalOverride(url.href)
      if (platformName !== 'darwin') throw new Error('当前桌面 Shell 尚未实现外部链接打开。')
      await execFileAsync('open', [url.href], { timeout: 10000, maxBuffer: 1024 * 1024 })
    },
    async openPath(filePath) {
      if (platformName !== 'darwin') throw new Error('当前桌面 Shell 尚未实现路径打开。')
      await execFileAsync('open', [String(filePath)], { timeout: 10000, maxBuffer: 1024 * 1024 })
      return ''
    },
  }

  const safeStorage = {
    isEncryptionAvailable: () => false,
  }
  const keychainHelperPath = resolveKeychainHelperPath({
    platformName,
    repoRoot,
  })
  const secrets = createKeychainSecrets({ helperPath: keychainHelperPath, platformName })

  return {
    app,
    ipcMain,
    dialog,
    BrowserWindow: ShellBrowserWindow,
    safeStorage,
    secrets,
    shell,
    net: null,
  }
}

export async function invokeShellChannel(channel, ...args) {
  const handler = invokeHandlers.get(channel)
  if (!handler) throw new Error(`未知 Shell 通道：${channel}`)
  const event = {
    senderFrame: { url: 'taskweaver://app/index.html' },
    sender: mainWindow.webContents,
  }
  return handler(event, ...args)
}
