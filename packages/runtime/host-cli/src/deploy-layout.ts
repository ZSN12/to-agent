/**
 * TaskWeaver / pnpm-deploy runtime layout: dependencies live in `runtime-packages/`.
 * @module @taskweaver/dsh/deploy-layout
 */

import { existsSync, lstatSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'

/** Bootstrap-only env reader (no workspace imports — entry loads before `node_modules` exists). */
const warnedLegacyEnvironment = new Set<string>()

function nonBlankEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]
  if (value === undefined || value.trim() === '') return undefined
  return value
}

function readEnvironment(canonical: string, legacy: readonly string[] = []): string | undefined {
  const current = nonBlankEnv(process.env, canonical)
  for (const name of legacy) {
    const value = nonBlankEnv(process.env, name)
    if (value === undefined) continue
    if (!warnedLegacyEnvironment.has(name)) {
      warnedLegacyEnvironment.add(name)
      process.stderr.write(`[TaskWeaver] ${name} 已弃用，请改用 ${canonical}。旧名称将在一个版本后移除。\n`)
    }
    if (current === undefined) return value
  }
  return current
}

function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    const suffix = sep === '/' ? path.slice(2).replaceAll('\\', '/') : path.slice(2).replaceAll('/', '\\')
    return join(homedir(), suffix)
  }
  return path
}

function taskweaverEmbedded(): boolean {
  return readEnvironment('TASKWEAVER_EMBEDDED', ['Z_TASKWEAVER_EMBEDDED', 'DSH_TASKWEAVER_EMBEDDED']) !== undefined
}

function resolveHarnessHomeDir(): string {
  const selected = readEnvironment('TASKWEAVER_HOME', ['Z_HOME', 'DSH_HOME'])
    ?? join(homedir(), '.taskweaver', 'runtime')
  return resolve(expandHomePath(selected))
}

export const RUNTIME_PACKAGES_DIR = 'runtime-packages'

function deployPackagesDir(runtimeRoot: string): string {
  return join(runtimeRoot, RUNTIME_PACKAGES_DIR)
}

function nodeModulesLink(runtimeRoot: string): string {
  return join(runtimeRoot, 'node_modules')
}

function linkPointsAtPackages(runtimeRoot: string, linkPath: string): boolean {
  try {
    if (!lstatSync(linkPath).isSymbolicLink()) return false
    const target = readlinkSync(linkPath)
    if (target === RUNTIME_PACKAGES_DIR) return true
    return resolve(runtimeRoot, target) === deployPackagesDir(runtimeRoot)
  } catch {
    return false
  }
}

/** Ensure `<runtime-root>/node_modules` resolves the deploy closure when present. */
export function ensureDeployNodeModules(runtimeRoot: string): void {
  const packagesDir = deployPackagesDir(runtimeRoot)
  if (!existsSync(packagesDir)) return

  const linkPath = nodeModulesLink(runtimeRoot)
  if (existsSync(linkPath)) {
    if (linkPointsAtPackages(runtimeRoot, linkPath)) return
    try {
      if (lstatSync(linkPath).isDirectory() && !lstatSync(linkPath).isSymbolicLink()) return
    } catch {
      /* broken link — try to replace below */
    }
  }

  try {
    symlinkSync(RUNTIME_PACKAGES_DIR, linkPath, 'dir')
    return
  } catch {
    /* fall through */
  }
  try {
    symlinkSync(packagesDir, linkPath, 'dir')
  } catch {
    // Read-only install roots must mirror elsewhere; embedders handle that.
  }
}

/**
 * TaskWeaver ≤0.1 wrote `authorization` into `$TASKWEAVER_HOME/cordis.patch.yml`. The
 * TaskWeaver bundle now owns that row — drop the legacy home overlay before Cordis loads.
 */
export function migrateLegacyTaskWeaverHomePatch(): void {
  if (!taskweaverEmbedded()) return
  const patchPath = join(resolveHarnessHomeDir(), 'cordis.patch.yml')
  if (!existsSync(patchPath)) return
  const text = readFileSync(patchPath, 'utf8')
  if (!/dsh-authorization/.test(text) && !/\bid:\s*authorization\b/.test(text)) return
  writeFileSync(patchPath, '[]\n', 'utf8')
}
