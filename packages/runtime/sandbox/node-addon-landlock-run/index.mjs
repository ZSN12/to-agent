/**
 * Minimal landlock-run launcher surface for Host sandbox-local on non-Linux
 * desktops. Linux packaging may replace this with the native addon publish.
 */
import { spawnSync } from 'node:child_process'

export const LAUNCHER_BIN = 'landlock-run'
export const LAUNCHER_FAILURE_EXIT = 125

export function launcherPath() {
  return LAUNCHER_BIN
}

/** @param {{ readOnly?: string[], readWrite?: string[] }} grants */
export function grantArgs(grants) {
  return [
    ...(grants.readOnly ?? []).flatMap((root) => ['--ro', root]),
    ...(grants.readWrite ?? []).flatMap((root) => ['--rw', root]),
  ]
}

/** @returns {'full' | 'partial' | 'unusable'} */
export function probe(launcher = launcherPath(), { timeoutMs = 2000 } = {}) {
  if (process.platform !== 'linux') return 'unusable'
  const result = spawnSync(launcher, ['--probe'], {
    timeout: timeoutMs,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.status !== 0) return 'unusable'
  return /partially enforced/.test(result.stdout || '') ? 'partial' : 'full'
}
