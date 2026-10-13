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
 *   shell: { openExternal: (url: string) => Promise<void> },
 *   mcp: ReturnType<typeof import('../mcp-service.mjs').createMcpService>,
 *   assertMcpHostRestartSafe: () => void,
 *   reloadMcpRuntime: () => Promise<void>,
 *   withMcpHostRestartLock: (operation: () => Promise<unknown>) => Promise<unknown>,
 * }} ctx
 */
export function registerMcpIpc(ctx) {
  const { ipcMain, dialog, BrowserWindow, shell, mcp, assertMcpHostRestartSafe, reloadMcpRuntime, withMcpHostRestartLock } = ctx
  let operationQueue = Promise.resolve()

  const enqueueMcpOperation = (operation) => {
    const result = operationQueue.then(operation)
    operationQueue = result.catch(() => {})
    return result
  }

  // Serialize configuration writes together with the Host restart. Without this
  // queue two quick toggles can both pass the busy check, race their writes, and
  // restart the runtime against an intermediate MCP configuration.
  const changeMcpRuntime = (operation, shouldReload = () => true) => {
    return enqueueMcpOperation(async () => {
      assertMcpHostRestartSafe()
      const value = await operation()
      if (shouldReload(value)) {
        await withMcpHostRestartLock(reloadMcpRuntime)
      }
      return value
    })
  }
  const readMcpRuntime = enqueueMcpOperation

  ipcHandle(ipcMain, 'mcp:getRuntimeBinding', () => readMcpRuntime(() => mcp.getDshRuntimeBinding()))
  ipcHandle(ipcMain, 'mcp:list', () => readMcpRuntime(() => mcp.listServers()))
  ipcHandle(ipcMain, 'mcp:save', (_event, server) => changeMcpRuntime(() => mcp.saveServer(server)))
  ipcHandle(ipcMain, 'mcp:remove', (_event, id) => changeMcpRuntime(() => mcp.removeServer(id)))
  ipcHandle(ipcMain, 'mcp:setEnabled', (_event, id, enabled) => changeMcpRuntime(() => mcp.setEnabled(id, enabled)))
  ipcHandle(ipcMain, 'mcp:testConnection', (_event, id) => readMcpRuntime(() => mcp.testConnection(id)))
  ipcHandle(ipcMain, 'mcp:configureGitHub', (_event, token) => changeMcpRuntime(() => mcp.configureGitHub(token)))
  ipcHandle(ipcMain, 'mcp:getGitHubOAuthAvailability', () => mcp.getGitHubOAuthAvailability())
  ipcHandle(ipcMain, 'mcp:startGitHubOAuth', async (event) => {
    const result = await changeMcpRuntime(async () => {
      return mcp.loginGitHubWithOAuth({
        onStatus: (statusInfo) => {
          try {
            event.sender.send('mcp:githubOAuthStatus', statusInfo)
          } catch (err) {
            console.error('GitHub OAuth 状态推送失败:', err)
          }
        },
        openExternal: (url) => {
          if (typeof shell?.openExternal !== 'function') {
            throw new Error('当前桌面 Shell 未提供安全的外部浏览器打开能力。')
          }
          return shell.openExternal(url)
        },
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
    }, (value) => value?.cancelled !== true)
    if (result.cancelled) return result
    return { ...result, cancelled: false, connection: await readMcpRuntime(() => mcp.testConnection('github')) }
  })
  ipcHandle(ipcMain, 'mcp:cancelGitHubOAuth', () => mcp.cancelGitHubOAuth())
  ipcHandle(ipcMain, 'mcp:disconnect', (_event, id) => changeMcpRuntime(() => mcp.disconnect(id)))
  ipcHandle(ipcMain, 'mcp:refresh', () => readMcpRuntime(() => {
    assertMcpHostRestartSafe()
    return mcp.listServers({ refresh: true })
  }))
  ipcHandle(ipcMain, 'mcp:catalog', () => listMcpCatalog())
  ipcHandle(ipcMain, 'mcp:marketplace', () => ({
    manifest: getMarketplaceManifest(),
    entries: listMarketplaceEntries(),
  }))
  ipcHandle(ipcMain, 'mcp:installCatalog', (_event, id, env) => changeMcpRuntime(async () => {
    const config = catalogEntryToServerConfig(id, { env })
    return mcp.installFromCatalog(config)
  }))
}
