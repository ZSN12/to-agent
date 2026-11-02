import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { runSequentialModelAdds } from '../src/features/models/model-add-workflow.ts'

const calls = []
const progress = []
let active = 0
let maxActive = 0
const results = await runSequentialModelAdds(
  ['provider/first', 'provider/rejected', 'provider/throws', 'provider/last'],
  async (modelKey) => {
    calls.push(modelKey)
    active += 1
    maxActive = Math.max(maxActive, active)
    await Promise.resolve()
    active -= 1
    if (modelKey.endsWith('/rejected')) throw new Error('provider refused this model')
    if (modelKey.endsWith('/throws')) throw 'transport closed'
  },
  (result) => progress.push(result),
)

assert.deepEqual(calls, ['provider/first', 'provider/rejected', 'provider/throws', 'provider/last'])
assert.equal(maxActive, 1, 'model additions remain sequential')
assert.deepEqual(results, [
  { modelKey: 'provider/first', ok: true },
  { modelKey: 'provider/rejected', ok: false, error: 'provider refused this model' },
  { modelKey: 'provider/throws', ok: false, error: 'transport closed' },
  { modelKey: 'provider/last', ok: true },
])
assert.deepEqual(progress, results, 'each outcome is reported as soon as the request settles')
assert.deepEqual(await runSequentialModelAdds([], async () => { throw new Error('not called') }), [])

const [hook, modal, api, panel, roleModal, format] = await Promise.all([
  fs.readFile(new URL('../src/features/models/useModelCatalog.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/features/models/components/AddModelModal.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/shared/model-api.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/features/models/ModelSettingsPanel.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/features/models/components/ModelRoleAssignmentModal.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/features/models/format.ts', import.meta.url), 'utf8'),
])

assert.match(hook, /async \(modelKeys: string\[\], onItemResult\?: ModelAddItemResultListener\)/)
assert.match(hook, /return failures\.length === 0/, 'the hook keeps the legacy boolean aggregate result')
assert.match(hook, /runSequentialModelAdds\(modelKeys, executeAddModel, onItemResult\)/)
assert.match(modal, /onAddModels\(keys, onItemResult\)/, 'the modal consumes per-item progress')
assert.match(modal, /if \(result\.ok\)[\s\S]*?next\.delete\(result\.modelKey\)/, 'successful models leave the retry selection')
assert.match(modal, /addResults\[model\.key\]\.error/, 'failed models retain their own actionable error')
assert.match(modal, /savingRef\.current\) return/, 'submission ref prevents duplicate requests before React rerenders')
assert.match(modal, /requestId === discoveryRequestIdRef\.current/, 'late provider discovery responses are ignored')
assert.match(api, /workBuddyMultiplier\?: string/)
assert.match(api, /workBuddyMultiplierStatus\?: 'fresh' \| 'stale' \| 'unknown'/)
assert.match(api, /workBuddyMultiplierUpdatedAt\?: string/)
assert.doesNotMatch(panel, />\s*(目录待确认|已配置|待配置)\s*</, 'model rows do not display noisy catalog/configuration badges')
assert.doesNotMatch(panel, /CapabilityTierStatusCard|capabilityTierStatus/, 'the leaderboard capability status card is removed')
assert.doesNotMatch(panel, /ProfileModal|AllocationToggle|分配元数据/, 'per-model metadata and routing controls are replaced by role grouping')
assert.match(panel, /模型分档设计/)
assert.match(roleModal, /label: '审查'/)
assert.match(roleModal, /label: '编写'/)
assert.match(roleModal, /label: '查询'/)
assert.match(roleModal, /onDragStart/)
assert.match(roleModal, /onDrop/)
assert.match(roleModal, /taskRoles/)
assert.ok(/model.verificationStatus === 'unverified'/.test(modal), 'cache-only discovered models keep their directory qualification')
assert.doesNotMatch(panel, /verificationStatus[^\n]*disabled/, 'unverified directory metadata does not disable model addition')
assert.doesNotMatch(`${panel}\n${modal}\n${roleModal}\n${format}`, /multiplier-status|倍率数据.{0,4}(较新|可能过期|新鲜度未知)/)

console.log('Model settings checks passed: per-item add feedback, role-based drag-and-drop assignment, and removed metadata/capability/freshness UI.')
