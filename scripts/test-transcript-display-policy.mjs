import assert from 'node:assert/strict'
import { resolvePreferDshTranscript } from '../electron/backend/transcript-display-policy.mjs'

assert.equal(resolvePreferDshTranscript({
  subscribed: true,
  conversationId: 'c1',
  view: { conversationId: 'c1' },
  preferDshTranscript: true,
}), true)

assert.equal(resolvePreferDshTranscript({
  subscribed: true,
  conversationId: 'c1',
  view: { conversationId: 'c1' },
  preferDshTranscript: false,
}), false)

assert.equal(resolvePreferDshTranscript({
  subscribed: true,
  conversationId: 'c1',
  view: { conversationId: 'c2' },
}), false)

console.log('transcript-display-policy tests passed')
