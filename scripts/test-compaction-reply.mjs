import assert from 'node:assert/strict'
import { parseCompactionCommandText } from '../electron/backend/compaction-reply.mjs'

const parsed = parseCompactionCommandText('Compacted 172 history items (~125556 tokens).')
assert.deepEqual(parsed, { historyItems: 172, tokensShadowed: 125556 })
assert.equal(parseCompactionCommandText('hello'), null)

console.log('test-compaction-reply: ok')
