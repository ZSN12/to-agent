import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadTaskweaverHooks, runTaskweaverHooks } from '../electron/backend/taskweaver-hook-runner.mjs'

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
console.log('taskweaver-hook-runner tests passed')
