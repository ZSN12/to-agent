import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ensureModelsJsonSyncedToDshHost } from '../desktop/backend/sync-models-json-to-host.mjs'

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-model-sync-'))
let apiKey = 'test-key-one'
const mutations = []
const credentialWrites = []
const credentialRemovals = []
let restarts = 0
const api = {
  settings: {
    async describe() {
      return { result: { ok: true, value: { namespaces: [
        { ns: 'llm-pi-ai', writable: true, revision: 1 },
        { ns: 'llm-taskweaver-bridge', writable: true, revision: 1 },
      ] } } }
    },
    async mutate(payload) {
      mutations.push(payload)
      return { revision: mutations.length + 1 }
    },
  },
  credentials: {
    async set(payload) { credentialWrites.push(payload); return {} },
    async unset(payload) { credentialRemovals.push(payload); return {} },
  },
}
const hostManager = {
  async start() { return { api } },
  async restart() { restarts += 1 },
}
const credentialStore = {
  async read(providerId) { return providerId === 'custom-gateway' && apiKey ? { key: apiKey } : null },
}

const modelDoc = (name = 'Composer') => ({
  providers: {
    'custom-gateway': {
      name: 'Custom Gateway',
      api: 'openai-completions',
      baseUrl: 'https://models.example/v1',
      models: [{ id: 'custom-model', name: 'Custom Model' }],
    },
    'bridge-composer': {
      name,
      api: 'taskweaver-bridge',
      bridgeKind: 'cursor',
      models: [{ id: 'cursor/composer-2.5', name: 'Composer 2.5' }],
    },
  },
})

const sync = (doc = modelDoc()) => ensureModelsJsonSyncedToDshHost({
  hostManager,
  userDataPath,
  credentialStore,
  modelsDocOverride: doc,
})

try {
  const first = await sync()
  assert.equal(first.synced, true)
  assert.equal(first.restarted, false, 'provider settings apply without restarting the Host')
  assert.deepEqual(mutations.map(({ ns }) => ns).sort(), ['llm-pi-ai', 'llm-taskweaver-bridge'])
  assert.equal(credentialWrites.length, 1)
  const statePath = path.join(userDataPath, 'taskweaver', 'host-model-sync-state.json')
  const stateText = await fs.readFile(statePath, 'utf8')
  assert.equal(stateText.includes(apiKey), false, 'persisted sync state never contains credential values')
  assert.equal((await fs.stat(statePath)).mode & 0o777, 0o600)

  const unchanged = await sync()
  assert.equal(unchanged.reason, 'unchanged')
  assert.equal(mutations.length, 2, 'unchanged settings are not rewritten')
  assert.equal(credentialWrites.length, 1, 'unchanged credentials are not resent')
  assert.equal(restarts, 0)

  const updatedProfile = await sync(modelDoc('Composer Renamed'))
  assert.equal(updatedProfile.synced, true, 'provider changes are hot-applied')
  assert.equal(updatedProfile.restarted, false)
  assert.equal(mutations.length, 4)
  assert.equal(credentialWrites.length, 1, 'profile-only updates do not rewrite credentials')
  assert.equal(restarts, 0)

  apiKey = 'test-key-two'
  const rotatedKey = await sync(modelDoc('Composer Renamed'))
  assert.equal(rotatedKey.synced, true, 'credential rotations are not hidden by an unchanged reference name')
  assert.equal(rotatedKey.restarted, false)
  assert.equal(mutations.length, 4, 'credential-only updates do not rewrite provider settings')
  assert.equal(credentialWrites.length, 2)
  assert.equal(credentialWrites[1].value, apiKey)
  assert.equal(restarts, 0)

  apiKey = null
  await sync(modelDoc('Composer Renamed'))
  assert.deepEqual(credentialRemovals, [{ ref: 'TASKWEAVER_CUSTOM_GATEWAY_API_KEY' }])
  assert.equal(restarts, 0)

  const environmentUserData = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-compaction-env-'))
  try {
    const compactionPath = path.join(environmentUserData, 'taskweaver', 'compaction-summarization.json')
    await fs.mkdir(path.dirname(compactionPath), { recursive: true })
    await fs.writeFile(compactionPath, JSON.stringify({ provider: 'legacy', model: 'legacy-summary' }))
    const environmentChange = await ensureModelsJsonSyncedToDshHost({
      hostManager,
      userDataPath: environmentUserData,
      modelsDocOverride: modelDoc('Composer'),
    })
    assert.equal(environmentChange.restarted, true, 'a changed spawn-time compaction environment is the only routine sync that restarts Host')
    assert.equal(restarts, 1)
  } finally {
    await fs.rm(environmentUserData, { recursive: true, force: true })
  }
} finally {
  await fs.rm(userDataPath, { recursive: true, force: true })
}

console.log('model sync hot-apply checks passed: digest gating, secret rotation, revocation, and no routine Host restart')
