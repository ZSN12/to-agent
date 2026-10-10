import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createJsonStore, setJsonStoreCorruptionHandler } from '../desktop/backend/json-store.mjs'
import { createUsageStore } from '../desktop/backend/usage-store.mjs'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-store-concurrency-'))
const corruptionNotices = []
setJsonStoreCorruptionHandler((details) => corruptionNotices.push(details))
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

  const corruptFile = path.join(home, 'corrupt.json')
  const corruptBytes = '{"valid": false, broken'
  await fs.writeFile(corruptFile, corruptBytes)
  const recoverable = createJsonStore(corruptFile, () => ({ recovered: true }))
  const [recoveredA, recoveredB] = await Promise.all([recoverable.read(), recoverable.read()])
  assert.deepEqual(recoveredA, { recovered: true }, 'corrupt JSON falls back to the default')
  assert.deepEqual(recoveredB, { recovered: true }, 'serialized readers see the same recovered default')
  assert.equal(corruptionNotices.length, 1, 'one corrupt file creates one user notice')
  assert.equal(corruptionNotices[0].filePath, corruptFile)
  assert.match(corruptionNotices[0].quarantinePath, /^.+\.corrupt-\d+-[0-9a-f-]+$/u)
  assert.equal(await fs.readFile(corruptionNotices[0].quarantinePath, 'utf8'), corruptBytes,
    'quarantine preserves the corrupt original')
  await assert.rejects(fs.access(corruptFile), { code: 'ENOENT' })
  await recoverable.update(value => ({ ...value, repaired: true }))
  assert.deepEqual(JSON.parse(await fs.readFile(corruptFile, 'utf8')), { recovered: true, repaired: true },
    'valid writes resume after recovery')

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
  assert.equal('recent' in stats, false, 'usage API exposes aggregates only')
  await usage.record({ id: 'parallel-0', modelKey: 'local/mock', inputTokens: 10, outputTokens: 2, elapsedMs: 1 })
  stats = await usage.getStats()
  assert.equal(stats.totals.totalCalls, 60, 'late duplicate cannot be re-counted after more than 50 calls')
  await Promise.all([usage.clear(), usage.record({ id: 'after-clear', modelKey: 'local/mock', inputTokens: 7 })])
  stats = await usage.getStats()
  assert.equal(stats.totals.totalCalls, 1, 'record admitted after clear survives')
  assert.equal(stats.totals.totalTokens, 7)
  const historyHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-usage-import-'))
  const historicalUsage = createUsageStore(historyHome)
  const historicalTimestamp = new Date(2026, 8, 20, 10).getTime()
  const importing = historicalUsage.importHistoricalIfEmpty([{ id: 'history', timestamp: historicalTimestamp,
    time: '10:00', modelKey: 'local/mock', usage: { inputTokens: 9, outputTokens: 1 } }])
  const live = historicalUsage.record({ id: 'live-during-import', modelKey: 'local/mock', inputTokens: 5 })
  await Promise.all([importing, live])
  stats = await historicalUsage.getStats()
  assert.equal(stats.totals.totalCalls, 2, 'historical import and concurrently admitted live call both survive')
  assert.equal(stats.totals.totalTokens, 15)
  assert.equal(stats.earliestDate, '2026-09-20', 'earliest date is available without per-call timestamps')
  await historicalUsage.importHistoricalIfEmpty([{ id: 'history', timestamp: historicalTimestamp,
    time: '10:00', modelKey: 'local/mock', usage: { inputTokens: 9, outputTokens: 1 } }])
  assert.equal((await historicalUsage.getStats()).totals.totalCalls, 2, 'historical backfill runs once')
  await fs.rm(historyHome, { recursive: true, force: true })
  console.log('JSON store concurrency: no lost updates, ordered reads/writes, failure recovery, parallel usage and delayed dedup pass')
} finally {
  setJsonStoreCorruptionHandler(null)
  await fs.rm(home, { recursive: true, force: true })
}
