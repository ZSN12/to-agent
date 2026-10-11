import os from 'node:os'
import path from 'node:path'

/**
 * Production Platform implementation backed by stdio JSON-RPC reverse requests to Swift.
 *
 * @param {{
 *   stdioServer: import('../rpc/stdio-server.mjs').StdioJsonRpcServer,
 *   paths?: Partial<import('./index.mjs').Platform['paths']>,
 *   app?: Partial<import('./index.mjs').Platform['app']>,
 * }} options
 * @returns {import('./index.mjs').Platform}
 */
export function createRpcPlatform({ stdioServer, paths = {}, app = {} }) {
  const isPackaged = process.env.TASKWEAVER_PACKAGED === '1' || process.env.TASKWEAVER_PACKAGED === 'true'

  function resolveUserData() {
    if (process.env.TASKWEAVER_USER_DATA) return path.resolve(process.env.TASKWEAVER_USER_DATA)
    if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'taskweaver-desktop')
    }
    return path.join(os.homedir(), '.config', 'taskweaver-desktop')
  }

  const defaultUserData = resolveUserData()
  const defaultAppRoot = process.env.TASKWEAVER_APP_ROOT ? path.resolve(process.env.TASKWEAVER_APP_ROOT) : process.cwd()

  /** @type {import('./index.mjs').Platform} */
  const platform = {
    paths: {
      userData: defaultUserData,
      appRoot: defaultAppRoot,
      documents: path.join(os.homedir(), 'Documents'),
      logs: path.join(os.homedir(), 'Library', 'Logs', 'TaskWeaver'),
      ...paths,
    },
    app: {
      version: process.env.TASKWEAVER_APP_VERSION || '1.2.1',
      isPackaged,
      ...app,
    },
    events: {
      emit(channel, payload) {
        stdioServer.sendNotification(channel, payload)
      },
    },
    ui: {
      async showMessageBox(options) {
        return stdioServer.sendReverseRequest('$platform/ui.showMessageBox', options)
      },
      async pickDirectory(options) {
        return stdioServer.sendReverseRequest('$platform/ui.pickDirectory', options)
      },
      async pickFiles(options) {
        return stdioServer.sendReverseRequest('$platform/ui.pickFiles', options)
      },
      async showSaveDialog(options) {
        return stdioServer.sendReverseRequest('$platform/ui.showSaveDialog', options)
      },
    },
    shell: {
      async openExternal(url) {
        await stdioServer.sendReverseRequest('$platform/shell.openExternal', { url })
      },
      async openPath(filePath) {
        return stdioServer.sendReverseRequest('$platform/shell.openPath', { filePath })
      },
    },
    secrets: {
      async get(key) {
        return stdioServer.sendReverseRequest('$platform/secrets.get', { key })
      },
      async set(key, value) {
        await stdioServer.sendReverseRequest('$platform/secrets.set', { key, value: String(value) })
      },
      async delete(key) {
        await stdioServer.sendReverseRequest('$platform/secrets.delete', { key })
      },
      async list(prefix = '') {
        return stdioServer.sendReverseRequest('$platform/secrets.list', { prefix })
      },
    },
    fetch: globalThis.fetch,
  }

  return platform
}
