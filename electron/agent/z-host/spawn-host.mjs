import { spawn as nodeSpawn } from 'node:child_process'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createZApiClient } from './z-api-client.mjs'
import { migrateLegacyDshProfileBundles } from './migrate-dsh-home.mjs'
import {
  resolveTaskWeaverHostLaunch,
  TASKWEAVER_RUNTIME_PACKAGES,
} from './resolve-runtime.mjs'

const READY_URL = /dsh web:\s+(https?:\/\/127\.0\.0\.1:\d+)/i
const START_TIMEOUT_MS = 45_000
const LEGACY_PI_AI_SETTINGS_NS = 'llm-pi-ai'
const MODEL_SETTINGS_READY_MS = 2_500

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 从系统配置读取代理（macOS scutil，Windows/Linux 可扩展）。
 * @returns {{ http?: string, https?: string, bypass?: string[] } | null}
 */
function getSystemProxyConfig() {
  try {
    if (process.platform === 'darwin') {
      return getSystemProxyConfigMacOS()
    } else if (process.platform === 'win32') {
      return getSystemProxyConfigWindows()
    } else if (process.platform === 'linux') {
      return getSystemProxyConfigLinux()
    }
  } catch (error) {
    // 读取失败则不注入代理，记录详细错误以便诊断
    console.warn(`无法读取系统代理配置 (${process.platform}):`, error instanceof Error ? error.message : error)
  }
  return null
}

function getSystemProxyConfigMacOS() {
  const output = execSync('scutil --proxy', { encoding: 'utf8', timeout: 1000 })
  const config = { bypass: [] }

  // HTTP 代理
  const httpEnabled = /HTTPEnable\s*:\s*1/.test(output)
  if (httpEnabled) {
    const hostMatch = output.match(/HTTPProxy\s*:\s*(\S+)/)
    const portMatch = output.match(/HTTPPort\s*:\s*(\d+)/)
    if (hostMatch && portMatch) {
      config.http = `http://${hostMatch[1]}:${portMatch[1]}`
    }
  }

  // HTTPS 代理（可能与 HTTP 不同）
  const httpsEnabled = /HTTPSEnable\s*:\s*1/.test(output)
  if (httpsEnabled) {
    const hostMatch = output.match(/HTTPSProxy\s*:\s*(\S+)/)
    const portMatch = output.match(/HTTPSPort\s*:\s*(\d+)/)
    if (hostMatch && portMatch) {
      config.https = `http://${hostMatch[1]}:${portMatch[1]}`
    }
  }

  // 旁路列表（ExceptionsList）
  const exceptionsMatch = output.match(/ExceptionsList\s*:\s*<array>\s*\{([^}]*)\}/)
  if (exceptionsMatch) {
    const items = exceptionsMatch[1].match(/\d+\s*:\s*(\S+)/g)
    if (items) {
      config.bypass = items.map(item => item.replace(/\d+\s*:\s*/, '').trim())
    }
  }

  // 始终包含 localhost 和本机 IP
  config.bypass = [...new Set([...config.bypass, 'localhost', '127.0.0.1', '::1', '*.local'])]

  if (!config.http && !config.https) return null
  return config
}

function getSystemProxyConfigWindows() {
  // Windows Registry: HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings
  try {
    const output = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /v ProxyServer /v ProxyOverride',
      { encoding: 'utf8', timeout: 2000 }
    )

    const proxyEnabled = /ProxyEnable\s+REG_DWORD\s+0x1/.test(output)
    if (!proxyEnabled) return null

    const config = { bypass: [] }

    // ProxyServer 格式可能是 "host:port" 或 "http=host:port;https=host:port"
    const serverMatch = output.match(/ProxyServer\s+REG_SZ\s+(.+)/i)
    if (serverMatch) {
      const proxyServer = serverMatch[1].trim()
      if (proxyServer.includes('=')) {
        // 协议特定代理
        const httpMatch = proxyServer.match(/http=([^;]+)/i)
        const httpsMatch = proxyServer.match(/https=([^;]+)/i)
        if (httpMatch) config.http = `http://${httpMatch[1]}`
        if (httpsMatch) config.https = `http://${httpsMatch[1]}`
      } else {
        // 通用代理
        config.http = `http://${proxyServer}`
        config.https = `http://${proxyServer}`
      }
    }

    // ProxyOverride 是以分号分隔的旁路列表
    const overrideMatch = output.match(/ProxyOverride\s+REG_SZ\s+(.+)/i)
    if (overrideMatch) {
      config.bypass = overrideMatch[1].trim().split(';').filter(Boolean)
    }

    // 始终包含 localhost
    config.bypass = [...new Set([...config.bypass, 'localhost', '127.0.0.1', '::1', '<local>'])]

    if (!config.http && !config.https) return null
    return config
  } catch (error) {
    // reg 命令可能不存在或无权限，静默失败
    return null
  }
}

function getSystemProxyConfigLinux() {
  // Linux 通常通过环境变量或 gsettings (GNOME) / KDE settings
  try {
    // 尝试 GNOME gsettings
    const modeOutput = execSync('gsettings get org.gnome.system.proxy mode', {
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim().replace(/'/g, '')

    if (modeOutput !== 'manual') return null

    const config = { bypass: [] }

    // HTTP 代理
    try {
      const httpHost = execSync('gsettings get org.gnome.system.proxy.http host', {
        encoding: 'utf8',
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim().replace(/'/g, '')
      const httpPort = execSync('gsettings get org.gnome.system.proxy.http port', {
        encoding: 'utf8',
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
      if (httpHost && httpPort && httpPort !== '0') {
        config.http = `http://${httpHost}:${httpPort}`
      }
    } catch {}

    // HTTPS 代理
    try {
      const httpsHost = execSync('gsettings get org.gnome.system.proxy.https host', {
        encoding: 'utf8',
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim().replace(/'/g, '')
      const httpsPort = execSync('gsettings get org.gnome.system.proxy.https port', {
        encoding: 'utf8',
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
      if (httpsHost && httpsPort && httpsPort !== '0') {
        config.https = `http://${httpsHost}:${httpsPort}`
      }
    } catch {}

    // 旁路列表
    try {
      const ignoreHosts = execSync('gsettings get org.gnome.system.proxy ignore-hosts', {
        encoding: 'utf8',
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
      // 格式: ['localhost', '127.0.0.0/8', ...]
      const hosts = ignoreHosts.match(/'([^']+)'/g)
      if (hosts) {
        config.bypass = hosts.map(h => h.replace(/'/g, ''))
      }
    } catch {}

    // 始终包含 localhost
    config.bypass = [...new Set([...config.bypass, 'localhost', '127.0.0.1', '::1'])]

    if (!config.http && !config.https) return null
    return config
  } catch (error) {
    // gsettings 可能不存在（非 GNOME 环境），静默失败
    return null
  }
}

function symlinkDir(target, linkPath) {
  fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
}

/** @param {string} runtimeRoot */
export function runtimePackagesResolveSmoke(runtimeRoot) {
  const marker = path.join(runtimeRoot, 'node_modules', '@z', 'dsh-persona', 'package.json')
  return fs.existsSync(marker)
}

function removeNodeModulesLink(runtimeRoot) {
  const modulesLink = path.join(runtimeRoot, 'node_modules')
  if (!fs.existsSync(modulesLink)) return
  try {
    const stat = fs.lstatSync(modulesLink)
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(modulesLink)
      return
    }
    if (stat.isDirectory() && !runtimePackagesResolveSmoke(runtimeRoot)) {
      fs.rmSync(modulesLink, { recursive: true, force: true })
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Ensure `<root>/node_modules` → `runtime-packages` so ESM can import `@z/dsh-persona` etc.
 * @returns {boolean}
 */
function ensureNodeModulesLink(runtimeRoot) {
  const packagesDir = path.join(runtimeRoot, TASKWEAVER_RUNTIME_PACKAGES)
  if (!fs.existsSync(packagesDir)) return false
  if (runtimePackagesResolveSmoke(runtimeRoot)) return true
  removeNodeModulesLink(runtimeRoot)
  const modulesLink = path.join(runtimeRoot, 'node_modules')
  try {
    symlinkDir(TASKWEAVER_RUNTIME_PACKAGES, modulesLink)
  } catch {
    try {
      symlinkDir(packagesDir, modulesLink)
    } catch {
      return false
    }
  }
  return runtimePackagesResolveSmoke(runtimeRoot)
}

function linkMirrorPiece(src, dest) {
  if (!fs.existsSync(src)) return
  try {
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
    fs.symlinkSync(src, dest, process.platform === 'win32' ? 'junction' : 'dir')
  } catch {
    /* skip */
  }
}

/**
 * Node ESM resolves from cwd/node_modules; deploy output uses runtime-packages (electron-builder strips node_modules).
 * Packaged .app Resources are often read-only — mirror into DSH_HOME when needed.
 */
export function prepareRuntimeCwd(runtimeRoot, dshHome, { preferWritableMirror = false } = {}) {
  const packagesDir = path.join(runtimeRoot, TASKWEAVER_RUNTIME_PACKAGES)
  if (!fs.existsSync(packagesDir)) {
    return runtimeRoot
  }

  if (!preferWritableMirror && ensureNodeModulesLink(runtimeRoot)) {
    return runtimeRoot
  }

  const mirror = path.join(dshHome, 'packaged-runtime')
  fs.mkdirSync(mirror, { recursive: true })
  for (const name of ['lib', 'config', TASKWEAVER_RUNTIME_PACKAGES]) {
    linkMirrorPiece(path.join(runtimeRoot, name), path.join(mirror, name))
  }
  for (const name of ['package.json', 'taskweaver-runtime-meta.json']) {
    const src = path.join(runtimeRoot, name)
    const dest = path.join(mirror, name)
    if (!fs.existsSync(src)) continue
    try {
      if (fs.existsSync(dest)) fs.rmSync(dest, { force: true })
      fs.symlinkSync(src, dest)
    } catch {
      /* skip */
    }
  }
  if (!ensureNodeModulesLink(mirror)) {
    throw new Error(
      'Z Host 无法在打包运行时下解析 @z/* 依赖（缺少 node_modules → runtime-packages）。'
      + ' 请重启 TaskWeaver；若仍失败请重新安装最新版本。',
    )
  }
  return mirror
}

/** Brief poll so settings tree exists; do not block on legacy llm-pi-ai (Z uses per-provider ns). */
async function waitForModelSettingsReady(client, timeoutMs = MODEL_SETTINGS_READY_MS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const described = await client.settings.describe({})
    if (described.result?.ok) {
      const namespaces = described.result.value?.namespaces ?? []
      if (namespaces.some((entry) => String(entry.ns) === LEGACY_PI_AI_SETTINGS_NS)) return
      if (namespaces.some((entry) => /^llm-/i.test(String(entry.ns)))) return
      if (namespaces.length >= 4) return
    }
    await sleep(100)
  }
}

/**
 * Owns one DSH profile process for the lifetime of the Electron main process.
 * DSH owns the Agent/session/tool runtime; TaskWeaver talks to its typed API.
 */
export function createZHostManager({
  runtimeRoot,
  userDataPath,
  executable = process.execPath,
  spawnProcess = nodeSpawn,
  environment = process.env,
  getMcpRuntimeIntegration,
  startTimeoutMs = START_TIMEOUT_MS,
  isPackaged = false,
}) {
  let child = null
  let startPromise = null
  let api = null
  let hostUrl = null
  let diagnostics = ''

  function appendDiagnostics(chunk) {
    diagnostics = `${diagnostics}${chunk}`.slice(-16_000)
  }

  async function stop() {
    const current = child
    child = null
    api = null
    hostUrl = null
    if (!current || current.exitCode !== null || current.signalCode !== null) return
    await new Promise((resolve) => {
      const forceKill = setTimeout(() => {
        try { current.kill('SIGKILL') } catch { /* process already exited */ }
      }, 2_000)
      forceKill.unref?.()
      current.once('close', () => {
        clearTimeout(forceKill)
        resolve()
      })
      try { current.kill('SIGTERM') } catch { resolve() }
    })
  }

  async function start() {
    const dshHome = path.join(userDataPath, 'dsh')
    try {
      const migration = await migrateLegacyDshProfileBundles(dshHome)
      if (migration.changed) {
        console.log(`Z Host: 已迁移 profile bundles → @z/*（${migration.profiles.join(', ')}）`)
      }
    } catch (error) {
      console.warn('Z Host: profile 迁移失败（继续尝试启动）:', error instanceof Error ? error.message : error)
    }
    if (api && child && child.exitCode === null && child.signalCode === null) return { api, baseUrl: hostUrl }
    if (startPromise) return startPromise
    startPromise = (async () => {
      const mcpIntegration = await getMcpRuntimeIntegration?.()
      return new Promise((resolve, reject) => {
      diagnostics = ''
      let entrypoint
      let nodePath
      let processCwd
      try {
        processCwd = prepareRuntimeCwd(runtimeRoot, dshHome, { preferWritableMirror: isPackaged })
        const launch = resolveTaskWeaverHostLaunch(processCwd)
        entrypoint = launch.entrypoint
        nodePath = launch.nodePath
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }
      const childEnv = {
        ...environment,
        ...(mcpIntegration?.environment ?? {}),
        DSH_HOME: dshHome,
        DSH_TELEMETRY_DISABLED: '1',
        DSH_TASKWEAVER_EMBEDDED: '1',
        TASKWEAVER_WEB_SEARCH_CONFIG_PATH: path.join(userDataPath, 'taskweaver-web-search.json'),
        ELECTRON_RUN_AS_NODE: '1',
      }
      // macOS 系统代理不会自动传入环境变量，需手动注入。
      // 若环境变量已有代理配置则保留（优先级最高）；否则从系统读取。
      const hasHttpProxy = childEnv.HTTP_PROXY || childEnv.http_proxy
      const hasHttpsProxy = childEnv.HTTPS_PROXY || childEnv.https_proxy
      const hasNoProxy = childEnv.NO_PROXY || childEnv.no_proxy

      if (!hasHttpProxy || !hasHttpsProxy || !hasNoProxy) {
        const proxyConfig = getSystemProxyConfig()
        if (proxyConfig) {
          if (proxyConfig.http && !hasHttpProxy) {
            childEnv.HTTP_PROXY = proxyConfig.http
            childEnv.http_proxy = proxyConfig.http
          }
          if (proxyConfig.https && !hasHttpsProxy) {
            childEnv.HTTPS_PROXY = proxyConfig.https
            childEnv.https_proxy = proxyConfig.https
          }
          // 旁路列表：防止本机 Z Host API 调用也走代理
          if (proxyConfig.bypass?.length && !hasNoProxy) {
            const bypassList = proxyConfig.bypass.join(',')
            childEnv.NO_PROXY = bypassList
            childEnv.no_proxy = bypassList
          }
        }
      }
      if (nodePath) {
        childEnv.NODE_PATH = nodePath
      }
      // Launcher options must precede the profile command; after `web`,
      // --patch would be forwarded to the web app and rejected as unknown.
      const args = [entrypoint]
      if (mcpIntegration?.patchPath) args.push('--patch', mcpIntegration.patchPath)
      args.push('--profile', 'web', '--no-open', '--port', '0')
      const spawned = spawnProcess(executable, args, {
        cwd: processCwd,
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      child = spawned
      let settled = false
      let urlHandled = false
      let outputBuffer = ''
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        void stop()
        reject(new Error(`Z Host 在 ${startTimeoutMs}ms 内未就绪。${diagnostics ? `\n${diagnostics}` : ''}`))
      }, startTimeoutMs)
      timer.unref?.()

      const fail = (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        child = null
        reject(error instanceof Error ? error : new Error(String(error)))
      }
      const inspectOutput = (chunk) => {
        const text = String(chunk)
        appendDiagnostics(text)
        outputBuffer = `${outputBuffer}${text}`.slice(-32_000)
        const match = outputBuffer.match(READY_URL)
        if (!match || settled || urlHandled) return
        urlHandled = true
        hostUrl = match[1]
        void createZApiClient({ runtimeRoot, baseUrl: hostUrl })
          .then(async (client) => {
            // Fail startup unless this is a real, reachable DSH API host.
            const description = await client.host.describe({})
            if (!description.result.ok) throw new Error(description.result.error.message)
            await waitForModelSettingsReady(client)
            if (settled) return
            settled = true
            clearTimeout(timer)
            api = client
            resolve({ api, baseUrl: hostUrl })
          })
          .catch((error) => {
            void stop()
            fail(error)
          })
      }
      spawned.stdout?.on('data', inspectOutput)
      spawned.stderr?.on('data', inspectOutput)
      spawned.once('error', fail)
      spawned.once('close', (code, signal) => {
        if (child === spawned) {
          child = null
          api = null
          hostUrl = null
        }
        if (!settled) {
          fail(new Error(`Z Host 启动失败（${signal ?? `退出码 ${code}`}）。${diagnostics ? `\n${diagnostics}` : ''}`))
        }
      })
      })
    })().finally(() => {
      startPromise = null
    })
    return startPromise
  }

  async function restart() {
    await stop()
    return start()
  }

  function isRunning() {
    return child !== null && child.exitCode === null && child.signalCode === null
  }

  return {
    start,
    stop,
    restart,
    isRunning,
    getApi: () => api,
    getBaseUrl: () => hostUrl,
    getDiagnostics: () => diagnostics,
  }
}

/** @deprecated use createZHostManager */
export const createDshHostManager = createZHostManager
