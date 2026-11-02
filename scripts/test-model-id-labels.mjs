import assert from 'node:assert/strict'

const { getCleanModelId, getCleanModelName } = await import('../src/features/models/format.ts')

// Transport namespaces are hidden from labels.
assert.equal(getCleanModelId('google-antigravity/gemini-3.8-pro', 'bridge-antigravity'), 'gemini-3.8-pro')
assert.equal(getCleanModelId('opencodex/cursor/composer-2.5', 'bridge-composer'), 'composer-2.5')
assert.equal(getCleanModelId('my-provider/model-x', 'my-provider'), 'model-x')

// WorkBuddy uses its namespace to tell apart same-named models, so two
// distinct routes must never render with the same label.
assert.equal(getCleanModelId('kimi-k3', 'workbuddy'), 'kimi-k3')
assert.equal(getCleanModelId('workbuddy-ai/kimi-k3', 'workbuddy'), 'workbuddy-ai/kimi-k3')
assert.notEqual(getCleanModelId('workbuddy-ai/kimi-k3', 'workbuddy'), getCleanModelId('kimi-k3', 'workbuddy'))

// Display names still drop the provider key prefix.
assert.equal(getCleanModelName('workbuddy/kimi-k3', 'Kimi K3'), 'Kimi K3')
assert.equal(getCleanModelName('google-antigravity/gemini-3.8-flash-medium'), 'Gemini 3.8 Flash')

console.log('model id label checks passed')
