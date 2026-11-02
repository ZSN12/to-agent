import { spawn as nodeSpawn } from 'node:child_process'

export const DEFAULT_OAUTH_TOKEN_HELPER_TIMEOUT_MS = 60_000

function bridgeError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function providerFailure(provider, kind) {
  const google = provider === 'google-antigravity'
  if (kind === 'aborted') {
    return bridgeError(
      google ? 'BRIDGE_ANTIGRAVITY_OAUTH_ABORTED' : 'BRIDGE_CURSOR_STREAM_ERROR',
      `${google ? 'Google Antigravity' : 'Cursor'} OAuth request was aborted.`,
    )
  }
  if (kind === 'timeout') {
    return bridgeError(
      google ? 'BRIDGE_ANTIGRAVITY_OAUTH_TIMEOUT' : 'BRIDGE_CURSOR_STREAM_ERROR',
      `${google ? 'Google Antigravity' : 'Cursor'} OAuth lookup timed out.`,
    )
  }
  if (kind === 'start') {
    return bridgeError(
      google ? 'BRIDGE_ANTIGRAVITY_OAUTH_RUNTIME_MISSING' : 'BRIDGE_CURSOR_BUN_RUNTIME_MISSING',
      google
        ? 'Google Antigravity OAuth token helper could not start.'
        : 'Cursor OAuth helper could not start.',
    )
  }
  if (kind === 'invalid-response') {
    return bridgeError(
      google ? 'BRIDGE_ANTIGRAVITY_OAUTH_HELPER_ERROR' : 'BRIDGE_CURSOR_STREAM_ERROR',
      `${google ? 'Google Antigravity' : 'Cursor'} OAuth token helper returned an invalid response.`,
    )
  }
  if (kind === 'invalid-token') {
    return bridgeError(
      google ? 'BRIDGE_ANTIGRAVITY_OAUTH_HELPER_ERROR' : 'BRIDGE_CURSOR_STREAM_ERROR',
      `${google ? 'Google Antigravity' : 'Cursor'} OAuth returned an invalid token envelope.`,
    )
  }

  const code = kind === 'account-changed'
    ? 'BRIDGE_ANTIGRAVITY_ACCOUNT_CHANGED'
    : kind === 'missing'
      ? google ? 'BRIDGE_ANTIGRAVITY_CREDENTIAL_MISSING' : 'BRIDGE_CURSOR_CREDENTIAL_MISSING'
      : kind === 'paused'
        ? google ? 'BRIDGE_ANTIGRAVITY_ACCOUNT_PAUSED' : 'BRIDGE_CURSOR_ACCOUNT_PAUSED'
        : google ? 'BRIDGE_ANTIGRAVITY_OAUTH_HELPER_ERROR' : 'BRIDGE_CURSOR_STREAM_ERROR'
  const message = code === 'BRIDGE_CURSOR_CREDENTIAL_MISSING'
    ? 'Cursor bridge requires configured Cursor OAuth (Host/OpenCodex); no active credential is available.'
    : code === 'BRIDGE_ANTIGRAVITY_CREDENTIAL_MISSING'
      ? 'Google Antigravity requires a configured Google OAuth account; no active credential is available.'
      : code === 'BRIDGE_CURSOR_ACCOUNT_PAUSED'
        ? 'The active Cursor OAuth account is paused.'
        : code === 'BRIDGE_ANTIGRAVITY_ACCOUNT_PAUSED'
          ? 'The active Google Antigravity OAuth account is paused.'
          : code === 'BRIDGE_ANTIGRAVITY_ACCOUNT_CHANGED'
            ? 'Google Antigravity account selection changed during token lookup; retry the request.'
            : `OpenCodex could not resolve the active ${google ? 'Google Antigravity' : 'Cursor'} OAuth credential.`
  return bridgeError(code, message)
}

/** Run the small OpenCodex OAuth reader and own its timeout, abort, and output limits. */
export function runOAuthTokenHelper({
  provider,
  bun,
  source,
  cwd,
  env,
  signal,
  timeoutMs = DEFAULT_OAUTH_TOKEN_HELPER_TIMEOUT_MS,
  spawnProcess = nodeSpawn,
  onDuration = () => {},
}) {
  if (provider !== 'cursor' && provider !== 'google-antigravity') {
    throw new TypeError(`Unsupported OAuth helper provider: ${provider}`)
  }

  const startedAt = process.hrtime.bigint()
  const abortReason = () => signal?.reason ?? providerFailure(provider, 'aborted')
  if (signal?.aborted) return Promise.reject(abortReason())

  return new Promise((resolve, reject) => {
    let child
    let timer
    let settled = false
    let receivedBytes = 0
    const tokenChunks = []
    const output = { stream: null }

    const finish = (settle, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      output.stream?.removeListener('data', onData)
      child?.removeListener('error', onError)
      child?.removeListener('close', onClose)
      try {
        onDuration(Number(process.hrtime.bigint() - startedAt) / 1e6)
      } catch {}
      settle(value)
    }

    const abort = () => {
      try { child?.kill() } catch {}
      finish(reject, abortReason())
    }

    const onData = (chunk) => {
      receivedBytes += chunk.length
      if (receivedBytes > 64 * 1024) {
        try { child?.kill() } catch {}
        finish(reject, providerFailure(provider, 'invalid-response'))
        return
      }
      tokenChunks.push(chunk)
    }

    const onError = () => finish(reject, providerFailure(provider, 'start'))

    const onClose = (code) => {
      const payload = Buffer.concat(tokenChunks).toString('utf8')
      if (code === 0 && payload.startsWith('T:') && payload.length > 2) {
        try {
          finish(resolve, JSON.parse(payload.slice(2)))
        } catch {
          finish(reject, providerFailure(provider, 'invalid-token'))
        }
        return
      }
      const kind = payload === 'E:account-changed'
        ? 'account-changed'
        : payload === 'E:missing'
          ? 'missing'
          : payload === 'E:paused'
            ? 'paused'
            : 'unavailable'
      finish(reject, providerFailure(provider, kind))
    }

    try {
      child = spawnProcess(bun, ['-e', source], {
        cwd,
        env,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
      })
    } catch {
      finish(reject, providerFailure(provider, 'start'))
      return
    }
    output.stream = child.stdio?.[3]

    timer = setTimeout(() => {
      // SIGKILL bounds the helper even if Bun is wedged or ignores SIGTERM.
      try { child.kill('SIGKILL') } catch {}
      finish(reject, providerFailure(provider, 'timeout'))
    }, timeoutMs)
    timer.unref?.()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
      return
    }

    output.stream?.on('data', onData)
    child.once('error', onError)
    child.once('close', onClose)
  })
}
