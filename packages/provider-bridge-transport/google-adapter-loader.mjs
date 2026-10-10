/** Transitional Antigravity adapter loader. P3.3 replaces this source loader with a Node client. */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
let tsxRegistered = false

function opencodexRoot() {
  const configured = process.env.TASKWEAVER_OPENCODEX_ROOT?.trim()
  return configured ? path.resolve(configured) : path.resolve(here, '..', '..', 'vendor', 'opencodex')
}

/** Antigravity remains on the vendored TypeScript adapter until the P3.3 client lands. */
export function ensureGoogleAdapterLoader() {
  if (tsxRegistered || typeof Bun !== 'undefined') return
  const candidates = [
    process.env.TASKWEAVER_TSX_ROOT?.trim(),
    path.resolve(here, '..', '..', 'node_modules', 'tsx'),
    path.resolve(here, '..', '..', 'packages', 'runtime', 'node_modules', 'tsx'),
  ].filter(Boolean).map(candidate => path.resolve(candidate))
  for (const directory of candidates) {
    for (const entry of [
      path.join(directory, 'dist', 'cjs', 'api', 'index.cjs'),
      path.join(directory, 'dist', 'esm', 'api', 'index.cjs'),
      path.join(directory, 'esm', 'api.mjs'),
      path.join(directory, 'esm', 'api.cjs'),
    ]) {
      try {
        const api = require(entry)
        if (typeof api.register === 'function') {
          api.register()
          tsxRegistered = true
          return
        }
      } catch {
        // Try another supported tsx package layout.
      }
    }
  }
  const error = new Error('Antigravity bridge still requires the development tsx loader until P3.3.')
  error.code = 'BRIDGE_ANTIGRAVITY_TSX_MISSING'
  throw error
}

export async function loadCreateGoogleAdapter() {
  ensureGoogleAdapterLoader()
  const filename = path.join(opencodexRoot(), 'src', 'adapters', 'google.ts')
  const module = await import(pathToFileURL(filename).href)
  if (typeof module.createGoogleAdapter !== 'function') {
    const error = new Error(`OpenCodex Google adapter is missing createGoogleAdapter: ${filename}`)
    error.code = 'BRIDGE_ANTIGRAVITY_ADAPTER_UNAVAILABLE'
    throw error
  }
  return module.createGoogleAdapter
}
