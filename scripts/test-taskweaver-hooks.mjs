import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadTaskweaverHooks, runTaskweaverHooks, ensureWorkspaceHooksApproved } from '../backend/taskweaver-hook-runner.mjs'
import { createPermissionService } from '../backend/permission-service.mjs'
import { createHandleEnvelope } from '../backend/dsh-chat/envelope-dispatch.mjs'
import { createEmptyTurnActivity } from '../backend/turn-activity.mjs'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-hooks-'))
await fs.writeFile(path.join(home, 'taskweaver-hooks.json'), JSON.stringify({
  beforeTurn: [{ command: 'echo hook-ok' }],
  preToolUse: [{
    matcher: 'bash',
    command: `printf '%s' '{"decision":"block","reason":"test hook blocked bash"}'`,
  }],
  postToolUse: [{
    matcher: 'edit|write',
    command: `node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>require('fs').writeFileSync('post-hook.json',s))"`,
  }],
}), 'utf8')
const hooks = await loadTaskweaverHooks(home, null)
assert.equal(hooks.beforeTurn.length, 1)
const result = await runTaskweaverHooks('beforeTurn', hooks, {
  conversationId: 'c-test',
  text: 'hello',
  workspacePath: home,
})
assert.equal(result.ran, 1)
assert.equal(result.failures.length, 0)

const permissionService = createPermissionService({
  getWorkspacePath: async () => home,
})
const authorization = await permissionService.withExecution('full', null, () => permissionService.authorize({
  toolName: 'bash',
  toolCallId: 'hook-blocks-bash',
  input: { command: 'echo should-not-run' },
}), {
  conversationId: 'c-test',
  workspacePath: home,
  toolHooks: hooks,
})
assert.deepEqual(authorization, { block: true, reason: 'PreToolUse Hook 已拒绝 bash：test hook blocked bash' })

const editedPath = path.join(home, 'after-edit.txt')
await fs.writeFile(editedPath, 'edited')
const eventTurn = {
  eventConversationId: 'c-test',
  workspacePath: home,
  toolHooks: hooks,
  taskId: null,
  webContents: null,
  toolCalls: 0,
  toolResults: 0,
  toolCallsById: new Map(),
  fileChanges: new Map(),
  turnActivity: createEmptyTurnActivity(),
}
const handleEnvelope = createHandleEnvelope({
  sessions: new Map([['c-test', { sessionId: 'hook-host-session', ownerConversationId: 'c-test' }]]),
  running: new Map([['c-test', eventTurn]]),
  observedSequences: new Map(),
  queueSnapshots: new Map(),
  pendingQuestions: new Map(),
  orchestrationRuns: new Map(),
  fanoutMuxFrame() {},
  registerPendingApproval() {},
  settleApproval() {},
  emitPermission() {},
  emitUserQuestion() {},
  getPermissionMode: () => 'ask',
  emit() {},
  finishTurn() {},
  recoverSession: async () => {},
  runTaskweaverHooks,
})
const dispatchToolEvent = (seq, type, data) => handleEnvelope({}, {
  payload: {
    type: 'session/event',
    sessionId: 'hook-host-session',
    event: { seq, time: Date.now(), type, data },
  },
})
const callId = 'edit-call'
await dispatchToolEvent(1, 'tool/call', {
  turn: 1,
  step: 1,
  callId,
  name: 'edit',
  arguments: JSON.stringify({ file_path: editedPath, old_string: 'edited', new_string: 'after' }),
})
await fs.writeFile(editedPath, 'after')
await dispatchToolEvent(2, 'tool/result', {
  message: {
    source: { callId },
    content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: 'Updated file' }] }],
  },
})
const postPayload = JSON.parse(await fs.readFile(path.join(home, 'post-hook.json'), 'utf8'))
assert.equal(postPayload.hook_event_name, 'PostToolUse')
assert.equal(postPayload.tool_name, 'edit')
assert.equal(postPayload.tool_input.file_path, editedPath)

const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-hooks-ws-'))
await fs.mkdir(path.join(ws, '.taskweaver'), { recursive: true })
await fs.writeFile(path.join(ws, '.taskweaver', 'hooks.json'), JSON.stringify({
  beforeTurn: [{ command: 'echo workspace-hook' }],
  preToolUse: [{ matcher: 'edit', command: 'touch untrusted-workspace-hook-ran.txt' }],
}), 'utf8')
const untrusted = await loadTaskweaverHooks(home, ws, { workspaceTrusted: false })
assert.equal(untrusted.beforeTurn.length, 1)
assert.equal(untrusted.beforeTurn[0].command, 'echo hook-ok')
const untrustedHookRun = await runTaskweaverHooks('preToolUse', untrusted, {
  workspacePath: ws,
  conversationId: 'c-test',
  toolName: 'edit',
})
assert.equal(untrustedHookRun.ran, 0)
await assert.rejects(fs.access(path.join(ws, 'untrusted-workspace-hook-ran.txt')), { code: 'ENOENT' })
const trusted = await loadTaskweaverHooks(home, ws, { workspaceTrusted: true })
assert.equal(trusted.beforeTurn.length, 2)
assert.equal(trusted.preToolUse.length, 2)

process.env.TASKWEAVER_AUTO_APPROVE_HOOKS = '1'
const packagedHome = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-hooks-packaged-'))
const packagedApproved = await ensureWorkspaceHooksApproved(packagedHome, ws, { isPackaged: true })
assert.equal(packagedApproved, false, 'the development-only auto-approve override must not approve hooks in packaged builds')
await assert.rejects(
  fs.access(path.join(packagedHome, 'hook-approvals.json')),
  { code: 'ENOENT' },
  'a packaged auto-approve attempt must not persist an approval',
)
const approved = await ensureWorkspaceHooksApproved(home, ws)
assert.equal(approved, true)
const trustedAfterApproval = await loadTaskweaverHooks(home, ws, { workspaceTrusted: true })
assert.equal(trustedAfterApproval.beforeTurn.length, 2)

console.log('taskweaver-hook-runner tests passed')
