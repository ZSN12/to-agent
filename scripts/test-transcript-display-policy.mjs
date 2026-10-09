import assert from 'node:assert/strict'
import { resolvePreferDshTranscript } from '../src/shared/transcript-display-policy.ts'

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
