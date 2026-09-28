import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { MockDshSession, createMockWorkspace, waitFor } from './helpers/mock-services.mjs'

/**
 * Integration tests for multi-session parallel execution
 *
 * Validates that multiple DSH sessions can run concurrently
 * with proper isolation between sessions.
 */

describe('Multi-Session Parallel Execution', () => {
  let workspace

  beforeEach(() => {
    workspace = createMockWorkspace()
  })

  it('should isolate tool calls between concurrent sessions', async () => {
    const session1 = new MockDshSession('session-1')
    const session2 = new MockDshSession('session-2')

    workspace.addSession(session1.sessionId, session1)
    workspace.addSession(session2.sessionId, session2)

    // Execute tool calls in parallel
    await Promise.all([
      session1.executeToolCall('bash', { command: 'echo session1' }),
      session2.executeToolCall('bash', { command: 'echo session2' }),
    ])

    // Verify isolation
    const state1 = session1.getIsolationState()
    const state2 = session2.getIsolationState()

    assert.equal(state1.toolCalls, 1, 'Session 1 should have 1 tool call')
    assert.equal(state2.toolCalls, 1, 'Session 2 should have 1 tool call')
    assert.equal(session1.toolCalls[0].sessionId, 'session-1')
    assert.equal(session2.toolCalls[0].sessionId, 'session-2')
  })

  it('should handle concurrent file mutations without interference', async () => {
    const session1 = new MockDshSession('session-1')
    const session2 = new MockDshSession('session-2')

    workspace.addSession(session1.sessionId, session1)
    workspace.addSession(session2.sessionId, session2)

    // Simulate concurrent file writes
    const file1Promise = session1.executeToolCall('write', {
      file_path: '/tmp/test-workspace/file1.txt',
      content: 'session1 content',
    })

    const file2Promise = session2.executeToolCall('write', {
      file_path: '/tmp/test-workspace/file2.txt',
      content: 'session2 content',
    })

    await Promise.all([file1Promise, file2Promise])

    // Both sessions should succeed independently
    assert.equal(session1.toolCalls.length, 1)
    assert.equal(session2.toolCalls.length, 1)
    assert.notEqual(
      session1.toolCalls[0].input.file_path,
      session2.toolCalls[0].input.file_path,
      'Sessions should write to different files'
    )
  })

  it('should maintain separate message histories', async () => {
    const session1 = new MockDshSession('session-1')
    const session2 = new MockDshSession('session-2')

    await session1.sendMessage('Message for session 1')
    await session2.sendMessage('Message for session 2')
    await session1.sendMessage('Another message for session 1')

    assert.equal(session1.messages.length, 2)
    assert.equal(session2.messages.length, 1)
    assert.equal(session1.messages[0].content, 'Message for session 1')
    assert.equal(session2.messages[0].content, 'Message for session 2')
  })

  it('should handle session state transitions independently', async () => {
    const session1 = new MockDshSession('session-1')
    const session2 = new MockDshSession('session-2')

    assert.equal(session1.state, 'ready')
    assert.equal(session2.state, 'ready')

    session1.disconnect()

    assert.equal(session1.state, 'disconnected')
    assert.equal(session2.state, 'ready', 'Session 2 should remain ready')

    session1.reconnect()

    assert.equal(session1.state, 'ready')
    assert.equal(session2.state, 'ready')
  })

  it('should emit events only to the correct session', async () => {
    const session1 = new MockDshSession('session-1')
    const session2 = new MockDshSession('session-2')

    const session1Events = []
    const session2Events = []

    session1.on('tool-call', (call) => session1Events.push(call))
    session2.on('tool-call', (call) => session2Events.push(call))

    await session1.executeToolCall('bash', { command: 'echo test1' })
    await session2.executeToolCall('bash', { command: 'echo test2' })

    assert.equal(session1Events.length, 1)
    assert.equal(session2Events.length, 1)
    assert.equal(session1Events[0].sessionId, 'session-1')
    assert.equal(session2Events[0].sessionId, 'session-2')
  })
})
