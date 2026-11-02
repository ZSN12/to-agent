import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const result = await build({
  stdin: {
    contents: `export { isStructuredThinkingBlock } from './src/features/chat/reasoning-heuristics'
export { splitMarkdownStableBlocks } from './src/features/chat/markdown-stream-blocks'
export { highlightCode } from './src/features/chat/highlight-code'
export { filterDshAssistantToolCalls } from './src/features/chat/dshAssistantToolGroups'`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
})
const presentation = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

const progressText = `I will inspect the relevant files and report the concrete findings. ${'This is ordinary user-visible progress. '.repeat(12)}`
const uppercaseLongAnswer = `Here is the result of the inspection. ${'The source confirms the expected behavior. '.repeat(12)}`

assert.equal(presentation.isStructuredThinkingBlock({ kind: 'text', text: progressText }), false,
  'long English progress text must remain visible answer text')
assert.equal(presentation.isStructuredThinkingBlock({ kind: 'text', text: uppercaseLongAnswer }), false,
  'long uppercase-leading answer text must not switch to Think while streaming')
assert.equal(presentation.isStructuredThinkingBlock({ kind: 'thinking', text: progressText }), true,
  'only Host-marked reasoning blocks should render as Think')

assert.deepEqual(presentation.splitMarkdownStableBlocks('alpha\n\nbeta'), {
  stableBlocks: ['alpha'],
  tail: 'beta',
})
assert.deepEqual(presentation.splitMarkdownStableBlocks('paragraph\n# heading\n\ntail'), {
  stableBlocks: ['paragraph', '# heading'],
  tail: 'tail',
}, 'a heading start can close the prior paragraph without a blank line')
assert.deepEqual(presentation.splitMarkdownStableBlocks('before\n\n```ts\nconst value = 1'), {
  stableBlocks: ['before'],
  tail: '```ts\nconst value = 1',
}, 'an unclosed code fence must remain in the streaming tail')
assert.deepEqual(presentation.splitMarkdownStableBlocks('before\n\n```js\nconst value = 1\n```\n\nafter'), {
  stableBlocks: ['before', '```js\nconst value = 1\n```'],
  tail: 'after',
}, 'a completed code fence should be reusable while the next block streams')
assert.deepEqual(presentation.splitMarkdownStableBlocks('- one\n- two\n\nparagraph\n\ntail'), {
  stableBlocks: ['- one\n- two', 'paragraph'],
  tail: 'tail',
}, 'list items must stay in one stable Markdown block')
assert.deepEqual(presentation.splitMarkdownStableBlocks('> quote one\n> quote two\n\nplain\n\ntail'), {
  stableBlocks: ['> quote one\n> quote two', 'plain'],
  tail: 'tail',
}, 'multi-line blockquotes must remain together')
const highlighted = presentation.highlightCode('const value = \"ok\"; // keep\n', 'typescript')
assert.equal(highlighted.map((token) => token.text).join(''), 'const value = \"ok\"; // keep\n',
  'syntax highlighting must preserve the exact source text')
assert.ok(highlighted.some((token) => token.kind === 'keyword' && token.text === 'const'))
assert.ok(highlighted.some((token) => token.kind === 'string' && token.text === '\"ok\"'))
assert.ok(highlighted.some((token) => token.kind === 'comment' && token.text === '// keep'))

const callsAcrossSteps = [
  { callId: 'weather-lookup', toolName: 'bash', step: 1 },
  { callId: 'retry', toolName: 'pwsh', step: 3 },
  { callId: 'read-config', toolName: 'read', step: 2 },
]
assert.deepEqual(
  presentation.filterDshAssistantToolCalls(callsAcrossSteps, { steps: [1, 2] }).map((call) => call.callId),
  ['weather-lookup', 'read-config'],
  'one tool group collects different tool types across adjacent assistant steps',
)
assert.deepEqual(
  presentation.filterDshAssistantToolCalls(callsAcrossSteps, { step: 2 }).map((call) => call.callId),
  ['read-config'],
  'tool calls can still be scoped to one step after a visible assistant response',
)

const body = await readFile('src/features/chat/AssistantTurnBody.tsx', 'utf8')
assert.match(body, /isStructuredThinkingBlock\(seg\)/, 'assistant renderer must use structured block type')
assert.match(body, /filterSteps: pendingToolSteps/,
  'consecutive tool calls across multiple steps must share one visible batch')
assert.match(body, /flushPendingToolGroup\(\)\s*items\.push\(\{ kind: 'text'/,
  'visible assistant text must separate consecutive tool-call groups')
assert.doesNotMatch(body, /shouldPresentTextAsThinking/, 'prose heuristics must not reclassify assistant text')

const markdown = await readFile('src/features/chat/AgentMessageMarkdown.tsx', 'utf8')
assert.match(markdown, /splitMarkdownStableBlocks\(text\)/, 'streaming Markdown must parse stable blocks separately from its tail')

console.log('assistant text presentation tests passed')
