import assert from 'node:assert/strict'
import test from 'node:test'
import { addUser, listUsers } from '../src/users.mjs'

test('addUser returns and stores an identified user', () => {
  const user = addUser({ name: 'Ada' })
  assert.deepEqual(user, { id: 1, name: 'Ada' })
  const second = addUser({ name: 'Grace' })
  assert.deepEqual(second, { id: 2, name: 'Grace' })
  assert.deepEqual(listUsers(), [user, second])
  assert.notEqual(listUsers(), listUsers(), 'listUsers should return a fresh snapshot')
})
