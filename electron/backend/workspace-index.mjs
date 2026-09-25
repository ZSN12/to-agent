import fs from 'node:fs/promises'
import path from 'node:path'
import { isPathInside } from './security-path.mjs'

const IGNORED_NAMES = new Set([
  '.git', '.svn', '.hg', 'node_modules', 'vendor', 'dist', 'build', 'release',
  '.next', '.nuxt', '.turbo', '.cache', 'coverage', 'target', 'out',
])
const DEFAULT_LIMIT = 3000

/**
 * Workspace-only path index used by @-context pickers. It never follows a
 * symlink outside the project and bounds traversal for large repositories.
 */
export function createWorkspaceIndex({ getWorkspacePath, maxEntries = DEFAULT_LIMIT } = {}) {
  async function walk({ query = '', limit = 100, includeDirectories = true } = {}) {
    const workspacePath = getWorkspacePath?.()
    if (!workspacePath) return []
    const root = await fs.realpath(workspacePath)
    const normalizedQuery = String(query).trim().toLocaleLowerCase()
    const results = []
    const stack = [{ absolute: root, relative: '' }]
    let visited = 0

    while (stack.length && results.length < Math.max(1, Math.min(500, limit)) && visited < maxEntries) {
      const current = stack.pop()
      let entries
      try {
        entries = await fs.readdir(current.absolute, { withFileTypes: true })
      } catch {
        continue
      }
      entries.sort((a, b) => a.name.localeCompare(b.name))

      for (const entry of entries) {
        if (visited++ >= maxEntries) break
        if (IGNORED_NAMES.has(entry.name)) continue
        const relative = path.posix.join(current.relative, entry.name)
        const absolute = path.join(current.absolute, entry.name)
        let info
        try {
          info = await fs.lstat(absolute)
        } catch {
          continue
        }
        if (info.isSymbolicLink()) continue
        const isDirectory = info.isDirectory()
        if (isDirectory) stack.push({ absolute, relative })
        if ((!isDirectory || includeDirectories) && (!normalizedQuery || relative.toLocaleLowerCase().includes(normalizedQuery))) {
          results.push({ path: relative, kind: isDirectory ? 'directory' : 'file' })
          if (results.length >= limit) break
        }
      }
    }
    return results
  }

  return { list: walk }
}

export { isPathInside as isWorkspacePath }
