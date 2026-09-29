import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveConversationId } from '../electron/backend/conversation-id-routing.mjs'

describe('IPC conversation routing', () => {
  it('uses the conversation captured by the renderer even after the active chat changes', () => {
    assert.equal(resolveConversationId('conversation-a', 'conversation-b'), 'conversation-a')
  })

  it('uses the active conversation only for legacy calls that omit an id', () => {
    assert.equal(resolveConversationId(undefined, 'conversation-b'), 'conversation-b')
  })

  it('does not silently redirect an explicit empty target to another conversation', () => {
    assert.equal(resolveConversationId(null, 'conversation-b'), null)
    assert.equal(resolveConversationId('', 'conversation-b'), null)
  })
})
