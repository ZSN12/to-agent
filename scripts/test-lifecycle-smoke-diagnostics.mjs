import assert from 'node:assert/strict'
import {
  classifyLifecycleSmokeError,
  summarizeLifecycleSmokeFailure,
} from './lifecycle-smoke-diagnostics.mjs'

assert.deepEqual(classifyLifecycleSmokeError(new Error('HTTP 402: private response body must not be persisted')), {
  errorCategory: 'provider-billing',
  httpStatus: 402,
})
assert.deepEqual(classifyLifecycleSmokeError('credential rejected (HTTP 401)'), {
  errorCategory: 'provider-auth',
  httpStatus: 401,
})

const privateBody = 'provider body with bearer secret-never-print-this'
const preflight = summarizeLifecycleSmokeFailure(new Error(privateBody), [])
assert.equal(preflight.failureStage, 'preflight-before-turn-start')
assert.equal(preflight.confirmedToolCalls, 0)
assert.equal(JSON.stringify(preflight).includes('secret-never-print-this'), false,
  'smoke diagnostics must not retain or print provider error bodies')

const rejectedPrompt = summarizeLifecycleSmokeFailure(new Error(privateBody), [
  { type: 'start' },
  { type: 'error', message: privateBody },
])
assert.equal(rejectedPrompt.failureStage, 'agent-terminal-error-before-tool')
assert.equal(rejectedPrompt.confirmedToolCalls, 0)
assert.equal(JSON.stringify(rejectedPrompt).includes(privateBody), false)

const fileToolFailure = summarizeLifecycleSmokeFailure(new Error('operation failed'), [
  { type: 'start' },
  { type: 'tool', status: 'running', toolName: 'read' },
  { type: 'error', message: 'operation failed' },
])
assert.equal(fileToolFailure.failureStage, 'agent-terminal-error-after-tool')
assert.equal(fileToolFailure.confirmedToolCalls, 1)

console.log('lifecycle smoke diagnostics: sanitized failure classification passed')

