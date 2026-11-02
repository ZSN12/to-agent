import assert from 'node:assert/strict'

const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => { storage.set(key, String(value)) },
  removeItem: (key) => { storage.delete(key) },
}

const { DEFAULT_SHORTCUTS, loadShortcuts } = await import('../src/shared/shortcuts.ts')
const keysFor = (items, id) => items.find((item) => item.id === id)?.keys
const defaultSteer = DEFAULT_SHORTCUTS.find((item) => item.id === 'steer').defaultKeys

assert.notDeepEqual(defaultSteer, ['↩'], 'steering must not share bare Enter with send')
assert.deepEqual(keysFor(loadShortcuts(), 'steer'), defaultSteer)

// Profiles saved by older builds stored steering on bare Enter.
storage.set('taskweaver.shortcuts', JSON.stringify([
  { id: 'steer', keys: ['↩'] },
  { id: 'send', keys: ['↩'] },
  { id: 'new-chat', keys: ['Ctrl', 'K'] },
]))
const migrated = loadShortcuts()
assert.deepEqual(keysFor(migrated, 'steer'), defaultSteer, 'retired steer default migrates to the new default')
assert.deepEqual(keysFor(migrated, 'send'), ['↩'])
assert.deepEqual(keysFor(migrated, 'new-chat'), ['Ctrl', 'K'], 'other custom bindings are preserved')

// A deliberately customized steering shortcut is kept.
storage.set('taskweaver.shortcuts', JSON.stringify([{ id: 'steer', keys: ['⇧', '↩'] }]))
assert.deepEqual(keysFor(loadShortcuts(), 'steer'), ['⇧', '↩'])

console.log('shortcut migration checks passed')
