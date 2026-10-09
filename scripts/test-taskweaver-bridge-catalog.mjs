import assert from 'node:assert/strict'
import {
  bridgeProviderBlocksFromExport,
  legacyOpenCodexKeyToBridge,
  listModelsFromBridgeDoc,
  mergeBridgeBlocksIntoModelsDoc,
} from '../electron/backend/model-sync/bridge-catalog.mjs'

const exportDoc = {
  providers: {
    opencodex: {
      models: [
        { id: 'cursor/composer-2.5-fast', name: 'Composer Fast' },
        { id: 'cursor/composer-2.5', name: 'Composer 2.5' },
      ],
    },
    'google-antigravity': {
      baseUrl: 'https://example.cloudcode',
      project: 'proj-1',
      models: [{ id: 'gemini-3.5-flash', name: 'Gemini Flash' }],
    },
  },
}

const blocks = bridgeProviderBlocksFromExport(exportDoc)
assert.equal(blocks['bridge-composer'].bridgeKind, 'cursor')
assert.equal(blocks['bridge-composer'].models.length, 2)
assert.equal(blocks['bridge-antigravity'].bridgeKind, 'google-antigravity')
assert.equal(blocks['bridge-antigravity'].baseUrl, 'https://example.cloudcode')
assert.equal(blocks['bridge-antigravity'].project, 'proj-1')

const merged = mergeBridgeBlocksIntoModelsDoc(
  { providers: { opencodex: { baseUrl: 'http://127.0.0.1:10100/v1', models: [] } } },
  blocks,
  { migrateAwayOpenCodex: true },
)
assert.ok(merged.providers['bridge-composer'])
assert.equal(merged.providers.opencodex, undefined)

const rows = listModelsFromBridgeDoc(merged, ['bridge-composer', 'bridge-antigravity'])
assert.ok(rows.some((r) => r.key === 'bridge-composer/cursor/composer-2.5-fast'))
assert.ok(rows.some((r) => r.key === 'bridge-antigravity/gemini-3.5-flash'))

assert.equal(legacyOpenCodexKeyToBridge('opencodex/cursor/composer-2.5'), 'bridge-composer/cursor/composer-2.5')

console.log('test-taskweaver-bridge-catalog: ok')
