import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAppPreferencesStore } from '../electron/backend/app-preferences.mjs'
import { normalizeOpenUsageBaseUrl } from '../electron/backend/openusage-service.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-preferences-'))
try {
  const store = createAppPreferencesStore(root)
  assert.equal((await store.get()).promptInjectionLimitBytes, 32 * 1024, 'prompt injection cap defaults to 32 KiB')
  assert.equal((await store.get()).adaptiveOrchestrationGate, true, 'adaptive gate defaults on')
  assert.equal((await store.get()).preferMultiAgent, false, 'prefer multi-agent defaults off')

  await store.set({ bashSandbox: 'read-only', promptInjectionLimitBytes: 24 * 1024 })
  const merged = await store.get()
  assert.equal(merged.bashSandbox, 'read-only')
  assert.equal(merged.promptInjectionLimitBytes, 24 * 1024, 'prompt injection cap persists')
  assert.equal(Object.hasOwn(merged, 'newSessionAgentPreset'), false, 'Agent preset is an internal automatic decision, not a user preference')
  const legacy = await store.set({ newSessionAgentPreset: 'code' })
  assert.equal(Object.hasOwn(legacy, 'newSessionAgentPreset'), false, 'legacy manual preset values are ignored')

  const belowMinimum = await store.set({ promptInjectionLimitBytes: 0 })
  assert.equal(belowMinimum.promptInjectionLimitBytes, 1024, 'prompt injection cap is clamped to 1 KiB minimum')
  const aboveMaximum = await store.set({ promptInjectionLimitBytes: 1024 * 1024 })
  assert.equal(aboveMaximum.promptInjectionLimitBytes, 128 * 1024, 'prompt injection cap is clamped to 128 KiB maximum')
  const rounded = await store.set({ promptInjectionLimitBytes: 4096.6 })
  assert.equal(rounded.promptInjectionLimitBytes, 4097, 'prompt injection cap is stored as a whole number of bytes')
  const invalid = await store.set({ promptInjectionLimitBytes: Number.NaN })
  assert.equal(invalid.promptInjectionLimitBytes, 4097, 'invalid update preserves the previous valid cap')

  // A legacy preferences file without the new key keeps its existing values
  // when the new preference is first written.
  await fs.writeFile(path.join(root, 'taskweaver-preferences.json'), JSON.stringify({
    bashSandbox: 'off',
    selfHealingLoop: false,
  }))
  assert.equal((await store.get()).promptInjectionLimitBytes, 32 * 1024, 'legacy preferences use the default cap')
  const upgraded = await store.set({ promptInjectionLimitBytes: 8192 })
  assert.equal(upgraded.promptInjectionLimitBytes, 8192)
  assert.equal(upgraded.bashSandbox, 'off', 'setting the new cap preserves existing preferences')
  assert.equal(upgraded.selfHealingLoop, false, 'setting the new cap preserves newer existing preferences')

  assert.equal(normalizeOpenUsageBaseUrl('http://127.0.0.1:6736'), 'http://127.0.0.1:6736')
  assert.equal(normalizeOpenUsageBaseUrl('127.0.0.1:8080'), 'http://127.0.0.1:8080')
  assert.equal(normalizeOpenUsageBaseUrl('http://evil.com'), null)
  assert.equal((await store.get()).openUsageBaseUrl, 'http://127.0.0.1:6736')
  const withUrl = await store.set({ openUsageBaseUrl: 'http://localhost:9000/' })
  assert.equal(withUrl.openUsageBaseUrl, 'http://localhost:9000')
  const badUrl = await store.set({ openUsageBaseUrl: 'http://192.168.1.1:6736' })
  assert.equal(badUrl.openUsageBaseUrl, 'http://localhost:9000', 'non-loopback URL is rejected')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}

console.log('app preference persistence tests passed')
