import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const source = await fs.readFile(path.resolve('src/features/chat/tool-output-reader.ts'), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { readToolOutput } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`,
)

let requested
const loaded = await readToolOutput(async (payload) => {
  requested = payload
  return { ok: true, data: { text: 'redacted output', truncated: true } }
}, 'canonical-owner-event-id', 'opaque-output-id')
assert.deepEqual(loaded, { kind: 'loaded', output: { text: 'redacted output', truncated: true } })
assert.deepEqual(requested, {
  conversationId: 'canonical-owner-event-id',
  outputId: 'opaque-output-id',
}, 'the UI reads by the canonical owner/event conversation and exact output reference')

let calledWithoutConversation = false
assert.deepEqual(await readToolOutput(async () => {
  calledWithoutConversation = true
  return { ok: true, data: null }
}, null, 'opaque-output-id'), { kind: 'missing-conversation' })
assert.equal(calledWithoutConversation, false, 'missing ownership never sends an unscoped read')

const unavailable = await readToolOutput(async (payload) => {
  requested = payload
  return { ok: true, data: null }
}, 'another-owner-event-id', 'opaque-output-id')
assert.deepEqual(unavailable, { kind: 'unavailable' }, 'evicted or cross-conversation references are reported as unavailable')
assert.equal(requested.conversationId, 'another-owner-event-id')

assert.deepEqual(await readToolOutput(async () => ({ ok: false, error: 'internal detail' }), 'owner', 'id'), {
  kind: 'failed',
})
assert.deepEqual(await readToolOutput(undefined, 'owner', 'id'), { kind: 'failed' })
console.log('tool output reader tests passed: canonical conversation scoping and explicit unavailable/failure states')
