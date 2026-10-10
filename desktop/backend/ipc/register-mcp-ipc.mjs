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
 *   dialog: import('electron').Dialog,
 *   BrowserWindow: typeof import('electron').BrowserWindow,
 *   mcp: ReturnType<typeof import('../mcp-service.mjs').createMcpService>,
 *   assertMcpHostRestartSafe: () => void,
 *   reloadMcpRuntime: () => Promise<void>,
 * }} ctx
 */
export function registerMcpIpc(ctx) {
  const { ipcMain, dialog, BrowserWindow, mcp, assertMcpHostRestartSafe, reloadMcpRuntime } = ctx

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
          event.sender.send('mcp:githubOAuthStatus', statusInfo)
        } catch (err) {
          console.error('GitHub OAuth 状态推送失败:', err)
        }
      },
      openExternal: (url) => shell.openExternal(url),
      confirmLocalCredential: async ({ source }) => {
        if (typeof dialog?.showMessageBox !== 'function') return false
        const isGh = source === 'gh-cli'
        const options = {
          type: 'question',
          title: '确认使用本机 GitHub 凭据',
          message: isGh
            ? '检测到本机 GitHub CLI 已登录，是否读取其令牌并启用 GitHub MCP？'
            : '检测到 GH_TOKEN 或 GITHUB_TOKEN，是否读取该令牌并启用 GitHub MCP？',
          detail: '令牌会保存到本机加密凭据中供 GitHub MCP 使用，不会提供给 Agent 的 shell。',
          buttons: ['使用本机凭据', '取消'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        }
        const owner = BrowserWindow?.fromWebContents?.(event.sender)
        const answer = owner
          ? await dialog.showMessageBox(owner, options)
          : await dialog.showMessageBox(options)
        return answer.response === 0
      },
    })
    if (result.cancelled) return result
    await reloadMcpRuntime()
    return { ...result, cancelled: false, connection: await mcp.testConnection('github') }
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
  ipcHandle(ipcMain, 'mcp:installCatalog', async (_event, id, env) => {
    assertMcpHostRestartSafe()
    const config = catalogEntryToServerConfig(id, { env })
    const saved = await mcp.installFromCatalog(config)
    await reloadMcpRuntime()
    return saved
  })
}
