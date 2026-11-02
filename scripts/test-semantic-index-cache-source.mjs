// Run: node --import tsx scripts/test-semantic-index-cache-source.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { Config, apply } from '../packages/runtime/fs/tool-fs-semantic-search/src/index.ts'
import { DEFAULT_MAX_INDEXED_WORKSPACES, WorkspaceIndexCache } from '../packages/runtime/fs/tool-fs-semantic-search/src/index-cache.ts'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('default/invalid capacities and configuration defaults', async () => {
  assert.equal(DEFAULT_MAX_INDEXED_WORKSPACES, 2)
  assert.equal(Config({}).maxIndexedWorkspaces, DEFAULT_MAX_INDEXED_WORKSPACES)
  for (const capacity of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => new WorkspaceIndexCache(capacity), /positive integer/)
    await assert.rejects(apply({}, { maxFiles: 1, maxFileBytes: 1, maxTotalBytes: 1,
      maxIndexedWorkspaces: capacity }), /positive integer/)
  }
  assert.throws(() => Config({ maxIndexedWorkspaces: 0 }))
  assert.throws(() => Config({ maxIndexedWorkspaces: 1.5 }))
})

test('LRU includes pending entries, touches reads, and responds to reduced capacity', async () => {
  const cache = new WorkspaceIndexCache(2)
  await cache.replace('one', async () => 1)
  await cache.replace('two', async () => 2)
  assert.equal(await cache.get('one'), 1)
  await cache.replace('three', async () => 3)
  assert.equal(cache.get('two'), undefined)
  assert.equal(await cache.get('one'), 1)
  cache.setCapacity(1)
  assert.equal(cache.get('three'), undefined)
  assert.equal(await cache.get('one'), 1)
  cache.dispose()
})

test('eviction cancels pending builds and late completion never resurrects an entry', async () => {
  const cache = new WorkspaceIndexCache(1)
  const slow = deferred()
  let buildSignal
  const old = cache.replace('old', async signal => { buildSignal = signal; return slow.promise })
  await Promise.resolve()
  const rejection = assert.rejects(old, /evicted.*index_project/)
  await cache.replace('new', async () => 'new value')
  await rejection
  assert.equal(buildSignal.aborted, true)
  slow.resolve('late result')
  await Promise.resolve()
  assert.equal(cache.get('old'), undefined)
  assert.equal(await cache.get('new'), 'new value')
  cache.dispose()
})

test('a stale rejection cannot delete a replacement build', async () => {
  const cache = new WorkspaceIndexCache(1)
  const slow = deferred()
  const old = cache.replace('same', async () => slow.promise)
  await Promise.resolve()
  const rejection = assert.rejects(old, /replaced/)
  await cache.replace('same', async () => 'replacement')
  await rejection
  slow.reject(new Error('late failure'))
  await Promise.resolve()
  assert.equal(await cache.get('same'), 'replacement')
  cache.dispose()
})

test('failure, caller cancellation, reset and disposal release their entries', async () => {
  const cache = new WorkspaceIndexCache(2)
  await assert.rejects(cache.replace('failure', async () => { throw new Error('failed') }), /failed/)
  assert.equal(cache.get('failure'), undefined)
  const caller = new AbortController()
  const slow = deferred()
  const canceled = cache.replace('canceled', async () => slow.promise, caller.signal)
  const cancellation = assert.rejects(canceled, /caller canceled/)
  caller.abort(new Error('caller canceled'))
  await cancellation
  assert.equal(cache.get('canceled'), undefined)
  slow.resolve('late')
  await cache.replace('ready', async () => 'ready')
  cache.clear()
  assert.equal(cache.get('ready'), undefined)
  const pending = cache.replace('pending', async () => new Promise(() => {}))
  const disposal = assert.rejects(pending, /reset/)
  cache.dispose()
  await disposal
  assert.equal(cache.get('pending'), undefined)
  await assert.rejects(cache.replace('closed', async () => 1), /disposed/)
})

function createHost({ content = 'function lookup() { return 1 }', read } = {}) {
  const tools = new Map(), events = new Map(), disposers = []
  const target = displayPath => ({ displayPath, targetKey: displayPath })
  const host = {
    get(name) { return name === 'credentials' ? { describe: async () => ({ configured: false }) } : undefined },
    inject() {},
    on(event, callback) { events.set(event, callback); return () => events.delete(event) },
    effect(factory) { disposers.push(factory()) },
    logger: { warn(message, error) { throw new Error(message, { cause: error }) } },
    tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name) } },
    systemPrompt: { section() { return () => {} } },
    fs: {
      resolve: async path => target(path),
      stat: async file => file.displayPath.endsWith('.ts') ? { type: 'file', size: content.length } : { type: 'directory' },
      listDir: async root => [{ name: 'code.ts', type: 'file', target: target(`${root.displayPath}/code.ts`) }],
      contains: (root, file) => file.targetKey.startsWith(`${root.targetKey}/`),
      readText: async (file, signal) => read ? read(file, signal) : content,
    },
  }
  return {
    host,
    call(name, workspace = '/workspace', args = {}, signal = new AbortController().signal) {
      return tools.get(name).execute({ workspace, ...args }, { signal })
    },
    emit(event, value) { events.get(event)?.(value) },
    dispose() { for (const dispose of disposers.splice(0).reverse()) dispose?.() },
  }
}

const baseConfig = { embeddingProvider: 'jina', maxFiles: 10, maxFileBytes: 10000, maxTotalBytes: 10000 }

test('two plugin instances own separate workspace snapshots and credential resets', async () => {
  const first = createHost(), second = createHost({ content: 'function other() { return 2 }' })
  await apply(first.host, baseConfig)
  await apply(second.host, baseConfig)
  try {
    await first.call('index_project_for_semantic_search')
    assert.equal((await second.call('semantic_search_stats')).indexed, false)
    await second.call('index_project_for_semantic_search')
    first.emit('credentials/reference-updated', 'JINA_API_KEY')
    assert.equal((await first.call('semantic_search_stats')).indexed, false)
    assert.equal((await second.call('semantic_search_stats')).indexed, true)
    first.dispose()
    assert.equal((await second.call('semantic_search_stats')).indexed, true)
  } finally { first.dispose(); second.dispose() }
})

test('tool integration enforces configured capacity and tells evicted workspaces to rebuild', async () => {
  const fixture = createHost()
  await apply(fixture.host, { ...baseConfig, maxIndexedWorkspaces: 1 })
  try {
    await fixture.call('index_project_for_semantic_search', '/first')
    await fixture.call('index_project_for_semantic_search', '/second')
    assert.equal((await fixture.call('semantic_search_stats', '/first')).indexed, false)
    assert.equal((await fixture.call('semantic_search_stats', '/second')).indexed, true)
    await assert.rejects(fixture.call('semantic_search_code', '/first', { query: 'lookup' }),
      /not indexed.*index_project/)
  } finally { fixture.dispose() }
})

test('disposing a plugin aborts its in-flight filesystem work and prevents publishing success', async () => {
  const started = deferred(), content = deferred()
  let readSignal
  const fixture = createHost({ read: async (_file, signal) => {
    readSignal = signal
    started.resolve()
    return content.promise
  } })
  await apply(fixture.host, baseConfig)
  const indexing = fixture.call('index_project_for_semantic_search')
  await started.promise
  const rejected = assert.rejects(indexing, /reset/)
  fixture.dispose()
  await rejected
  assert.equal(readSignal.aborted, true)
  content.resolve('function late() { return 1 }')
})
