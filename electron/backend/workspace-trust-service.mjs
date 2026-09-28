import fs from 'node:fs/promises'
import path from 'node:path'
import { createJsonStore } from './json-store.mjs'

/** TaskWeaver-owned workspace trust registry. Unknown workspaces are untrusted. */
export function createWorkspaceTrustService(userDataPath) {
  const store = createJsonStore(path.join(userDataPath, 'workspace-trust.json'), () => ({ version: 1, workspaces: {} }))

  async function canonicalize(workspacePath) {
    if (!workspacePath || typeof workspacePath !== 'string') throw new Error('工作区路径无效')
    return fs.realpath(path.resolve(workspacePath))
  }

  return {
    filePath: store.filePath,
    async get(workspacePath) {
      const canonical = await canonicalize(workspacePath)
      const state = await store.read()
      const record = state?.workspaces?.[canonical]
      return { workspacePath: canonical, trusted: record?.trusted === true, updatedAt: record?.updatedAt ?? null }
    },
    async set(workspacePath, trusted) {
      const canonical = await canonicalize(workspacePath)
      const next = await store.update((state) => ({
        version: 1,
        workspaces: {
          ...(state?.workspaces ?? {}),
          [canonical]: { trusted: trusted === true, updatedAt: Date.now() },
        },
      }))
      return { workspacePath: canonical, ...next.workspaces[canonical] }
    },
    async list() {
      const state = await store.read()
      return Object.entries(state?.workspaces ?? {}).map(([workspacePath, record]) => ({ workspacePath, trusted: record?.trusted === true, updatedAt: record?.updatedAt ?? null }))
    },
  }
}
