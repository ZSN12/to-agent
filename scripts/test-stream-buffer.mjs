import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const sourcePath = path.resolve('src/features/chat/conversation-stream-buffer.ts')
const source = await fs.readFile(sourcePath, 'utf8')
const { outputText, diagnostics = [] } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  reportDiagnostics: true,
})
assert.equal(diagnostics.length, 0, 'stream buffer should transpile without diagnostics')
const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
const { applyStreamEventToSnapshot, emptyConversationStream } = await import(moduleUrl)

const activitySource = await fs.readFile(path.resolve('src/features/chat/streamActivityLabel.ts'), 'utf8')
const { outputText: activityOutput } = ts.transpileModule(activitySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { visibleStreamStatusLabel } = await import(
  `data:text/javascript;base64,${Buffer.from(activityOutput).toString('base64')}`,
)
assert.equal(visibleStreamStatusLabel({}), '模型思考中', 'the live turn uses the compact model-thinking label before prose appears')
assert.equal(visibleStreamStatusLabel({ isThinking: true }), '模型思考中')
assert.equal(visibleStreamStatusLabel({ hasVisibleText: true }), '模型思考中')
assert.equal(visibleStreamStatusLabel({ completedToolCount: 2 }), '模型思考中')
assert.equal(visibleStreamStatusLabel({ isCallingTool: true }), '模型调用工具',
  'tool execution uses the second stable status label')

const inFlight = applyStreamEventToSnapshot(emptyConversationStream(), { type: 'start', conversationId: 'c1' })
const thought = applyStreamEventToSnapshot(inFlight, { type: 'thinking_start', conversationId: 'c1' })
const thoughtDelta = applyStreamEventToSnapshot(thought, {
  type: 'thinking_delta', conversationId: 'c1', delta: 'checking the files',
})
assert.equal(thoughtDelta.streamThinking?.isActive, true, 'reasoning deltas mark the Think row active')
const duringTool = applyStreamEventToSnapshot(thoughtDelta, {
  type: 'tool', conversationId: 'c1', id: 'tool-running', toolName: 'bash', status: 'running',
})
assert.equal(duringTool.streamThinking?.isActive, false, 'tool execution settles Think instead of leaving it spinning')
const afterThinkEnd = applyStreamEventToSnapshot(thoughtDelta, {
  type: 'thinking_end', conversationId: 'c1', fullThinking: 'checking the files',
})
assert.equal(afterThinkEnd.streamThinking?.isActive, false, 'thinking_end preserves text but ends the active state')
const withToolTrace = applyStreamEventToSnapshot(inFlight, {
  type: 'tool', conversationId: 'c1', id: 'tool-1', toolName: 'read', status: 'done',
  outputId: 'output-ref', outputTruncated: false,
})
assert.equal(withToolTrace.toolTraces.length, 1, 'tool calls should be captured in the conversation snapshot')
assert.equal(withToolTrace.toolTraces[0].outputId, 'output-ref', 'in-flight trace replay preserves transient output references')
const legacyToolTrace = applyStreamEventToSnapshot(inFlight, {
  type: 'tool', conversationId: 'c1', id: 'legacy-tool', toolName: 'read', status: 'done',
})
assert.equal(legacyToolTrace.toolTraces[0].outputId, undefined, 'older stream events remain valid without output references')
assert.deepEqual(
  applyStreamEventToSnapshot(withToolTrace, { type: 'start', conversationId: 'c1' }).toolTraces,
  [],
  'a new turn must not carry the previous turn tool rows into its batch',
)
const partial = applyStreamEventToSnapshot(inFlight, {
  type: 'delta', conversationId: 'c1', delta: 'partial answer', full: 'partial answer',
})
assert.equal(partial.streamText, 'partial answer', 'in-flight content must remain recoverable')

const incremental = applyStreamEventToSnapshot(inFlight, {
  type: 'delta', conversationId: 'c1', delta: 'hel',
})
const incremental2 = applyStreamEventToSnapshot(incremental, {
  type: 'delta', conversationId: 'c1', delta: 'lo',
})
assert.equal(incremental2.streamText, 'hello', 'delta without full must append incrementally')

const block1 = applyStreamEventToSnapshot(inFlight, {
  type: 'block_delta', conversationId: 'c1', id: 'step-1-text', kind: 'text', delta: 'hel',
})
const block2 = applyStreamEventToSnapshot(block1, {
  type: 'block_delta', conversationId: 'c1', id: 'step-1-text', kind: 'text', delta: 'lo',
})
assert.deepEqual(block2.streamBlocks, [{ id: 'step-1-text', kind: 'text', text: 'hello' }],
  'keyed block patches reconstruct streamed blocks without resending full snapshots')

const completed = applyStreamEventToSnapshot(partial, {
  type: 'done', conversationId: 'c1', full: 'complete answer',
})
assert.deepEqual(completed, emptyConversationStream(), 'completed output must leave the in-flight recovery snapshot')

const nextTurn = applyStreamEventToSnapshot(completed, { type: 'start', conversationId: 'c1' })
assert.deepEqual(nextTurn, emptyConversationStream(), 'a queued turn must start with a clean snapshot')

const queued = applyStreamEventToSnapshot(partial, { type: 'followup_queued', text: 'next question' })
const intermediate = applyStreamEventToSnapshot(queued, { type: 'done', full: 'complete answer', continuing: true })
assert.equal(intermediate.streamText, null, 'completed output belongs in the transcript, not recovery state')
assert.deepEqual(intermediate.promptQueue.followUp, ['next question'], 'intermediate done must not discard accepted prompts')
assert.deepEqual(applyStreamEventToSnapshot(intermediate, { type: 'start' }), emptyConversationStream())

const failed = applyStreamEventToSnapshot(partial, { type: 'error', conversationId: 'c1', message: 'network error' })
assert.deepEqual(failed, emptyConversationStream(), 'terminal errors must not leave stale stream snapshots')

console.log('stream buffer lifecycle tests passed')
