import { spawn as nodeSpawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDshApiClient } from './dsh-api-client.mjs'
import { resolveDshHostLaunch } from './resolve-runtime.mjs'

const TASKWEAVER_DSH_PATCH_SOURCE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'taskweaver-cordis.patch.yml',
)
const AUTHORIZATION_PATCH_MARKER = 'id: authorization'

/** Ensure OAuth / official-subscription flows are mounted in the TaskWeaver DSH profile. */
export function ensureTaskWeaverDshHomePatch(dshHome) {
  fs.mkdirSync(dshHome, { recursive: true })
  const dest = path.join(dshHome, 'cordis.patch.yml')
  const bundled = fs.readFileSync(TASKWEAVER_DSH_PATCH_SOURCE, 'utf8')
  if (!fs.existsSync(dest)) {
    fs.writeFileSync(dest, bundled, 'utf8')
    return { updated: true }
  }
  const current = fs.readFileSync(dest, 'utf8')
  if (current.includes(AUTHORIZATION_PATCH_MARKER) && current.includes('dsh-authorization')) {
    return { updated: false }
  }
  if (current.trim() === '[]' || current.trim() === '') {
    fs.writeFileSync(dest, bundled, 'utf8')
    return { updated: true }
  }
  fs.writeFileSync(dest, `${current.trimEnd()}\n\n${bundled}`, 'utf8')
  return { updated: true }
}

const READY_URL = /dsh web:\s+(https?:\/\/127\.0\.0\.1:\d+)/i
const START_TIMEOUT_MS = 45_000

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
    let patchUpdated = false
    try {
      const patchResult = ensureTaskWeaverDshHomePatch(dshHome)
      patchUpdated = patchResult.updated
    } catch (error) {
      throw new Error(`无法准备 TaskWeaver DSH 配置（${dshHome}）：${error instanceof Error ? error.message : error}`)
    }
    if (patchUpdated && api && child && child.exitCode === null && child.signalCode === null) {
      await stop()
      startPromise = null
    }
    if (api && child && child.exitCode === null && child.signalCode === null) return { api, baseUrl: hostUrl }
    if (startPromise) return startPromise
    startPromise = new Promise((resolve, reject) => {
      diagnostics = ''
      let launch
      try {
        launch = resolveDshHostLaunch(runtimeRoot)
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }
      const { entrypoint, cwd: processCwd } = launch
      const childEnv = {
        ...environment,
        DSH_HOME: dshHome,
        DSH_TELEMETRY_DISABLED: '1',
        ELECTRON_RUN_AS_NODE: '1',
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
