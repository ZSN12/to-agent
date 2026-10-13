import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildCapabilityTierSnapshot, leaderboardNameForms } from './sync-capability-tiers.mjs'
import {
  canonicalModelIdFromRoute,
  createCapabilityTierService,
  resolveCapabilityTier,
  validateCapabilityTierSnapshot,
} from '../backend/capability-tiers.mjs'
import { createProfileStore } from '../backend/profile-store.mjs'

const aliases = JSON.parse(await fs.readFile(new URL('../pricing/model-aliases.json', import.meta.url), 'utf8'))
const registry = {
  models: {
    'qwen-token-plan/qwen3.8-max': { id: 'qwen3.8-max' },
    'zai/glm-5.3': { id: 'glm-5.3' },
    'openai-codex/gpt-5.6-sol': { id: 'gpt-5.6-sol' },
    'openai/gpt-5.6-sol': { id: 'gpt-5.6-sol' },
    'xai/grok-4.6': { id: 'grok-4.6' },
    'google/gemini-3.1-pro-preview': { id: 'gemini-3.1-pro-preview' },
    'moonshotai/kimi-k2.7-code': { id: 'kimi-k2.7-code' },
    'deepseek/deepseek-flash': { id: 'deepseek-flash' },
    'first/foo': { id: 'foo' },
    'second/foo': { id: 'foo' },
  },
}
const boards = {
  webdev: [
    { model_name: 'qwen3.8-max', rating: 1672, vote_count: 2000, category: 'overall', leaderboard_publish_date: '2026-10-08' },
    { model_name: 'glm-5.3-max', rating: 1622, vote_count: 2000, category: 'overall', leaderboard_publish_date: '2026-10-08' },
    { model_name: 'gpt-5.6-sol-xhigh (codex-harness)', rating: 1618, vote_count: 2000, category: 'overall' },
    { model_name: 'gpt-5.6-sol-xhigh', rating: 1620, vote_count: 2000, category: 'overall' },
    { model_name: 'grok-4.6-high', rating: 1617, vote_count: 2000, category: 'overall' },
    { model_name: 'gemini-3.1-pro-preview', rating: 1447, vote_count: 2000, category: 'overall' },
    { model_name: 'kimi-k2.7-code', rating: 1473, vote_count: 2000, category: 'overall' },
    { model_name: 'foo', rating: 1700, vote_count: 2000, category: 'overall' },
    { model_name: 'low-vote-model', rating: 1800, vote_count: 978, category: 'overall' },
  ],
  text: [
    { model_name: 'grok-4.6-high', rating: 1454, vote_count: 2000, category: 'overall' },
    { model_name: 'gemini-3.1-pro-preview', rating: 1487, vote_count: 2000, category: 'overall' },
  ],
}

assert.deepEqual(leaderboardNameForms('qwen3.8-max').slice(0, 2), ['qwen3.8-max', 'qwen3.8'])
assert.equal(canonicalModelIdFromRoute('openai-codex/gpt-5.6-sol', aliases), 'openai/gpt-5.6-sol')
assert.equal(canonicalModelIdFromRoute('openrouter/anthropic/claude-fable-5-1', aliases), 'anthropic/claude-fable-5-1')
assert.equal(canonicalModelIdFromRoute('amazon-bedrock/apac.anthropic.claude-fable-5-1', aliases), 'anthropic/claude-fable-5-1')

const snapshot = buildCapabilityTierSnapshot({
  registry,
  aliases,
  boards,
  fetchedAt: '2026-10-10T00:00:00.000Z',
})
assert.equal(snapshot.thresholdsVersion, 'arena-2026-10-a')
assert.equal(snapshot.models['alibaba/qwen3.8-max'].fetchedAt, '2026-10-10T00:00:00.000Z')
assert.equal(snapshot.models['alibaba/qwen3.8-max'].tier, 'strong', 'T1 literal -max model names match before suffix stripping')
assert.equal(snapshot.models['zai/glm-5.3'].tier, 'strong', 'T2 reasoning -max suffix is stripped only after exact matching')
assert.equal(snapshot.models['openai/gpt-5.6-sol'].boards.webdev.rating, 1620, 'T3 keeps the highest-scoring variant')
assert.equal(snapshot.models['openai/gpt-5.6-sol'].boards.webdev.matchedName, 'gpt-5.6-sol-xhigh')
assert.equal(snapshot.models['xai/grok-4.6'].tier, 'strong', 'T8 uses the higher tier from either board')
assert.equal(snapshot.models['google/gemini-3.1-pro-preview'].tier, 'strong', 'T8 can be strong based on Text alone')
assert.equal(snapshot.models['moonshotai/kimi-k2.7-code'].tier, 'medium', 'T9 accepts a single board result')
assert.equal(snapshot.models['moonshotai/kimi-k2.7-code'].status, 'single-board')
assert.equal(snapshot.models['deepseek/deepseek-flash'].tier, 'medium')
assert.equal(snapshot.models['deepseek/deepseek-flash'].status, 'unrated')
assert.equal(snapshot.models['first/foo'].status, 'unrated', 'ambiguous exact matches fail closed')
assert.equal(canonicalModelIdFromRoute('opencode/gpt-5.6-sol', aliases), 'openai/gpt-5.6-sol', 'known provider routes share an exact canonical model identity')
assert.equal(canonicalModelIdFromRoute('qwen-token-plan/qwen3.8-max', aliases), 'alibaba/qwen3.8-max')
assert.equal(canonicalModelIdFromRoute('zai-coding-cn/glm-5.3', aliases), 'zai/glm-5.3')
assert.equal(canonicalModelIdFromRoute('github-copilot/grok-4.6', aliases), 'xai/grok-4.6')
assert.equal(snapshot.diagnostics.ambiguousRows, 1)
assert.equal(snapshot.diagnostics.unmatchedRows, 0, 'low-vote entries are ignored before matching')

const bundledSnapshot = validateCapabilityTierSnapshot(JSON.parse(await fs.readFile(
  new URL('../pricing/capability-tiers.json', import.meta.url),
  'utf8',
)))
assert.equal(bundledSnapshot.source.license, 'CC BY 4.0')
assert.match(bundledSnapshot.source.attribution, /LMArena Leaderboard Dataset/)
assert.ok(Object.keys(bundledSnapshot.models).length > 0, 'the packaged snapshot must contain generated model records')

const laterSnapshot = structuredClone(snapshot)
laterSnapshot.models['xai/grok-4.6'].tier = 'medium'
const override = resolveCapabilityTier(laterSnapshot, 'xai/grok-4.6', aliases, 'weak')
assert.equal(override.tier, 'weak', 'user overrides win over refreshed snapshots')
assert.equal(override.defaultTier, 'medium')
assert.equal(override.source, 'user')

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-capability-tiers-'))
try {
  const future = Date.now() + 60_000
  const cachePath = path.join(userDataPath, 'taskweaver', 'capability-tiers-cache.json')
  const bundledPath = path.join(userDataPath, 'bundled.json')
  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  await fs.writeFile(cachePath, JSON.stringify({ ...snapshot, fetchedAt: new Date(future - 31 * 24 * 60 * 60 * 1000).toISOString() }))
  await fs.writeFile(bundledPath, JSON.stringify(snapshot))
  let fetches = 0
  const service = createCapabilityTierService({
    userDataPath,
    bundledSnapshotPath: bundledPath,
    aliasesPath: path.join(userDataPath, 'aliases.json'),
    snapshotUrl: 'https://tiers.example.test/snapshot.json',
    now: () => future,
    fetchImpl: async () => {
      fetches += 1
      throw new Error('offline')
    },
  })
  const initial = await service.getState()
  assert.equal(initial.source, 'cache', 'offline startup prefers its local cache')
  assert.equal(initial.stale, true, 'T5 warns when fetched data is older than 30 days')
  const result = await service.refresh({ force: true })
  assert.equal(result.error, 'offline')
  assert.equal((await service.getState()).source, 'cache', 'failed refresh keeps the cache')
  assert.equal(fetches, 1)

  const fallbackService = createCapabilityTierService({
    userDataPath: path.join(userDataPath, 'other'),
    bundledSnapshotPath: bundledPath,
    aliasesPath: path.join(userDataPath, 'aliases.json'),
    snapshotUrl: null,
  })
  const fallback = await fallbackService.getState()
  assert.equal(fallback.source, 'bundled', 'a missing user cache falls back to the packaged snapshot')

  const changedSnapshot = structuredClone(snapshot)
  changedSnapshot.fetchedAt = new Date(future).toISOString()
  changedSnapshot.models['xai/grok-4.6'].tier = 'medium'
  const refreshedService = createCapabilityTierService({
    userDataPath: path.join(userDataPath, 'refresh'),
    bundledSnapshotPath: bundledPath,
    aliasesPath: path.join(userDataPath, 'aliases.json'),
    snapshotUrl: 'https://tiers.example.test/snapshot.json',
    now: () => future,
    fetchImpl: async () => {
      fetches += 1
      await new Promise((resolve) => setTimeout(resolve, 5))
      return { ok: true, json: async () => changedSnapshot }
    },
  })
  const [firstRefresh, joinedRefresh] = await Promise.all([
    refreshedService.refresh({ force: true }),
    refreshedService.refresh({ force: true }),
  ])
  assert.equal(fetches, 2, 'concurrent refresh requests share one in-flight fetch')
  assert.deepEqual(firstRefresh, joinedRefresh)
  assert.deepEqual(firstRefresh.changes, [{ canonicalId: 'xai/grok-4.6', before: 'strong', after: 'medium' }])
  assert.equal((await refreshedService.getState()).snapshot.models['xai/grok-4.6'].tier, 'medium')

  const profiles = createProfileStore(userDataPath)
  await profiles.addModel('openai/gpt-6-luna')
  await profiles.upsertProfile('openai/gpt-6-luna', { tier: 'cheap', capabilityTierOverride: 'weak' })
  await profiles.setActiveModelKey('openai/gpt-6-luna')
  await profiles.setThinkingLevel('high')
  assert.equal((await profiles.getProfile('openai/gpt-6-luna')).capabilityTierOverride, 'weak', 'thinking-level updates preserve the capability override')
  await profiles.upsertProfile('openai/gpt-6-luna', { capabilityTierOverride: null })
  assert.equal((await profiles.getProfile('openai/gpt-6-luna')).capabilityTierOverride, undefined, 'null clears the user override')
  await assert.rejects(
    profiles.upsertProfile('openai/gpt-6-luna', { capabilityTierOverride: 'automatic' }),
    /能力档位覆盖/,
  )
} finally {
  await fs.rm(userDataPath, { recursive: true, force: true })
}

console.log('capability tier checks passed: exact matching, thresholds, ambiguity, overrides, offline cache and expiry')
