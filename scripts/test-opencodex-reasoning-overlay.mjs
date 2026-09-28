import assert from 'node:assert/strict'
import { applyOpenCodexDshReasoningOverlay } from '../electron/backend/opencodex-reasoning-overlay.mjs'

const sample = {
  providers: {
    opencodex: {
      baseUrl: 'http://127.0.0.1:10100/v1',
      api: 'openai-completions',
      models: [
        { id: 'cursor/composer-2.5', name: 'composer-2.5 (cursor)' },
        { id: 'cursor/composer-2.5-fast', name: 'fast' },
        { id: 'cursor/grok-4.6', name: 'grok' },
      ],
    },
    other: {
      baseUrl: 'https://api.example.com/v1',
      models: [{ id: 'gpt-4' }],
    },
  },
}

const out = applyOpenCodexDshReasoningOverlay(sample)
const ocx = out.providers.opencodex

assert.equal(ocx.compat.thinkingFormat, 'openai')
assert.equal(ocx.compat.supportsReasoningEffort, true)

const composer = ocx.models.find((m) => m.id === 'cursor/composer-2.5')
assert.equal(composer.reasoning, true)
assert.equal(composer.thinkingLevelMap.high, 'high')

const fast = ocx.models.find((m) => m.id === 'cursor/composer-2.5-fast')
assert.equal(fast.reasoning, undefined)

const grok = ocx.models.find((m) => m.id === 'cursor/grok-4.6')
assert.equal(grok.reasoning, true)

assert.equal(out.providers.other.compat, undefined)

console.log('test-opencodex-reasoning-overlay: ok')
