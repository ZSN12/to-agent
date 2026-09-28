import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { MockPermissionService, MockDshSession, waitFor } from './helpers/mock-services.mjs'

/**
 * Integration tests for permission approval flow
 *
 * Validates the permission request, approval, denial, and
 * queuing behavior for tool calls requiring user consent.
 */

describe('Permission Flow', () => {
  let permissionService
  let session

  beforeEach(() => {
    permissionService = new MockPermissionService()
    session = new MockDshSession('test-session')
  })

  it('should create pending prompt for permission request', async () => {
    const toolCall = { toolName: 'bash', input: { command: 'rm -rf /tmp/test' } }
    const context = { workspacePath: '/tmp/workspace', sessionId: session.sessionId }

    const requestPromise = permissionService.requestPermission(toolCall, context)

    await waitFor(() => permissionService.getPendingCount() === 1)

    assert.equal(permissionService.pendingPrompts.length, 1)
    assert.equal(permissionService.pendingPrompts[0].status, 'pending')
    assert.equal(permissionService.pendingPrompts[0].toolCall.toolName, 'bash')

    // Clean up - approve to resolve promise
    const promptId = permissionService.pendingPrompts[0].id
    permissionService.approve(promptId)
    await requestPromise
  })

  it('should resolve permission request on approval', async () => {
    const toolCall = { toolName: 'write', input: { file_path: '/etc/config.json' } }
    const context = { workspacePath: '/home/user/project' }

    const requestPromise = permissionService.requestPermission(toolCall, context)

    await waitFor(() => permissionService.getPendingCount() === 1)

    const promptId = permissionService.pendingPrompts[0].id
    const approvalOptions = { remember: true, scope: 'session' }

    permissionService.approve(promptId, approvalOptions)

    const result = await requestPromise

    assert.equal(result.approved, true)
    assert.deepEqual(result.options, approvalOptions)
    assert.equal(permissionService.approvals.length, 1)
    assert.equal(permissionService.approvals[0].status, 'approved')
  })

  it('should resolve permission request on denial', async () => {
    const toolCall = { toolName: 'bash', input: { command: 'sudo rm -rf /' } }
    const context = { workspacePath: '/home/user/project' }

    const requestPromise = permissionService.requestPermission(toolCall, context)

    await waitFor(() => permissionService.getPendingCount() === 1)

    const promptId = permissionService.pendingPrompts[0].id
    permissionService.deny(promptId, 'Dangerous operation')

    const result = await requestPromise

    assert.equal(result.approved, false)
    assert.equal(result.reason, 'Dangerous operation')
    assert.equal(permissionService.denials.length, 1)
    assert.equal(permissionService.denials[0].status, 'denied')
  })

  it('should handle multiple concurrent permission requests', async () => {
    const toolCall1 = { toolName: 'bash', input: { command: 'git push' } }
    const toolCall2 = { toolName: 'write', input: { file_path: '/tmp/output.txt' } }
    const toolCall3 = { toolName: 'bash', input: { command: 'npm install' } }

    const requests = [
      permissionService.requestPermission(toolCall1, {}),
      permissionService.requestPermission(toolCall2, {}),
      permissionService.requestPermission(toolCall3, {}),
    ]

    await waitFor(() => permissionService.getPendingCount() === 3)

    assert.equal(permissionService.pendingPrompts.length, 3)

    // Approve first and third, deny second
    const [prompt1, prompt2, prompt3] = permissionService.pendingPrompts

    permissionService.approve(prompt1.id)
    permissionService.deny(prompt2.id, 'User denied')
    permissionService.approve(prompt3.id)

    const results = await Promise.all(requests)

    assert.equal(results[0].approved, true)
    assert.equal(results[1].approved, false)
    assert.equal(results[2].approved, true)

    assert.equal(permissionService.approvals.length, 2)
    assert.equal(permissionService.denials.length, 1)
  })

  it('should support auto-approve mode', async () => {
    permissionService.autoApprove = true

    const toolCall = { toolName: 'read', input: { file_path: '/tmp/test.txt' } }
    const result = await permissionService.requestPermission(toolCall, {})

    assert.equal(result.approved, true)
    assert.equal(permissionService.approvals.length, 1)
  })

  it('should throw error when approving non-existent prompt', () => {
    assert.throws(
      () => {
        permissionService.approve('non-existent-prompt-id')
      },
      /Prompt .* not found/
    )
  })

  it('should throw error when denying non-existent prompt', () => {
    assert.throws(
      () => {
        permissionService.deny('non-existent-prompt-id')
      },
      /Prompt .* not found/
    )
  })

  it('should track approval and denial counts correctly', async () => {
    const requests = []

    for (let i = 0; i < 5; i++) {
      const toolCall = { toolName: 'bash', input: { command: `echo ${i}` } }
      requests.push(permissionService.requestPermission(toolCall, {}))
    }

    await waitFor(() => permissionService.getPendingCount() === 5)

    // Approve 3, deny 2
    permissionService.approve(permissionService.pendingPrompts[0].id)
    permissionService.approve(permissionService.pendingPrompts[1].id)
    permissionService.deny(permissionService.pendingPrompts[2].id)
    permissionService.approve(permissionService.pendingPrompts[3].id)
    permissionService.deny(permissionService.pendingPrompts[4].id)

    await Promise.all(requests)

    assert.equal(permissionService.approvals.length, 3)
    assert.equal(permissionService.denials.length, 2)
    assert.equal(permissionService.getPendingCount(), 0)
  })

  it('should reset state correctly', async () => {
    const toolCall = { toolName: 'bash', input: { command: 'echo test' } }
    const requestPromise = permissionService.requestPermission(toolCall, {})

    await waitFor(() => permissionService.getPendingCount() === 1)

    const promptId = permissionService.pendingPrompts[0].id
    permissionService.approve(promptId)
    await requestPromise

    assert.equal(permissionService.pendingPrompts.length, 1)
    assert.equal(permissionService.approvals.length, 1)

    permissionService.reset()

    assert.equal(permissionService.pendingPrompts.length, 0)
    assert.equal(permissionService.approvals.length, 0)
    assert.equal(permissionService.denials.length, 0)
  })
})
