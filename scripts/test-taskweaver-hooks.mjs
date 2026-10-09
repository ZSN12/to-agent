import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadTaskweaverHooks, runTaskweaverHooks, ensureWorkspaceHooksApproved } from '../electron/backend/taskweaver-hook-runner.mjs'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-hooks-'))
await fs.writeFile(path.join(home, 'taskweaver-hooks.json'), JSON.stringify({
  beforeTurn: [{ command: 'echo hook-ok' }],
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

const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-hooks-ws-'))
await fs.mkdir(path.join(ws, '.taskweaver'), { recursive: true })
await fs.writeFile(path.join(ws, '.taskweaver', 'hooks.json'), JSON.stringify({
  beforeTurn: [{ command: 'echo workspace-hook' }],
}), 'utf8')
const untrusted = await loadTaskweaverHooks(home, ws, { workspaceTrusted: false })
assert.equal(untrusted.beforeTurn.length, 1)
assert.equal(untrusted.beforeTurn[0].command, 'echo hook-ok')
const trusted = await loadTaskweaverHooks(home, ws, { workspaceTrusted: true })
assert.equal(trusted.beforeTurn.length, 2)

process.env.TASKWEAVER_AUTO_APPROVE_HOOKS = '1'
const approved = await ensureWorkspaceHooksApproved(home, ws)
assert.equal(approved, true)
const trustedAfterApproval = await loadTaskweaverHooks(home, ws, { workspaceTrusted: true })
assert.equal(trustedAfterApproval.beforeTurn.length, 2)

console.log('taskweaver-hook-runner tests passed')
