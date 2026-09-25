import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createCredentialStore } from '../electron/backend/credential-store.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-credential-store-'))
const filePath = path.join(root, 'taskweaver', 'credentials.enc')
const prefix = 'test-encrypted:'
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`${prefix}${value}`),
  decryptString: (value) => {
    const decoded = value.toString()
    assert.ok(decoded.startsWith(prefix))
    return decoded.slice(prefix.length)
  },
}

try {
  const store = createCredentialStore({ filePath, safeStorage })
  const secret = 'test-api-key-not-plaintext'
  await store.modify('deepseek', async () => ({ type: 'api_key', key: secret }))
  const serialized = await fs.readFile(filePath, 'utf8')
  assert.equal(serialized.includes(secret), false)
  assert.deepEqual(await store.read('deepseek'), { type: 'api_key', key: secret })
  assert.deepEqual(await store.list(), [{ providerId: 'deepseek', type: 'api_key' }])
  await store.modify('deepseek', async (current) => current)
  assert.deepEqual(await store.read('deepseek'), { type: 'api_key', key: secret })
  await store.delete('deepseek')
  assert.equal(await store.read('deepseek'), undefined)
  console.log('credential store checks passed: encrypted persistence, metadata-only listing, update and delete')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
