import assert from 'node:assert/strict'
import test from 'node:test'
import { isWithinWindow } from '../src/window.mjs'

test('isWithinWindow uses a half-open interval', () => {
  assert.equal(isWithinWindow(4, 4, 7), true)
  assert.equal(isWithinWindow(7, 4, 7), false)
})
