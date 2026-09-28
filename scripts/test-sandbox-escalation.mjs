import assert from 'node:assert/strict'
import { isWiderMode, validateEscalationArgs, sandboxDenialMarker } from '../vendor/dsh-sandbox/escalation.mjs'
import { withSandboxEscalation, consumeOneShotSandboxMode } from '../electron/backend/sandbox-escalation-runtime.mjs'

assert.equal(isWiderMode('read-only', 'workspace-write'), true)
assert.equal(isWiderMode('workspace-write', 'read-only'), false)
validateEscalationArgs('workspace-write', 'need tmp write')
assert.throws(() => validateEscalationArgs('workspace-write', undefined))
assert.match(sandboxDenialMarker('read-only'), /read-only/)

await withSandboxEscalation('workspace-write', async () => {
  assert.equal(consumeOneShotSandboxMode(), 'workspace-write')
  assert.equal(consumeOneShotSandboxMode(), null)
})

console.log('sandbox-escalation 测试通过')
