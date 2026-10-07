import assert from 'node:assert/strict'
import {
  routePermissionPromptResponse,
  waitForRendererPermissionPrompt,
} from '../electron/backend/permission-prompt-bridge.mjs'

let localPrompt
const localDecision = waitForRendererPermissionPrompt({
  isDestroyed: () => false,
  send: (_channel, payload) => { localPrompt = payload },
}, { reason: 'local fence request', detail: 'test', tool: 'write' })

let hostWasCalled = false
assert.equal(await routePermissionPromptResponse(localPrompt.id, { action: 'allow-once' }, {
  respondHostApproval: async () => { hostWasCalled = true; return true },
}), true, 'in-process prompts should resolve through the local permission bridge')
assert.deepEqual(await localDecision, { action: 'allow-once' })
assert.equal(hostWasCalled, false, 'local prompt IDs must not fall through to the Host approval channel')

let hostDecision
assert.equal(await routePermissionPromptResponse('dsh-approval-session-approval', { action: 'deny' }, {
  respondHostApproval: async (id, response) => {
    hostDecision = { id, response }
    return true
  },
}), true, 'Host approval IDs should route to the Z Host response handler')
assert.deepEqual(hostDecision, {
  id: 'dsh-approval-session-approval',
  response: { action: 'deny' },
})

assert.equal(await routePermissionPromptResponse('unknown-prompt', { action: 'allow-once' }, {
  respondHostApproval: async () => false,
}), false, 'unknown prompt IDs must not be reported as successfully handled')

console.log('permission prompt bridge checks passed: local approvals, Z Host approval routing, and unknown-ID rejection')
