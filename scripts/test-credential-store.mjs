import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createCredentialStore } from '../electron/backend/credential-store.mjs'

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

  console.log('credential store checks passed: encrypted persistence, concurrent updates, provider isolation, restrictive file mode, and fail-closed safeStorage')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
