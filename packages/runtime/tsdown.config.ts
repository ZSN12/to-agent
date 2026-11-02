import { defineConfig } from 'tsdown'
import { typertPlugin } from './typert/generator/lib/types/tsdown-plugin.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url))

function isBuildFaceClient(value: unknown): boolean {
  if (value === undefined || value === 'host') return false
  if (value === 'client') return true
  throw new Error(`tsdown: --env.TASKWEAVER_BUILD_FACE must be host or client, received ${String(value)}`)
}

/** Shared entry settings for packages whose emitted modules need bundling. */
export function hostPackageConfig(env: { TASKWEAVER_BUILD_FACE?: unknown } | undefined) {
  const client = isBuildFaceClient(env?.TASKWEAVER_BUILD_FACE)
  return {
    entry: client ? '' : ['lib/types/{index,invariant,startup}.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    plugins: client ? [] : [typertPlugin({ mode: 'workspace', faces: ['host'] })],
  }
}

/**
 * The ordinary workspace build consumes JavaScript emitted by the Host
 * TypeScript project and runs Typert. The Client pass selects packages that
 * declare a browser bundle and lets their package-local configs emit both
 * their Node loader entry and browser artifact.
 */
export default defineConfig(({ env, cwd }) => {
  const workspace = {
    include: ['cordis/*', '*/*', 'host-cli'],
  }
  // Tsdown also resolves the root package.json as a workspace config. The root
  // is only a coordinator, not a runtime package; returning an entry for it
  // makes the build try to emit nonexistent lib/types/index.js files.
  if (path.resolve(cwd ?? process.cwd()) === workspaceRoot) return { workspace }

  return {
    workspace,
    ...hostPackageConfig(env),
  }
})
