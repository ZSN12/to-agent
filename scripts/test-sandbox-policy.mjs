import assert from 'node:assert/strict'
import { probeSandboxSupport } from '../backend/sandbox-service.mjs'
import { resolveSandboxPolicy, renderFileSandboxContext } from '../backend/sandbox-policy.mjs'

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
assert.match(line, /does not restrict network access/)

const workspaceWriteContext = renderFileSandboxContext({ mode: 'workspace-write' }, ws)
const sandbox = probeSandboxSupport()
if ((sandbox.platform === 'darwin' && sandbox.runner === 'seatbelt')
  || (sandbox.platform === 'linux' && sandbox.runner === 'bwrap')) {
  assert.match(workspaceWriteContext, /blocks network sockets/)
  assert.match(workspaceWriteContext, /Unix-domain sockets remain available/)
  assert.match(workspaceWriteContext, /sandbox_permissions="danger-full-access"/)
} else {
  assert.match(workspaceWriteContext, /does not restrict network access|No OS sandbox runner is available/)
}

console.log('sandbox-policy 测试通过')
