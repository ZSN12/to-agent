import assert from 'node:assert/strict'
import { extractFileDiff, normalizeToolResult, summarizeToolInput, summarizeToolResult } from '../electron/backend/tool-trace.mjs'

const command = summarizeToolInput('bash', { command: 'curl -H "Authorization: Bearer abcdefghijklmnop12345" https://example.invalid' })
assert.equal(command.includes('abcdefghijklmnop12345'), false)
assert.match(command, /已隐藏/)

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
const nestedError = { content: [{ type: 'tool-result', isError: true, content: [{ type: 'text', text: 'SEARCH_RAW_OUTPUT_OVERFLOW token=supersecret' }] }] }
assert.match(summarizeToolResult(nestedError, false), /SEARCH_RAW_OUTPUT_OVERFLOW/)
assert.equal(summarizeToolResult(nestedError, false).includes('supersecret'), false)
assert.equal(normalizeToolResult(nestedError).isError, true)
assert.equal(extractFileDiff('write', { path: '/tmp/no-write', content: 'x' }, nestedError), null)
assert.equal(normalizeToolResult({ content: [{ type: 'image', data: 'opaque' }] }).content[0].type, 'image')
assert.equal(summarizeToolInput('glob', { path: '/project', pattern: '*.ts' }), '*.ts · /project')
console.log('tool trace checks passed: argument/result minimization and secret redaction')
