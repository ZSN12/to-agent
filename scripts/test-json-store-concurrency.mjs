import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createJsonStore } from '../electron/backend/json-store.mjs'
import { createUsageStore } from '../electron/backend/usage-store.mjs'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-store-concurrency-'))
try {
  const file = path.join(home, 'counter.json')
  const store = createJsonStore(file, () => ({ count: 0 }))
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  await Promise.all(Array.from({ length: 40 }, (_, i) => store.update(async current => {
    await sleep(i % 3)
    return { count: current.count + 1 }
  })))
  assert.equal((await store.read()).count, 40, 'concurrent read-modify-write must not lose updates')
  const ordering = [
    store.write({ count: 100 }),
    store.update(current => ({ count: current.count + 1 })),
    store.read(),
  ]
  assert.equal((await Promise.all(ordering))[2].count, 101, 'read sees earlier admitted writes')
  await assert.rejects(store.update(() => { throw new Error('injected mutation failure') }), /injected/)
  await store.update(current => ({ count: current.count + 1 }))
  assert.equal((await store.read()).count, 102, 'one failure must not poison subsequent mutations')
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { count: 102 })
  const second = createJsonStore(file, { count: 0 })
  await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? second : store)
    .update(current => ({ count: current.count + 1 }))))
  assert.equal((await store.read()).count, 122, 'instances sharing a path must share mutation order')
  assert.equal((await fs.readdir(home)).some(name => name.endsWith('.tmp')), false)

  const usage = createUsageStore(home)
  await Promise.all(Array.from({ length: 60 }, (_, i) => usage.record({
    id: `parallel-${i}`, modelKey: 'local/mock', conversationId: `c-${i % 4}`,
    inputTokens: 10, outputTokens: 2, elapsedMs: 1,
  })))
  let stats = await usage.getStats()
  assert.equal(stats.totals.totalCalls, 60, 'all parallel conversation usage records survive')
  assert.equal(stats.totals.totalTokens, 720)
  await usage.record({ id: 'parallel-0', modelKey: 'local/mock', inputTokens: 10, outputTokens: 2, elapsedMs: 1 })
  stats = await usage.getStats()
  assert.equal(stats.totals.totalCalls, 60, 'late duplicate cannot be re-counted after more than 50 calls')
  await Promise.all([usage.clear(), usage.record({ id: 'after-clear', modelKey: 'local/mock', inputTokens: 7 })])
  stats = await usage.getStats()
  assert.equal(stats.totals.totalCalls, 1, 'record admitted after clear survives')
  assert.equal(stats.totals.totalTokens, 7)
  await usage.clear()
  const historicalTimestamp = new Date(2026, 8, 20, 10).getTime()
  const importing = usage.importHistoricalIfEmpty([{ id: 'history', timestamp: historicalTimestamp,
    time: '10:00', modelKey: 'local/mock', usage: { inputTokens: 9, outputTokens: 1 } }])
  const live = usage.record({ id: 'live-during-import', modelKey: 'local/mock', inputTokens: 5 })
  await Promise.all([importing, live])
  stats = await usage.getStats()
  assert.ok(stats.recent.some(record => record.id === 'live-during-import'), 'migration must not overwrite live usage')
  await usage.clear()
  await usage.importHistoricalIfEmpty([{ id: 'history', timestamp: historicalTimestamp,
    time: '10:00', modelKey: 'local/mock', usage: { inputTokens: 9, outputTokens: 1 } }])
  stats = await usage.getStats()
  assert.equal(stats.recent[0].timestamp, historicalTimestamp, 'historical usage retains its actual date')
  console.log('JSON store concurrency: no lost updates, ordered reads/writes, failure recovery, parallel usage and delayed dedup pass')
} finally {
  await fs.rm(home, { recursive: true, force: true })
}
