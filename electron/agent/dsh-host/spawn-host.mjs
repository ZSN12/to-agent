import { spawn as nodeSpawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createDshApiClient } from './dsh-api-client.mjs'
import {
  resolveDshHostLaunch,
  TASKWEAVER_DSH_RUNTIME_PACKAGES,
} from './resolve-runtime.mjs'

const READY_URL = /dsh web:\s+(https?:\/\/127\.0\.0\.1:\d+)/i
const START_TIMEOUT_MS = 45_000
const MODEL_SETTINGS_NS = 'llm-pi-ai'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function symlinkDir(target, linkPath) {
  fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
}

/** Node ESM resolves packages from cwd/node_modules; deploy output uses runtime-packages for packaging. */
function prepareRuntimeCwd(runtimeRoot, dshHome) {
  const packagesDir = path.join(runtimeRoot, TASKWEAVER_DSH_RUNTIME_PACKAGES)
  if (!fs.existsSync(packagesDir)) {
    return runtimeRoot
  }
  const modulesLink = path.join(runtimeRoot, 'node_modules')
  if (!fs.existsSync(modulesLink)) {
    try {
      symlinkDir(TASKWEAVER_DSH_RUNTIME_PACKAGES, modulesLink)
      return runtimeRoot
    } catch {
      /* .app Resources may be read-only — mirror into DSH_HOME */
    }
  } else {
    return runtimeRoot
  }

  const mirror = path.join(dshHome, 'packaged-runtime')
  fs.mkdirSync(mirror, { recursive: true })
  for (const name of ['lib', 'config', TASKWEAVER_DSH_RUNTIME_PACKAGES]) {
    const src = path.join(runtimeRoot, name)
    const dest = path.join(mirror, name)
    if (!fs.existsSync(src) || fs.existsSync(dest)) continue
    try {
      fs.symlinkSync(src, dest, process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      /* skip broken mirror piece */
    }
  }
  for (const name of ['package.json', 'taskweaver-runtime-meta.json']) {
    const src = path.join(runtimeRoot, name)
    const dest = path.join(mirror, name)
    if (!fs.existsSync(src) || fs.existsSync(dest)) continue
    fs.symlinkSync(src, dest)
  }
  const mirrorModules = path.join(mirror, 'node_modules')
  if (!fs.existsSync(mirrorModules)) {
    symlinkDir(path.join(mirror, TASKWEAVER_DSH_RUNTIME_PACKAGES), mirrorModules)
  }
  return mirror
}

async function waitForModelSettingsNamespace(client, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const described = await client.settings.describe({})
    if (described.result?.ok) {
      const namespaces = described.result.value?.namespaces ?? []
      if (namespaces.some((entry) => String(entry.ns) === MODEL_SETTINGS_NS)) return
    }
    await sleep(250)
  }
  console.warn(`DSH Host 在 ${timeoutMs}ms 内未注册 ${MODEL_SETTINGS_NS} 设置命名空间（模型凭据保存可能需重试）`)
}

/**
 * Owns one DSH profile process for the lifetime of the Electron main process.
 * DSH owns the Agent/session/tool runtime; TaskWeaver talks to its typed API.
 */
export function createDshHostManager({
  runtimeRoot,
  userDataPath,
  executable = process.execPath,
  spawnProcess = nodeSpawn,
  environment = process.env,
  startTimeoutMs = START_TIMEOUT_MS,
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
    if (api && child && child.exitCode === null && child.signalCode === null) return { api, baseUrl: hostUrl }
    if (startPromise) return startPromise
    startPromise = new Promise((resolve, reject) => {
      diagnostics = ''
      let entrypoint
      let nodePath
      let processCwd
      try {
        processCwd = prepareRuntimeCwd(runtimeRoot, dshHome)
        const launch = resolveDshHostLaunch(processCwd)
        entrypoint = launch.entrypoint
        nodePath = launch.nodePath
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }
      const childEnv = {
        ...environment,
        DSH_HOME: dshHome,
        DSH_TELEMETRY_DISABLED: '1',
        DSH_TASKWEAVER_EMBEDDED: '1',
        ELECTRON_RUN_AS_NODE: '1',
      }
      if (nodePath) {
        childEnv.NODE_PATH = nodePath
      }
      const spawned = spawnProcess(executable, [entrypoint, 'web', '--no-open', '--port', '0'], {
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
        reject(new Error(`DSH Host 在 ${startTimeoutMs}ms 内未就绪。${diagnostics ? `\n${diagnostics}` : ''}`))
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
        void createDshApiClient({ runtimeRoot, baseUrl: hostUrl })
          .then(async (client) => {
            // Fail startup unless this is a real, reachable DSH API host.
            const description = await client.host.describe({})
            if (!description.result.ok) throw new Error(description.result.error.message)
            await waitForModelSettingsNamespace(client)
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
          fail(new Error(`DSH Host 启动失败（${signal ?? `退出码 ${code}`}）。${diagnostics ? `\n${diagnostics}` : ''}`))
        }
      })
    }).finally(() => {
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
