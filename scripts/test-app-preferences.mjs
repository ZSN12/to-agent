import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAppPreferencesStore } from '../backend/app-preferences.mjs'
import { normalizeOpenUsageBaseUrl } from '../backend/openusage-service.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-preferences-'))
try {
  const store = createAppPreferencesStore(root)
  assert.equal((await store.get()).promptInjectionLimitBytes, 128 * 1024, 'prompt injection cap defaults to the safe 128 KiB ceiling')
  assert.equal((await store.get()).inlineSmallFileReferences, false, 'small-file inline references default off')
  assert.equal((await store.set({ inlineSmallFileReferences: true })).inlineSmallFileReferences, true)
  assert.equal((await store.set({ inlineSmallFileReferences: 'invalid' })).inlineSmallFileReferences, true,
    'invalid inline-reference preference updates preserve the previous value')
  assert.equal((await store.set({ inlineSmallFileReferences: false })).inlineSmallFileReferences, false)
  const preferences = await store.get()
  assert.equal(Object.hasOwn(preferences, 'adaptiveOrchestrationGate'), false, 'the removed adaptive gate is absent from the settings contract')
  await fs.writeFile(path.join(root, 'taskweaver-preferences.json'), JSON.stringify({ adaptiveOrchestrationGate: true }))
  assert.equal(Object.hasOwn(await store.get(), 'adaptiveOrchestrationGate'), false, 'legacy gate settings are ignored')
  assert.equal((await store.get()).preferMultiAgent, false, 'prefer multi-agent defaults off')
  assert.equal((await store.get()).dagReadOnlyTimeoutMs, 600_000, 'DAG read-only timeout defaults to ten minutes')
  assert.equal((await store.get()).dagWriteTimeoutMs, 1_200_000, 'DAG writer timeout defaults to twenty minutes')
  assert.equal((await store.get()).dagIdleTimeoutMs, 180_000, 'DAG idle timeout defaults to three minutes')
  assert.equal((await store.get()).maxSubtaskConcurrency, 3, 'DAG concurrency defaults to three tasks')
  assert.equal((await store.get()).maxDagNodes, 6, 'DAG node limit defaults to the legacy six-node behavior')
  assert.equal((await store.get()).dagPlanApproval, 'write-only', 'DAG plan approval defaults to write-only plans')
  assert.equal((await store.get()).dagCrossProviderReview, false, 'DAG cross-provider review defaults off')
  assert.equal((await store.set({ dagCrossProviderReview: true })).dagCrossProviderReview, true)
  assert.equal((await store.set({ dagCrossProviderReview: 'invalid' })).dagCrossProviderReview, true,
    'invalid review preference updates preserve the last valid value')
  assert.equal((await store.set({ dagCrossProviderReview: false })).dagCrossProviderReview, false)
  assert.equal((await store.get()).dagBudgetTokens, 2_000_000, 'DAG token budget defaults to two million')
  assert.equal((await store.get()).dagBudgetUsd, 2, 'DAG cost budget defaults to two dollars')
  assert.equal((await store.get()).compactionThresholdRatio, 0.8, 'DSH compaction threshold defaults to 80%')
  assert.equal((await store.set({ dagPlanApproval: 'always' })).dagPlanApproval, 'always')
  assert.equal((await store.set({ dagPlanApproval: 'invalid' })).dagPlanApproval, 'always', 'invalid DAG approval modes preserve the previous valid value')
  assert.equal((await store.set({ dagPlanApproval: 'write-only' })).dagPlanApproval, 'write-only')

  const dagTimeouts = await store.set({ dagReadOnlyTimeoutMs: 0, dagWriteTimeoutMs: 90 * 60_000, dagIdleTimeoutMs: 240_000 })
  assert.equal(dagTimeouts.dagReadOnlyTimeoutMs, 1_000, 'DAG timeout is clamped to a positive one-second minimum')
  assert.equal(dagTimeouts.dagWriteTimeoutMs, 60 * 60_000, 'DAG timeout is clamped to a one-hour maximum')
  assert.equal(dagTimeouts.dagIdleTimeoutMs, 240_000, 'DAG idle timeout persists')
  const dagConcurrency = await store.set({ maxSubtaskConcurrency: 20 })
  assert.equal(dagConcurrency.maxSubtaskConcurrency, 10, 'DAG concurrency is clamped to ten')
  assert.equal((await store.set({ maxSubtaskConcurrency: 2 })).maxSubtaskConcurrency, 2)
  assert.equal((await store.set({ maxSubtaskConcurrency: 0 })).maxSubtaskConcurrency, 1, 'DAG concurrency has a one-task minimum')
  assert.equal((await store.set({ maxDagNodes: 99 })).maxDagNodes, 12, 'DAG node limit is clamped to twelve')
  assert.equal((await store.set({ maxDagNodes: 1.4 })).maxDagNodes, 1, 'DAG node limit rounds then clamps to its minimum')
  assert.equal((await store.set({ maxDagNodes: Number.NaN })).maxDagNodes, 1, 'invalid DAG node limit preserves the previous valid value')
  const dagBudgets = await store.set({ dagBudgetTokens: 999, dagBudgetUsd: 0 })
  assert.equal(dagBudgets.dagBudgetTokens, 1_000, 'DAG token budget has a one-thousand-token minimum')
  assert.equal(dagBudgets.dagBudgetUsd, 0.01, 'DAG cost budget has a one-cent minimum')
  assert.equal((await store.set({ compactionThresholdRatio: 0.55 })).compactionThresholdRatio, 0.6,
    'compaction threshold is clamped to 60%')
  assert.equal((await store.set({ compactionThresholdRatio: 0.95 })).compactionThresholdRatio, 0.9,
    'compaction threshold is capped at 90%')
  assert.equal((await store.set({ compactionThresholdRatio: Number.NaN })).compactionThresholdRatio, 0.9,
    'invalid compaction threshold preserves the previous valid value')
  const highDagBudgets = await store.set({ dagBudgetTokens: 200_000_000, dagBudgetUsd: 20_000 })
  assert.equal(highDagBudgets.dagBudgetTokens, 100_000_000, 'DAG token budget is capped at a safe upper bound')
  assert.equal(highDagBudgets.dagBudgetUsd, 10_000, 'DAG cost budget is capped at ten thousand dollars')
  assert.equal((await store.set({ dagBudgetTokens: Number.NaN, dagBudgetUsd: Number.NaN })).dagBudgetTokens, 100_000_000,
    'invalid budget values preserve the last valid token budget')

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
  assert.equal((await store.get()).promptInjectionLimitBytes, 128 * 1024, 'legacy preferences use the new model-scaled cap')
  const upgraded = await store.set({ promptInjectionLimitBytes: 8192 })
  assert.equal(upgraded.promptInjectionLimitBytes, 8192)
  assert.equal(upgraded.bashSandbox, 'off', 'setting the new cap preserves existing preferences')
  assert.equal(upgraded.selfHealingLoop, false, 'setting the new cap preserves newer existing preferences')
  const migratedFile = JSON.parse(await fs.readFile(path.join(root, 'taskweaver-preferences.json'), 'utf8'))
  assert.equal(migratedFile.version, 1, 'legacy settings are migrated and written with a schema version')
  assert.equal(Object.hasOwn(upgraded, 'version'), false, 'the storage version stays private to the persistence layer')

  const v0Dir = path.join(root, 'v0')
  await fs.mkdir(v0Dir)
  await fs.writeFile(path.join(v0Dir, 'taskweaver-preferences.json'), JSON.stringify({
    version: 0,
    bashSandbox: 'workspace-write',
  }))
  const v0Store = createAppPreferencesStore(v0Dir)
  assert.equal((await v0Store.get()).bashSandbox, 'workspace-write')
  assert.equal(JSON.parse(await fs.readFile(path.join(v0Dir, 'taskweaver-preferences.json'), 'utf8')).version, 1)

  const futureDir = path.join(root, 'future')
  await fs.mkdir(futureDir)
  await fs.writeFile(path.join(futureDir, 'taskweaver-preferences.json'), JSON.stringify({ version: 9, marker: 'preserve-me' }))
  const futureStore = createAppPreferencesStore(futureDir)
  await assert.rejects(() => futureStore.get(), /高于当前支持版本/)
  const futureFile = JSON.parse(await fs.readFile(path.join(futureDir, 'taskweaver-preferences.json'), 'utf8'))
  assert.equal(futureFile.marker, 'preserve-me', 'newer preference files are not overwritten by older builds')

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
