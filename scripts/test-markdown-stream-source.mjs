import assert from 'node:assert/strict'
import { build } from 'esbuild'

// Bundle the actual production TypeScript; no alternate parser is copied into the test.
const result = await build({ entryPoints: ['src/features/chat/markdown-stream-blocks.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { splitMarkdownStableBlocks: split, createMarkdownStreamSplitter } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

const cases = [
  ['', [], ''],
  ['alpha\n\nbeta', ['alpha'], 'beta'],
  ['paragraph\n# heading\n\ntail', ['paragraph', '# heading'], 'tail'],
  ['- one\n- two\n\nparagraph\n\ntail', ['- one\n- two', 'paragraph'], 'tail'],
  ['- one\n\n  continuation\n  - nested\n- two\n\nend', ['- one\n\n  continuation\n  - nested\n- two'], 'end'],
  ['> quote\n> more\n\nplain', ['> quote\n> more'], 'plain'],
  ['|a|b|\n|---|---|\n\n|c|d|\n\nend', ['|a|b|\n|---|---|\n\n|c|d|'], 'end'],
  ['Title\n---\n\nend', ['Title\n---'], 'end'],
  ['Title\n\n===\n\nend', ['Title\n\n==='], 'end'],
  ['[label][id]\n\nparagraph\n\n[id]: https://example.test', [], '[label][id]\n\nparagraph\n\n[id]: https://example.test'],
  ['[id]: https://example.test\n\nparagraph', [], '[id]: https://example.test\n\nparagraph'],
  ['[label\ncontinued][id]\n\nparagraph', [], '[label\ncontinued][id]\n\nparagraph'],
  ['[label\ncontinued]: url\n\nparagraph', [], '[label\ncontinued]: url\n\nparagraph'],
  ['before\n\n```ts\nconst x = 1', ['before'], '```ts\nconst x = 1'],
  ['before\n\n````ts\n```\nbody\n````\n\nafter', ['before', '````ts\n```\nbody\n````'], 'after'],
  ['~~~ts\n```\n~~~ trailing\n~~~\n\n', ['~~~ts\n```\n~~~ trailing\n~~~'], ''],
  ['```\nx\n```', ['```\nx\n```'], ''],
]
for (const [source, stableBlocks, tail] of cases) {
  const expected = { stableBlocks, tail }
  assert.deepEqual(split(source), expected, source)
  for (const size of [1, 2, 7, 31]) {
    const stream = createMarkdownStreamSplitter()
    for (let end = size; end < source.length; end += size) {
      const prefix = source.slice(0, end)
      assert.deepEqual(stream.splitMarkdownStableBlocks(prefix), split(prefix), `chunk ${size}: ${JSON.stringify(prefix)}`)
    }
    assert.deepEqual(stream.splitMarkdownStableBlocks(source), expected)
    assert.deepEqual(stream.splitMarkdownStableBlocks(source), expected, 'identical input must not duplicate blocks')
  }
}

const stream = createMarkdownStreamSplitter()
const sources = ['alpha\n\nsecond\n\nthird', 'alpha\n\nSecOnd\n\nthird', 'alpha\n', 'replacement\n\nnew', '', '```\nx\n```\n', '```\nx\n```js', 'short', 'shorter\n\n[x]: url', 'shorter\n\n[x]: url\n\ntail']
for (const source of sources) assert.deepEqual(stream.splitMarkdownStableBlocks(source), split(source), 'rollback, replacement and retry must reset state')

// Exercise partial reference/fence/Setext lines, including boundary reversal while typing.
const mutations = ['text\n\n[', 'text\n\n[x]', 'text\n\n[x]:', 'text\n\n[x]: ', 'text\n\n[x]: url', 'a\n\n-', 'a\n\n--', 'a\n\n---', '```\nx\n```', '```\nx\n```a']
for (const source of mutations) assert.deepEqual(stream.splitMarkdownStableBlocks(source), split(source))

let random = 84
const pieces = ['', '- list', '  - nested', '> quote', '```', '```js', '~~~', 'alpha', '[a]: ', '[a]: url', '[a', 'b]: url', '[a][b]', '---', '|a|b|', '|---|---|']
for (let trial = 0; trial < 300; trial += 1) {
  const source = Array.from({ length: 1 + trial % 15 }, () => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0
    return pieces[random % pieces.length]
  }).join('\n')
  const parser = createMarkdownStreamSplitter()
  for (let end = 1; end <= source.length; end += 3) assert.deepEqual(parser.splitMarkdownStableBlocks(source.slice(0, end)), split(source.slice(0, end)))
  assert.deepEqual(parser.splitMarkdownStableBlocks(source), split(source))
}

for (const lines of [1_000, 2_000, 4_000, 8_000]) {
  const source = Array.from({ length: lines }, (_, index) => `- item ${index}`).join('\n')
  let count = 0
  const parser = createMarkdownStreamSplitter({ onLineProcessed: () => { count += 1 } })
  for (let end = 128; end < source.length; end += 128) parser.splitMarkdownStableBlocks(source.slice(0, end))
  assert.deepEqual(parser.splitMarkdownStableBlocks(source), { stableBlocks: [], tail: source })
  assert.ok(count <= lines + Math.ceil(source.length / 128), 'each complete line is processed once; only the unfinished line is previewed again')
  let statelessCount = 0
  createMarkdownStreamSplitter({ onLineProcessed: () => { statelessCount += 1 } }).splitMarkdownStableBlocks(source)
  assert.equal(statelessCount, lines, 'a full parse visits each line exactly once')
}
const blankSource = `alpha${'\n'.repeat(8_000)}beta`
let blankLineCount = 0
assert.deepEqual(createMarkdownStreamSplitter({ onLineProcessed: () => { blankLineCount += 1 } }).splitMarkdownStableBlocks(blankSource), { stableBlocks: ['alpha'], tail: 'beta' })
assert.equal(blankLineCount, 8_001, 'blank runs must not rescan the remaining blanks for every line')

const snapshots = createMarkdownStreamSplitter()
const earlier = snapshots.splitMarkdownStableBlocks('a\n\nb')
snapshots.splitMarkdownStableBlocks('a\n\nb\n\nc')
assert.deepEqual(earlier, { stableBlocks: ['a'], tail: 'b' }, 'later renders must not mutate an earlier render snapshot')

console.log('Markdown production-source checks passed: block semantics, chunk boundaries, rollback, replacement, deterministic linear line counts')
