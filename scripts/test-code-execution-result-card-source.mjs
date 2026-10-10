import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile('src/features/chat/codeOutputPresentation.ts', 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const presentation = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

assert.equal(presentation.CODE_OUTPUT_MAX_CHARS, 4_000)
assert.deepEqual(presentation.boundCodeOutput('{"ok":true}'), {
  text: '{"ok":true}',
  truncated: false,
}, 'JSON text remains intact for the result card')
assert.deepEqual(presentation.boundCodeOutput('x'.repeat(5), 4), {
  text: 'xxxx',
  truncated: true,
}, 'large output is clipped at the configured bound')
assert.equal(presentation.boundCodeOutput(`a${'😀'.repeat(3)}`, 2).text, 'a',
  'clipping does not leave a broken surrogate pair')
assert.equal(presentation.boundCodeOutput({ ok: true }).text, '',
  'non-text values cannot bypass the bounded result renderer')

assert.equal(presentation.codeOutputImageDataUrl({ mediaType: 'image/png', data: 'aGVsbG8=' }),
  'data:image/png;base64,aGVsbG8=', 'supported canonical image data is rendered as a data URL')
assert.equal(presentation.codeOutputImageDataUrl({ mediaType: 'image/svg+xml', data: 'PHN2Zz4=' }), null,
  'active content formats are refused')
assert.equal(presentation.codeOutputImageDataUrl({ mediaType: 'image/png', data: 'not-base64' }), null,
  'invalid image bytes are refused')
assert.equal(presentation.codeOutputImageDataUrl({ mediaType: 'image/png', data: 'aGVsbG8=', bytes: 5 }),
  'data:image/png;base64,aGVsbG8=', 'bounded result data remains renderable when its byte length matches')
assert.equal(presentation.codeOutputImageDataUrl({ mediaType: 'image/png', data: 'aGVsbG8=', bytes: 4 }), null,
  'renderer refuses bytes that disagree with the Host attachment metadata')

const [card, traceCard, toolList, composer, imageComponent] = await Promise.all([
  readFile('src/features/chat/CodeExecutionResultCard.tsx', 'utf8'),
  readFile('src/features/chat/ToolTraceCard.tsx', 'utf8'),
  readFile('src/features/chat/DshToolCallList.tsx', 'utf8'),
  readFile('src/features/composer/Composer.tsx', 'utf8'),
  readFile('src/features/chat/AttachmentImagePreview.tsx', 'utf8'),
])

assert.match(card, /boundCodeOutput\(output\)/, 'the code result card always applies its output bound')
assert.match(card, /CODE_OUTPUT_MAX_IMAGES/, 'the code result card caps displayed image count')
assert.match(card, /AttachmentImagePreview/, 'the code result card uses the shared image preview')
assert.match(traceCard, /<CodeExecutionResultCard[\s\S]*?output=\{item\.resultSummary\}/,
  'code tool traces render through the dedicated result card')
assert.match(toolList, /row\.toolName === 'run_code' \|\| Boolean\(row\.parentCallId\)/,
  'run_code and nested code-mode dispatches use the dedicated result presentation')
assert.match(toolList, /row\.resultPreview \?\? sourceTrace\.resultSummary/,
  'code-mode calls prefer projected rendered output over the compact live status summary')
assert.match(toolList, /chat\.getResultAttachment/, 'image bytes are fetched through the session-authorized IPC')
assert.match(toolList, /setResultImagesLoading\(true\)/, 'image attachment reads wait until the tool row is expanded')
assert.match(toolList, /openImageIdsKey/, 'project refreshes do not trigger duplicate attachment reads')
assert.match(composer, /<AttachmentImagePreview/, 'composer image attachments also use the shared preview')
assert.match(imageComponent, /loading="lazy" decoding="async"/, 'shared image previews decode lazily')

console.log('code execution result card source tests passed')
