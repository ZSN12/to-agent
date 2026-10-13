import { ipcHandle } from '../ipc-utils.mjs'

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   appPreferences: { get: () => Promise<unknown>, set: (patch: unknown) => Promise<unknown> },
 *   webSearch: { getConfig: () => unknown, setConfig: (patch: unknown) => unknown, testSearch: (query: string) => unknown },
 *   listGithubPullRequests: (workspacePath: string | null, getToken: () => string | null) => Promise<unknown>,
 *   getGitHubPersonalAccessToken: () => string | null,
 *   assertCompactionSettingsChangeSafe?: () => void,
 *   onCompactionSettingsChanged?: () => Promise<void>,
 * }} ctx
 */
export function registerPreferencesIpc(ctx) {
  const {
    ipcMain,
    appPreferences,
    webSearch,
    listGithubPullRequests,
    getGitHubPersonalAccessToken,
    assertCompactionSettingsChangeSafe,
    onCompactionSettingsChanged,
  } = ctx

  ipcHandle(ipcMain, 'preferences:get', () => appPreferences.get())
  ipcHandle(ipcMain, 'preferences:set', async (_event, patch) => {
    const update = patch ?? {}
    const previous = await appPreferences.get()
    const thresholdChanged = update.compactionThresholdRatio !== undefined
      && Number(update.compactionThresholdRatio) !== previous.compactionThresholdRatio
    if (thresholdChanged) assertCompactionSettingsChangeSafe?.()
    const next = await appPreferences.set(update)
    if (thresholdChanged && next.compactionThresholdRatio !== previous.compactionThresholdRatio) {
      await onCompactionSettingsChanged?.()
    }
    return next
  })

  ipcHandle(ipcMain, 'github:listPullRequests', async (_event, workspacePath) =>
    listGithubPullRequests(workspacePath ?? null, () => getGitHubPersonalAccessToken()),
  )

  ipcHandle(ipcMain, 'webSearch:getConfig', () => webSearch.getConfig())
  ipcHandle(ipcMain, 'webSearch:setConfig', (_event, patch) => webSearch.setConfig(patch ?? {}))
  ipcHandle(ipcMain, 'webSearch:testSearch', (_event, query) => webSearch.testSearch(query))
}
