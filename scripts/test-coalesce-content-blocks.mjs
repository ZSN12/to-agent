import assert from 'node:assert/strict'
import { coalesceContentBlocks } from '../src/features/chat/coalesceContentBlocks.ts'

const merged = coalesceContentBlocks([
  { id: '0:0:thinking', kind: 'thinking', text: 'Plan A' },
  { id: '1:0:thinking', kind: 'thinking', text: 'Plan B' },
  { id: '2:0:text', kind: 'text', text: 'Answer' },
  { id: '3:0:thinking', kind: 'thinking', text: 'Plan C' },
])

assert.equal(merged.length, 3)
assert.match(merged[0].text, /Plan A/)
assert.match(merged[0].text, /Plan B/)
assert.equal(merged[1].kind, 'text')
assert.equal(merged[2].text, 'Plan C')

console.log('coalesce-content-blocks 测试通过')
