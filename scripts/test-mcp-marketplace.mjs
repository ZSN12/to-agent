import assert from 'node:assert/strict'
import { getMarketplaceManifest, catalogEntryToServerConfig } from '../electron/backend/mcp-marketplace.mjs'

const manifest = getMarketplaceManifest()
assert.ok(manifest.entryCount >= 4)

const cfg = catalogEntryToServerConfig('memory')
assert.equal(cfg.id, 'memory')
assert.equal(cfg.enabled, true)

console.log('mcp-marketplace 测试通过')
