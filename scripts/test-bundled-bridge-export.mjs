import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildBundledBridgeExportDoc,
  exportDocHasBridgeAgents,
  mergeBridgeExportDocs,
} from '../backend/model-sync/bundled-bridge-export.mjs'
import { bridgeProviderBlocksFromExport } from '../backend/model-sync/bridge-catalog.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const exportDoc = await buildBundledBridgeExportDoc({ appPath: root, userDataPath: null })
assert.equal(exportDocHasBridgeAgents(exportDoc), true)
const blocks = bridgeProviderBlocksFromExport(exportDoc)
assert.ok(blocks['bridge-composer']?.models?.length >= 1)

const merged = mergeBridgeExportDocs(exportDoc, {
  providers: {
    opencodex: { models: [{ id: 'cursor/new-model', name: 'New' }] },
  },
})
assert.ok(merged.providers.opencodex.models.some((m) => m.id === 'cursor/new-model'))

console.log('test-bundled-bridge-export: ok')
