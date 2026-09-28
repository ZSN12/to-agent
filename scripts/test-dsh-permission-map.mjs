import assert from 'node:assert/strict'
import {
  resolveDshApprovalBridgeAction,
  dshApprovalNeedsPrompt,
  dshAgentPresetForPermissionMode,
  dshPermissionPresetForMode,
  normalizePermissionMode,
} from '../electron/backend/dsh-permission-map.mjs'

assert.equal(dshAgentPresetForPermissionMode('full'), 'code')
assert.equal(dshAgentPresetForPermissionMode('ask'), 'code', 'agent/tool composition is independent from permission mode')

assert.equal(dshPermissionPresetForMode('ask'), 'workspace-write')
assert.equal(dshPermissionPresetForMode('on-risk'), 'workspace-write')
assert.equal(dshPermissionPresetForMode('full'), 'danger-full-access')
assert.equal(normalizePermissionMode('unexpected'), 'ask', 'unknown UI modes fall back to the restrictive ask mode')

for (const mode of ['ask', 'on-risk', 'full', 'unknown']) {
  assert.equal(dshApprovalNeedsPrompt(mode, { toolName: 'bash', reason: 'npm test' }), true)
  assert.equal(dshApprovalNeedsPrompt(mode, { toolName: 'bash', reason: 'rm -rf /' }), true)
  assert.equal(dshApprovalNeedsPrompt(mode, { toolName: 'read', reason: 'README' }), true)
  assert.equal(dshApprovalNeedsPrompt(mode, {}), true, 'missing tool context must not auto-approve')
  assert.equal(resolveDshApprovalBridgeAction(mode, { toolName: 'bash', reason: 'npm test' }), 'prompt')
}
console.log('dsh-permission-map tests passed')
