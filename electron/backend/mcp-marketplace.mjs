/**
 * Bundled MCP marketplace index (offline). Entries can be installed into mcp-service store.
 * Not a Cordis plugin registry — each row is a stdio MCP server recipe.
 */
import { MCP_CATALOG, listMcpCatalog } from './mcp-catalog.mjs'

/** @typedef {{ id: string, version: string, updatedAt: string, entries: typeof MCP_CATALOG }} MarketplaceManifest */

const MANIFEST = {
  id: 'taskweaver-bundled',
  version: '1',
  updatedAt: '2026-03-25',
  description: 'TaskWeaver 内置 MCP 目录（对标 DSH 插件市场的本地种子，非在线 Cordis 仓库）',
}

export function getMarketplaceManifest() {
  return { ...MANIFEST, entryCount: MCP_CATALOG.length }
}

export function listMarketplaceEntries() {
  return listMcpCatalog().map((entry) => ({
    ...entry,
    marketplaceId: MANIFEST.id,
    installable: true,
  }))
}

export function getMarketplaceEntry(id) {
  return listMarketplaceEntries().find((e) => e.id === id) ?? null
}

/** @param {string} id @param {{ env?: Record<string, string> }} overrides */
export function catalogEntryToServerConfig(id, overrides = {}) {
  const entry = getMarketplaceEntry(id)
  if (!entry) throw new Error(`MCP 目录项不存在: ${id}`)
  const env = { ...(overrides.env || {}) }
  for (const key of entry.envKeys || []) {
    if (env[key] === undefined) env[key] = ''
  }
  return {
    id: entry.id,
    command: entry.command,
    args: [...entry.args],
    env,
    enabled: true,
  }
}
