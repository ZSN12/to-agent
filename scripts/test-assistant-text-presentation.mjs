import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const result = await build({
  stdin: {
    contents: `export { isStructuredThinkingBlock } from './src/features/chat/reasoning-heuristics'`,
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

const body = await readFile('src/features/chat/AssistantTurnBody.tsx', 'utf8')
assert.match(body, /isStructuredThinkingBlock\(seg\)/, 'assistant renderer must use structured block type')
assert.doesNotMatch(body, /shouldPresentTextAsThinking/, 'prose heuristics must not reclassify assistant text')

console.log('assistant text presentation tests passed')
