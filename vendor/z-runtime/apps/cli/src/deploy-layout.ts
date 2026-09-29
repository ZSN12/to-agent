/**
 * TaskWeaver / pnpm-deploy runtime layout: dependencies live in `runtime-packages/`.
 * @module @z/dsh/deploy-layout
 */

import { existsSync, lstatSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

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

function taskweaverEmbedded(): boolean {
  return (process.env.DSH_TASKWEAVER_EMBEDDED ?? '') !== ''
}

function resolveDshHomeDir(): string {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim()
  return join(homedir(), '.dsh')
}

/**
 * TaskWeaver ≤0.1 wrote `authorization` into `$DSH_HOME/cordis.patch.yml`. The
 * web bundle now owns that row — drop the legacy home overlay before Cordis loads.
 */
export function migrateLegacyTaskWeaverHomePatch(): void {
  if (!taskweaverEmbedded()) return
  const patchPath = join(resolveDshHomeDir(), 'cordis.patch.yml')
  if (!existsSync(patchPath)) return
  const text = readFileSync(patchPath, 'utf8')
  if (!/dsh-authorization/.test(text) && !/\bid:\s*authorization\b/.test(text)) return
  writeFileSync(patchPath, '[]\n', 'utf8')
}
