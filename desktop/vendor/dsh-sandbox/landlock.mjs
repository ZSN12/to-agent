/**
 * Landlock launcher CLI (from DSH @deepseek-ai/node-addon-landlock-run).
 * Optional npm package; falls back to `landlock-run` on PATH.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LAUNCHER_BIN = 'landlock-run'
export const LAUNCHER_FAILURE_EXIT = 125

const require = createRequire(import.meta.url)

export function launcherPath() {
  const spec = `@deepseek-ai/node-addon-landlock-run-${process.platform}-${process.arch}/package.json`
  try {
    return join(dirname(require.resolve(spec)), 'bin', LAUNCHER_BIN)
  } catch {
    return join(dirname(fileURLToPath(import.meta.url)), 'node_modules', spec.replace('/package.json', ''), 'bin', LAUNCHER_BIN)
  }
}

/** @param {{ readOnly?: string[], readWrite?: string[] }} grants */
export function grantArgs(grants) {
  return [
    ...(grants.readOnly ?? []).flatMap((root) => ['--ro', root]),
    ...(grants.readWrite ?? []).flatMap((root) => ['--rw', root]),
  ]
}

/**
 * @returns {'full' | 'partial' | 'unusable'}
 */
export function probeLandlock(launcher = launcherPath(), { timeoutMs = 2000 } = {}) {
  const result = spawnSync(launcher, ['--probe'], {
    timeout: timeoutMs,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.status !== 0) return 'unusable'
  return /partially enforced/.test(result.stdout || '') ? 'partial' : 'full'
}
