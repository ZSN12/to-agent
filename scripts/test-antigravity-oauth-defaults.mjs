import assert from 'node:assert/strict'
import {
  getAntigravityOAuthCredentials,
  getAntigravityOAuthStatus,
  saveAntigravityOAuthCredentials,
  resetAntigravityOAuthCredentials,
} from '../backend/model-sync/antigravity-oauth-settings.mjs'

const mockStorage = new Map()
const mockSecrets = {
  get: async (key) => mockStorage.get(key) ?? null,
  set: async (key, val) => { mockStorage.set(key, String(val)) },
  delete: async (key) => { mockStorage.delete(key) },
}

const emptyStatus = await getAntigravityOAuthStatus(mockSecrets, {})
assert.equal(emptyStatus.configured, false)
assert.equal(emptyStatus.isDefault, false)
assert.equal(emptyStatus.hasCustomCredentials, false)
assert.equal(await getAntigravityOAuthCredentials(mockSecrets, {}), null)

const env = {
  GOOGLE_ANTIGRAVITY_CLIENT_ID: 'env-client-id.apps.googleusercontent.com',
  GOOGLE_ANTIGRAVITY_CLIENT_SECRET: 'env-client-secret-123',
}
const envStatus = await getAntigravityOAuthStatus(mockSecrets, env)
assert.equal(envStatus.configured, true)
assert.equal(envStatus.isDefault, false)
assert.equal(envStatus.hasCustomCredentials, true)
const envCreds = await getAntigravityOAuthCredentials(mockSecrets, env)
assert.equal(envCreds.clientId, env.GOOGLE_ANTIGRAVITY_CLIENT_ID)
assert.equal(envCreds.clientSecret, env.GOOGLE_ANTIGRAVITY_CLIENT_SECRET)

await saveAntigravityOAuthCredentials(mockSecrets, {
  clientId: 'custom-client-id.apps.googleusercontent.com',
  clientSecret: 'custom-client-secret-123',
})

const customStatus = await getAntigravityOAuthStatus(mockSecrets, {})
assert.equal(customStatus.configured, true)
assert.equal(customStatus.isDefault, false)
assert.equal(customStatus.hasCustomCredentials, true)

const customCreds = await getAntigravityOAuthCredentials(mockSecrets, {})
assert.equal(customCreds.clientId, 'custom-client-id.apps.googleusercontent.com')
assert.equal(customCreds.clientSecret, 'custom-client-secret-123')
assert.equal(customCreds.isCustom, true)

await resetAntigravityOAuthCredentials(mockSecrets)
const resetStatus = await getAntigravityOAuthStatus(mockSecrets, {})
assert.equal(resetStatus.configured, false)
assert.equal(resetStatus.isDefault, false)
assert.equal(resetStatus.hasCustomCredentials, false)
assert.equal(await getAntigravityOAuthCredentials(mockSecrets, {}), null)

console.log('✓ Google Antigravity OAuth credential configuration tests passed.')
