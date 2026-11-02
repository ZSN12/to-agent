export const OAUTH_TOKEN_CACHE_REFRESH_SKEW_MS = 60_000
const FALLBACK_TTL_MS = 5 * 60_000

export function accessTokenExpiryMs(token) {
  if (typeof token !== 'string') return null
  const payloadSegment = token.split('.')[1]
  if (!payloadSegment) return null
  try {
    const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'))
    const expiration = Number(payload?.exp)
    if (!Number.isFinite(expiration) || expiration <= 0) return null
    return expiration < 1_000_000_000_000 ? expiration * 1000 : expiration
  } catch {
    return null
  }
}

export function isUnauthorizedError(error) {
  if (Number(error?.status ?? error?.statusCode) === 401) return true
  return /(?:^|\D)401(?:\D|$)|unauthori[sz]ed/i.test(String(error?.message ?? error ?? ''))
}

export function createOAuthTokenCache({
  now = Date.now,
  refreshSkewMs = OAUTH_TOKEN_CACHE_REFRESH_SKEW_MS,
} = {}) {
  const tokens = new Map()
  const inFlight = new Map()

  function abortReason(signal) {
    return signal?.reason ?? new DOMException('OAuth token lookup was aborted.', 'AbortError')
  }

  function cancelFlight(provider, flight) {
    if (inFlight.get(provider) === flight) inFlight.delete(provider)
    flight.controller.abort()
  }

  function startFlight(provider, loadToken) {
    const controller = new AbortController()
    const flight = { controller, consumers: 0, settled: false, promise: null }
    inFlight.set(provider, flight)
    // The helper belongs to the shared lookup, never to its first consumer.
    // Also settle if a loader ignores cancellation; its late value cannot cache.
    const loadedToken = new Promise((resolve, reject) => {
      const abort = () => reject(abortReason(controller.signal))
      controller.signal.addEventListener('abort', abort, { once: true })
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw abortReason(controller.signal)
        return loadToken(controller.signal)
      }).then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', abort))
    })
    flight.promise = loadedToken.then((loaded) => {
      const accessToken = typeof loaded === 'string' ? loaded : loaded?.accessToken
      if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
        throw new TypeError('OAuth token loader must return a non-empty access token string.')
      }

      const expiryHint = typeof loaded === 'object' && loaded !== null ? loaded.expiresAtMs : undefined
      const expiresAtMs = typeof expiryHint === 'number' && Number.isFinite(expiryHint) && expiryHint > 0
        ? expiryHint
        : accessTokenExpiryMs(accessToken)
      const currentTimeMs = now()
      if (expiresAtMs !== null && expiresAtMs <= currentTimeMs) {
        throw new TypeError('OAuth token loader returned an expired access token.')
      }
      const effectiveExpiry = expiresAtMs ?? currentTimeMs + FALLBACK_TTL_MS + refreshSkewMs
      if (inFlight.get(provider) === flight && !controller.signal.aborted) {
        if (effectiveExpiry > currentTimeMs + refreshSkewMs) {
          tokens.set(provider, { accessToken, expiresAtMs: effectiveExpiry })
        } else {
          tokens.delete(provider)
        }
      }
      return accessToken
    }).finally(() => {
      flight.settled = true
      if (inFlight.get(provider) === flight) inFlight.delete(provider)
    })
    return flight
  }

  return {
    async get(provider, loadToken, { signal } = {}) {
      if (signal?.aborted) throw abortReason(signal)
      const cached = tokens.get(provider)
      if (cached && cached.expiresAtMs > now() + refreshSkewMs) return cached.accessToken
      const flight = inFlight.get(provider) ?? startFlight(provider, loadToken)
      flight.consumers++
      return new Promise((resolve, reject) => {
        let settled = false
        const finish = (settle, value) => {
          if (settled) return
          settled = true
          signal?.removeEventListener('abort', abort)
          flight.consumers--
          if (!flight.settled && flight.consumers === 0) cancelFlight(provider, flight)
          settle(value)
        }
        const abort = () => finish(reject, abortReason(signal))
        signal?.addEventListener('abort', abort, { once: true })
        flight.promise.then((token) => finish(resolve, token), (error) => finish(reject, error))
      })
    },
    invalidate(provider) {
      tokens.delete(provider)
      const flight = inFlight.get(provider)
      if (flight) cancelFlight(provider, flight)
    },
    clear() {
      tokens.clear()
      for (const [provider, flight] of inFlight) cancelFlight(provider, flight)
    },
  }
}
