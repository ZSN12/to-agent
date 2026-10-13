import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { singleFlight } from '../src/features/models/single-flight.ts'

const source = await fs.readFile(new URL('../src/features/models/useModelCatalog.ts', import.meta.url), 'utf8')
assert.match(source, /singleFlight\(loadInFlight,\s*async\s*\(/, 'the hook must route its initial load through the tested coalescer')
assert.match(source, /const res = await loadBundle\(\)/, 'the coalesced hook operation must load the model bundle')

const ref = { current: null }
let calls = 0
let resolveWork
const sharedWork = new Promise((resolve) => { resolveWork = resolve })
const work = async () => {
  calls += 1
  return sharedWork
}

const first = singleFlight(ref, work)
const second = singleFlight(ref, async () => {
  calls += 1
  return 'duplicate'
})
const third = singleFlight(ref, work)
assert.equal(first, second)
assert.equal(first, third)
await Promise.resolve()
assert.equal(calls, 1, 'three concurrent initial loads must invoke the bundle loader once')
resolveWork('loaded')
assert.deepEqual(await Promise.all([first, second, third]), ['loaded', 'loaded', 'loaded'])
assert.equal(ref.current, null, 'settled work releases the in-flight slot')

let retryCalls = 0
await assert.rejects(singleFlight(ref, async () => {
  retryCalls += 1
  throw new Error('temporary failure')
}), /temporary failure/)
assert.equal(ref.current, null, 'failed work also releases the in-flight slot')
assert.equal(await singleFlight(ref, async () => {
  retryCalls += 1
  return 'retried'
}), 'retried')
assert.equal(retryCalls, 2, 'a later call can retry after failure')

console.log('useModelCatalog single-flight checks passed: concurrent calls share one bundle load and failures can retry')
