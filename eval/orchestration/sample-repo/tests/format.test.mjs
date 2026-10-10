import assert from 'node:assert/strict'
import test from 'node:test'
import { formatLabel } from '../src/format.mjs'

test('formatLabel trims strings and handles nullish values', () => {
  assert.equal(formatLabel('  Ada  '), 'Ada')
  assert.equal(formatLabel(null), '')
  assert.equal(formatLabel(undefined), '')
})
