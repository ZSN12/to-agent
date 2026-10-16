import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { resolveOcxExecutable } from './opencodex-binary.mjs'
import { ocxInvocation, openCodexEnvironment, runOcx } from './model-sync/ocx-cli.mjs'

/** Per-user OpenCodex state (runtime-port.json, OAuth store) beside Electron userData. */
export function resolveOpenCodexHome(userDataPath) {
  return path.join(path.resolve(userDataPath), 'opencodex')
}

async function readRuntimePort(home) {
  try {
    const raw = await fs.readFile(path.join(home, 'runtime-port.json'), 'utf8')
    const parsed = JSON.parse(raw)
    if (Number.isFinite(parsed?.port)) return parsed
  } catch {
    // not ready yet
  }
  return null
}

async function proxyHealthy(runtime) {
  const host = typeof runtime.hostname === 'string' && runtime.hostname.trim()
    ? runtime.hostname.trim()
    : '127.0.0.1'
  try {
    const response = await fetch(`http://${host}:${runtime.port}/healthz`, {
      signal: AbortSignal.timeout(2_500),
      redirect: 'error',
      cache: 'no-store',
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * `ocx export` reads the local OpenCodex proxy catalog; ensure it is running before scan.
 */
export async function ensureOpenCodexProxyForExport({
  userDataPath,
  hostManager,
  timeoutMs = 90_000,
} = {}) {
  if (!userDataPath) {
    throw new Error('OpenCodex 扫描需要 TaskWeaver 用户数据目录。')
  }
  if (hostManager) {
    if (hostManager.state === 'failed' && typeof hostManager.restart === 'function') {
      await hostManager.restart()
    }
    if (typeof hostManager.whenReady === 'function') {
      await hostManager.whenReady()
    }
  }

  const home = resolveOpenCodexHome(userDataPath)
  await fs.mkdir(home, { recursive: true })
  const env = openCodexEnvironment({ OPENCODEX_HOME: home })

  let runtime = await readRuntimePort(home)
  if (runtime && await proxyHealthy(runtime)) return { home, port: runtime.port }

  const ocx = resolveOcxExecutable()
  const invocation = ocxInvocation(ocx, ['start'])
  const child = spawn(invocation.executable, invocation.args, {
    env,
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    runtime = await readRuntimePort(home)
    if (runtime && await proxyHealthy(runtime)) return { home, port: runtime.port }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }

  throw new Error(
    'OpenCodex 本地代理未在时限内就绪。请完全退出 TaskWeaver 后重开，等待约 1 分钟再点「扫描本地官方 Agent」。',
  )
}

/** Stop the TaskWeaver-owned OpenCodex daemon during desktop shutdown. */
export async function stopOpenCodexProxyForApp({ userDataPath, timeoutMs = 20_000 } = {}) {
  if (!userDataPath) return { stopped: false, reason: 'missing-user-data' }

  const home = resolveOpenCodexHome(userDataPath)
  const runtime = await readRuntimePort(home)
  if (!runtime) return { stopped: false, reason: 'not-started-by-taskweaver' }

  await runOcx(['stop'], {
    timeoutMs,
    env: { OPENCODEX_HOME: home },
  })
  return { stopped: true }
}
