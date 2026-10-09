import assert from 'node:assert/strict'
import { readMissingEvents } from '../electron/backend/dsh-chat/session-history.mjs'

const entries = Array.from({ length: 180 }, (_, seq) => ({ event: { seq: seq + 1, type: 'assistant/chunk' }, view: { seq: seq + 1 } }))
const calls = []
const api = { sessions: { history: async (args) => {
  calls.push(args)
  const eligible = entries.filter((row) => args.beforeSeq === undefined || row.event.seq < args.beforeSeq)
  return { result: { ok: true, value: { events: eligible.slice(-80), hasMore: eligible.length > 80 } } }
} } }
const rows = await readMissingEvents(api, 's1', 10)
assert.deepEqual(rows.map((row) => row.event.seq), Array.from({ length: 170 }, (_, index) => index + 11))
assert.deepEqual(calls.map((call) => call.beforeSeq), [undefined, 101, 21])
assert.equal(rows[0].view.seq, 11)
calls.length = 0
assert.equal((await readMissingEvents(api, 's1', 180)).length, 0)
assert.equal(calls.length, 1)
await assert.rejects(readMissingEvents({ sessions: { history: async () => ({ result: { ok: true,
  value: { events: entries.slice(-80), hasMore: true } } }) } }, 's1', 0), /分页未前进/)
await assert.rejects(readMissingEvents({ sessions: { history: async () => ({ result: { ok: false,
  error: { message: 'controlled unavailable history' } } }) } }, 's1', 0), /unavailable history/)
console.log('native recovery history: multi-page gap, sequence ordering, retained tool views, empty gap and fail-closed pagination/API errors pass')
