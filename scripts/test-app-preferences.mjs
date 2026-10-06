import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAppPreferencesStore } from '../electron/backend/app-preferences.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-preferences-'))
try {
  const store = createAppPreferencesStore(root)
  await store.set({ bashSandbox: 'read-only' })
  const merged = await store.get()
  assert.equal(merged.bashSandbox, 'read-only')
  assert.equal(Object.hasOwn(merged, 'newSessionAgentPreset'), false, 'Agent preset is an internal automatic decision, not a user preference')
  const legacy = await store.set({ newSessionAgentPreset: 'code' })
  assert.equal(Object.hasOwn(legacy, 'newSessionAgentPreset'), false, 'legacy manual preset values are ignored')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}

console.log('app preference persistence tests passed')
