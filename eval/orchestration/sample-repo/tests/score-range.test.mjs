import assert from 'node:assert/strict'
import test from 'node:test'
import { parseScore } from '../src/score.mjs'

test('parseScore rejects non-numbers and scores outside 0 through 100', () => {
  assert.equal(parseScore('0'), 0)
  assert.equal(parseScore('100'), 100)
  assert.equal(parseScore('101'), null)
  assert.equal(parseScore('bad'), null)
})
