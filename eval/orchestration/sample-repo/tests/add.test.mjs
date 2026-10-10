import assert from 'node:assert/strict'
import test from 'node:test'
import { add } from '../src/math.mjs'

test('add sums its inputs', () => {
  assert.equal(add(3, 5), 8)
  assert.equal(add(-3, 5), 2)
})
