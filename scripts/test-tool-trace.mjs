import assert from 'node:assert/strict'
import { applyReverseDiffEdits } from '../backend/workspace-diff-revert.mjs'
import {
  extractFileDiff,
  extractToolOutputText,
  normalizeToolResult,
  summarizeShellCommand,
  summarizeShellCommandOutcome,
  summarizeToolInput,
  summarizeToolResult,
} from '../backend/tool-trace.mjs'

const command = summarizeToolInput('bash', { command: 'curl -H "Authorization: Bearer abcdefghijklmnop12345" https://example.invalid' })
assert.equal(command.includes('abcdefghijklmnop12345'), false)
assert.match(command, /已隐藏/)
assert.equal(summarizeShellCommand('bash', { command: 'pnpm test', description: 'Run tests' }), 'pnpm test')
assert.equal(summarizeShellCommand('read', { command: 'pnpm test' }), null)
assert.deepEqual(summarizeShellCommandOutcome('bash', { command: 'pnpm test' }, 'tests failed\n[exit code: 4]'), {
  exitCode: 4,
  background: false,
  timedOut: false,
  sandboxDenied: false,
})
assert.deepEqual(summarizeShellCommandOutcome('bash', { command: 'pnpm test' }, 'tests passed'), {
  exitCode: null,
  background: false,
  timedOut: false,
  sandboxDenied: false,
})
assert.equal(
  summarizeShellCommandOutcome('bash', { command: 'pnpm test' }, 'tests passed\n[exit code: 0]').exitCode,
  0,
  'verification requires the shell exit marker even when output text says tests passed',
)
assert.equal(summarizeShellCommandOutcome('bash', { command: 'pnpm test' }, 'output\n[timed out after 500ms]').exitCode, null)
assert.equal(summarizeShellCommandOutcome('bash', { command: 'pnpm test', run_in_background: true }, 'started background job j1').background, true)
assert.equal(summarizeShellCommandOutcome('bash', { command: 'pnpm test' }, 'output\n[exit code: 0]', true).exitCode, null)

const args = summarizeToolInput('write', { path: '/tmp/note.md', content: 'private body' })
assert.equal(args, '/tmp/note.md')
assert.equal(args.includes('private body'), false)

const result = summarizeToolResult({ content: [{ type: 'text', text: 'secret output not shown' }] }, false)
assert.match(result, /执行完成/)
assert.equal(result.includes('secret output not shown'), false)

const error = summarizeToolResult({ content: [{ type: 'text', text: 'token=supersecret value rejected' }] }, true)
assert.equal(error.includes('supersecret'), false)
const wrapped = { content: [{ type: 'tool-result', toolCallId: 'read-1', content: [{ type: 'text', text: 'actual file contents' }] }] }
assert.equal(summarizeToolResult(wrapped, false), '执行完成 · 1 个结果块，约 20 字符')
assert.equal(summarizeToolResult(wrapped, false).includes('actual file contents'), false)
assert.equal(extractToolOutputText(wrapped), 'actual file contents', 'full text is extracted before trace compaction')
const nestedError = { content: [{ type: 'tool-result', isError: true, content: [{ type: 'text', text: 'SEARCH_RAW_OUTPUT_OVERFLOW token=supersecret' }] }] }
assert.match(summarizeToolResult(nestedError, false), /SEARCH_RAW_OUTPUT_OVERFLOW/)
assert.equal(summarizeToolResult(nestedError, false).includes('supersecret'), false)
assert.equal(normalizeToolResult(nestedError).isError, true)
assert.equal(extractFileDiff('write', { path: '/tmp/no-write', content: 'x' }, nestedError), null)
const editMetaDiff = extractFileDiff('edit', { file_path: '/workspace/src/main.ts' }, {
  content: [{ type: 'text', text: 'updated' }],
  meta: { diffs: [{ path: 'src/main.ts', oldText: 'keep\nold line\nend', newText: 'keep\nnew line\nend' }] },
})
assert.equal(editMetaDiff.path, '/workspace/src/main.ts')
assert.equal(editMetaDiff.addedLines, 1)
assert.equal(editMetaDiff.deletedLines, 1)
assert.match(editMetaDiff.diff, /-old line/)
assert.match(editMetaDiff.diff, /\+new line/)
assert.deepEqual(editMetaDiff.reverseEdits, [{
  oldText: 'keep\nnew line\nend',
  newText: 'keep\nold line\nend',
}], 'each contextual diff hunk carries its own safe reverse edit')
assert.equal(
  applyReverseDiffEdits('start\nkeep\nnew line\nend\nfinish', editMetaDiff.reverseEdits).content,
  'start\nkeep\nold line\nend\nfinish',
)
assert.throws(
  () => applyReverseDiffEdits('keep\nnew line\nend\nkeep\nnew line\nend', editMetaDiff.reverseEdits),
  /出现多次/,
  'ambiguous repeated contexts must not edit an arbitrary location',
)
assert.throws(
  () => applyReverseDiffEdits('keep\nother line\nend', editMetaDiff.reverseEdits),
  /内容已变化/,
  'stale hunks must fail instead of silently succeeding',
)
const alreadyReverted = applyReverseDiffEdits('keep\nold line\nend', editMetaDiff.reverseEdits)
assert.equal(alreadyReverted.changed, false, 'retrying an already applied hunk is idempotent')
const emptyFileInsertion = extractFileDiff('edit', { file_path: '/workspace/empty.txt' }, {
  content: [{ type: 'text', text: 'updated' }],
  meta: { diffs: [{ path: 'empty.txt', oldText: null, newText: 'new content' }] },
})
assert.deepEqual(emptyFileInsertion.reverseEdits, [{ oldText: 'new content', newText: '' }])
const emptyAfterInsertionRevert = applyReverseDiffEdits('new content', emptyFileInsertion.reverseEdits)
assert.equal(emptyAfterInsertionRevert.content, '')
assert.equal(applyReverseDiffEdits('', emptyFileInsertion.reverseEdits).changed, false)
const fullFileDeletion = extractFileDiff('edit', { file_path: '/workspace/file.txt' }, {
  content: [{ type: 'text', text: 'updated' }],
  meta: { diffs: [{ path: 'file.txt', oldText: 'entire original file', newText: '' }] },
})
assert.deepEqual(fullFileDeletion.reverseEdits, [{ oldText: '', newText: 'entire original file' }])
assert.equal(applyReverseDiffEdits('', fullFileDeletion.reverseEdits).content, 'entire original file')
assert.equal(applyReverseDiffEdits('entire original file', fullFileDeletion.reverseEdits).changed, false)
assert.throws(
  () => applyReverseDiffEdits('modified after deletion', fullFileDeletion.reverseEdits),
  /内容已变化/,
  'empty-target reversal must only restore an actually empty file',
)
const createdFile = extractFileDiff('write', { file_path: '/workspace/new.md', content: 'one\ntwo\n' }, {
  content: [{ type: 'text', text: '<content>Created file</content>' }],
  meta: { diffs: [] },
})
assert.deepEqual({ added: createdFile.addedLines, deleted: createdFile.deletedLines, isNew: createdFile.isNewFile }, {
  added: 2, deleted: 0, isNew: true,
})
assert.equal(extractFileDiff('write', { file_path: '/workspace/existing.md', content: 'same' }, {
  content: [{ type: 'text', text: '<content>Updated file</content>' }],
  meta: { diffs: [] },
}), null, 'an unchanged overwrite is not reported as a changed file')
const nestedWrite = extractFileDiff('write', { file_path: 'src/existing.md', content: 'new content' }, {
  content: [{ type: 'text', text: '<content>Updated file</content>' }],
})
assert.equal(nestedWrite.path, 'src/existing.md', 'nested write without Host metadata remains visible')
assert.equal(nestedWrite.addedLines, undefined, 'unknown nested diff counts are not fabricated')
const nestedEdit = extractFileDiff('edit', { file_path: 'src/main.ts', old_string: 'before', new_string: 'after' }, { content: [] })
assert.equal(nestedEdit.addedLines, 1, 'nested Code edits still get a useful summary from their arguments')
assert.equal(nestedEdit.deletedLines, 1)
const editorCreate = extractFileDiff('str_replace_editor', {
  command: 'create', path: '/workspace/new.ts', file_text: 'const value = 1\nexport { value }\n',
}, { content: [{ type: 'text', text: 'New file created successfully at: /workspace/new.ts' }] })
assert.deepEqual({ added: editorCreate.addedLines, deleted: editorCreate.deletedLines, isNew: editorCreate.isNewFile }, {
  added: 2, deleted: 0, isNew: true,
}, 'str_replace_editor create should report new file lines')
const editorReplace = extractFileDiff('str_replace_editor', {
  command: 'str_replace', path: '/workspace/main.ts', old_str: 'const old = 1', new_str: 'const current = 2',
}, { content: [{ type: 'text', text: 'The file /workspace/main.ts has been edited successfully.' }] })
assert.equal(editorReplace.addedLines, 1)
assert.equal(editorReplace.deletedLines, 1)
const editorInsert = extractFileDiff('str_replace_editor', {
  command: 'insert', path: '/workspace/main.ts', insert_line: 2, new_str: 'new line\nanother line',
}, { content: [{ type: 'text', text: 'The file /workspace/main.ts has been edited successfully.' }] })
assert.equal(editorInsert.addedLines, 2)
assert.equal(editorInsert.deletedLines, 0)
assert.equal(normalizeToolResult({ content: [{ type: 'image', data: 'opaque' }] }).content[0].type, 'image')
const manyLines = Array.from({ length: 80 }, (_, i) => `trace line ${i}`).join('\n')
const lineCompacted = normalizeToolResult({ content: [{ type: 'text', text: manyLines }] }, { maxChars: 8000 })
assert.equal(lineCompacted.content[0].compacted, true, 'long line-count tool output should compact for UI traces')
const concurrentSmallBudget = normalizeToolResult({ content: [{ type: 'text', text: 'x'.repeat(1200) }] }, { maxChars: 800 })
const concurrentLargeBudget = normalizeToolResult({ content: [{ type: 'text', text: 'x'.repeat(1200) }] }, { maxChars: 2000 })
assert.equal(concurrentSmallBudget.content[0].compacted, true, 'each call applies its own compacting budget')
assert.notEqual(concurrentLargeBudget.content[0].compacted, true, 'a second call cannot replace the first call budget')
assert.equal(summarizeToolInput('glob', { path: '/project', pattern: '*.ts' }), '*.ts · /project')
console.log('tool trace checks passed: secret redaction, Host diff metadata and safe file change counts')
