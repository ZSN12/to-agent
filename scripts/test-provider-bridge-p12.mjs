import assert from 'node:assert/strict'
import { accessTokenExpiryMs, createOAuthTokenCache, isUnauthorizedError } from '../packages/provider-bridge-transport/oauth-token-cache.mjs'
import { scheduleCursorAdapterPrewarm } from '../packages/provider-bridge-transport/index.mjs'
import { createSystemProxyConfigCache } from '../backend/agent/z-host/system-proxy-cache.mjs'
import { migrateLegacyProfileManifestsOnce } from '../backend/agent/z-host/spawn-host.mjs'

let now = 1_000
let tokenReads = 0
const tokens = createOAuthTokenCache({ now: () => now, refreshSkewMs: 60_000 })
const token = (value, expSeconds) => ({
  accessToken: value,
  expiresAtMs: expSeconds * 1_000,
})

assert.equal(accessTokenExpiryMs(`header.${Buffer.from(JSON.stringify({ exp: 100 })).toString('base64url')}.signature`), 100_000)
assert.equal(accessTokenExpiryMs('opaque-token'), null)
assert.equal(isUnauthorizedError({ status: 401 }), true)
assert.equal(isUnauthorizedError(new Error('upstream returned 401 Unauthorized')), true)
assert.equal(isUnauthorizedError(new Error('upstream unavailable')), false)

assert.equal(await tokens.get('cursor', async () => { tokenReads += 1; return token('cursor-a', 200) }), 'cursor-a')
assert.equal(await tokens.get('cursor', async () => { tokenReads += 1; return token('unexpected', 300) }), 'cursor-a')
assert.equal(tokenReads, 1, 'provider token is reused while it is valid beyond the refresh skew')
assert.equal(await tokens.get('google-antigravity', async () => token('google-a', 200)), 'google-a')
now = 140_001
assert.equal(await tokens.get('cursor', async () => { tokenReads += 1; return token('cursor-b', 400) }), 'cursor-b')
tokens.invalidate('cursor')
assert.equal(await tokens.get('cursor', async () => { tokenReads += 1; return token('cursor-c', 500) }), 'cursor-c')
assert.equal(tokenReads, 3, 'unauthorized invalidation forces a new OAuth read')

let opaqueReads = 0
assert.equal(await tokens.get('opaque-provider', async () => { opaqueReads += 1; return 'opaque-token-val' }), 'opaque-token-val')
assert.equal(await tokens.get('opaque-provider', async () => { opaqueReads += 1; return 'unexpected' }), 'opaque-token-val')
assert.equal(opaqueReads, 1, 'opaque token without exp is cached with fallback TTL')
tokens.invalidate('opaque-provider')
assert.equal(await tokens.get('opaque-provider', async () => { opaqueReads += 1; return 'opaque-token-2' }), 'opaque-token-2')
assert.equal(opaqueReads, 2, 'opaque token is invalidated on 401')

const invalidCache = createOAuthTokenCache({ now: () => 1_000, refreshSkewMs: 60_000 })
let invalidLoads = 0
await assert.rejects(
  invalidCache.get('missing-token', async () => { invalidLoads += 1; return undefined }),
  /non-empty access token string/,
)
await assert.rejects(
  invalidCache.get('non-string-token', async () => ({ accessToken: 42, expiresAtMs: 500_000 })),
  /non-empty access token string/,
)
await assert.rejects(
  invalidCache.get('empty-token', async () => ({ accessToken: '   ', expiresAtMs: 500_000 })),
  /non-empty access token string/,
)
assert.equal(await invalidCache.get('missing-token', async () => { invalidLoads += 1; return 'recovered-token' }), 'recovered-token')
assert.equal(invalidLoads, 2, 'an invalid token result is not cached and a later read retries the loader')

for (const [provider, badExpiry] of [
  ['string-expiry', 'never'],
  ['infinite-expiry', Infinity],
  ['nan-expiry', Number.NaN],
]) {
  let expiryNow = 1_000
  let expiryReads = 0
  const expiryCache = createOAuthTokenCache({ now: () => expiryNow, refreshSkewMs: 60_000 })
  assert.equal(await expiryCache.get(provider, async () => {
    expiryReads += 1
    return { accessToken: `${provider}-first`, expiresAtMs: badExpiry }
  }), `${provider}-first`)
  assert.equal(await expiryCache.get(provider, async () => {
    expiryReads += 1
    return { accessToken: `${provider}-unexpected`, expiresAtMs: 500_000 }
  }), `${provider}-first`, 'a malformed expiry falls back to the short conservative TTL')
  expiryNow += 5 * 60_000 + 1
  assert.equal(await expiryCache.get(provider, async () => {
    expiryReads += 1
    return { accessToken: `${provider}-second`, expiresAtMs: 500_000 }
  }), `${provider}-second`)
  assert.equal(expiryReads, 2, 'fallback expiry is bounded and eventually reloads the token')
}

let expiredNow = 200_000
let expiredReads = 0
const expiredCache = createOAuthTokenCache({ now: () => expiredNow, refreshSkewMs: 0 })
await assert.rejects(expiredCache.get('expired-token', async () => {
  expiredReads += 1
  return { accessToken: 'expired-token', expiresAtMs: expiredNow - 1 }
}), /expired access token/)
assert.equal(await expiredCache.get('expired-token', async () => {
  expiredReads += 1
  return { accessToken: 'fresh-token', expiresAtMs: expiredNow + 100_000 }
}), 'fresh-token', 'an already-expired token is rejected and never cached')
assert.equal(expiredReads, 2)

let prewarmCallback
let prewarmDelay
let prewarmCalls = 0
let prewarmErrors = 0
scheduleCursorAdapterPrewarm({
  delayMs: 1_000,
  schedule(callback, delay) {
    prewarmCallback = callback
    prewarmDelay = delay
    return { unref() {} }
  },
  async loadAdapter() { prewarmCalls += 1 },
  onError() { prewarmErrors += 1 },
})
assert.equal(prewarmDelay, 1_000)
assert.equal(prewarmCalls, 0, 'adapter prewarm is deferred to an idle timer')
prewarmCallback()
await new Promise((resolve) => setImmediate(resolve))
assert.equal(prewarmCalls, 1)
assert.equal(prewarmErrors, 0)

let proxyNow = 0
let proxyReads = 0
const proxyCache = createSystemProxyConfigCache({
  ttlMs: 30_000,
  now: () => proxyNow,
  async read() {
    proxyReads += 1
    await new Promise((resolve) => setImmediate(resolve))
    return { http: 'http://proxy.local:8080' }
  },
})
const [proxyA, proxyB] = await Promise.all([proxyCache(), proxyCache()])
assert.deepEqual(proxyA, proxyB)
assert.equal(proxyReads, 1, 'concurrent Host starts share proxy discovery')
assert.deepEqual(await proxyCache(), proxyA, 'system proxy is cached')
proxyNow = 30_001
await proxyCache()
assert.equal(proxyReads, 2, 'proxy cache refreshes after its TTL')
proxyCache.invalidate()
await proxyCache()
assert.equal(proxyReads, 3, 'proxy cache can be invalidated explicitly')

const profileHome = `/tmp/taskweaver-profile-migration-${process.pid}-${Date.now()}`
let migrationCalls = 0
const migrate = async () => {
  migrationCalls += 1
  await new Promise((resolve) => setImmediate(resolve))
  return { changed: true, profiles: ['legacy'] }
}
const [migrationA, migrationB] = await Promise.all([
  migrateLegacyProfileManifestsOnce(profileHome, migrate),
  migrateLegacyProfileManifestsOnce(profileHome, migrate),
])
assert.deepEqual(migrationA, migrationB)
assert.equal(migrationCalls, 1, 'concurrent migration requests are single-flight')
await migrateLegacyProfileManifestsOnce(profileHome, migrate)
assert.equal(migrationCalls, 1, 'profile migration runs once per Host process and runtime home')

const retryHome = `${profileHome}-retry`
let retryCalls = 0
await assert.rejects(migrateLegacyProfileManifestsOnce(retryHome, async () => {
  retryCalls += 1
  throw new Error('temporary migration failure')
}), /temporary migration failure/)
await migrateLegacyProfileManifestsOnce(retryHome, async () => {
  retryCalls += 1
  return { changed: false, profiles: [] }
})
assert.equal(retryCalls, 2, 'a failed migration can be retried')

console.log('P12.9 bridge checks passed: expiry-aware OAuth cache, 401 invalidation, idle adapter prewarm, async proxy cache, and once-per-process profile migration.')
