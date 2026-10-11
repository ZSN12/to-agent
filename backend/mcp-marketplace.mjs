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

/**
 * 官方预设锁定的推荐版本号，防止每次 npx 拉取未经测试的 upstream latest 导致运行时崩溃
 */
export const DEFAULT_PINNED_VERSIONS = Object.freeze({
  'sequential-thinking': '0.6.2',
  github: '0.6.2',
  everything: '0.6.2',
  'google-drive': '0.6.2',
  gitlab: '0.6.2',
  postgres: '0.6.2',
  'brave-search': '0.6.2',
  puppeteer: '0.6.2',
  filesystem: '0.6.2',
  slack: '0.6.2',
  memory: '0.6.2',
})

export function getMarketplaceManifest() {
  return { ...MANIFEST, entryCount: MCP_CATALOG.length }
}

export function listMarketplaceEntries() {
  return listMcpCatalog().map((entry) => {
    const pinnedVersion = entry.version || DEFAULT_PINNED_VERSIONS[entry.id] || '0.6.2'
    return {
      ...entry,
      marketplaceId: MANIFEST.id,
      pinnedVersion,
      installable: true,
    }
  })
}

export function getMarketplaceEntry(id) {
  return listMarketplaceEntries().find((e) => e.id === id) ?? null
}

/**
 * 将市场目录模板转化为锁版本持久化的服务配置
 * @param {string} id
 * @param {{ env?: Record<string, string>, version?: string, pinnedVersion?: string, pin?: boolean, installedAt?: string }} overrides
 */
export function catalogEntryToServerConfig(id, overrides = {}) {
  const entry = getMarketplaceEntry(id)
  if (!entry) throw new Error(`MCP 目录项不存在: ${id}`)
  const env = { ...(overrides.env || {}) }
  for (const key of entry.envKeys || []) {
    if (env[key] === undefined) env[key] = ''
  }

  const pinnedVersion = overrides.version || overrides.pinnedVersion || entry.pinnedVersion || DEFAULT_PINNED_VERSIONS[id] || '0.6.2'
  const shouldPin = overrides.pin !== false

  // 深度复制参数列表并锁定 npm 包版本
  const args = [...entry.args]
  if (shouldPin && pinnedVersion && pinnedVersion !== 'latest') {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (typeof arg === 'string' && arg.startsWith('@modelcontextprotocol/server-') && !arg.includes('@', 1)) {
        args[i] = `${arg}@${pinnedVersion}`
      }
    }
  }

  return {
    id: entry.id,
    command: entry.command,
    args,
    env,
    enabled: true,
    version: pinnedVersion,
    pinned: shouldPin,
    installedAt: overrides.installedAt || new Date().toISOString(),
    marketplaceId: MANIFEST.id,
  }
}
