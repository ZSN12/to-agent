import assert from 'node:assert/strict'
import {
  decideOrchestrationMode,
  ORCHESTRATION_GATE_MAX_INPUT_CHARS,
  ORCHESTRATION_GATE_THRESHOLDS,
} from '../backend/orchestration-gate.mjs'

function expectMode(text, expected, context, label) {
  const result = decideOrchestrationMode(text, context)
  assert.equal(result.mode, expected, `${label}: ${JSON.stringify(text)} → ${result.mode}`)
  assert.ok(Number.isFinite(result.confidence), `${label}: confidence must be a number`)
  assert.ok(result.confidence >= 0 && result.confidence <= 1, `${label}: confidence must be within [0, 1]`)
  assert.ok(Array.isArray(result.reasons) && result.reasons.length > 0, `${label}: include an explanation`)
  return result
}

assert.deepEqual(decideOrchestrationMode(''), {
  mode: 'single-agent',
  confidence: 1,
  reasons: ['空请求不触发多 Agent 编排。'],
})
expectMode(null, 'single-agent', undefined, 'null input is safe')
expectMode('跨模块', 'single-agent', null, 'below-threshold cross-module mention stays single-agent')
expectMode('修复一个按钮颜色', 'single-agent', undefined, 'localized change')
expectMode('为什么前后端的职责不同？', 'single-agent', undefined, 'ordinary cross-domain question')

const thresholdEdge = expectMode('跨模块实现', 'ask-user', undefined, 'minimum grey-zone threshold')
assert.equal(ORCHESTRATION_GATE_THRESHOLDS.askUserMinScore, 35)
assert.equal(thresholdEdge.confidence, 0.35, 'the minimum grey-zone score is reported deterministically')
assert.match(thresholdEdge.reasons.join(' '), /缺少明确独立任务或多个路径簇/)
expectMode('修改前端和后端的登录流程', 'ask-user', undefined, 'cross-workstream task without independence')
expectMode('实现跨模块功能并完成全链路检查', 'ask-user', undefined, 'high complexity still asks without separability evidence')

const independent = expectMode(
  '请并行推进两项独立研究：一项检查前端交互，一项审查后端接口，最后交叉汇总。',
  'multi-agent',
  undefined,
  'explicit independent tasks',
)
assert.equal(independent.confidence, 0.94)
expectMode('并行推进任务 A 和任务 B，分别实现后汇总', 'multi-agent', undefined, 'enumerated parallel tasks')
expectMode('拆成两个互不依赖的子任务分别完成', 'multi-agent', undefined, 'explicitly independent subtasks')

const pathClusters = expectMode(
  '统一处理 @src/features/chat/Composer.tsx 与 @backend/orchestration-policy.mjs。',
  'multi-agent',
  undefined,
  'multiple explicit path clusters',
)
assert.equal(pathClusters.confidence, 0.96)
assert.match(pathClusters.reasons.join(' '), /src\/features\/chat/)
expectMode(
  '比较 @src/features/chat/Composer.tsx 和 @src/features/roles/RoleModeControls.tsx。',
  'multi-agent',
  undefined,
  'distinct path clusters under one repository root',
)
expectMode(
  '修改 @backend/chat-send.mjs 与 @backend/chat-session.mjs。',
  'single-agent',
  undefined,
  'multiple files in one path cluster do not imply parallel work',
)
expectMode(
  '先检查 @src/features/chat/Composer.tsx，再根据结果修改 @backend/chat-send.mjs 接口。',
  'multi-agent',
  undefined,
  'explicit cross-path dependency can be represented by DAG edges',
)
expectMode(
  '先检查前端流程，再根据结果修改后端接口。',
  'ask-user',
  undefined,
  'cross-workstream language without explicit scopes stays in the grey zone',
)
expectMode(
  '先检查并逐步修复同一个文件里的函数问题。',
  'single-agent',
  undefined,
  'local sequential work stays single-agent',
)

expectMode('普通描述一个工作项', 'single-agent', { modeOverrides: ['single-agent'] }, 'explicit single mode')
expectMode(
  '跨模块实现',
  'single-agent',
  { modeOverrides: ['single-agent', 'multi-agent'], preferMultiAgent: true, skillRequiresDag: true },
  'explicit single mode wins conflicting DAG controls',
)
expectMode('你好', 'multi-agent', { modeOverrides: ['multi-agent'] }, 'explicit multi mode bypasses text scoring')
expectMode('你好', 'multi-agent', { executionModeOverride: 'multi-agent' }, 'execution override alias')
expectMode('mention a prefix value', 'single-agent', undefined, 'English path fragments do not count as an action')
expectMode('你好', 'multi-agent', { workMode: 'goal' }, 'goal mode forces multi-agent')
expectMode('你好', 'single-agent', { workMode: 'plan', preferMultiAgent: true }, 'plan mode keeps single-agent')
expectMode('你好', 'multi-agent', { skillRequiresDag: true }, 'required DAG skill')
expectMode('你好', 'multi-agent', { preferMultiAgent: true }, 'saved multi-agent preference')

const oversized = `${'普通描述。'.repeat(Math.ceil(ORCHESTRATION_GATE_MAX_INPUT_CHARS / 5))}跨模块实现`
const bounded = expectMode(oversized, 'single-agent', undefined, 'scan is bounded to the leading input window')
assert.match(bounded.reasons.join(' '), new RegExp(`仅扫描前 ${ORCHESTRATION_GATE_MAX_INPUT_CHARS} 字符`))
assert.equal(
  JSON.stringify(decideOrchestrationMode('修改前端和后端的登录流程')),
  JSON.stringify(decideOrchestrationMode('修改前端和后端的登录流程')),
  'same input must produce byte-for-byte deterministic output',
)

console.log('orchestration gate 单元测试全部通过。')
