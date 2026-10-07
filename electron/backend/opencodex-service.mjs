import { spawn } from 'node:child_process'
import { shell } from 'electron'
import { expandedPath, runOcx } from './opencodex-sync.mjs'
import {
  resolveOcxExecutable,
  isOcxBundled,
  ocxSupportsComposerToolContinuation,
  OCX_COMPOSER_CONTINUATION_MIN_VERSION,
} from './opencodex-binary.mjs'
import {
  ensureOpenCodexProxyReachable,
  fetchProxyHealthz,
  parseLoopbackBaseUrl,
  readOpenCodexBaseUrlFromModelsJson,
} from './opencodex-health.mjs'

/**
 * @returns {Promise<{ ok: boolean, port?: number, pid?: number, raw?: Record<string, unknown> }>}
 */
export async function fetchOpenCodexHealthJson() {
  try {
    const { stdout } = await runOcx(['health', '--json'], { timeoutMs: 12_000 })
    const parsed = JSON.parse(stdout.trim())
    return { ok: Boolean(parsed?.ok), port: parsed?.port, pid: parsed?.pid, raw: parsed }
  } catch {
    return { ok: false }
  }
}

/**
 * Parse `ocx status` text for provider login lines like `cursor     ✓ logged in`.
 */
export function parseProviderLoginFromStatusText(text) {
  const providers = {}
  for (const line of String(text ?? '').split('\n')) {
    const match = line.match(/^\s*([a-z0-9-]+)\s+[✓✗]\s+(logged in|not logged in)/i)
    if (!match) continue
    providers[match[1]] = /logged in/i.test(match[2]) && !/not logged in/i.test(line)
  }
  return providers
}

export async function getOpenCodexSetupStatus(modelsPath) {
  const baseUrl = modelsPath ? await readOpenCodexBaseUrlFromModelsJson(modelsPath) : null
  let statusText = ''
  try {
    const { stdout } = await runOcx(['status'], { timeoutMs: 15_000 })
    statusText = stdout
  } catch {
    // ocx missing or status failed
  }
  const logins = parseProviderLoginFromStatusText(statusText)
  const health = await fetchOpenCodexHealthJson()
  let cliVersion = null
  try {
    const { stdout } = await runOcx(['--version'], { timeoutMs: 8_000 })
    cliVersion = stdout.trim().split('\n')[0] ?? null
  } catch {
    // ignore
  }
  const resolvedBase = baseUrl ?? (health.port ? `http://127.0.0.1:${health.port}/v1` : null)
  const loopback = resolvedBase ? parseLoopbackBaseUrl(resolvedBase) : { host: '127.0.0.1', port: 10100 }
  const proxyHealth = loopback ? await fetchProxyHealthz(loopback.host, loopback.port) : { version: null }
  const proxyVersion = proxyHealth.version ?? null
  const composerContinuationOk = ocxSupportsComposerToolContinuation(proxyVersion)
  const cliSupportsComposer = ocxSupportsComposerToolContinuation(cliVersion)
  return {
    ocx: resolveOcxExecutable(),
    bundled: isOcxBundled(),
    version: cliVersion,
    cliVersion,
    proxyVersion,
    composerContinuationOk,
    cliSupportsComposer,
    composerContinuationMinVersion: OCX_COMPOSER_CONTINUATION_MIN_VERSION,
    proxyUp: health.ok,
    baseUrl: resolvedBase,
    cursorLoggedIn: logins.cursor === true,
    providerLogins: logins,
    health,
  }
}

export async function ensureOpenCodexProxy(modelsPath) {
  return ensureOpenCodexProxyReachable(modelsPath)
}

/**
 * Start OAuth in the system browser via ocx (non-blocking).
 */
export function startOpenCodexProviderLogin(provider = 'cursor') {
  const ocx = resolveOcxExecutable()
  const child = spawn(ocx, ['login', provider], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PATH: expandedPath() },
  })
  child.unref()
  return { provider, ocx }
}

export async function openOpenCodexDashboard(baseUrl) {
  const url = baseUrl?.replace(/\/v1\/?$/, '') || 'http://127.0.0.1:10100'
  const target = `${url}/`
  await shell.openExternal(target)
  return target
}
