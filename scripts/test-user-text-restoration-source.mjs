import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({
  entryPoints: ['src/features/dsh-runtime/dshTranscriptMessages.ts'], bundle: true,
  write: false, format: 'esm', platform: 'node',
})
const { chatMessagesFromDshTranscript, mergeStoredMessagesWithDshTranscript } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const WINDOW = 10 * 60 * 1000
const user = (id, text, timestamp, behavior) => ({ id, author: 'user', name: '你', time: '00:00', text, timestamp, behavior })
const host = (id, text, timestamp, behavior, images) => ({ dshKey: id, role: 'user', text, timestamp, behavior, images })
// Frozen pre-optimization matching semantics: first compatible original text
// after the last successful match, including its exact whitespace and images.
function legacyRestore(stored, transcript) {
  const users = stored.filter((message) => message.author === 'user')
  let next = 0
  return chatMessagesFromDshTranscript(transcript, { user: '你', agent: 'TaskWeaver' }).map((message) => {
    if (message.author !== 'user') return message
    const text = message.text.trim()
    if (!text) return message
    for (let i = next; i < users.length; i++) {
      const candidate = users[i]
      const original = candidate.text.trim()
      if (!original || !text.includes(original)) continue
      if ((message.behavior === 'steer') !== (candidate.behavior === 'steer')) continue
      if (typeof message.timestamp === 'number' && typeof candidate.timestamp === 'number'
        && Math.abs(message.timestamp - candidate.timestamp) > WINDOW) continue
      next = i + 1
      return { ...message, text: candidate.text, images: message.images ?? candidate.images }
    }
    return message
  })
}
function equivalent(stored, transcript) {
  const expected = legacyRestore(stored, transcript)
  const actual = mergeStoredMessagesWithDshTranscript(stored, transcript, true)
  assert.deepEqual(actual, expected)
  return actual
}
const originalNow = Date.now
Date.now = () => 1_000_000
try {
  const stored = [
    user('one', '  重复内容  ', 1000),
    { id: 'assistant', author: 'orchestrator', text: 'irrelevant' },
    user('steer', '重复内容', 1002, 'steer'),
    user('two', '重复内容\n', 1005, 'followUp'),
  ]
  const restored = equivalent(stored, [
    host('one', '[[HOST]] internal context\n重复内容\nmore context', 1000),
    host('steer', '[[HOST]] 重复内容', 1002, 'steer'),
    host('two', '[[HOST]] 重复内容', 1005),
  ])
  assert.deepEqual(restored.map((message) => message.text), ['  重复内容  ', '重复内容', '重复内容\n'])

  // Both the closed ten-minute boundary and the first-match ordering matter.
  for (const offset of [-WINDOW - 1, -WINDOW, -WINDOW + 1, WINDOW - 1, WINDOW, WINDOW + 1]) {
    const timestamp = 10 * WINDOW
    const output = equivalent([user('boundary', 'USER: boundary', timestamp + offset)], [host('boundary', '[[HOST]] USER: boundary', timestamp)])
    assert.equal(output[0].text, Math.abs(offset) <= WINDOW ? 'USER: boundary' : '[[HOST]] USER: boundary')
  }
  equivalent([user('fractional-negative', 'USER: boundary', -1e-12)], [host('fractional-positive', '[[HOST]] USER: boundary', WINDOW)])
  equivalent([user('fractional-positive', 'USER: boundary', 1e-12)], [host('fractional-negative', '[[HOST]] USER: boundary', -WINDOW)])
  // Merge timed/untimed lists in original order, rather than picking the
  // nearest timestamp, an exact-text hit, or a later shorter candidate.
  equivalent([
    user('untimed-first', ' USER: same ', undefined),
    user('timed-next', 'USER: same', WINDOW),
    user('untimed-last', 'USER: same\n', undefined),
  ], [host('a', '[[HOST]] USER: same', WINDOW), host('b', '[[HOST]] USER: same', WINDOW), host('c', '[[HOST]] USER: same', WINDOW)])
  equivalent([user('prefix', 'USER: one', 1000), user('full', 'USER: one plus', 1000)], [host('a', '[[HOST]] USER: one plus', 1000)])
  equivalent([user('future', 'USER: later', 1), user('past', 'USER: earlier', 1)], [host('a', '[[HOST]] USER: earlier', 1), host('b', '[[HOST]] USER: later', 1)])
  equivalent([user('empty', ' \n ', 1), user('a', 'USER: match', 1)], [host('empty', ' ', 1), host('a', '[[HOST]] USER: match', 1)])
  const images = [{ mediaType: 'image/png', data: 'synthetic' }]
  const imageStored = [{ ...user('image', 'USER: image', 1), images }]
  assert.equal(equivalent(imageStored, [host('a', '[[HOST]] USER: image', 1)])[0].images, images)
  assert.deepEqual(equivalent(imageStored, [host('a', '[[HOST]] USER: image', 1, undefined, [])])[0].images, [])

  for (const timestamp of [undefined, NaN, Infinity, -Infinity, 0, -WINDOW, 1e308]) {
    for (const candidateTime of [undefined, NaN, Infinity, -Infinity, 0, -WINDOW, 1e308]) {
      equivalent([user('numeric', 'USER: numeric', candidateTime)], [host('numeric', '[[HOST]] USER: numeric', timestamp)])
    }
  }
  let seed = 19
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)
  for (let sample = 0; sample < 80; sample++) {
    const texts = ['USER: a', 'USER: a more', 'USER: b', ' 重复 ', '', ' \n ', 'USER: C😀']
    const times = [undefined, NaN, -WINDOW, 0, 1, WINDOW, WINDOW + 1, 3 * WINDOW]
    const behaviors = [undefined, 'steer', 'followUp']
    const stored = Array.from({ length: 30 }, (_, i) => user(`s-${i}`, texts[random() % texts.length], times[random() % times.length], behaviors[random() % behaviors.length]))
    const transcript = Array.from({ length: 30 }, (_, i) => i % 9 === 0
      ? { dshKey: `c-${i}`, role: 'context', plugin: 'test', text: 'opaque', timestamp: i }
      : host(`h-${i}`, `[[HOST]] ${texts[random() % texts.length]} | ${texts[random() % texts.length]}`, times[random() % times.length], behaviors[random() % behaviors.length]))
    equivalent(stored, transcript)
  }

  const originalIncludes = String.prototype.includes
  const countIncludes = (run) => {
    let checks = 0
    String.prototype.includes = function (...args) {
      if (String(this).startsWith('[[HOST]]')) checks++
      return originalIncludes.apply(this, args)
    }
    try { run() } finally { String.prototype.includes = originalIncludes }
    return checks
  }
  for (const size of [100, 500, 1000]) {
    const stored = Array.from({ length: size }, (_, i) => user(`stored-${i}`, `USER: candidate-${i};`, i * 60_000, i % 2 ? 'steer' : undefined))
    const transcript = Array.from({ length: size }, (_, i) => host(`host-${i}`, '[[HOST]] no compatible original text', i * 60_000, i % 2 ? 'steer' : undefined))
    const baselineChecks = countIncludes(() => legacyRestore(stored, transcript))
    const currentChecks = countIncludes(() => mergeStoredMessagesWithDshTranscript(stored, transcript, true))
    assert.equal(baselineChecks, size * size)
    assert(currentChecks <= 11 * size)
    assert.deepEqual(mergeStoredMessagesWithDshTranscript(stored, transcript, true), legacyRestore(stored, transcript))
    console.log(`restoration includes: messages=${size}, baseline=${baselineChecks}, current=${currentChecks}`)
  }
  // No timestamp means no safe temporal exclusion. Preserve this conservative
  // fallback rather than guessing associations from duplicated internal prompts.
  const untimedStored = Array.from({ length: 50 }, (_, i) => user(`untimed-${i}`, `USER: candidate-${i};`))
  const untimedTranscript = Array.from({ length: 50 }, (_, i) => host(`untimed-${i}`, '[[HOST]] no original text'))
  assert.equal(countIncludes(() => mergeStoredMessagesWithDshTranscript(untimedStored, untimedTranscript, true)), 2500)
  equivalent(untimedStored, untimedTranscript)
  const originalTrim = String.prototype.trim
  let originalTextTrims = 0
  String.prototype.trim = function () {
    if (String(this).startsWith('USER:')) originalTextTrims++
    return originalTrim.call(this)
  }
  try { mergeStoredMessagesWithDshTranscript(untimedStored, untimedTranscript, true) }
  finally { String.prototype.trim = originalTrim }
  assert.equal(originalTextTrims, untimedStored.length, 'even fallback candidates normalize their text only once')
} finally { Date.now = originalNow }
console.log('User-text restoration source checks passed: ordered legacy equivalence, repeated text, steer, closed ten-minute window, images, malformed times and conservative untimed fallback.')
