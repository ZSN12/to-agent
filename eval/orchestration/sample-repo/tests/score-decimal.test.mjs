import assert from 'node:assert/strict'
import test from 'node:test'
import { parseScore } from '../src/score.mjs'

test('parseScore preserves decimals', () => {
  assert.equal(parseScore('8.5'), 8.5)
})
