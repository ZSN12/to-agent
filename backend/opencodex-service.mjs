import { runOcx, openCodexEnvironment } from './model-sync/ocx-cli.mjs'
import { resolveOpenCodexHome } from './ensure-opencodex-proxy.mjs'

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

export async function fetchOpenCodexProviderLogins(userDataPath) {
  try {
    const env = userDataPath
      ? openCodexEnvironment({ OPENCODEX_HOME: resolveOpenCodexHome(userDataPath) })
      : undefined
    const { stdout } = await runOcx(['status'], { timeoutMs: 15_000, env })
    return parseProviderLoginFromStatusText(stdout)
  } catch {
    return {}
  }
}

