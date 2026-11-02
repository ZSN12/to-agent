import assert from 'node:assert/strict'
import {
  bridgeProviderBlocksFromExport,
  legacyOpenCodexKeyToBridge,
  listModelsFromBridgeDoc,
  mergeBridgeBlocksIntoModelsDoc,
} from '../backend/model-sync/bridge-catalog.mjs'

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
      models: [
        { id: 'gemini-3.5-flash', name: 'Gemini Flash' },
        { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
      ],
    },
  },
}

const blocks = bridgeProviderBlocksFromExport(exportDoc)
assert.equal(blocks['bridge-composer'].bridgeKind, 'cursor')
assert.equal(blocks['bridge-composer'].models.length, 2)
assert.equal(blocks['bridge-antigravity'].bridgeKind, 'google-antigravity')
assert.equal(blocks['bridge-antigravity'].baseUrl, 'https://example.cloudcode')
assert.equal(blocks['bridge-antigravity'].project, 'proj-1')
const geminiFlash = blocks['bridge-antigravity'].models.find((model) => model.id === 'gemini-3.8-flash')
assert.equal(geminiFlash.reasoning, true)
assert.deepEqual(geminiFlash.thinkingLevelMap, { low: 'low', medium: 'medium', high: 'high' })
assert.equal(geminiFlash.defaultThinkingLevel, 'medium')

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

// 验证 OpenCodex 导出中混入 WorkBuddy 等外部模型时，绝不会被归入 bridge-composer
const contaminatedExport = {
  providers: {
    opencodex: {
      models: [
        { id: 'cursor/claude-4.5-sonnet', name: 'Claude 4.5 Sonnet' },
        { id: 'workbuddy/deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
        { id: 'workbuddy-ai/gpt-5.5', name: 'GPT 5.5' },
        { id: 'google-antigravity/gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
      ],
    },
  },
}
const filteredBlocks = bridgeProviderBlocksFromExport(contaminatedExport)
assert.equal(filteredBlocks['bridge-composer'].models.length, 1)
assert.equal(filteredBlocks['bridge-composer'].models[0].id, 'cursor/claude-4.5-sonnet')

console.log('test-taskweaver-bridge-catalog: ok')
