import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createProfileStore } from '../electron/backend/profile-store.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-migrate-'))
const store = createProfileStore(root)
await store.addModel('opencodex/cursor/composer-2.5')
await store.upsertProfile('opencodex/cursor/composer-2.5', { tier: 'fast', capabilitySummary: 'x', enabledForAllocation: true, notes: '' })
await store.setActiveModelKey('opencodex/cursor/composer-2.5')

const { changed, migrated } = await store.migrateOpenCodexRoutesToBridge()
assert.equal(changed, true)
assert.deepEqual(migrated, [{ from: 'opencodex/cursor/composer-2.5', to: 'bridge-composer/cursor/composer-2.5' }])

const keys = await store.listAddedModelKeys()
assert.deepEqual(keys, ['bridge-composer/cursor/composer-2.5'])
assert.equal(await store.getActiveModelKey(), 'bridge-composer/cursor/composer-2.5')
const profile = await store.getProfile('bridge-composer/cursor/composer-2.5')
assert.equal(profile?.tier, 'fast')

await fs.rm(root, { recursive: true, force: true })
console.log('test-migrate-opencodex-routes: ok')
