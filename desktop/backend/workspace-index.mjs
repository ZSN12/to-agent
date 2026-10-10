import fs from 'node:fs/promises'
import path from 'node:path'
import { isPathInside } from './security-path.mjs'

const IGNORED_NAMES = new Set([
  '.git', '.svn', '.hg', 'node_modules', 'vendor', 'dist', 'build', 'release',
  '.next', '.nuxt', '.turbo', '.cache', 'coverage', 'target', 'out',
])
const DEFAULT_LIMIT = 3000
const INDEX_CACHE_TTL_MS = 5_000

/**
 * Workspace-only path index used by @-context pickers. It never follows a
 * symlink outside the project and bounds traversal for large repositories.
 */
export function createWorkspaceIndex({ getWorkspacePath = null, maxEntries = DEFAULT_LIMIT } = {}) {
  let cachedRoot = null
  let cachedEntries = null
  let cachedAt = 0
  let cacheGeneration = 0

  async function buildIndex(root) {
    const entries = []
    const stack = [{ absolute: root, relative: '' }]
    let visited = 0

    while (stack.length && visited < maxEntries) {
      const current = stack.pop()
      let children
      try {
        children = await fs.readdir(current.absolute, { withFileTypes: true })
      } catch {
        continue
      }
      children.sort((a, b) => a.name.localeCompare(b.name))

      for (const child of children) {
        if (visited++ >= maxEntries) break
        if (IGNORED_NAMES.has(child.name)) continue
        const relative = path.posix.join(current.relative, child.name)
        const absolute = path.join(current.absolute, child.name)
        let info
        try {
          info = await fs.lstat(absolute)
        } catch {
          continue
        }
        if (info.isSymbolicLink()) continue
        const isDirectory = info.isDirectory()
        if (isDirectory) stack.push({ absolute, relative })
        if (isDirectory || info.isFile()) {
          entries.push({ path: relative, kind: isDirectory ? 'directory' : 'file' })
        }
      }
    }
    return entries
  }

  async function walk({ query = '', limit = 100, includeDirectories = true, workspacePath: rootOverride } = {}) {
    const workspacePath = rootOverride ?? getWorkspacePath?.()
    if (!workspacePath) {
      cachedRoot = null
      cachedEntries = null
      cachedAt = 0
      cacheGeneration++
      return []
    }
    const root = await fs.realpath(workspacePath)
    const normalizedQuery = String(query).trim().toLocaleLowerCase()
    if (root !== cachedRoot) {
      cachedRoot = root
      cachedEntries = null
      cachedAt = 0
      cacheGeneration++
    }

    const requestedGeneration = cacheGeneration
    let entries = cachedEntries
    if (!entries || Date.now() - cachedAt >= INDEX_CACHE_TTL_MS) {
      entries = await buildIndex(root)
      // A workspace can change while indexing. Keep the result only if no
      // newer request switched the active root while this build was running.
      if (requestedGeneration === cacheGeneration && cachedRoot === root) {
        cachedEntries = entries
        cachedAt = Date.now()
      }
    }

    const resultLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 100
    return entries.filter((entry) =>
      (includeDirectories || entry.kind !== 'directory')
      && (!normalizedQuery || entry.path.toLocaleLowerCase().includes(normalizedQuery)),
    ).slice(0, resultLimit)
  }

  return { list: walk }
}

export { isPathInside as isWorkspacePath }
