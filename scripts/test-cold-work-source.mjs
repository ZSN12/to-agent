import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createWorkspaceIndex } from '../backend/workspace-index.mjs'
import { createOAuthTokenCache } from '../packages/provider-bridge-transport/oauth-token-cache.mjs'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))
const file = { isSymbolicLink: () => false, isDirectory: () => false, isFile: () => true }
const directory = { ...file, isDirectory: () => true, isFile: () => false }
const symlink = { ...file, isSymbolicLink: () => true }
const child = (name) => ({ name })
async function test(label, run) {
  await run()
  console.log(`✓ ${label}`)
}
async function withIndexFs(run) {
  const original = { realpath: fs.realpath, readdir: fs.readdir, lstat: fs.lstat, now: Date.now }
  fs.realpath = async (value) => value
  fs.lstat = async () => file
  try { await run() } finally { Object.assign(fs, { realpath: original.realpath, readdir: original.readdir, lstat: original.lstat }); Date.now = original.now }
}

await test('Workspace: eight cold requests share one 3,000-entry traversal; warm and TTL refresh', () => withIndexFs(async () => {
  let reads = 0, stats = 0, time = 10_000
  Date.now = () => time
  fs.readdir = async () => { reads++; return Array.from({ length: 3000 }, (_, i) => child(`file-${i}`)) }
  fs.lstat = async () => { stats++; return file }
  const index = createWorkspaceIndex({ getWorkspacePath: () => '/workspace' })
  const results = await Promise.all(Array.from({ length: 8 }, () => index.list({ limit: 500 })))
  assert.equal(reads, 1)
  assert.equal(stats, 3000)
  assert(results.every((result) => result.length === 500))
  await index.list()
  assert.equal(reads, 1)
  time += 5000
  await Promise.all(Array.from({ length: 8 }, () => index.list()))
  assert.equal(reads, 2)
  assert.equal(stats, 6000)
}))

await test('Workspace: switch away and back rejects late cache publication; clearing root starts a new generation', () => withIndexFs(async () => {
  const old = deferred()
  let aReads = 0, root = '/a'
  fs.readdir = async (value) => value === '/a' && ++aReads === 1 ? old.promise : [child(value === '/a' ? 'new-a' : 'b')]
  const index = createWorkspaceIndex({ getWorkspacePath: () => root })
  const first = index.list()
  await tick()
  root = '/b'
  assert.equal((await index.list())[0].path, 'b')
  root = '/a'
  assert.equal((await index.list())[0].path, 'new-a')
  old.resolve([child('old-a')])
  assert.equal((await first)[0].path, 'old-a')
  assert.equal((await index.list())[0].path, 'new-a')
  assert.equal(aReads, 2)
  root = null
  assert.deepEqual(await index.list(), [])
  root = '/a'
  await index.list()
  assert.equal(aReads, 3)
}))

await test('Workspace: build failure releases flight; empty roots, ignored paths, symlinks, filters and limits', () => withIndexFs(async () => {
  let reads = 0
  fs.readdir = async () => ++reads === 1 ? { sort() { throw new Error('synthetic build failure') } } : []
  const index = createWorkspaceIndex({ getWorkspacePath: () => '/empty' })
  const failed = await Promise.allSettled(Array.from({ length: 8 }, () => index.list()))
  assert(failed.every((result) => result.status === 'rejected'))
  assert.equal(reads, 1)
  assert.deepEqual(await index.list(), [])
  assert.equal(reads, 2)
  let ioReads = 0
  fs.readdir = async () => { if (++ioReads === 1) throw new Error('synthetic I/O failure'); return [child('recovered')] }
  const transient = createWorkspaceIndex({ getWorkspacePath: () => '/transient' })
  assert.deepEqual(await transient.list(), [])
  assert.equal((await transient.list())[0].path, 'recovered')
  assert.equal(ioReads, 2)
  const visited = []
  fs.readdir = async (value) => value === '/safe' ? ['.git', 'dir', 'link-outside', 'a.txt', 'b.txt'].map(child) : [child('c.txt')]
  fs.lstat = async (value) => { visited.push(value); return value.endsWith('/dir') ? directory : value.endsWith('/link-outside') ? symlink : file }
  const safe = createWorkspaceIndex({ getWorkspacePath: () => '/safe' })
  assert.deepEqual((await safe.list({ includeDirectories: false, query: '.TXT', limit: 2 })).map((entry) => entry.path), ['a.txt', 'b.txt'])
  assert.equal(visited.includes('/safe/.git'), false)
  assert.equal((await safe.list()).some((entry) => entry.path.includes('link-outside')), false)
  const limited = createWorkspaceIndex({ getWorkspacePath: () => '/safe', maxEntries: 2 })
  assert.equal((await limited.list()).length <= 2, true)
}))

await test('OAuth: eight cold consumers share loader, provider caches isolate, fallback TTL and skew expire', async () => {
  let now = 1000, calls = 0
  const cache = createOAuthTokenCache({ now: () => now, refreshSkewMs: 60_000 })
  const load = async () => { calls++; return 'synthetic-token' }
  await Promise.all(Array.from({ length: 8 }, () => cache.get('cursor', load)))
  assert.equal(calls, 1)
  await cache.get('cursor', load)
  assert.equal(calls, 1)
  await cache.get('another-provider', load)
  assert.equal(calls, 2)
  now += 300_000
  await Promise.all(Array.from({ length: 8 }, () => cache.get('cursor', load)))
  assert.equal(calls, 3)
})

await test('OAuth: a failed or invalid load releases flight; expired tokens fail; near-expiry tokens do not cache', async () => {
  const cache = createOAuthTokenCache({ now: () => 1000, refreshSkewMs: 100 })
  let calls = 0
  const fail = async () => { calls++; throw new Error('synthetic helper failure') }
  const failures = await Promise.allSettled(Array.from({ length: 8 }, () => cache.get('cursor', fail)))
  assert(failures.every((result) => result.status === 'rejected'))
  assert.equal(calls, 1)
  await assert.rejects(cache.get('cursor', async () => ''))
  await assert.rejects(cache.get('cursor', async () => ({ accessToken: 'synthetic-expired', expiresAtMs: 999 })), /expired/)
  const near = async () => { calls++; return { accessToken: 'synthetic-near', expiresAtMs: 1050 } }
  await cache.get('cursor', near)
  await cache.get('cursor', near)
  assert.equal(calls, 3)
  await cache.get('cursor', async () => 'synthetic-valid')
})

await test('OAuth: first and later consumers cancel independently; only last cancellation aborts helper', async () => {
  for (const cancelledIndex of [0, 1]) {
    const cache = createOAuthTokenCache()
    const pending = deferred()
    let helperSignal, calls = 0
    const load = (signal) => { calls++; helperSignal = signal; return pending.promise }
    const controllers = [new AbortController(), new AbortController()]
    const requests = controllers.map((controller) => cache.get('cursor', load, { signal: controller.signal }))
    const cancelled = assert.rejects(requests[cancelledIndex], /consumer cancelled/)
    await tick()
    controllers[cancelledIndex].abort(new Error('consumer cancelled'))
    await cancelled
    assert.equal(helperSignal.aborted, false)
    pending.resolve('synthetic-shared')
    assert.equal(await requests[1 - cancelledIndex], 'synthetic-shared')
    assert.equal(calls, 1)
  }
  const cache = createOAuthTokenCache()
  const pending = deferred(), controller = new AbortController()
  let helperSignal
  const request = cache.get('cursor', (signal) => { helperSignal = signal; return pending.promise }, { signal: controller.signal })
  const cancelled = assert.rejects(request, { name: 'AbortError' })
  await tick()
  controller.abort()
  await cancelled
  assert.equal(helperSignal.aborted, true)
  await cache.get('cursor', async () => 'synthetic-next')
  pending.resolve('synthetic-late')
  await tick()
  assert.equal(await cache.get('cursor', async () => { throw new Error('must stay cached') }), 'synthetic-next')
  const alreadyAborted = new AbortController()
  alreadyAborted.abort()
  await assert.rejects(cache.get('cursor', async () => { throw new Error('must not load') }, { signal: alreadyAborted.signal }), { name: 'AbortError' })
})

await test('OAuth: invalidate and clear abort pending consumers and prevent late results overwriting fresh credentials', async () => {
  for (const operation of ['invalidate', 'clear']) {
    const cache = createOAuthTokenCache()
    const old = deferred(), fresh = deferred()
    const request = cache.get('cursor', () => old.promise)
    const cancelled = assert.rejects(request, { name: 'AbortError' })
    await tick()
    if (operation === 'clear') cache.clear()
    else cache.invalidate('cursor')
    await cancelled
    const next = cache.get('cursor', () => fresh.promise)
    old.resolve('synthetic-old')
    await tick()
    fresh.resolve('synthetic-new')
    await next
    assert.equal(await cache.get('cursor', async () => { throw new Error('must stay cached') }), 'synthetic-new')
    if (operation === 'clear') cache.clear()
    else cache.invalidate('cursor')
    assert.equal(await cache.get('cursor', async () => 'synthetic-after-clear'), 'synthetic-after-clear')
  }
})

console.log('Cold-work source regressions passed (local mocks only).')
