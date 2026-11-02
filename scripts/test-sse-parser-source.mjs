import assert from 'node:assert/strict'
import { createGoogleAdapter } from '../packages/provider-bridge-transport/google-antigravity-adapter.mjs'

const adapter = createGoogleAdapter({})
const encoder = new TextEncoder()
const MAX_BYTES = 16 * 1024 * 1024
const textFrame = (text, finishReason) => `data: ${JSON.stringify({ response: { candidates: [{ content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }] } })}\n\n`
function fixture(chunks, { throwAt = -1, error = new Error('synthetic stream failure') } = {}) {
  let read = 0, cancelled = 0, released = 0, reason
  const reader = {
    closed: Promise.resolve(),
    async read() {
      if (read === throwAt) throw error
      return read < chunks.length ? { value: chunks[read++], done: false } : { done: true }
    },
    async cancel(value) { cancelled++; reason = value },
    releaseLock() { released++ },
  }
  return { response: { body: { getReader: () => reader } }, stats: () => ({ read, cancelled, released, reason }) }
}
const split = (bytes, size) => Array.from({ length: Math.ceil(bytes.length / size) }, (_, i) => bytes.subarray(i * size, (i + 1) * size))
async function collect(source) {
  const events = []
  for await (const event of adapter.parseStream(source.response)) events.push(event)
  return events
}
async function test(label, run) {
  await run()
  console.log(`✓ ${label}`)
}

await test('SSE: split UTF-8 and CRLF, multiline data, blank/comment frames, ordered events and DONE', async () => {
  const wire = ': keepalive\r\n\r\n\r\n'
    + 'data: {"response":\r\ndata: {"candidates":[{"content":{"parts":[{"thought":true,"text":"想😀"},{"text":"答é中"}]}}]}}\r\n\r\n'
    + 'data: [DONE]\r\n\r\n'
  const expected = [
    { type: 'thinking_delta', thinking: '想😀' },
    { type: 'text_delta', text: '答é中' },
    { type: 'done', usage: undefined },
  ]
  for (const size of [1, 2, 3, 7, 64, 65536]) {
    const source = fixture(split(encoder.encode(wire), size))
    assert.deepEqual(await collect(source), expected)
    assert.equal(source.stats().cancelled, 0)
    assert.equal(source.stats().released, 1)
  }
})

await test('SSE: EOF flush, terminal finish reason/usage and empty/truncated/malformed/error frames', async () => {
  const wire = 'data: {"response":{"candidates":[{"content":{"parts":[{"text":"done"}]},"finishReason":"MAX_TOKENS"}],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":2}}}'
  const events = await collect(fixture([encoder.encode(wire)]))
  assert.equal(events[0].text, 'done')
  assert.equal(events[1].type, 'done')
  assert.equal(events[1].stopReason, 'max_tokens')
  assert.equal(events[1].usage.inputTokens, 4)
  for (const [wire, message, earlyFailure] of [
    ['', /without a terminal signal/, false],
    [textFrame('partial'), /without a terminal signal/, false],
    ['data: {broken}\n\n', /malformed SSE/, true],
    ['data: {"error":{"message":"synthetic upstream"}}\n\n', /synthetic upstream/, true],
    ['data: {"candidates":{}}\n\n', /candidates were invalid/, true],
    ['data: {"candidates":[{"content":{"parts":{}}}]}\n\n', /parts were invalid/, true],
  ]) {
    const source = fixture([encoder.encode(wire)])
    const output = await collect(source)
    assert.equal(output.at(-1).type, 'error')
    assert.match(output.at(-1).message, message)
    assert.equal(output.some((event) => event.type === 'done'), false)
    assert.equal(source.stats().released, 1)
    assert.equal(source.stats().cancelled, earlyFailure ? 1 : 0)
  }
  const absent = []
  for await (const event of adapter.parseStream({ body: null })) absent.push(event)
  assert.match(absent[0].message, /no body/)
})

await test('SSE: long fragmented lines count each decoded byte once, independent of fragment count', async () => {
  const original = Buffer.byteLength
  const wire = encoder.encode(textFrame('x'.repeat(256 * 1024), 'STOP'))
  for (const size of [256, 1024, 4096]) {
    let countedBytes = 0
    Buffer.byteLength = function (value, encoding) {
      const bytes = original(value, encoding)
      countedBytes += bytes
      return bytes
    }
    let output
    try { output = await collect(fixture(split(wire, size))) } finally { Buffer.byteLength = original }
    assert.equal(output[0].text.length, 256 * 1024)
    assert.equal(output.at(-1).type, 'done')
    assert(countedBytes <= wire.length, `byte counting must be linear: ${countedBytes} <= ${wire.length}`)
  }
})

await test('SSE: exact 16 MiB frame, oversized complete/partial lines, cumulative lines and multibyte boundary', async () => {
  const complete = encoder.encode(`:${'x'.repeat(MAX_BYTES - 2)}\n\ndata: [DONE]\n\n`)
  assert.equal((await collect(fixture(split(complete, 16 * 1024))))[0].type, 'done')
  for (const wire of [
    `:${'x'.repeat(MAX_BYTES - 1)}\n\n`,
    `:${'x'.repeat(MAX_BYTES)}`,
    `:${'x'.repeat(MAX_BYTES / 2 - 2)}\n:${'x'.repeat(MAX_BYTES / 2 - 1)}\n\n`,
    `:${'x'.repeat(MAX_BYTES - 3)}中`,
  ]) {
    const source = fixture(split(encoder.encode(wire), 16 * 1024))
    const output = await collect(source)
    assert.equal(output.length, 1)
    assert.equal(output[0].type, 'error')
    assert.match(output[0].message, /16 MiB limit/)
    assert.equal(source.stats().cancelled, 1)
    assert.equal(source.stats().released, 1)
  }
})

await test('SSE: reader failure/cancellation propagates and early iterator return cancels and releases reader', async () => {
  for (const error of [new Error('synthetic read failure'), new DOMException('synthetic abort', 'AbortError')]) {
    const source = fixture([encoder.encode(textFrame('first'))], { throwAt: 1, error })
    await assert.rejects(collect(source), (actual) => actual === error)
    assert.equal(source.stats().cancelled, 1)
    assert.equal(source.stats().reason, error)
    assert.equal(source.stats().released, 1)
  }
  const source = fixture([encoder.encode(textFrame('first')), encoder.encode(textFrame('unread', 'STOP'))])
  const iterator = adapter.parseStream(source.response)
  assert.equal((await iterator.next()).value.text, 'first')
  await iterator.return()
  assert.equal(source.stats().read, 1)
  assert.equal(source.stats().cancelled, 1)
  assert.equal(source.stats().released, 1)
})
console.log('SSE parser source regressions passed (local streams only; no timing benchmark).')
