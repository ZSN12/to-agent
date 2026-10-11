import os from 'node:os'
import path from 'node:path'

/**
 * In-memory test implementation of the Platform interface.
 * Suitable for unit tests, headless CLI runs, and local verification.
 *
 * @param {Partial<import('./index.mjs').Platform>} [overrides]
 * @returns {import('./index.mjs').Platform & { _events: Array<{ channel: string, payload: unknown }>, _secrets: Map<string, string> }}
 */
export function createTestPlatform(overrides = {}) {
  const tmpRoot = path.join(os.tmpdir(), 'taskweaver-test-platform')
  const secretsMap = new Map()
  const recordedEvents = []

  /** @type {import('./index.mjs').Platform & { _events: any[], _secrets: Map<string, string> }} */
  const platform = {
    paths: {
      userData: path.join(tmpRoot, 'userData'),
      appRoot: process.cwd(),
      documents: path.join(tmpRoot, 'documents'),
      logs: path.join(tmpRoot, 'logs'),
      ...overrides.paths,
    },
    app: {
      version: '1.2.1-test',
      isPackaged: false,
      ...overrides.app,
    },
    events: {
      emit(channel, payload) {
        recordedEvents.push({ channel, payload })
        if (overrides.events?.emit) {
          overrides.events.emit(channel, payload)
        }
      },
    },
    ui: {
      async showMessageBox(options) {
        if (overrides.ui?.showMessageBox) return overrides.ui.showMessageBox(options)
        return { response: options.defaultId ?? 0 }
      },
      async pickDirectory(options) {
        if (overrides.ui?.pickDirectory) return overrides.ui.pickDirectory(options)
        return null
      },
      async pickFiles(options) {
        if (overrides.ui?.pickFiles) return overrides.ui.pickFiles(options)
        return []
      },
      async showSaveDialog(options) {
        if (overrides.ui?.showSaveDialog) return overrides.ui.showSaveDialog(options)
        return null
      },
      ...overrides.ui,
    },
    shell: {
      async openExternal(url) {
        if (overrides.shell?.openExternal) return overrides.shell.openExternal(url)
      },
      async openPath(filePath) {
        if (overrides.shell?.openPath) return overrides.shell.openPath(filePath)
        return ''
      },
      ...overrides.shell,
    },
    secrets: {
      async get(key) {
        return secretsMap.get(key) ?? null
      },
      async set(key, value) {
        secretsMap.set(key, String(value))
      },
      async delete(key) {
        secretsMap.delete(key)
      },
      async list(prefix = '') {
        const result = []
        for (const k of secretsMap.keys()) {
          if (!prefix || k.startsWith(prefix)) result.push(k)
        }
        return result
      },
      ...overrides.secrets,
    },
    fetch: overrides.fetch ?? globalThis.fetch,
    _events: recordedEvents,
    _secrets: secretsMap,
  }

  return platform
}
