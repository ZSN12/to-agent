import { ipcHandle } from '../ipc-utils.mjs'
import { listMcpCatalog } from '../mcp-catalog.mjs'
import {
  getMarketplaceManifest,
  listMarketplaceEntries,
  catalogEntryToServerConfig,
} from '../mcp-marketplace.mjs'

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   mcp: ReturnType<typeof import('../mcp-service.mjs').createMcpService>,
 *   assertMcpHostRestartSafe: () => void,
 *   reloadMcpRuntime: () => Promise<void>,
 * }} ctx
 */
export function registerMcpIpc(ctx) {
  const { ipcMain, mcp, assertMcpHostRestartSafe, reloadMcpRuntime } = ctx

  ipcHandle(ipcMain, 'mcp:getRuntimeBinding', () => mcp.getDshRuntimeBinding())
  ipcHandle(ipcMain, 'mcp:list', () => mcp.listServers())
  ipcHandle(ipcMain, 'mcp:save', async (_event, server) => {
    assertMcpHostRestartSafe()
    const saved = await mcp.saveServer(server)
    await reloadMcpRuntime()
    return saved
  })
  ipcHandle(ipcMain, 'mcp:remove', async (_event, id) => {
    assertMcpHostRestartSafe()
    const removed = await mcp.removeServer(id)
    await reloadMcpRuntime()
    return removed
  })
  ipcHandle(ipcMain, 'mcp:setEnabled', async (_event, id, enabled) => {
    assertMcpHostRestartSafe()
    const saved = await mcp.setEnabled(id, enabled)
    await reloadMcpRuntime()
    return saved
  })
  ipcHandle(ipcMain, 'mcp:testConnection', (_event, id) => mcp.testConnection(id))
  ipcHandle(ipcMain, 'mcp:configureGitHub', async (_event, token) => {
    assertMcpHostRestartSafe()
    const saved = await mcp.configureGitHub(token)
    await reloadMcpRuntime()
    return saved
  })
  ipcHandle(ipcMain, 'mcp:getGitHubOAuthAvailability', () => mcp.getGitHubOAuthAvailability())
  ipcHandle(ipcMain, 'mcp:startGitHubOAuth', async (event) => {
    assertMcpHostRestartSafe()
    const { shell } = await import('electron')
    const result = await mcp.loginGitHubWithOAuth({
      onStatus: (statusInfo) => {
        try {
          if (statusInfo?.url) shell.openExternal(statusInfo.url).catch(() => {})
          event.sender.send('mcp:githubOAuthStatus', statusInfo)
        } catch (err) {
          console.error('GitHub OAuth 状态推送失败:', err)
        }
      },
      openExternal: (url) => shell.openExternal(url),
    })
    await reloadMcpRuntime()
    return { ...result, connection: await mcp.testConnection('github') }
  })
  ipcHandle(ipcMain, 'mcp:cancelGitHubOAuth', () => mcp.cancelGitHubOAuth())
  ipcHandle(ipcMain, 'mcp:disconnect', async (_event, id) => {
    assertMcpHostRestartSafe()
    const disconnected = await mcp.disconnect(id)
    await reloadMcpRuntime()
    return disconnected
  })
  ipcHandle(ipcMain, 'mcp:refresh', async () => {
    assertMcpHostRestartSafe()
    return mcp.listServers({ refresh: true })
  })
  ipcHandle(ipcMain, 'mcp:catalog', () => listMcpCatalog())
  ipcHandle(ipcMain, 'mcp:marketplace', () => ({
    manifest: getMarketplaceManifest(),
    entries: listMarketplaceEntries(),
  }))
  ipcHandle(ipcMain, 'mcp:installCatalog', async (_event, { id, env } = {}) => {
    assertMcpHostRestartSafe()
    const config = catalogEntryToServerConfig(id, { env })
    const saved = await mcp.installFromCatalog(config)
    await reloadMcpRuntime()
    return saved
  })
}
