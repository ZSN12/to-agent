/**
 * Load OpenCodex Cursor adapter in Node (tsx) or Bun without starting ocx/Bun server.
 */
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))

function repoRootFromTransport() {
  return path.resolve(here, '..', '..')
}

function resolveOpenCodexRoot() {
  const fromEnv = process.env.TASKWEAVER_OPENCODEX_ROOT?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return path.join(repoRootFromTransport(), 'vendor', 'opencodex')
}

function tsxRegisterCandidates() {
  const root = repoRootFromTransport()
  const runtimeRoot = path.resolve(here, '..', '..')
  const fromEnv = process.env.TASKWEAVER_TSX_ROOT?.trim()
  const zRuntime = process.env.TASKWEAVER_Z_RUNTIME?.trim()
  const candidates = [
    fromEnv ? path.resolve(fromEnv) : null,
    path.join(here, '..', 'tsx'),
    zRuntime ? path.join(path.resolve(zRuntime), 'runtime-packages', 'tsx') : null,
    zRuntime ? path.join(path.resolve(zRuntime), 'node_modules', 'tsx') : null,
    zRuntime ? path.join(path.resolve(zRuntime), 'electron-vendor', 'tsx') : null,
    path.join(runtimeRoot, 'node_modules', 'tsx'),
    path.join(runtimeRoot, 'runtime-packages', 'tsx'),
    path.join(runtimeRoot, 'electron-vendor', 'tsx'),
    path.join(root, 'packages', 'runtime', 'node_modules', 'tsx'),
    path.join(root, 'node_modules', 'tsx'),
    path.join(root, 'vendor', 'opencodex', 'node_modules', 'tsx'),
  ].filter(Boolean)
  return candidates
}

function tsxRegisterModuleCandidates(tsxDir) {
  return [
    // Electron's module hooks break tsx's ESM register entry; CJS works in Node + Electron.
    path.join(tsxDir, 'dist', 'cjs', 'api', 'index.cjs'),
    path.join(tsxDir, 'dist', 'esm', 'api', 'index.cjs'),
    path.join(tsxDir, 'esm', 'api.mjs'),
    path.join(tsxDir, 'esm', 'api.cjs'),
  ]
}

let tsxRegistered = false

export function ensureNodeTypescriptLoader() {
  if (tsxRegistered || typeof Bun !== 'undefined') return
  const require = createRequire(import.meta.url)
  for (const tsxDir of tsxRegisterCandidates()) {
    for (const registerModule of tsxRegisterModuleCandidates(tsxDir)) {
      try {
        const registerApi = require(registerModule)
        if (typeof registerApi.register === 'function') {
          registerApi.register()
          tsxRegistered = true
          return
        }
      } catch {
        /* try the next supported package layout */
      }
    }
  }
  const err = new Error(
    'Cursor bridge transport requires the tsx loader (packages/runtime node_modules). '
      + 'Install z-runtime deps or set BRIDGE_SMOKE_MOCK=1 for mock smoke.',
  )
  err.code = 'BRIDGE_CURSOR_TSX_MISSING'
  throw err
}

export async function loadCreateCursorAdapter() {
  if (typeof Bun !== 'undefined') {
    const api = await import('@taskweaver/opencodex')
    if (typeof api.createCursorAdapter === 'function') return api.createCursorAdapter
  }
  ensureNodeTypescriptLoader()
  const cursorModule = path.join(resolveOpenCodexRoot(), 'src', 'adapters', 'cursor.ts')
  const mod = await import(pathToFileURL(cursorModule).href)
  if (typeof mod.createCursorAdapter !== 'function') {
    const err = new Error(`Cursor adapter module missing createCursorAdapter: ${cursorModule}`)
    err.code = 'BRIDGE_CURSOR_ADAPTER_UNAVAILABLE'
    throw err
  }
  return mod.createCursorAdapter
}
