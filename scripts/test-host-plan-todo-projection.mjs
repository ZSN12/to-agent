import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import ts from 'typescript'

const source = await fs.readFile(new URL('../src/features/chat/hostPlanTodoProjection.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const module = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const viewSource = await fs.readFile(new URL('../src/features/dsh-runtime/matchDshConversationView.ts', import.meta.url), 'utf8')
const { outputText: viewOutput } = ts.transpileModule(viewSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const viewModule = await import(`data:text/javascript;base64,${Buffer.from(viewOutput).toString('base64')}`)

assert.equal(module.readHostPlanMode({ plan: { active: true, pending: false } }), true)
assert.equal(module.readHostPlanMode({ plan: { active: false, pending: true } }), true, 'pending Host entry targets active')
assert.equal(module.readHostPlanMode({ plan: { active: true, pending: true } }), false, 'pending Host exit targets inactive')
assert.equal(module.readHostPlanMode({ plan: { active: 'yes', pending: false } }), null)
assert.equal(module.readHostPlanMode({}), null, 'missing Host projection is not fabricated as inactive')

const todos = [
  { content: 'inspect host protocol', status: 'completed' },
  { content: 'render host todo snapshot', status: 'in_progress' },
]
assert.deepEqual(module.readHostTodos({ todos }), todos)
assert.equal(module.readHostTodos({ todos: null }), null)
assert.equal(module.readHostTodos({ todos: [{ content: 'bad', status: 'running' }] }), null)

const sessionAView = { conversationId: 'session-A', projections: { plan: { active: true, pending: false } } }
assert.equal(viewModule.matchDshConversationView(sessionAView, 'session-A'), sessionAView)
assert.equal(viewModule.matchDshConversationView(sessionAView, 'session-B'), null, 'a delayed snapshot from another session must be rejected')
assert.equal(viewModule.matchDshConversationView(sessionAView, null), null, 'no active session must not expose a stale projection')

console.log('Host plan/todo projection parsing and strict session identity smoke passed')

