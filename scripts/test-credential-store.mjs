import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createCredentialStore } from '../backend/credential-store.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-credentials-'))
const filePath = path.join(root, 'private', 'credentials.enc')
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`test-encrypted:${value}`),
  decryptString: (value) => {
    const text = Buffer.from(value).toString('utf8')
    assert.ok(text.startsWith('test-encrypted:'), 'credential file should contain only encrypted payload')
    return text.slice('test-encrypted:'.length)
  },
}

try {
  const store = createCredentialStore({ filePath, safeStorage })
  assert.deepEqual(await store.list(), [], 'missing credential store should start empty')

  await Promise.all([
    store.modify('provider-a', () => ({ type: 'api-key', key: 'alpha-secret' })),
    store.modify('provider-b', () => ({ type: 'oauth', token: 'beta-secret' })),
  ])
  assert.deepEqual(await store.read('provider-a'), { type: 'api-key', key: 'alpha-secret' })
  assert.deepEqual(await store.read('provider-b'), { type: 'oauth', token: 'beta-secret' })
  assert.deepEqual((await store.list()).map(({ providerId, type }) => ({ providerId, type })).sort((a, b) => a.providerId.localeCompare(b.providerId)), [
    { providerId: 'provider-a', type: 'api-key' },
    { providerId: 'provider-b', type: 'oauth' },
  ])

  const diskValue = await fs.readFile(filePath, 'utf8')
  assert.equal(diskValue.includes('alpha-secret'), false, 'plaintext secrets must never reach disk')
  assert.equal(diskValue.includes('beta-secret'), false, 'concurrent updates must stay encrypted')
  if (process.platform !== 'win32') assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600)

  await store.delete('provider-a')
  assert.equal(await store.read('provider-a'), undefined)
  assert.deepEqual(await store.read('provider-b'), { type: 'oauth', token: 'beta-secret' }, 'deleting one provider must preserve others')

  const unavailable = createCredentialStore({ filePath, safeStorage: { isEncryptionAvailable: () => false } })
  await assert.rejects(unavailable.modify('provider', () => ({ type: 'api-key', key: 'secret' })), /安全存储当前不可用/)
  await assert.rejects(unavailable.read('provider'), /安全存储当前不可用/)

  const insecurePath = path.join(root, 'private', 'credentials-insecure.enc')
  const previousInsecure = process.env.TASKWEAVER_INSECURE_CREDENTIAL_STORE
  process.env.TASKWEAVER_INSECURE_CREDENTIAL_STORE = '1'
  const insecure = createCredentialStore({ filePath: insecurePath, safeStorage: { isEncryptionAvailable: () => false } })
  await insecure.modify('provider', () => ({ type: 'api-key', key: 'smoke-secret' }))
  assert.equal((await fs.readFile(insecurePath, 'utf8')).includes('smoke-secret'), false)
  assert.deepEqual(await insecure.read('provider'), { type: 'api-key', key: 'smoke-secret' })
  if (previousInsecure === undefined) delete process.env.TASKWEAVER_INSECURE_CREDENTIAL_STORE
  else process.env.TASKWEAVER_INSECURE_CREDENTIAL_STORE = previousInsecure

  const keychainPath = path.join(root, 'private', 'credentials-keychain.json')
  const keychain = new Map()
  const secrets = {
    async get(account) { return keychain.get(account) ?? null },
    async set(account, value) { keychain.set(account, value) },
    async delete(account) { keychain.delete(account) },
  }
  const keychainStore = createCredentialStore({
    filePath: keychainPath,
    safeStorage: { isEncryptionAvailable: () => false },
    secrets,
  })
  await keychainStore.modify('provider-keychain', () => ({ type: 'api-key', key: 'keychain-secret' }))
  assert.deepEqual(await keychainStore.read('provider-keychain'), { type: 'api-key', key: 'keychain-secret' })
  const keychainIndex = await fs.readFile(keychainPath, 'utf8')
  assert.equal(keychainIndex.includes('keychain-secret'), false, 'Keychain mode must persist references only')
  assert.equal(keychainIndex.includes('keychain:'), true)
  assert.equal(keychain.size, 1)
  await keychainStore.modify('provider-keychain', () => ({ type: 'api-key', key: 'rotated-secret' }))
  assert.deepEqual(await keychainStore.read('provider-keychain'), { type: 'api-key', key: 'rotated-secret' })
  assert.equal(keychain.size, 1, 'rotating a credential must delete its previous Keychain item')
  await keychainStore.delete('provider-keychain')
  assert.deepEqual(await keychainStore.list(), [])
  assert.equal(keychain.size, 0)

  const migratedPath = path.join(root, 'private', 'credentials-legacy.enc')
  const legacyCredentials = { oldProvider: { type: 'api-key', key: 'legacy-secret' } }
  await fs.writeFile(migratedPath, `tw-b64:${Buffer.from(JSON.stringify(legacyCredentials)).toString('base64')}\n`)
  const migratedStore = createCredentialStore({ filePath: migratedPath, safeStorage: { isEncryptionAvailable: () => false }, secrets })
  assert.deepEqual(await migratedStore.read('oldProvider'), legacyCredentials.oldProvider)
  assert.equal((await fs.readFile(migratedPath, 'utf8')).includes('legacy-secret'), false, 'legacy file credentials must migrate to Keychain references')

  const chromiumPath = path.join(root, 'private', 'credentials-chromium.enc')
  const chromiumBlob = Buffer.from('v10-encrypted-payload').toString('base64')
  await fs.writeFile(chromiumPath, chromiumBlob)
  const chromiumStore = createCredentialStore({
    filePath: chromiumPath,
    safeStorage: { isEncryptionAvailable: () => false },
    secrets,
  })
  assert.equal(await chromiumStore.read('provider'), undefined, 'unreadable Chromium credentials must not be treated as Keychain index data')
  assert.equal(await fs.access(chromiumPath).then(() => true, () => false), false, 'native Keychain mode should rename unreadable Chromium data')
  const chromiumArchive = (await fs.readdir(path.dirname(chromiumPath)))
    .find((name) => name.startsWith('credentials-chromium.enc.chromium-legacy-'))
  assert.ok(chromiumArchive, 'old Chromium credentials must be kept in a recoverable archive')
  assert.equal(await fs.readFile(path.join(path.dirname(chromiumPath), chromiumArchive), 'utf8'), chromiumBlob)

  console.log('credential store checks passed: encrypted persistence, Keychain references and migration, Chromium credential archival, concurrent updates, provider isolation, restrictive file mode, and fail-closed safeStorage')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
