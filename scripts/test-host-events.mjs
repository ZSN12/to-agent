import assert from 'node:assert/strict'
import { createHostModelCatalogEventPump } from '../backend/host-events.mjs'

const calls = []
const modelService = {
  async invalidateCatalogCache() { calls.push('invalidate') },
  async refreshCatalogBundle() { calls.push('refresh') },
}
const frames = [
  { type: 'host/remote-event', event: 'agent-preset/selected', args: [] },
  { type: 'host/remote-event', event: 'llm/adapters-updated', args: [] },
  { type: 'host/remote-event', event: 'credentials/reference-updated', args: ['OPENAI_API_KEY'] },
]
const hostManager = {
  async start() {
    return {
      api: {
        events: {
          async *host(_request, signal) {
            for (const payload of frames) yield { payload }
            await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
          },
        },
      },
    }
  },
}

const pump = createHostModelCatalogEventPump({ hostManager, modelService, debounceMs: 10, retryMs: 10, onError: (error) => { throw error } })
void pump.start()
await new Promise((resolve) => setTimeout(resolve, 40))
await pump.stop()
assert.deepEqual(calls, ['invalidate', 'refresh'], 'relevant Host events coalesce into one refresh')
console.log('host model catalog event checks passed')
