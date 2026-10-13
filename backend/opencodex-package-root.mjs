import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** npm package name for the vendored OpenCodex fork. */
export const TASKWEAVER_OPENCODEX_PACKAGE = '@taskweaver/opencodex'

const PKG_SEGMENTS = TASKWEAVER_OPENCODEX_PACKAGE.split('/')

/**
 * Resolve directory containing bundled ocx (vendor symlink via npm file: dep).
 * @param {string} [cwd] project root
 * @returns {string | null}
 */
export function resolveTaskWeaverOpenCodexRoot(cwd = process.cwd()) {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const roots = [
    cwd,
    path.join(cwd, '..'),
    path.join(cwd, '..', '..'),
    path.join(here, '..', '..'),
    path.dirname(path.dirname(here)),
  ]
  for (const root of roots) {
    const fromNodeModules = path.join(root, 'node_modules', ...PKG_SEGMENTS)
    if (fs.existsSync(path.join(fromNodeModules, 'package.json'))) return fromNodeModules
    const fromVendor = path.join(root, 'vendor', 'opencodex')
    if (fs.existsSync(path.join(fromVendor, 'package.json'))) return fromVendor
  }
  return null
}
