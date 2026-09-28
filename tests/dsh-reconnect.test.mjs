import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { MockDshSession, waitFor } from './helpers/mock-services.mjs'

/**
 * Integration tests for DSH session reconnection
 *
 * Validates disconnect/reconnect handling, state preservation,
 * and message queue recovery.
 */

describe('DSH Session Reconnection', () => {
  let session

  beforeEach(() => {
    session = new MockDshSession('test-session')
  })

  it('should detect disconnection and update session state', async () => {
    assert.equal(session.connected, true)
    assert.equal(session.state, 'ready')

    const disconnectPromise = new Promise((resolve) => {
      session.once('disconnect', resolve)
    })

    session.disconnect()

    await disconnectPromise

    assert.equal(session.connected, false)
    assert.equal(session.state, 'disconnected')
  })

  it('should reject operations during disconnected state', async () => {
    session.disconnect()

    await assert.rejects(
      async () => {
        await session.sendMessage('test message')
      },
      /Session disconnected/,
      'Should reject message when disconnected'
    )
  })

  it('should restore session state after reconnection', async () => {
    // Send a message and execute a tool call before disconnect
    await session.sendMessage('message before disconnect')
    await session.executeToolCall('bash', { command: 'echo test' })

    const messageCountBeforeDisconnect = session.messages.length
    const toolCallCountBeforeDisconnect = session.toolCalls.length

    session.disconnect()
    assert.equal(session.connected, false)

    const reconnectPromise = new Promise((resolve) => {
      session.once('reconnect', resolve)
    })

    session.reconnect()

    await reconnectPromise

    // State should be restored
    assert.equal(session.connected, true)
    assert.equal(session.state, 'ready')
    assert.equal(session.messages.length, messageCountBeforeDisconnect)
    assert.equal(session.toolCalls.length, toolCallCountBeforeDisconnect)
  })

  it('should resume operations after reconnection', async () => {
    session.disconnect()
    session.reconnect()

    // Should be able to send messages again
    await assert.doesNotReject(async () => {
      await session.sendMessage('message after reconnect')
    })

    assert.equal(session.messages.length, 1)
    assert.equal(session.messages[0].content, 'message after reconnect')
  })

  it('should preserve session ID across disconnect/reconnect cycles', async () => {
    const originalSessionId = session.sessionId

    session.disconnect()
    session.reconnect()

    assert.equal(session.sessionId, originalSessionId)

    // Multiple cycles
    session.disconnect()
    session.reconnect()

    assert.equal(session.sessionId, originalSessionId)
  })

  it('should handle rapid disconnect/reconnect cycles', async () => {
    const cycles = 5
    const sessionId = session.sessionId

    for (let i = 0; i < cycles; i++) {
      session.disconnect()
      assert.equal(session.state, 'disconnected')

      session.reconnect()
      assert.equal(session.state, 'ready')
      assert.equal(session.sessionId, sessionId)
    }
  })

  it('should emit proper events during reconnection lifecycle', async () => {
    const events = []

    session.on('disconnect', () => events.push('disconnect'))
    session.on('reconnect', () => events.push('reconnect'))

    session.disconnect()
    await waitFor(() => events.includes('disconnect'))

    session.reconnect()
    await waitFor(() => events.includes('reconnect'))

    assert.deepEqual(events, ['disconnect', 'reconnect'])
  })

  it('should maintain tool call history through disconnect/reconnect', async () => {
    await session.executeToolCall('read', { file_path: '/test/file1.txt' })
    await session.executeToolCall('write', { file_path: '/test/file2.txt', content: 'data' })

    const toolCallsBeforeDisconnect = [...session.toolCalls]

    session.disconnect()
    session.reconnect()

    assert.equal(session.toolCalls.length, toolCallsBeforeDisconnect.length)
    assert.deepEqual(session.toolCalls[0].toolName, toolCallsBeforeDisconnect[0].toolName)
    assert.deepEqual(session.toolCalls[1].toolName, toolCallsBeforeDisconnect[1].toolName)
  })
})
