import assert from 'node:assert/strict'
import { getMarketplaceManifest, catalogEntryToServerConfig } from '../electron/backend/mcp-marketplace.mjs'

const manifest = getMarketplaceManifest()
assert.ok(manifest.entryCount >= 4)

const cfg = catalogEntryToServerConfig('memory')
assert.equal(cfg.id, 'memory')
assert.equal(cfg.enabled, true)
assert.equal(cfg.pinned, true)
assert.equal(cfg.version, '0.6.2')
assert.ok(cfg.args.some((a) => a.includes('@0.6.2')))

console.log('mcp-marketplace 测试通过')
