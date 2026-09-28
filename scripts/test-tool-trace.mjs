import assert from 'node:assert/strict'
import { summarizeToolInput, summarizeToolResult } from '../electron/backend/tool-trace.mjs'

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
console.log('tool trace checks passed: argument/result minimization and secret redaction')
