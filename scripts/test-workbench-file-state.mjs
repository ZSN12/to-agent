import assert from 'node:assert/strict'
import { clearWorkbenchConversationState, readWorkbenchFileState, workbenchFileStateKey } from '../src/features/workbench/workbench-file-state.ts'

const entries = new Map()
const storage = {
  get length() { return entries.size },
  key(index) { return [...entries.keys()][index] ?? null },
  getItem(key) { return entries.get(key) ?? null },
  setItem(key, value) { entries.set(key, value) },
  removeItem(key) { entries.delete(key) },
}
const a = workbenchFileStateKey('session/A', '/workspace/A')
const b = workbenchFileStateKey('session/B', '/workspace/A')
const movedA = workbenchFileStateKey('session/A', '/workspace/B')
const saved = { query: 'backend', scrollTop: 825, selectedPath: 'backend/server.mjs' }
storage.setItem(a, JSON.stringify(saved))
assert.deepEqual(readWorkbenchFileState(storage, a), saved)
assert.deepEqual(readWorkbenchFileState(storage, b), { query: '', scrollTop: 0, selectedPath: null })
assert.deepEqual(readWorkbenchFileState(storage, movedA), { query: '', scrollTop: 0, selectedPath: null })
storage.setItem(b, '{bad-json')
assert.equal(readWorkbenchFileState(storage, b).query, '')
storage.setItem(b, JSON.stringify({ query: [], scrollTop: -100, selectedPath: 3 }))
assert.deepEqual(readWorkbenchFileState(storage, b), { query: '', scrollTop: 0, selectedPath: null })
storage.setItem(`taskweaver.workbench.v1.${encodeURIComponent('session/A')}`, '{}')
storage.setItem(movedA, JSON.stringify(saved))
storage.setItem('unrelated', 'preserved')
clearWorkbenchConversationState(storage, 'session/A')
assert.equal(storage.getItem(a), null)
assert.equal(storage.getItem(movedA), null)
assert.equal(storage.getItem(`taskweaver.workbench.v1.${encodeURIComponent('session/A')}`), null)
assert.notEqual(storage.getItem(b), null)
assert.equal(storage.getItem('unrelated'), 'preserved')
const denied = { getItem() { throw new Error('storage disabled') } }
assert.equal(readWorkbenchFileState(denied, a).query, '')
console.log('workbench file state checks passed: session/project isolation, restoration, malformed storage, cleanup')
