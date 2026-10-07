import assert from 'node:assert/strict'
import {
  compareConversationTranscripts,
  inspectUserPromptEnvelope,
} from '../electron/backend/conversation-shadow-compare.mjs'

const exact = compareConversationTranscripts([
  { author: 'user', text: '  看一下代码  ' },
  { author: 'orchestrator', text: '项目结构如下', thinking: '先找入口', usage: { inputTokens: 10, outputTokens: 4 } },
], [
  { role: 'user', text: '看一下代码' },
  { role: 'assistant', text: '项目结构如下', thinking: '先找入口', usage: { inputTokens: 10, outputTokens: 4 } },
])
assert.equal(exact.users.exactInOrder, 1)
assert.equal(exact.assistants.exactInOrder, 1)
assert.equal(exact.thinking.exactInOrder, 1)
assert.equal(exact.usage.inputTokens.delta, 0)
assert.equal(JSON.stringify(exact).includes('项目结构如下'), false, 'reports must not expose transcript content')

const contextEnvelope = inspectUserPromptEnvelope(
  '请读这个 @file:src/main.ts',
  '请读这个 @file:src/main.ts\n\n注入上下文 <taskweaver_workspace_context>文件</taskweaver_workspace_context>',
)
assert.equal(contextEnvelope.uiHasFileReference, true)
assert.equal(contextEnvelope.uiHasDirectoryReference, false)
assert.equal(contextEnvelope.hostSuffixHasWorkspaceContextEnvelope, true)
assert.equal(JSON.stringify(contextEnvelope).includes('src/main.ts'), false, 'envelope diagnostics must not expose prompt text')

const verifyEnvelope = inspectUserPromptEnvelope(
  '修复这个问题',
  '修复这个问题\n\n> **自主闭环要求**：运行验证。',
)
assert.equal(verifyEnvelope.hostSuffixHasAutoVerifyGuidance, true)

const skillEnvelope = inspectUserPromptEnvelope(
  '用户任务',
  '以下是用户在 TaskWeaver 中明确选择的 Skill。<taskweaver_skill_instructions>约束</taskweaver_skill_instructions><user_task>用户任务</user_task>',
)
assert.equal(skillEnvelope.hostHasFilesystemSkillEnvelope, true)
assert.equal(skillEnvelope.hostSuffixHasWorkspaceContextEnvelope, false)

const drift = compareConversationTranscripts([
  { author: 'user', text: '已提交但未被 Host 接收' },
  { author: 'orchestrator', text: '执行失败：连接断开' },
  { author: 'orchestrator', text: '（模型未返回文本）' },
], [
  { role: 'user', text: '另一个 Host 用户输入' },
  { role: 'assistant', text: '已由 Host 持久化的答复' },
  { role: 'compaction', summary: '不参与 UI transcript 比对' },
])
assert.deepEqual(drift.users, {
  uiCount: 1, hostCount: 1, exactInOrder: 0, uiOnly: 1, hostOnly: 1, skippedReason: null,
})
assert.deepEqual(drift.assistants, {
  uiCount: 0, hostCount: 1, exactInOrder: 0, uiOnly: 0, hostOnly: 1, skippedReason: null,
})
assert.equal(drift.ui.errorCount, 1)
assert.equal(drift.ui.emptyResponsePlaceholderCount, 1)
assert.equal(drift.host.compactionCount, 1)

const noLeak = compareConversationTranscripts([{ author: 'user', text: 'secret prompt' }], [])
assert.equal(JSON.stringify(noLeak).includes('secret prompt'), false)
console.log('conversation shadow compare: ordered transcript parity, envelope-shape privacy, UI-only error/fallback rows, compaction accounting and no-content report passed')
