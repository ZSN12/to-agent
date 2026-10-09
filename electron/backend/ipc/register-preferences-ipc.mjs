import { ipcHandle } from '../ipc-utils.mjs'

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   appPreferences: { get: () => Promise<unknown>, set: (patch: unknown) => Promise<unknown> },
 *   webSearch: { getConfig: () => unknown, setConfig: (patch: unknown) => unknown, testSearch: (query: string) => unknown },
 *   listGithubPullRequests: (workspacePath: string | null, getToken: () => string | null) => Promise<unknown>,
 *   getGitHubPersonalAccessToken: () => string | null,
 * }} ctx
 */
export function registerPreferencesIpc(ctx) {
  const { ipcMain, appPreferences, webSearch, listGithubPullRequests, getGitHubPersonalAccessToken } = ctx

  ipcHandle(ipcMain, 'preferences:get', () => appPreferences.get())
  ipcHandle(ipcMain, 'preferences:set', (_event, patch) => appPreferences.set(patch ?? {}))

  ipcHandle(ipcMain, 'github:listPullRequests', async (_event, workspacePath) =>
    listGithubPullRequests(workspacePath ?? null, () => getGitHubPersonalAccessToken()),
  )

  ipcHandle(ipcMain, 'webSearch:getConfig', () => webSearch.getConfig())
  ipcHandle(ipcMain, 'webSearch:setConfig', (_event, patch) => webSearch.setConfig(patch ?? {}))
  ipcHandle(ipcMain, 'webSearch:testSearch', (_event, query) => webSearch.testSearch(query))
}
