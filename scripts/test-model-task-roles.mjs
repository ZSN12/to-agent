import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createProfileStore } from '../backend/profile-store.mjs'
import { selectModelForTask } from '../backend/orchestration-policy.mjs'
import { createModelFilter } from '../backend/orchestration/model-filter.mjs'

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-model-role-test-'))

try {
  const store = createProfileStore(userDataPath)
  const keys = ['role-review', 'role-writing', 'role-query', 'role-unassigned']
  for (const key of keys) await store.addModel(key)

  await store.upsertProfile('role-review', { taskRoles: ['review'] })
  await store.upsertProfile('role-writing', { taskRoles: ['writing'] })
  await store.upsertProfile('role-query', { taskRoles: ['query'] })
  assert.equal((await store.getProfile('role-review'))?.enabledForAllocation, true, 'role assignment automatically enables routing')
  await store.upsertProfile('role-unassigned', { taskRoles: [] })

  assert.equal(await store.isTaskRoleRoutingEnabled(), true)
  await assert.rejects(
    store.upsertProfile('role-review', { taskRoles: ['summarize'] }),
    /只能是 review、writing 或 query/,
  )
  await store.setActiveModelKey('role-review')
  await store.setThinkingLevel('high')
  assert.deepEqual((await store.getProfile('role-review'))?.taskRoles, ['review'], 'thinking-level updates preserve role assignment')

  const profiles = await store.listProfiles()
  const catalog = {
    taskRoleRoutingEnabled: await store.isTaskRoleRoutingEnabled(),
    models: keys.map((key) => ({
      key,
      id: key,
      name: key,
      provider: 'test',
      available: true,
      routeRegistered: true,
      costPerMillion: { input: 0, output: 0 },
      profile: profiles[key],
    })),
  }

  assert.equal(selectModelForTask('review', catalog, 'role-unassigned').model?.key, 'role-review')
  assert.equal(selectModelForTask('implementation', catalog, 'role-query').model?.key, 'role-writing')
  assert.equal(selectModelForTask('test', catalog, 'role-review').model?.key, 'role-writing')
  assert.equal(selectModelForTask('research', catalog, 'role-writing').model?.key, 'role-query')
  assert.equal(selectModelForTask('planning', catalog, 'role-writing').model?.key, 'role-query')

  const legacyEnabled = {
    ...catalog.models[0],
    key: 'legacy-enabled',
    profile: { enabledForAllocation: true },
  }
  const explicitEmpty = {
    ...catalog.models[0],
    key: 'explicit-empty',
    profile: { enabledForAllocation: false, taskRoles: [] },
  }
  const mixedFilter = createModelFilter({ taskType: 'review', taskRoleRoutingEnabled: true })
  assert.deepEqual(
    mixedFilter.filterAll([catalog.models[0], legacyEnabled, explicitEmpty]).map((model) => model.key),
    ['role-review', 'legacy-enabled'],
    'legacy enabled models remain candidates, while explicit empty roles opt out',
  )

  const missingReview = selectModelForTask('review', {
    taskRoleRoutingEnabled: true,
    models: [catalog.models.find((model) => model.key === 'role-writing')],
  }, 'role-writing')
  assert.equal(missingReview.model, null, 'an explicitly categorized model cannot be routed into another role')
  assert.match(missingReview.reason, /尚未给“审查”分配模型/)

  const legacy = selectModelForTask('research', {
    models: [
      { ...catalog.models.find((model) => model.key === 'role-query'), profile: { tier: 'cheap', enabledForAllocation: true } },
      { ...catalog.models.find((model) => model.key === 'role-writing'), profile: { tier: 'strong', enabledForAllocation: true } },
    ],
  }, 'role-writing')
  assert.equal(legacy.model?.key, 'role-query', 'catalogs without role mode keep their previous tier-based selection')

  const concurrentStore = createProfileStore(path.join(userDataPath, 'concurrent'))
  const concurrentKeys = Array.from({ length: 24 }, (_, index) => `concurrent/model-${index}`)
  await Promise.all(concurrentKeys.map((key) => concurrentStore.addModel(key)))
  await Promise.all(concurrentKeys.map((key, index) => concurrentStore.upsertProfile(key, {
    taskRoles: [['review'], ['writing'], ['query']][index % 3],
  })))
  await Promise.all([
    concurrentStore.setActiveModelKey(concurrentKeys[0]),
    concurrentStore.setThinkingLevel('high'),
  ])
  const concurrentState = JSON.parse(await fs.readFile(concurrentStore.filePath, 'utf8'))
  assert.deepEqual(new Set(concurrentState.addedModelKeys), new Set(concurrentKeys), 'concurrent additions do not overwrite one another')
  assert.equal(Object.values(concurrentState.profiles).filter((profile) => profile.taskRoles?.length).length, concurrentKeys.length,
    'concurrent role updates all persist')
  assert.equal(concurrentState.activeModelKey, concurrentKeys[0], 'concurrent active-model update is retained')
  assert.equal(concurrentState.thinkingLevel, 'high', 'concurrent thinking-level update is retained')
  assert.deepEqual((await fs.readdir(path.dirname(concurrentStore.filePath))).filter((name) => name.endsWith('.tmp')), [],
    'atomic profile writes leave no temporary files behind')

  console.log('Model task-role checks passed: profile persistence, concurrent atomic updates, legacy compatibility, task filtering, and empty-role failures.')
} finally {
  await fs.rm(userDataPath, { recursive: true, force: true })
}
