import { spawn as nodeSpawn, execFile, execSync } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createZApiClient } from './z-api-client.mjs'
import {
  migrateLegacyProfileManifests,
  migrateRuntimeHome,
  readTaskWeaverEnvironment,
  removeLegacyRuntimeHome,
  removeStaleRetiredRuntimeHomes,
} from './migrate-z-home.mjs'
import {
  resolveTaskWeaverHostLaunch,
  TASKWEAVER_RUNTIME_PACKAGES,
} from './resolve-runtime.mjs'
import { resolveHostNodeExecutable } from './resolve-host-executable.mjs'
import { readCompactionSummarizationEnv } from '../../taskweaver-compaction-target.mjs'
import { createSystemProxyConfigCache } from './system-proxy-cache.mjs'
import startupTrace from '../../startup-trace.cjs'

const { traceStartup } = startupTrace

const READY_URL = /(?:z|dsh) web:\s+(https?:\/\/127\.0\.0\.1:\d+)/i
const START_TIMEOUT_MS = Number(process.env.TASKWEAVER_HOST_START_TIMEOUT_MS) || 20_000
const LEGACY_PI_AI_SETTINGS_NS = 'llm-pi-ai'
const MODEL_SETTINGS_READY_MS = 2_500
const WEB_SEARCH_RUNTIME_ENV = [
  'TASKWEAVER_WEB_SEARCH_ENABLED',
  'TASKWEAVER_WEB_SEARCH_ENDPOINT',
  'TASKWEAVER_WEB_SEARCH_MAX_RESULTS',
  'TASKWEAVER_WEB_SEARCH_API_KEY_SECRET',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const execFileAsync = promisify(execFile)
const profileMigrationFlights = new Map()

export async function migrateLegacyProfileManifestsOnce(
  runtimeHome,
  migrate = migrateLegacyProfileManifests,
  migrateOptions = { embedded: true },
) {
  const key = path.resolve(runtimeHome)
  const existing = profileMigrationFlights.get(key)
  if (existing) return existing
  const request = Promise.resolve().then(() => migrate(runtimeHome, migrateOptions))
  profileMigrationFlights.set(key, request)
  try {
    return await request
  } catch (error) {
    if (profileMigrationFlights.get(key) === request) profileMigrationFlights.delete(key)
    throw error
  }
}

const BRIDGE_NO_PROXY_HOSTS = [
  '127.0.0.1',
  'localhost',
  '[::1]',
  'api2.cursor.sh',
  'cursor.com',
  'cursor.sh',
]

/** Keep loopback Z Host + Cursor upstream off a dead system HTTP proxy. */
function sanitizeSpawnEnv(env) {
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== 'string') continue
    if (!value.includes('\u0000')) continue
    delete env[name]
    console.warn(`[TaskWeaver] 已从 Z Host 环境变量中移除含非法字符的 ${name}`)
  }
}

function mergeBridgeNoProxy(childEnv) {
  const existing = String(childEnv.NO_PROXY ?? childEnv.no_proxy ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const merged = [...new Set([...existing, ...BRIDGE_NO_PROXY_HOSTS])]
  const value = merged.join(',')
  childEnv.NO_PROXY = value
  childEnv.no_proxy = value
}

/**
 * In-process bridge transport + OpenCodex adapter root for Z Host (scheme C).
 * @param {string} runtimeCwd Host cwd (often runtime-home packaged-runtime mirror)
 * @param {string} [opencodexPackageRoot] Resolved @taskweaver/opencodex package dir
 * @param {string} [runtimeRoot] Deploy tree (Resources/taskweaver-z-runtime); transport lives here
 */
export function bridgeTransportChildEnv(runtimeCwd, opencodexPackageRoot, runtimeRoot = runtimeCwd, { packaged = false } = {}) {
  const env = {}
  const transportCandidates = [
    path.join(runtimeRoot, 'electron-vendor', 'taskweaver-bridge-transport', 'index.mjs'),
    path.join(runtimeCwd, 'electron-vendor', 'taskweaver-bridge-transport', 'index.mjs'),
  ]
  const stagedTransport = transportCandidates.find((candidate) => fs.existsSync(candidate))
  if (stagedTransport) {
    env.TASKWEAVER_BRIDGE_TRANSPORT = pathToFileURL(stagedTransport).href
  }
  if (runtimeRoot && fs.existsSync(runtimeRoot)) {
    env.TASKWEAVER_RUNTIME = path.resolve(runtimeRoot)
  }
  if (opencodexPackageRoot && fs.existsSync(opencodexPackageRoot)) {
    env.TASKWEAVER_OPENCODEX_ROOT = opencodexPackageRoot
  }
  const isPackaged = packaged || process.env.TASKWEAVER_PACKAGED === '1' || process.env.TASKWEAVER_PACKAGED === 'true'
  if (!isPackaged) {
    try {
      const require = createRequire(import.meta.url)
      env.TASKWEAVER_TSX_ROOT = path.dirname(require.resolve('tsx/package.json'))
    } catch {
      // Production Cursor transport is provided by the compiled bridge package;
      // the source adapter needs tsx only in a development checkout.
    }
  }
  return env
}

/**
 * 从系统配置读取代理（macOS scutil，Windows/Linux 可扩展）。
 * @returns {{ http?: string, https?: string, bypass?: string[] } | null}
 */
const getSystemProxyConfig = createSystemProxyConfigCache({
  read: async () => {
    try {
      if (process.platform === 'darwin') {
        return await getSystemProxyConfigMacOS()
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
  },
})

async function getSystemProxyConfigMacOS() {
  const { stdout: output } = await execFileAsync('scutil', ['--proxy'], { encoding: 'utf8', timeout: 1000 })
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
  const packagesDir = path.join(runtimeRoot, TASKWEAVER_RUNTIME_PACKAGES)
  const markers = [
    path.join(runtimeRoot, 'node_modules', '@taskweaver', 'dsh-persona', 'package.json'),
    path.join(packagesDir, '@taskweaver', 'dsh-persona', 'package.json'),
    path.join(runtimeRoot, 'node_modules', '@z', 'dsh-persona', 'package.json'),
    path.join(packagesDir, '@z', 'dsh-persona', 'package.json'),
  ]
  return markers.some((marker) => fs.existsSync(marker))
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
 * Ensure `<root>/node_modules` → `runtime-packages` so ESM can import `@taskweaver/dsh-persona` etc.
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
 * Use a stable runtime-home mirror for Host cwd. Runtime deploys atomically replace
 * `runtimeRoot`; a live Node process whose cwd is the renamed/deleted old tree
 * cannot create Worker threads (`uv_cwd`). The mirror's package symlinks keep
 * resolving through the stable runtimeRoot path after the swap.
 */
export function prepareRuntimeCwd(runtimeRoot, dshHome, { useStableMirror = false } = {}) {
  const packagesDir = path.join(runtimeRoot, TASKWEAVER_RUNTIME_PACKAGES)
  if (!fs.existsSync(packagesDir)) {
    return runtimeRoot
  }

  if (!useStableMirror && ensureNodeModulesLink(runtimeRoot)) {
    return runtimeRoot
  }

  const mirror = path.join(dshHome, 'packaged-runtime')
  fs.mkdirSync(mirror, { recursive: true })
  for (const name of ['lib', 'config', TASKWEAVER_RUNTIME_PACKAGES, 'electron-vendor']) {
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
      'Z Host 无法在打包运行时下解析 @taskweaver/* 依赖（缺少 node_modules → runtime-packages）。'
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
  opencodexPackageRoot,
  userDataPath,
  spawnProcess = nodeSpawn,
  environment = process.env,
  getMcpRuntimeIntegration,
  getWebSearchRuntimeIntegration,
  getCompactionRuntimeIntegration,
  startTimeoutMs = START_TIMEOUT_MS,
  prepareRuntimeCwdFn = prepareRuntimeCwd,
  resolveHostLaunch = resolveTaskWeaverHostLaunch,
  createApiClient = createZApiClient,
  waitForSettingsReady = waitForModelSettingsReady,
  getSystemProxyConfigFn = getSystemProxyConfig,
}) {
  let child = null
  let startPromise = null
  let api = null
  let hostUrl = null
  let diagnostics = ''
  let state = 'stopped'
  let lastStartError = null
  const envStartTimeoutMs = Number(environment.TASKWEAVER_HOST_START_TIMEOUT_MS)
  const configuredStartTimeoutMs = Number.isFinite(envStartTimeoutMs) && envStartTimeoutMs > 0
    ? Math.min(Math.floor(envStartTimeoutMs), 2_147_483_647)
    : (Number.isFinite(startTimeoutMs) && startTimeoutMs > 0 ? startTimeoutMs : START_TIMEOUT_MS)

  function appendDiagnostics(chunk) {
    diagnostics = `${diagnostics}${chunk}`.slice(-16_000)
  }

  async function stop() {
    traceStartup('host:stop:begin')
    const current = child
    if (state !== 'restarting' && state !== 'failed') state = 'stopped'
    child = null
    api = null
    hostUrl = null
    if (!current || current.exitCode !== null || current.signalCode !== null) {
      traceStartup('host:stop:end')
      return
    }
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
    traceStartup('host:stop:end')
  }

  async function startHostProcess() {
    traceStartup('host:start:begin')
    // Preserve one release of launch-script compatibility, but make old
    // control variables visible in logs so callers can switch to the product
    // namespace before the aliases are removed.
    readTaskWeaverEnvironment(environment, 'TASKWEAVER_TELEMETRY_DISABLED', [
      'Z_TELEMETRY_DISABLED', 'DSH_TELEMETRY_DISABLED',
    ])
    readTaskWeaverEnvironment(environment, 'TASKWEAVER_EMBEDDED', [
      'Z_TASKWEAVER_EMBEDDED', 'DSH_TASKWEAVER_EMBEDDED',
    ])
    await removeStaleRetiredRuntimeHomes({ userDataPath }).catch(() => {})
    const homeMigration = await migrateRuntimeHome({ env: environment, userDataPath })
    const runtimeHome = homeMigration.runtimeHomePath
    if (environment === process.env) {
      // Electron main-process stores (for example native OAuth credentials)
      // must switch at the same commit point as the Host child. Keeping the
      // old alias in the process env would make later writes drift back to the
      // rollback copy after the verified migration.
      process.env.TASKWEAVER_HOME = runtimeHome
      delete process.env.Z_HOME
      delete process.env.DSH_HOME
    }
    if (homeMigration.migrated) {
      console.info(`[TaskWeaver] 已复制旧运行时数据 ${homeMigration.source} → ${runtimeHome}`)
      const removal = await removeLegacyRuntimeHome(homeMigration.source, { env: environment })
      if (removal.removed) {
        console.info(`[TaskWeaver] 已删除已迁移的旧运行时目录 ${homeMigration.source}`)
      } else if (removal.reason === 'remove-failed') {
        console.warn(`[TaskWeaver] 无法删除旧运行时目录 ${homeMigration.source}：${removal.message}`)
      }
    } else if (homeMigration.reason === 'destination-exists' && homeMigration.source) {
      console.warn(`[TaskWeaver] ${runtimeHome} 已存在，未从 ${homeMigration.source} 再次覆盖。`)
    }
    const effectiveHome = runtimeHome
    try {
      const migration = await migrateLegacyProfileManifestsOnce(effectiveHome)
      if (migration.changed) {
        console.log(`[TaskWeaver] 已迁移旧 profile manifest（${migration.profiles.join(', ')}）`)
      }
    } catch (error) {
      console.warn('[TaskWeaver] profile 迁移失败（继续尝试启动）:', error instanceof Error ? error.message : error)
    }
    if (api && child && child.exitCode === null && child.signalCode === null) return { api, baseUrl: hostUrl }
    const [mcpIntegration, webSearchIntegration, compactionEnv, compactionRuntimeIntegration] = await Promise.all([
      getMcpRuntimeIntegration?.(),
      getWebSearchRuntimeIntegration?.(),
      readCompactionSummarizationEnv(userDataPath),
      getCompactionRuntimeIntegration?.(),
    ])
    const proxyEnv = {
      ...environment,
      ...(mcpIntegration?.environment ?? {}),
      ...(webSearchIntegration?.environment ?? {}),
      ...compactionEnv,
      ...(compactionRuntimeIntegration?.environment ?? {}),
    }
    const needsSystemProxy = !(proxyEnv.HTTP_PROXY || proxyEnv.http_proxy)
      || !(proxyEnv.HTTPS_PROXY || proxyEnv.https_proxy)
      || !(proxyEnv.NO_PROXY || proxyEnv.no_proxy)
    const systemProxyConfig = needsSystemProxy ? await getSystemProxyConfigFn() : null
    return new Promise((resolve, reject) => {
      diagnostics = ''
      let entrypoint
      let nodePath
      let processCwd
      try {
        // Worker threads inherit the Host process cwd. Keep it outside the
        // atomically replaced runtime tree in both dev and packaged builds.
        processCwd = prepareRuntimeCwdFn(runtimeRoot, effectiveHome, { useStableMirror: true })
        const launch = resolveHostLaunch(processCwd)
        entrypoint = launch.entrypoint
        nodePath = launch.nodePath
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }
      const childEnv = {
        ...environment,
        ...(mcpIntegration?.environment ?? {}),
        ...(webSearchIntegration?.environment ?? {}),
        ...compactionEnv,
        ...(compactionRuntimeIntegration?.environment ?? {}),
        ...bridgeTransportChildEnv(processCwd, opencodexPackageRoot, runtimeRoot, {
          packaged: environment.TASKWEAVER_PACKAGED === '1' || environment.TASKWEAVER_PACKAGED === 'true',
        }),
        ...(environment.TASKWEAVER_PACKAGED === '1' || environment.TASKWEAVER_PACKAGED === 'true'
          ? { TASKWEAVER_PACKAGED: '1' }
          : {}),
        TASKWEAVER_HOME: effectiveHome,
        TASKWEAVER_TELEMETRY_DISABLED: '1',
        TASKWEAVER_EMBEDDED: '1',
      }
      for (const legacyName of [
        'Z_HOME', 'DSH_HOME',
        'Z_TELEMETRY_DISABLED', 'DSH_TELEMETRY_DISABLED',
        'Z_TASKWEAVER_EMBEDDED', 'DSH_TASKWEAVER_EMBEDDED',
      ]) delete childEnv[legacyName]
      if (environment.TASKWEAVER_UI_VERIFY === '1') {
        // The UI smoke may run against retained lib artifacts from before the
        // home-path rename. Keep those artifacts inside the same disposable
        // profile instead of allowing their legacy resolver to reach ~/.dsh.
        childEnv.Z_HOME = effectiveHome
        childEnv.DSH_HOME = effectiveHome
      }
      const webSearchEnv = webSearchIntegration?.environment ?? {}
      for (const name of WEB_SEARCH_RUNTIME_ENV) {
        if (!Object.hasOwn(webSearchEnv, name)) delete childEnv[name]
      }
      // macOS 系统代理不会自动传入环境变量，需手动注入。
      // 若环境变量已有代理配置则保留（优先级最高）；否则从系统读取。
      const hasHttpProxy = childEnv.HTTP_PROXY || childEnv.http_proxy
      const hasHttpsProxy = childEnv.HTTPS_PROXY || childEnv.https_proxy
      const hasNoProxy = childEnv.NO_PROXY || childEnv.no_proxy

      if (!hasHttpProxy || !hasHttpsProxy || !hasNoProxy) {
        if (systemProxyConfig) {
          if (systemProxyConfig.http && !hasHttpProxy) {
            childEnv.HTTP_PROXY = systemProxyConfig.http
            childEnv.http_proxy = systemProxyConfig.http
          }
          if (systemProxyConfig.https && !hasHttpsProxy) {
            childEnv.HTTPS_PROXY = systemProxyConfig.https
            childEnv.https_proxy = systemProxyConfig.https
          }
          // 旁路列表：防止本机 Z Host API 调用也走代理
          if (systemProxyConfig.bypass?.length && !hasNoProxy) {
            const bypassList = systemProxyConfig.bypass.join(',')
            childEnv.NO_PROXY = bypassList
            childEnv.no_proxy = bypassList
          }
        }
      }
      mergeBridgeNoProxy(childEnv)
      if (process.env.TASKWEAVER_STARTUP_TRACE) childEnv.TASKWEAVER_STARTUP_TRACE = process.env.TASKWEAVER_STARTUP_TRACE
      if (process.env.TASKWEAVER_STARTUP_TRACE_FILE) childEnv.TASKWEAVER_STARTUP_TRACE_FILE = process.env.TASKWEAVER_STARTUP_TRACE_FILE
      if (process.env.TASKWEAVER_STARTUP_ID) childEnv.TASKWEAVER_STARTUP_ID = process.env.TASKWEAVER_STARTUP_ID
      if (process.env.TASKWEAVER_STARTUP_T0_EPOCH_MS) childEnv.TASKWEAVER_STARTUP_T0_EPOCH_MS = process.env.TASKWEAVER_STARTUP_T0_EPOCH_MS
      sanitizeSpawnEnv(childEnv)
      if (nodePath) {
        childEnv.NODE_PATH = nodePath
      }
      // Launcher options must precede profile selection; --patch is an entry
      // option, while the web profile accepts only its host/port options here.
      const hostExecutable = resolveHostNodeExecutable({
        env: environment,
        resourcesPath: environment.TASKWEAVER_RESOURCES_PATH,
        isPackaged: environment.TASKWEAVER_PACKAGED === '1' || environment.TASKWEAVER_PACKAGED === 'true',
      }).executable
      const args = [entrypoint]
      if (mcpIntegration?.patchPath) args.push('--patch', mcpIntegration.patchPath)
      args.push('--profile', 'web', '--host', '127.0.0.1', '--port', '0')
      const spawned = spawnProcess(hostExecutable, args, {
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
        state = 'failed'
        lastStartError = new Error(`Z Host 在 ${configuredStartTimeoutMs}ms 内未就绪。`)
        void stop()
        reject(new Error(`${lastStartError.message}${diagnostics ? `\n${diagnostics}` : ''}`))
      }, configuredStartTimeoutMs)
      timer.unref?.()

      const fail = (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        state = 'failed'
        child = null
        lastStartError = error instanceof Error ? error : new Error(String(error))
        reject(lastStartError)
      }
      const inspectOutput = (chunk) => {
        const text = String(chunk)
        appendDiagnostics(text)
        outputBuffer = `${outputBuffer}${text}`.slice(-32_000)
        const match = outputBuffer.match(READY_URL)
        if (!match || settled || urlHandled) return
        urlHandled = true
        hostUrl = match[1]
        void createApiClient({ runtimeRoot, baseUrl: hostUrl })
          .then(async (client) => {
            // Fail startup unless this is a real, reachable DSH API host.
            const description = await client.host.describe({})
            if (!description.result.ok) throw new Error(description.result.error.message)
            await waitForSettingsReady(client)
            if (settled) return
            settled = true
            clearTimeout(timer)
            api = client
            resolve({ api, baseUrl: hostUrl })
          })
          .catch((error) => {
            void stop()
            const message = error instanceof Error ? error.message : String(error)
            fail(new Error(`Z Host API 不可访问（${hostUrl}）：${message}${diagnostics ? `\n${diagnostics}` : ''}`))
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
        } else if (state !== 'stopped' && state !== 'restarting') {
          state = 'failed'
          lastStartError = new Error(`Z Host 意外退出（${signal ?? `退出码 ${code}`}）。${diagnostics ? `\n${diagnostics}` : ''}`)
        }
      })
      })
  }

  function start() {
    if (api && child && child.exitCode === null && child.signalCode === null) {
      state = 'ready'
      return Promise.resolve({ api, baseUrl: hostUrl })
    }
    if (state === 'failed') {
      return Promise.reject(lastStartError ?? new Error('Z Host 上一次启动失败，请显式重启后重试。'))
    }
    if (startPromise) return startPromise
    const requestedState = state === 'restarting' ? 'restarting' : 'starting'
    state = requestedState
    let pending
    pending = startHostProcess()
      .then((result) => {
        state = 'ready'
        lastStartError = null
        traceStartup('host:start:ready')
        return result
      })
      .catch((error) => {
        state = 'failed'
        // A failure may occur before the child is spawned (for example while
        // preparing its runtime cwd), so pair it with a trace event here too.
        traceStartup('host:start:failed', { reason: 'startup' })
        lastStartError = error instanceof Error ? error : new Error(String(error))
        throw lastStartError
      })
      .finally(() => {
        if (startPromise === pending) startPromise = null
      })
    startPromise = pending
    return pending
  }

  let restartPromise = null

  function whenReady() {
    if (state === 'restarting' && restartPromise) return restartPromise
    if (state === 'ready' && api && child && child.exitCode === null && child.signalCode === null) {
      return Promise.resolve({ api, baseUrl: hostUrl })
    }
    if (state === 'failed') {
      const message = `Z Host 启动失败${lastStartError instanceof Error ? `：${lastStartError.message}` : ''}${diagnostics ? `\n${diagnostics}` : ''}`
      return Promise.reject(new Error(message))
    }
    return start()
  }

  async function restart(reason) {
    if (restartPromise) return restartPromise
    state = 'restarting'
    traceStartup('host:restart', { reason: reason ? String(reason) : 'unspecified' })
    restartPromise = (async () => {
      await stop()
      return start()
    })().finally(() => {
      restartPromise = null
    })
    return restartPromise
  }

  function isRunning() {
    return child !== null && child.exitCode === null && child.signalCode === null
  }

  return {
    start,
    whenReady,
    stop,
    restart,
    isRunning,
    getApi: () => api,
    getBaseUrl: () => hostUrl,
    getDiagnostics: () => diagnostics,
    get state() { return state },
  }
}
