import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
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

const inFlight = applyStreamEventToSnapshot(emptyConversationStream(), { type: 'start', conversationId: 'c1' })
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
