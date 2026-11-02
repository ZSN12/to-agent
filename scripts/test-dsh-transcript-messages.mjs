import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({
  stdin: {
    contents: `export { chatMessagesFromDshTranscript, dshToolHistoryForMessage, isDshContextMessage, mergeStoredMessagesWithDshTranscript }
      from './src/features/dsh-runtime/dshTranscriptMessages'`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
})
const mapper = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

const transcript = [
  { dshKey: 'u1', role: 'user', text: '查看上下文', timestamp: 1_000 },
  { dshKey: 'ctx1', role: 'context', text: 'injected context', plugin: 'time-context', form: 'future-form', timestamp: 1_500 },
  { dshKey: 'ctx2', role: 'context', text: 'opaque context', plugin: 'workspace', timestamp: 1_750 },
  { dshKey: 'a1', role: 'assistant', turn: 7, text: '处理完成', thinking: 'checked', timestamp: 2_000 },
  { dshKey: 'c1', role: 'compaction', summary: 'prior summary', automatic: true, timestamp: 2_500 },
]
const messages = mapper.chatMessagesFromDshTranscript(transcript, { user: 'User', agent: 'Agent' })

assert.deepEqual(messages.map(message => message.id), [
  'dsh-user-u1', 'dsh-context-ctx1', 'dsh-context-ctx2', 'dsh-asst-a1', 'dsh-compact-c1',
])
assert.deepEqual(messages.map(message => message.author), ['user', 'agent', 'agent', 'orchestrator', 'orchestrator'])
assert.equal(messages[1].text, 'injected context')
assert.deepEqual(messages[1].dshContext, { plugin: 'time-context', form: 'future-form' })
assert.deepEqual(messages[2].dshContext, { plugin: 'workspace', form: undefined })
assert.equal(mapper.isDshContextMessage(messages[1]), true)
assert.equal(mapper.isDshContextMessage(messages[2]), true)
assert.equal(mapper.isDshContextMessage(messages[3]), false)
assert.equal(messages[1].usage, undefined)
assert.equal(messages[1].modelKey, undefined)
assert.equal(messages[1].thinking, undefined)
assert.equal(messages[1].callout, undefined)
assert.equal(messages[1].fileChanges, undefined)
assert.equal(messages[3].thinking, 'checked')
assert.equal(messages[3].dshTurn, 7)
assert.equal(messages[4].compaction.summary, 'prior summary')

// An injected context must neither absorb assistant metadata nor satisfy the
// occurrence-based de-duplication for a streamed answer with identical text.
const answer = {
  id: 'z-turn-live',
  author: 'orchestrator',
  name: 'Agent',
  time: '00:02',
  timestamp: 2_000,
  text: 'same words',
  usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0,
    elapsedMs: 1, tokensPerSecond: 1, contextTokens: null, contextWindow: null, contextPercent: null },
}
const contextOnlyTranscript = [{ dshKey: 'ctx-same', role: 'context', text: 'same words', plugin: 'test-plugin' }]
const mergedWithContext = mapper.mergeStoredMessagesWithDshTranscript([answer], contextOnlyTranscript, true)
assert.equal(mergedWithContext.length, 2)
assert.equal(mapper.isDshContextMessage(mergedWithContext[0]), true)
assert.equal(mergedWithContext[0].usage, undefined)
assert.equal(mergedWithContext[1].id, 'z-turn-live')

const assistantTranscript = [{ dshKey: 'assistant-same', role: 'assistant', text: 'same words', thinking: '' }]
const mergedAssistant = mapper.mergeStoredMessagesWithDshTranscript([answer], assistantTranscript, true)
assert.equal(mergedAssistant.length, 1)
assert.equal(mergedAssistant[0].usage, answer.usage)

// Role sessions are private to each role, so their durable messages are not
// part of the primary DSH projection. Keep them even when their text happens
// to match an ordinary assistant turn, and do not duplicate the optimistic
// role-mode user row while a role response is still running.
const roleUser = { id: 'role-user-1', author: 'user', name: '你', text: '角色问题', roleMode: true }
const roleAssistant = { ...answer, id: 'z-turn-role-1', name: '研究员', roleMode: true, speakerId: 'role-1' }
const roleTranscript = [
  { dshKey: 'main-user', role: 'user', text: '普通问题', timestamp: 1_000 },
  { dshKey: 'main-assistant', role: 'assistant', text: 'same words', thinking: '' },
]
const mergedRoleMode = mapper.mergeStoredMessagesWithDshTranscript([roleUser, roleAssistant], roleTranscript, true)
assert.equal(mergedRoleMode.some((message) => message.id === roleUser.id), true)
assert.equal(mergedRoleMode.some((message) => message.id === roleAssistant.id), true)
assert.equal(mergedRoleMode.filter((message) => message.author !== 'user' && message.text === 'same words').length, 2)
const sendingRoleMode = mapper.mergeStoredMessagesWithDshTranscript([roleUser], roleTranscript, true, true)
assert.equal(sendingRoleMode.filter((message) => message.id === roleUser.id).length, 1)

const cappedAnswer = {
  ...answer,
  id: 'z-turn-step-limit',
  callout: '执行失败：本轮达到安全步数上限（已保留此前输出）',
  errorCode: 'MAX_STEPS',
  interrupted: true,
}
const mergedCappedAnswer = mapper.mergeStoredMessagesWithDshTranscript([cappedAnswer], assistantTranscript, true)
assert.equal(mergedCappedAnswer.length, 1)
assert.equal(mergedCappedAnswer[0].errorCode, 'MAX_STEPS',
  'Host transcript takeover must preserve the error code used by the continue action')
assert.equal(mergedCappedAnswer[0].callout, cappedAnswer.callout)
assert.equal(mergedCappedAnswer[0].interrupted, true)

const errorCodeOnly = mapper.mergeStoredMessagesWithDshTranscript([
  { id: 'z-turn-error-code-only', author: 'orchestrator', text: 'same words', errorCode: 'MAX_STEPS' },
], assistantTranscript, true)
assert.equal(errorCodeOnly[0].errorCode, 'MAX_STEPS',
  'an error code is preserved even when it is the only stored assistant metadata')

// Automatic verification evidence stored on the final turn survives transcript takeover.
const verification = { status: 'passed', executed: true, passed: true, command: 'pnpm run typecheck', exitCode: 0, healAttempts: 1 }
const repairTranscript = [
  { dshKey: 'u-fix', role: 'user', text: '修复类型错误', timestamp: 1_000 },
  { dshKey: 'a-fix', role: 'assistant', text: '已修改', thinking: '', timestamp: 2_000 },
  { dshKey: 'u-auto', role: 'user', text: '[TaskWeaver 自动验证] 第 1/2 轮修复\n错误摘要', timestamp: 3_000 },
  { dshKey: 'a-repair', role: 'assistant', text: '已修复剩余错误', thinking: '', timestamp: 4_000 },
]
const repairStored = [
  { id: 'u-stored', author: 'user', text: '修复类型错误' },
  { id: 'z-turn-first', author: 'orchestrator', text: '已修改' },
  { id: 'z-turn-repair', author: 'orchestrator', text: '已修复剩余错误', verification },
]
const mergedRepair = mapper.mergeStoredMessagesWithDshTranscript(repairStored, repairTranscript, true)
assert.equal(mergedRepair.at(-1).verification, verification, 'verification evidence is merged onto the matching transcript row')
assert.equal(mergedRepair.find((message) => message.text === '已修改').verification, undefined)
const subagentOnly = mapper.mergeStoredMessagesWithDshTranscript([
  { id: 'z-turn-dag', author: 'orchestrator', text: 'same words', subagentOutputs: [{ id: 's1', role: 'r', title: 't', model: 'm', text: 'out' }] },
], assistantTranscript, true)
assert.equal(subagentOnly[0].subagentOutputs?.length, 1, 'sub-agent outputs alone are enough to merge stored metadata')
const sendingRepair = mapper.mergeStoredMessagesWithDshTranscript(repairStored, repairTranscript.slice(0, 3), true, true)
assert.equal(sendingRepair.filter((message) => message.author === 'user' && message.text === '修复类型错误').length, 1,
  'an automatic repair prompt does not make the user request reappear while the repair runs')

const perTurnHistory = mapper.dshToolHistoryForMessage(
  messages[3],
  [
    { callId: 'old-call', toolName: 'read', argsRaw: '{}', status: 'done', turn: 6, step: 1 },
    { callId: 'this-call', toolName: 'grep', argsRaw: '{}', status: 'done', turn: 7, step: 2 },
    { callId: 'next-call', toolName: 'bash', argsRaw: '{}', status: 'done', turn: 8, step: 1 },
  ],
  [],
  false,
)
assert.deepEqual(perTurnHistory.rows?.map(row => row.callId), ['this-call'],
  'each assistant transcript row keeps only its own settled tool-call history')

console.log('dsh-transcript-messages smoke passed')
