import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const source = await fs.readFile(path.resolve('src/features/chat/dshToolCallTree.ts'), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { buildDshToolCallTree, isDshToolCallBatchExpanded } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`,
)

assert.equal(isDshToolCallBatchExpanded(null, true), true, 'live tool calls expand by default')
assert.equal(isDshToolCallBatchExpanded(null, false), false, 'completed tool batches collapse by default')
assert.equal(isDshToolCallBatchExpanded(false, true), false, 'user can collapse a running batch')
assert.equal(isDshToolCallBatchExpanded(true, false), true, 'user can keep completed details expanded')

function row(callId, { parentCallId, status = 'done', resultPreview } = {}) {
  return {
    callId,
    parentCallId,
    toolName: callId === 'root' ? 'run_code' : 'bash',
    argsRaw: JSON.stringify({ description: callId }),
    status,
    turn: 1,
    step: 1,
    resultPreview,
  }
}

function trace(id, { parentCallId, status = 'done', resultSummary, inputSummary = id } = {}) {
  return { id, parentCallId, toolName: 'bash', status, resultSummary, inputSummary }
}

const nested = buildDshToolCallTree([
  row('root'),
  row('child', { parentCallId: 'root' }),
  row('grandchild', { parentCallId: 'child' }),
  row('second-root'),
  row('second-child', { parentCallId: 'second-root' }),
])
assert.deepEqual(nested.map((node) => node.row.callId), ['root', 'second-root'], 'root order follows projection order')
assert.deepEqual(nested[0].children.map((node) => node.row.callId), ['child'])
assert.deepEqual(nested[0].children[0].children.map((node) => node.row.callId), ['grandchild'])
assert.deepEqual(nested[1].children.map((node) => node.row.callId), ['second-child'])

const orphan = buildDshToolCallTree([
  row('orphan', { parentCallId: 'missing-parent' }),
  row('ordinary-root'),
])
assert.deepEqual(orphan.map((node) => node.row.callId), ['orphan', 'ordinary-root'], 'orphan rows remain visible as roots')

const cyclic = buildDshToolCallTree([
  row('cycle-a', { parentCallId: 'cycle-b' }),
  row('cycle-b', { parentCallId: 'cycle-a' }),
  row('cycle-child', { parentCallId: 'cycle-a' }),
])
assert.deepEqual(cyclic.map((node) => node.row.callId), ['cycle-a', 'cycle-b'], 'cycle members are surfaced as roots')
assert.deepEqual(cyclic[0].children.map((node) => node.row.callId), ['cycle-child'])

const merged = buildDshToolCallTree(
  [row('parent'), row('settling-call', { status: 'running', resultPreview: 'projected result' })],
  [trace('settling-call', {
    parentCallId: 'parent',
    status: 'done',
    resultSummary: 'final result',
  })],
)
const mergedParent = merged[0]
const settled = mergedParent.children[0]
assert.equal(settled.row.parentCallId, 'parent', 'trace parentCallId survives row/trace merge')
assert.equal(settled.row.status, 'done', 'terminal trace status settles a running projection')
assert.equal(settled.trace.status, 'done')
assert.equal(settled.row.resultPreview, 'final result')
assert.equal(settled.trace.resultSummary, 'final result')

const lateRunning = buildDshToolCallTree(
  [row('already-done', { status: 'done', resultPreview: 'kept result' })],
  [trace('already-done', { status: 'running' })],
)
assert.equal(lateRunning[0].row.status, 'done', 'a delayed running trace cannot regress terminal status')
assert.equal(lateRunning[0].row.resultPreview, 'kept result', 'projection result is retained when trace has no result')

const traceOnly = buildDshToolCallTree([], [trace('trace-root'), trace('trace-child', { parentCallId: 'trace-root' })])
assert.deepEqual(traceOnly.map((node) => node.row.callId), ['trace-root'])
assert.deepEqual(traceOnly[0].children.map((node) => node.row.callId), ['trace-child'])

console.log('dsh tool-call tree tests passed')
