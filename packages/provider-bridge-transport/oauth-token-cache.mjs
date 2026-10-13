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

  return {
    async get(provider, loadToken) {
      const cached = tokens.get(provider)
      if (cached && cached.expiresAtMs > now() + refreshSkewMs) return cached.accessToken

      const loaded = await loadToken()
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
      if (effectiveExpiry > currentTimeMs + refreshSkewMs) {
        tokens.set(provider, { accessToken, expiresAtMs: effectiveExpiry })
      } else {
        tokens.delete(provider)
      }
      return accessToken
    },
    invalidate(provider) {
      tokens.delete(provider)
    },
    clear() {
      tokens.clear()
    },
  }
}
