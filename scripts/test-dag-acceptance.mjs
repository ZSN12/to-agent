import assert from 'node:assert/strict'
import { assessAcceptanceCriteria, assessSubtaskCompletion } from '../backend/orchestration/evidence.mjs'
import { parsePlan } from '../backend/orchestration/planner.mjs'
import { applyPlanApprovalChanges } from '../backend/orchestration/plan-approval.mjs'

const criteria = ['调用路径已核实', '异常行为有记录']
const report = (results) => `<taskweaver-acceptance-v1>${JSON.stringify({ results })}</taskweaver-acceptance-v1>`
const task = { id: 'T1', taskType: 'research', acceptance: criteria }

const completeText = `已读取相关源码。\n${report(criteria.map((criterion, index) => ({
  criterion,
  passed: true,
  evidence: `README.md 第 ${index + 1} 项`,
})))}`
assert.deepEqual(assessAcceptanceCriteria(task, completeText), {
  required: 2,
  passed: true,
  items: [
    { criterion: criteria[0], passed: true, evidence: 'README.md 第 1 项' },
    { criterion: criteria[1], passed: true, evidence: 'README.md 第 2 项' },
  ],
})
assert.equal(assessSubtaskCompletion(task, {
  text: completeText,
  executionEvidence: { observedToolCalls: [{ toolName: 'read', status: 'done' }] },
}).complete, true)
assert.match(assessSubtaskCompletion(task, {
  text: '已读取相关源码，但没有逐项报告验收结果。',
  executionEvidence: { observedToolCalls: [{ toolName: 'read', status: 'done' }] },
}).reason, /验收点未全部通过/)
assert.match(assessSubtaskCompletion(task, {
  text: `已读取相关源码。\n${report([{ criterion: criteria[0], passed: true, evidence: '有证据' }, { criterion: criteria[1], passed: false, evidence: '未满足' }])}`,
  executionEvidence: { observedToolCalls: [{ toolName: 'read', status: 'done' }] },
}).reason, /验收点未全部通过/)

assert.throws(() => parsePlan(JSON.stringify({ tasks: [{ id: 'T1', taskType: 'implementation' }] })), /必须提供 1 到 5 条/)
assert.throws(() => parsePlan(JSON.stringify({ tasks: [{ id: 'T1', taskType: 'implementation', acceptance: Array(6).fill('可检查') }] })), /必须提供 1 到 5 条/)
assert.equal(parsePlan(JSON.stringify({ tasks: [{ id: 'T1', taskType: 'implementation', acceptance: ['文件有结果'] }] }))[0].acceptance[0], '文件有结果')

const approvalTask = { id: 'T1', description: '实现功能', acceptance: ['功能有结果'], modelKey: 'mock/strong' }
const catalog = { models: [{ key: 'mock/strong', name: 'Strong', available: true }] }
assert.throws(() => applyPlanApprovalChanges([approvalTask], {
  edits: [{ id: 'T1', acceptance: [], description: '实现功能', modelKey: 'mock/strong' }],
  deletedTaskIds: [],
}, { catalog }), /验收点必须是 1 到 5 条/)

const implementation = { id: 'I1', taskType: 'implementation', acceptance: ['接口可调用'] }
assert.equal(assessSubtaskCompletion(implementation, {
  text: `已实现接口。\n${report([{ criterion: '接口可调用', passed: true, evidence: '调用返回 200' }])}`,
  fileChanges: [],
}).complete, false, 'implementation completion requires file changes or an explicit no-change reason')
assert.equal(assessSubtaskCompletion(implementation, {
  text: `已核对需求，无需改动，因为现有接口已经满足要求。\n${report([{ criterion: '接口可调用', passed: true, evidence: '现有接口返回 200' }])}`,
  fileChanges: [],
}).complete, true)
assert.match(assessSubtaskCompletion(implementation, {
  text: `已修改接口。\n${report([{ criterion: '接口可调用', passed: true, evidence: '调用返回 200' }])}`,
  fileChanges: [{ path: 'src/api.ts' }],
  verificationRequired: true,
  verification: { executed: true, passed: false, command: 'pnpm test', exitCode: 1 },
}).reason, /验证命令/)

console.log('DAG acceptance focused tests passed')
