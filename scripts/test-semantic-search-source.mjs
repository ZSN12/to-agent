// Run against TypeScript sources: node --import tsx scripts/test-semantic-search-source.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { CodeChunker } from '../packages/runtime/fs/tool-fs-semantic-search/src/chunker.ts'
import { SemanticSearcher } from '../packages/runtime/fs/tool-fs-semantic-search/src/searcher.ts'
import { InMemoryVectorStore } from '../packages/runtime/fs/tool-fs-semantic-search/src/vector-store.ts'

function chunk(id, overrides = {}) {
  return {
    id, file: `src/${id}.ts`, language: 'typescript', type: 'function',
    name: 'lookup', content: 'function lookup() { return value }',
    startLine: 1, endLine: 1, metadata: {}, ...overrides,
  }
}

function createSearcher(store = new InMemoryVectorStore()) {
  return new SemanticSearcher({
    async embed() { return [1, 0] },
    async embedBatch(documents) { return documents.map(() => [1, 0]) },
  }, store)
}

test('file filtering recalls the fourth equal-score chunk before candidate truncation', async () => {
  const searcher = createSearcher()
  await searcher.indexChunks(['one', 'two', 'three', 'target'].map(id => chunk(id)))
  assert.deepEqual((await searcher.search('lookup', 1, { file: 'target.ts' }))
    .map(result => result.chunk.id), ['target'])
})

test('combined filters use AND semantics, allow substring paths, and handle sparse/empty matches', async () => {
  const searcher = createSearcher()
  await searcher.indexChunks([
    chunk('wrong-path'),
    chunk('wrong-language', { file: 'src/target.js', language: 'javascript' }),
    chunk('wrong-type', { file: 'src/target.ts', type: 'class' }),
    chunk('wanted', { file: 'src/nested/target.ts' }),
  ])
  const filters = { file: 'target', language: 'typescript', type: 'function' }
  assert.deepEqual((await searcher.search('lookup', 1, filters)).map(result => result.chunk.id), ['wanted'])
  assert.deepEqual((await searcher.search('lookup', 10, filters)).map(result => result.chunk.id), ['wanted'])
  assert.deepEqual(await searcher.search('lookup', 10, { file: 'absent' }), [])
  assert.equal((await searcher.search('lookup', 10)).length, 4)
  assert.equal((await searcher.search('lookup', 10, {})).length, 4)
})

test('store filters before reading excluded vectors, and orders tied scores by insertion', async () => {
  const store = new InMemoryVectorStore()
  await store.add([chunk('low'), chunk('first'), chunk('second'), chunk('third')], [
    [0, 1], [1, 0], [1, 0], [1, 0],
  ])
  assert.deepEqual((await store.search('lookup', [1, 0], 3)).map(result => result.chunk.id),
    ['first', 'second', 'third'])

  // After add has computed its norm, any access to the excluded vector fails.
  const excluded = [1, 0]
  const filteredStore = new InMemoryVectorStore()
  await filteredStore.add([chunk('excluded'), chunk('wanted')], [excluded, [1, 0]])
  Object.defineProperty(excluded, 0, { get() { throw new Error('excluded vector was scored') } })
  assert.deepEqual((await filteredStore.search('lookup', [1, 0], 1, { file: 'wanted' }))
    .map(result => result.chunk.id), ['wanted'])
})

test('searcher and store handle invalid limits, zero vectors, and limits larger than the corpus', async () => {
  const store = new InMemoryVectorStore()
  const searcher = createSearcher(store)
  await searcher.indexChunks([chunk('first'), chunk('second')])
  for (const limit of [0, -1, Number.NaN, Infinity, -Infinity]) {
    assert.deepEqual(await store.search('lookup', [1, 0], limit), [])
    assert.deepEqual(await searcher.search('lookup', limit), [])
  }
  for (const limit of [0.5, 1.9]) {
    assert.equal((await store.search('lookup', [1, 0], limit)).length, 1)
    assert.equal((await searcher.search('lookup', limit)).length, 1)
  }
  assert.equal((await store.search('lookup', [1, 0], Number.MAX_VALUE)).length, 2)
  assert.equal((await searcher.search('lookup', Number.MAX_VALUE)).length, 2)
  assert.deepEqual(await store.search('lookup', [0, 0], 1), [])
  assert.deepEqual(await searcher.search(' !!! ', 1), [])
})

test('non-finite store scores are excluded before score fusion', async () => {
  const store = new InMemoryVectorStore()
  const searcher = createSearcher(store)
  await searcher.indexChunks([chunk('good')])
  store.search = async () => [
    { chunk: chunk('nan'), score: NaN },
    { chunk: chunk('infinite'), score: Infinity },
    { chunk: chunk('good'), score: 0.5 },
  ]
  const results = await searcher.search('lookup', 3)
  assert.deepEqual(results.map(result => result.chunk.id), ['good'])
  assert.ok(results.every(result => Number.isFinite(result.score)))
})

test('imports are extracted once per JavaScript/TypeScript file at both corpus sizes', async () => {
  for (const language of ['javascript', 'typescript']) {
    for (const count of [1000, 2000]) {
      const chunker = new CodeChunker()
      const original = chunker.extractImports
      let calls = 0
      chunker.extractImports = function (...args) {
        calls += 1
        return original.apply(this, args)
      }
      const content = ['import { value } from "./value"',
        ...Array.from({ length: count }, (_, i) => `function lookup${i}() { return value }`)].join('\n')
      const chunks = await chunker.chunk(`large.${language === 'javascript' ? 'js' : 'ts'}`, content, language)
      assert.equal(chunks.length, count)
      assert.equal(calls, 1, `${language}: ${count} functions should scan imports once`)
      assert.ok(chunks.every(item => item.metadata.imports?.[0] === 'import { value } from "./value"'))
      chunks[0].metadata.imports.push('local metadata edit')
      assert.equal(chunks[1].metadata.imports.length, 1, 'chunk metadata arrays remain independent')
    }
  }
})
