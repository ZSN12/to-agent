import assert from 'node:assert/strict'
import { createWorkspaceOperationGuard } from '../electron/backend/workspace-operation-guard.mjs'

const contexts = new Map([
  ['same-project', { workspacePath: '/work/project-a' }],
  ['other-project', { workspacePath: '/work/project-b' }],
  ['unknown-project', {}],
])
const guard = createWorkspaceOperationGuard(async (id) => contexts.get(id))

await assert.rejects(
  guard.withWorkspaceOperation('/work/project-a', ['same-project'], async () => {}),
  /此工作区仍有会话正在执行任务/,
  'must block restore/revert while an Agent is running in the same workspace',
)
await assert.doesNotReject(
  guard.withWorkspaceOperation('/work/project-a', ['other-project'], async () => {}),
  'must preserve concurrency for a different workspace',
)
await assert.rejects(
  guard.withWorkspaceOperation('/work/project-a', ['unknown-project'], async () => {}),
  /无法确认其工作区/,
  'must fail closed if a running conversation workspace cannot be resolved',
)

let releaseOperation
const operationGate = new Promise((resolve) => { releaseOperation = resolve })
let operationStarted
const started = new Promise((resolve) => { operationStarted = resolve })
const mutation = guard.withWorkspaceOperation('/work/project-a', [], async () => {
  operationStarted()
  await operationGate
})
await started
await assert.rejects(
  guard.assertConversationCanRun('same-project'),
  /正在执行文件或恢复点操作/,
  'must prevent a new Agent turn from racing an active workspace mutation',
)
await assert.doesNotReject(
  guard.assertConversationCanRun('other-project'),
  'must allow an Agent turn in a different workspace during the mutation',
)
releaseOperation()
await mutation
await assert.doesNotReject(guard.assertConversationCanRun('same-project'), 'must release the workspace lock')

await assert.doesNotReject(
  guard.withWorkspaceOperation('/work/project-a', [], async () => {}),
  'must allow a workspace operation when no conversation is running',
)

console.log('workspace operation concurrency guard tests passed')
