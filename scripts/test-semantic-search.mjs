import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { BuiltinLocalEmbeddingService, CachedEmbeddingService } from '../packages/runtime/fs/tool-fs-semantic-search/lib/types/embedding.js'
import { SemanticSearcher } from '../packages/runtime/fs/tool-fs-semantic-search/lib/types/searcher.js'
import { InMemoryVectorStore } from '../packages/runtime/fs/tool-fs-semantic-search/lib/types/vector-store.js'
import { CodeChunker } from '../packages/runtime/fs/tool-fs-semantic-search/lib/types/chunker.js'
import { BM25Scorer, MinHeap } from '../packages/runtime/fs/tool-fs-semantic-search/lib/types/performance-utils.js'

// Load exactly the installed package entry, without tsx or custom ESM resolution.
const packageRoot = new URL('../packages/runtime/fs/tool-fs-semantic-search/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('package.json', packageRoot), 'utf8'))
const plugin = await import(new URL(manifest.main, packageRoot).href)
assert.equal(plugin.name, 'tool-fs-semantic-search')

console.log('--- 测试 1: BuiltinLocalEmbeddingService 免密向量生成与相似度 ---')
const localEmbedding = new BuiltinLocalEmbeddingService()
const vecAuth = await localEmbedding.embed('user login authentication verify password session token')
const vecQueryAuth = await localEmbedding.embed('how to authenticate and login a user')
const vecMath = await localEmbedding.embed('calculate matrix determinant eigenvalues linear algebra')

assert.equal(vecAuth.length, 384, '向量维度应为 384')
assert.equal(vecQueryAuth.length, 384)
assert.equal(vecMath.length, 384)

function dotProduct(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

const simAuth = dotProduct(vecAuth, vecQueryAuth)
const simMath = dotProduct(vecMath, vecQueryAuth)

console.log(`认证相关相似度: ${simAuth.toFixed(4)}, 数学无关相似度: ${simMath.toFixed(4)}`)
assert.ok(simAuth > simMath, '语义相关的文本余弦相似度必须明显高于无关文本')
assert.ok(simAuth > 0.3, '语义相关文本的相似度应具有明确正相关性')

console.log('--- 测试 2: SemanticSearcher 未配置 Key 时的端到端索引与搜索 ---')
const store = new InMemoryVectorStore()
const chunker = new CodeChunker()
const searcher = new SemanticSearcher(localEmbedding, store)

const sampleChunks = [
  {
    id: 'chunk-auth-1',
    file: 'src/auth/jwt-service.ts',
    language: 'typescript',
    type: 'class',
    name: 'JwtAuthService',
    content: 'export class JwtAuthService { verifyUserToken(token: string) { return decode(token) } }',
    startLine: 1,
    endLine: 10,
    metadata: {
      comments: 'Authentication token handler for user login and session management',
      exports: ['JwtAuthService'],
    },
  },
  {
    id: 'chunk-db-2',
    file: 'src/database/connection-pool.ts',
    language: 'typescript',
    type: 'function',
    name: 'createConnectionPool',
    content: 'export function createConnectionPool(config: PoolConfig) { return new Pool(config) }',
    startLine: 1,
    endLine: 15,
    metadata: {
      comments: 'Database connection pool manager with PostgreSQL driver',
      exports: ['createConnectionPool'],
    },
  },
  {
    id: 'chunk-calc-3',
    file: 'src/math/tax-calculator.ts',
    language: 'typescript',
    type: 'function',
    name: 'calculateTaxRate',
    content: 'export function calculateTaxRate(income: number, deductions: number) { return income * 0.2 }',
    startLine: 1,
    endLine: 8,
    metadata: {
      comments: 'Tax and financial calculation utilities',
      exports: ['calculateTaxRate'],
    },
  },
]

// 索引代码块（无需任何外部 API key）
await searcher.indexChunks(sampleChunks)

// 执行搜索
const authResults = await searcher.search('user authentication and login tokens', 5)
assert.ok(authResults.length > 0, '应返回搜索结果')
assert.equal(authResults[0].chunk.id, 'chunk-auth-1', '最相关结果应为 JwtAuthService')
assert.ok(authResults[0].score > 0, '命中得分应为正数')
assert.deepEqual(await searcher.search('   !!! ???   '), [], '空白和标点查询不应把零向量当成有效语义查询')

// 按符号名搜索
const poolResults = await searcher.search('createConnectionPool', 5)
assert.equal(poolResults[0].chunk.id, 'chunk-db-2', '按符号名检索应精准命中数据库连接池函数')

// 过滤测试
const tsOnly = await searcher.search('token', 5, { language: 'typescript' })
assert.ok(tsOnly.every(r => r.chunk.language === 'typescript'), '应支持语言过滤')
assert.equal((await searcher.search('token', 0.5)).length, 1, 'positive fractional topK is normalized to one result')

// 统计信息
const stats = await searcher.getStats()
assert.equal(stats.totalChunks, 3, '已索引代码块数量应为 3')
assert.ok(stats.cacheSize >= 0)

// Top-K must agree with a full sort even after several multi-level replacements.
const values = [53, 48, 59, 78, 49, 80, 39, 30, 41, 24, 59, 18, 61, 32, 35, 34, 25, 40, 39, 86]
for (const k of [1, 3, 5, 10, values.length + 1]) {
  const heap = new MinHeap(k, (a, b) => a - b)
  for (const [index, value] of values.entries()) {
    heap.push(value)
    // Taking a snapshot must not corrupt the heap before subsequent pushes.
    assert.deepEqual(heap.toSortedArray(), values.slice(0, index + 1).sort((a, b) => b - a).slice(0, k))
  }
  assert.deepEqual(heap.toSortedArray(), [...values].sort((a, b) => b - a).slice(0, k))
}
const rankedStore = new InMemoryVectorStore()
await rankedStore.add(values.map((value, i) => ({ ...sampleChunks[0], id: String(i), name: String(value) })),
  values.map(value => [value / 100, Math.sqrt(1 - (value / 100) ** 2)]))
assert.deepEqual((await rankedStore.search('', [1, 0], 5)).map(result => Number(result.chunk.name)), [86, 80, 78, 61, 59])
assert.deepEqual(await rankedStore.search('', [0, 0], 5), [], '零向量不能产生 NaN 或任意排序结果')

let embeddingCalls = 0
const boundedCache = new CachedEmbeddingService({
  embed: async text => { embeddingCalls += 1; return [text.length] },
  embedBatch: async texts => { embeddingCalls += texts.length; return texts.map(text => [text.length]) },
})
for (let index = 0; index < 1025; index += 1) await boundedCache.embed(`cache-entry-${index}`)
assert.equal(boundedCache.getCacheSize(), 1024, 'embedding cache must enforce its entry limit')
await boundedCache.embed('cache-entry-0')
assert.equal(embeddingCalls, 1026, 'least-recently-used cache entries should be evicted')

const python = 'def first():\n    return 1\n\ndef second():\n    return 2\n\nclass Third:\n    pass\n\ndef fourth():\n    return 4'
const pythonChunks = await chunker.chunk('consecutive.py', python, 'python')
assert.deepEqual(pythonChunks.map(chunk => chunk.name), ['first', 'second', 'Third', 'fourth'])
assert.deepEqual(pythonChunks.map(chunk => chunk.startLine), [1, 4, 7, 10])
assert.ok(pythonChunks.every(chunk => !chunk.content.includes('def second') || chunk.name === 'second'))

const changed = { ...sampleChunks[0], content: 'export class JwtAuthService { revisedSessionToken() {} }' }
await searcher.indexChunks([changed])
assert.equal((await searcher.getStats()).totalChunks, 1)
assert.deepEqual((await searcher.search('session token', 10)).map(result => result.chunk.content), [changed.content])
await searcher.indexChunks([])
assert.equal((await searcher.getStats()).totalChunks, 0)
assert.deepEqual(await searcher.search('session token'), [])

// Rebuild failure preserves the previous snapshot and does not poison later rebuilds.
let failEmbedding = false
const retrySearcher = new SemanticSearcher({
  embed: async () => [1, 0],
  embedBatch: async documents => {
    if (failEmbedding) throw new Error('offline embedding fixture failed')
    return documents.map(() => [1, 0])
  },
}, new InMemoryVectorStore())
await retrySearcher.indexChunks([sampleChunks[0]])
failEmbedding = true
await assert.rejects(retrySearcher.indexChunks([changed]), /embedding fixture failed/)
assert.deepEqual((await retrySearcher.search('session')).map(result => result.chunk.content), [sampleChunks[0].content])
failEmbedding = false
await Promise.all([retrySearcher.indexChunks([sampleChunks[1]]), retrySearcher.indexChunks([changed])])
assert.equal((await retrySearcher.getStats()).totalChunks, 1)
assert.deepEqual((await retrySearcher.search('session')).map(result => result.chunk.content), [changed.content])

const bm25 = new BM25Scorer()
function tokenizeBm25(text) {
  return text.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_\-$/.]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1)
}
function referenceBm25Scores(documents, query) {
  const documentTokens = documents.map(tokenizeBm25)
  const averageLength = documentTokens.reduce((sum, tokens) => sum + tokens.length, 0) / documents.length
  const documentFrequency = new Map()
  for (const tokens of documentTokens) {
    for (const token of new Set(tokens)) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1)
  }
  const queryTokens = tokenizeBm25(query)
  return documentTokens.map(tokens => {
    const frequencies = new Map()
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1)
    let score = 0
    for (const token of queryTokens) {
      const tf = frequencies.get(token) || 0
      const df = documentFrequency.get(token) || 0
      const idf = df ? Math.log((documents.length - df + 0.5) / (df + 0.5) + 1) : 0
      score += idf * (tf * 2.5 / (tf + 1.5 * (1 - 0.75 + 0.75 * (tokens.length / averageLength))))
    }
    return score
  })
}
const bm25Documents = [
  'Symbol: authToken (function)\n\nverify auth token token',
  'Symbol: databasePool (class)\nComments: manages database connections\n\nopen database connection',
  'Symbol: taxRate (function)\n\ncalculate yearly tax',
]
const bm25Query = 'auth token token database'
bm25.buildIndex(bm25Documents)
assert.deepEqual(bm25.scoreMany(bm25Query, bm25Documents), referenceBm25Scores(bm25Documents, bm25Query), 'batched cached scoring must preserve BM25 values, including repeated query terms')
assert.deepEqual(bm25.scoreManyTokens(bm25.tokenizeQuery(bm25Query), bm25Documents), referenceBm25Scores(bm25Documents, bm25Query), 'reusing query tokens in the hybrid search path must preserve BM25 values')
assert.deepEqual(bm25.scoreManyCandidates(bm25.tokenizeQuery(bm25Query), bm25Documents.map((document, index) => ({ key: `chunk-${index}`, document }))), referenceBm25Scores(bm25Documents, bm25Query), 'chunk ID cache keys must preserve BM25 values')
assert.equal(bm25.score(bm25Query, bm25Documents[0]), referenceBm25Scores(bm25Documents, bm25Query)[0], 'single-document API must preserve BM25 values')
bm25.buildIndex(['obsolete symbol'])
bm25.buildIndex(['current symbol'])
assert.equal(bm25.score('obsolete', 'obsolete symbol'), 0, 'rebuilding must discard obsolete IDF entries')
bm25.buildIndex([])
assert.equal(bm25.score('current', 'current symbol'), 0)

let invalidTopKEmbeddingCalls = 0
const requestedCandidateCounts = []
const topKSearcher = new SemanticSearcher({
  embed: async () => { invalidTopKEmbeddingCalls += 1; return [1, 0] },
  embedBatch: async documents => documents.map(() => [1, 0]),
}, {
  add: async () => {},
  clear: async () => {},
  count: async () => 0,
  search: async (_query, _embedding, topK) => { requestedCandidateCounts.push(topK); return [] },
})
assert.deepEqual(await topKSearcher.search('query', 0), [])
assert.deepEqual(await topKSearcher.search('query', -3), [])
assert.equal(invalidTopKEmbeddingCalls, 0, 'zero and negative topK should return before embedding')
assert.deepEqual(await topKSearcher.search('query', 0.5), [])
assert.equal(invalidTopKEmbeddingCalls, 1)
assert.deepEqual(requestedCandidateCounts, [3], 'positive fractional topK is normalized to one before vector recall')

// Exercise the bundled main's registered tools through a memory-only Host filesystem.
const workspace = '/semantic-search-regression'
const files = new Map([['code.py', 'def first():\n    return 1\n\ndef second():\n    return 2']])
const tools = new Map()
const disposers = []
const target = displayPath => ({ displayPath, targetKey: displayPath })
const host = {
  get() { return undefined },
  inject() {},
  on() { return () => {} },
  effect(factory) { disposers.push(factory()) },
  logger: { warn(message, error) { throw new Error(message, { cause: error }) } },
  tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name) } },
  systemPrompt: { section() { return () => {} } },
  fs: {
    resolve: async path => target(path),
    stat: async file => file.displayPath === workspace
      ? { type: 'directory' }
      : files.has(file.displayPath.slice(workspace.length + 1))
        ? { type: 'file', size: Buffer.byteLength(files.get(file.displayPath.slice(workspace.length + 1))) }
        : undefined,
    listDir: async () => [...files.keys()].map(name => ({ name, type: 'file', target: target(`${workspace}/${name}`) })),
    contains: (root, file) => file.targetKey.startsWith(`${root.targetKey}/`),
    readText: async file => files.get(file.displayPath.slice(workspace.length + 1)),
  },
}
await plugin.apply(host, { embeddingProvider: 'builtin-local', maxFiles: 10, maxFileBytes: 10000, maxTotalBytes: 10000 })
try {
  const exec = { signal: new AbortController().signal }
  const call = (name, args = {}) => tools.get(name).execute({ workspace, ...args }, exec)
  assert.equal((await call('index_project_for_semantic_search')).chunks, 2)
  files.set('code.py', 'def second():\n    return 42')
  assert.equal((await call('index_project_for_semantic_search')).chunks, 1)
  const found = JSON.parse(await call('semantic_search_code', { query: 'second' }))
  assert.equal(found.length, 1)
  assert.equal(found[0].chunk.content, files.get('code.py'))
  files.clear()
  assert.equal((await call('index_project_for_semantic_search')).chunks, 0)
  assert.equal((await call('semantic_search_stats')).chunks, 0)
  assert.deepEqual(JSON.parse(await call('semantic_search_code', { query: 'second' })), [])
} finally {
  for (const dispose of disposers.reverse()) dispose?.()
}

console.log('test-semantic-search: ok (Node package main, Top-K, Python boundaries, rebuild, empty snapshot and failure recovery)')
