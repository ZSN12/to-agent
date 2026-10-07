import assert from 'node:assert/strict'
import { resolveSandboxPolicy, renderFileSandboxContext } from '../electron/backend/sandbox-policy.mjs'

const ws = '/tmp/taskweaver-ws'
const ro = resolveSandboxPolicy({ bashSandbox: 'auto', permissionMode: 'readonly', workspacePath: ws })
assert.equal(ro.file.mode, 'read-only')
assert.equal(ro.standingMode, 'read-only')

const full = resolveSandboxPolicy({ bashSandbox: 'read-only', permissionMode: 'full', workspacePath: ws })
assert.equal(full.file.mode, 'off')
assert.equal(full.bash.mode, 'off')

const fileOnly = resolveSandboxPolicy({ bashSandbox: 'read-only', permissionMode: 'ask', workspacePath: ws })
assert.equal(fileOnly.file.mode, 'read-only')

const auto = resolveSandboxPolicy({ bashSandbox: 'auto', permissionMode: 'ask', workspacePath: ws })
assert.equal(auto.file.mode, 'workspace-write')

const line = renderFileSandboxContext({ mode: 'read-only' }, ws)
assert.match(line, /read-only/)

console.log('sandbox-policy 测试通过')
