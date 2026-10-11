import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { broadcastShellEvent } from '../shell/event-bus.mjs'

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

class ShellWebContents {
  #destroyed = false

  send(channel, payload) {
    if (this.#destroyed) return
    broadcastShellEvent(channel, payload)
  }

  isDestroyed() {
    return this.#destroyed
  }

  destroy() {
    this.#destroyed = true
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

const lifecycle = new EventEmitter()

/** @type {Map<string, import('electron').IpcMainInvokeHandler>} */
const invokeHandlers = new Map()

/**
 * Minimal Electron-shaped adapters for compose-services + registerIpc.
 * Credentials and secrets use shell file encoding (see credential-store), not Chromium safeStorage.
 */
export function createShellPlatform() {
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

  async function macChooseFolder(defaultPath) {
    const location = defaultPath && fs.existsSync(defaultPath) ? defaultPath.replace(/"/g, '\\"') : os.homedir()
    const script = `POSIX path of (choose folder with prompt "选择 TaskWeaver 工作区" default location "${location}")`
    try {
      const { stdout } = await execFileAsync('osascript', ['-e', script])
      const picked = stdout.trim()
      if (!picked) return { canceled: true, filePaths: [] }
      return { canceled: false, filePaths: [picked] }
    } catch {
      return { canceled: true, filePaths: [] }
    }
  }

  const dialog = {
    async showOpenDialog(_parent, options) {
      if (process.platform === 'darwin') return macChooseFolder(options?.defaultPath)
      return { canceled: true, filePaths: [] }
    },
    async showMessageBox(_parent, options) {
      console.warn('[shell]', options?.title ?? 'TaskWeaver', options?.message ?? '')
      return { response: 0 }
    },
  }

  /** Shell has no OS keychain bridge; credential-store uses tw-b64 file encoding. */
  const safeStorage = {
    isEncryptionAvailable: () => false,
  }

  return {
    app,
    ipcMain,
    dialog,
    BrowserWindow: ShellBrowserWindow,
    safeStorage,
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
