import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const modulePath = path.resolve('vendor/taskweaver-z-runtime/runtime-packages/@z/dsh-tool-cache/lib/index.js')
const { apply, Config } = await import(pathToFileURL(modulePath).href)

assert.equal(typeof Config, 'function', 'tool-cache must expose a runtime config schema')
assert.deepEqual(Config({}), {
  enabled: true,
  maxEntriesPerSession: 128,
  maxResultBytes: 65_536,
  maxCacheBytesPerSession: 4_194_304,
  allowedTools: [],
  blockedTools: [],
}, 'tool-cache defaults should be resolved by the schema')

function createCache(config = {}) {
  const listeners = new Map()
  const services = new Map()
  const ctx = {
    on(event, listener) { listeners.set(event, listener) },
    effect(effect) { effect() },
    provide(name, service) { services.set(name, service) },
    logger: { debug() {}, info() {} },
  }
  apply(ctx, {
    enabled: true,
    maxEntriesPerSession: 128,
    maxResultBytes: 65_536,
    maxCacheBytesPerSession: 4_194_304,
    allowedTools: [],
    blockedTools: [],
    ...config,
  })
  return { listeners, services }
}

const { listeners, services } = createCache()
const sessionId = 'tool-cache-test-session'
const agent = { session: { sessionId } }
const invoke = listeners.get('agent/tool/call')
let physicalCalls = 0
const call = (toolName, toolInput, result) => invoke(
  agent,
  { tool_name: toolName, tool_input: toolInput },
  async () => result ?? { is_error: false, content: [{ type: 'text', text: `result-${++physicalCalls}` }] },
)

const firstRead = await call('read', { path: 'src/a.ts', range: { start: 1, end: 3 } })
const equivalentRead = await call('read', { range: { end: 3, start: 1 }, path: 'src/a.ts' })
assert.equal(physicalCalls, 1, 'nested object key order must not cause a cache miss')
assert.deepEqual(equivalentRead, firstRead)

await call('read', { path: 'src/b.ts', range: { start: 1, end: 3 } })
assert.equal(physicalCalls, 2, 'different nested tool arguments must not collide')

await call('edit', { path: 'src/a.ts', content: 'changed' })
const readAfterEdit = await call('read', { path: 'src/a.ts', range: { start: 1, end: 3 } })
assert.equal(physicalCalls, 4, 'a possibly mutating tool call must invalidate prior reads')
assert.notDeepEqual(readAfterEdit, firstRead)

await call('bash', { command: 'ls' })
await call('bash', { command: 'ls' })
assert.equal(physicalCalls, 6, 'shell commands must never be cached by heuristic')

const cacheStats = services.get('tool-cache').getStats(sessionId)
assert.equal(cacheStats.hits, 1)
assert.equal(cacheStats.entries, 0, 'possibly mutating tool calls clear cached entries')
assert.equal(cacheStats.bytes, 0, 'invalidation releases the retained cache budget')

const capped = createCache({ maxResultBytes: 64 })
const cappedInvoke = capped.listeners.get('agent/tool/call')
let largeCalls = 0
const largeCall = () => cappedInvoke(
  agent,
  { tool_name: 'read', tool_input: { path: 'large.txt' } },
  async () => ({ is_error: false, content: [{ type: 'text', text: `x${++largeCalls}`.padEnd(256, 'x') }] }),
)
await largeCall()
await largeCall()
assert.equal(largeCalls, 2, 'oversized results should not consume the session cache')

console.log('tool-cache correctness and bounds tests passed')
