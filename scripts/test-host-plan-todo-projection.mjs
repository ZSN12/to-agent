import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import ts from 'typescript'

const source = await fs.readFile(new URL('../src/features/chat/hostPlanTodoProjection.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const module = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const reviewSource = await fs.readFile(new URL('../src/features/chat/planReviewQuestion.ts', import.meta.url), 'utf8')
const { outputText: reviewOutput } = ts.transpileModule(reviewSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const reviewModule = await import(`data:text/javascript;base64,${Buffer.from(reviewOutput).toString('base64')}`)
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

const planQuestions = [{
  id: 'plan-review',
  question: 'Approve this plan and leave plan mode?',
  detail: '# Plan\n\n1. Inspect\n2. Implement',
  options: [
    { label: 'Approve', description: 'Start executing' },
    { label: 'Keep planning', description: 'Revise the plan' },
  ],
  intent: { kind: 'plan-review', approve: 'Approve' },
}]
const review = reviewModule.readPlanReviewQuestion(planQuestions)
assert.deepEqual(review, {
  id: 'plan-review',
  question: 'Approve this plan and leave plan mode?',
  plan: '# Plan\n\n1. Inspect\n2. Implement',
  approve: { label: 'Approve', description: 'Start executing' },
  keepPlanning: { label: 'Keep planning', description: 'Revise the plan' },
})
assert.deepEqual(reviewModule.makePlanReviewAnswer(review, 'approve', 'ignored on approval'), {
  answers: [{ id: 'plan-review', selected: ['Approve'] }],
}, 'approval must carry only the Host-declared approval label')
assert.deepEqual(reviewModule.makePlanReviewAnswer(review, 'keep-planning', '  Add a test  '), {
  answers: [{ id: 'plan-review', selected: ['Keep planning'], custom: 'Add a test' }],
}, 'revision feedback is trimmed and returned only with keep-planning')
assert.equal(reviewModule.readPlanReviewQuestion([{ ...planQuestions[0], options: [{ label: 'Approve' }] }]), null,
  'malformed/non-binary review prompts remain on the generic answer surface')

const sessionAView = { conversationId: 'session-A', projections: { plan: { active: true, pending: false } } }
assert.equal(viewModule.matchDshConversationView(sessionAView, 'session-A'), sessionAView)
assert.equal(viewModule.matchDshConversationView(sessionAView, 'session-B'), null, 'a delayed snapshot from another session must be rejected')
assert.equal(viewModule.matchDshConversationView(sessionAView, null), null, 'no active session must not expose a stale projection')

console.log('Host plan/todo projection, plan-review answers, and strict session identity smoke passed')
