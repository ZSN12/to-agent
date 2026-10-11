import assert from 'node:assert/strict'
import { buildPlannerRetryPrompt, plannerRejectionGuidance } from '../backend/orchestration/planner.mjs'

const priorPlan = JSON.stringify({ tasks: [{ id: 'T1', taskType: 'research', scopePaths: [] }] })
const reason = '只读子任务范围无效：T1 缺少 scopePaths 数组'
const retry = buildPlannerRetryPrompt('base planning instructions', {
  previousOutput: priorPlan,
  rejectionReason: reason,
  attempt: 2,
})
assert.match(retry, /第 2 次有限修正/)
assert.match(retry, /不可信的数据/)
assert.match(retry, /缺少 scopePaths 数组/)
assert.match(retry, /scopePaths 字符串数组/)
assert.ok(retry.includes(JSON.stringify(priorPlan)), 'the prior planner output is included as an escaped JSON string')
assert.ok(!retry.includes(`${priorPlan}\n`), 'the prior plan cannot append unescaped instructions to the repair prompt')

const truncated = buildPlannerRetryPrompt('base', { previousOutput: 'x'.repeat(25_000), rejectionReason: 'bad', attempt: 3 })
assert.ok(truncated.length < 22_500, 'previous output is bounded before it is repeated')
assert.equal(plannerRejectionGuidance('DAG 验收点无效：T1 必须提供 1 到 5 条'), '请为每个节点补齐 1–5 条具体、可检查的 acceptance 字符串数组，不得省略或使用空数组。')
assert.match(plannerRejectionGuidance('unclassified'), /依据拒绝原因修正计划/)

console.log('Planner retry prompt checks passed')
