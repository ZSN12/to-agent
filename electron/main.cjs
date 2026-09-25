const { app, BrowserWindow, ipcMain, dialog, safeStorage, net, protocol } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const SCHEME = 'taskweaver'
const APP_ROOT = path.join(__dirname, '..')
const INDEX_REL = path.join('dist', 'index.html')
const indexHtmlPath = path.join(APP_ROOT, INDEX_REL)
const DEV_URL = 'http://127.0.0.1:5173/'
const hasSingleInstanceLock = app.requestSingleInstanceLock()
const preloadPath = () => {
  const inPackage = path.join(__dirname, 'preload.cjs')
  if (!app.isPackaged) return inPackage
  const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'preload.cjs')
  return fs.existsSync(unpacked) ? unpacked : inPackage
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

function shouldUseBuiltUi() {
  return app.isPackaged || process.env.TASKWEAVER_PACKAGED === '1' || process.env.TASKWEAVER_PACKAGED === 'true'
}

function distReady() {
  return fs.existsSync(indexHtmlPath)
}

function isPathInside(root, target) {
  const rel = path.relative(root, target)
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel))
}

function resolvePackagedFile(relativePath) {
  const root = path.resolve(APP_ROOT)
  const target = path.resolve(root, relativePath)
  if (!isPathInside(root, target)) return null
  return target
}

function registerPackagedProtocol() {
  const prefix = `${SCHEME}://`
  protocol.handle(SCHEME, (request) => {
    let relative = decodeURIComponent(request.url.slice(prefix.length))
    if (relative.startsWith('/')) relative = relative.slice(1)
    if (!relative) relative = INDEX_REL.replace(/\\/g, '/')
    const filePath = resolvePackagedFile(relative)
    if (!filePath || !fs.existsSync(filePath)) {
      return new Response(`Not found: ${relative}`, { status: 404, headers: { 'content-type': 'text/plain' } })
    }
    return net.fetch(pathToFileURL(filePath).href)
  })
}

function isDevServerUp() {
  return new Promise((resolve) => {
    const request = net.request({ method: 'GET', url: DEV_URL })
    request.on('response', (response) => resolve(response.statusCode >= 200 && response.statusCode < 500))
    request.on('error', () => resolve(false))
    request.end()
  })
}

async function showStartupError(window, message) {
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><title>TaskWeaver</title></head><body style="font-family:system-ui;padding:32px"><h1>TaskWeaver 无法加载界面</h1><p>${message}</p></body></html>`
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
}

async function loadBuiltUi(window) {
  if (!distReady()) {
    await showStartupError(window, '缺少 dist/index.html，请在项目目录执行 npm run build && npm run app。')
    return
  }
  const entry = `${SCHEME}://${INDEX_REL.replace(/\\/g, '/')}`
  await window.loadURL(entry)
}

async function loadDevUi(window) {
  if (await isDevServerUp()) {
    await window.loadURL(DEV_URL)
    return
  }
  if (distReady()) {
    console.warn('[TaskWeaver] Vite 未运行，使用 dist/（npm run dev 可热更新）')
    await loadBuiltUi(window)
    return
  }
  await showStartupError(window, '请先运行 npm run dev，或 npm run build 后再启动。')
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#0d0e11',
    title: 'TaskWeaver',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: preloadPath(),
    },
  })

  if (process.env.TASKWEAVER_DEVTOOLS === '1') {
    window.webContents.openDevTools({ mode: 'detach' })
  }

  window.webContents.on('preload-error', (_event, usedPath, error) => {
    console.error('[TaskWeaver] preload-error', usedPath, error)
    dialog.showErrorBox('TaskWeaver', `预加载脚本失败：${error?.message ?? error}`)
  })

  const load = shouldUseBuiltUi() ? loadBuiltUi(window) : loadDevUi(window)
  return load.then(() => window)
}

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })

  app.whenReady().then(async () => {
    registerPackagedProtocol()

    try {
      const { registerIpc } = await import('./backend/register-ipc.mjs')
      await registerIpc({ ipcMain, app, dialog, BrowserWindow, safeStorage })
    } catch (error) {
      const message = error instanceof Error ? error.stack || error.message : String(error)
      console.error('[TaskWeaver] registerIpc failed:', message)
      dialog.showErrorBox('TaskWeaver 启动失败', message)
      app.quit()
      return
    }

    await createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
