import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
const RUNNER_REL = path.join('windows', 'runner.js')

export function windowsAclRunnerPath() {
  return path.join(here, RUNNER_REL)
}

/** @returns {boolean} */
export function probeWindowsAclRunner() {
  if (process.platform !== 'win32') return false
  const runner = windowsAclRunnerPath()
  return fs.existsSync(runner)
}

/**
 * 将 argv 包进 DSH windows-acl runner（需先运行 `npm run sync:dsh-windows-acl`）。
 * @param {string[]} argv
 * @param {{ mode: 'read-only' | 'workspace-write', workspaceRoot: string }} policy
 */
export function confineArgvWindows(argv, policy) {
  if (!argv.length || !probeWindowsAclRunner()) return argv
  const workspaceRoot = path.resolve(policy.workspaceRoot || process.cwd())
  const mode = policy.mode === 'read-only' ? 'read-only' : 'workspace-write'
  const runner = windowsAclRunnerPath()
  const tempRoot = path.join(workspaceRoot, '.taskweaver-sandbox-temp')
  return [
    process.execPath,
    runner,
    '--workspace',
    workspaceRoot,
    '--temp',
    tempRoot,
    '--mode',
    mode,
    '--',
    ...argv,
  ]
}
