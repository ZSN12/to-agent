import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { bwrapProfileArgs, landlockProfileArgs, seatbeltProfileArgs } from '../vendor/dsh-sandbox/profiles.mjs'
import { launcherPath, probeLandlock } from '../vendor/dsh-sandbox/landlock.mjs'
import { probeWindowsAclRunner, confineArgvWindows } from '../vendor/dsh-sandbox/windows-acl.mjs'

export const SANDBOX_MODE = Object.freeze({
  OFF: 'off',
  READ_ONLY: 'read-only',
  WORKSPACE_WRITE: 'workspace-write',
})

const PROBE_TIMEOUT_MS = 5000
let cachedProbe = null
/** @type {'bwrap' | 'landlock' | 'seatbelt' | null} */
let cachedLinuxRunner = undefined

function probeBwrap() {
  const probe = spawnSync('bwrap', [...bwrapProfileArgs({ mode: 'read-only', workspaceRoot: '/' }), '--', 'true'], {
    timeout: PROBE_TIMEOUT_MS,
    stdio: 'ignore',
  })
  return probe.status === 0
}

function probeSeatbelt() {
  const probe = spawnSync('sandbox-exec', [...seatbeltProfileArgs({ mode: 'read-only', workspaceRoot: '/' }), '--', 'true'], {
    timeout: PROBE_TIMEOUT_MS,
    stdio: 'ignore',
  })
  return probe.status === 0
}

function selectLinuxRunner() {
  if (cachedLinuxRunner !== undefined) return cachedLinuxRunner
  if (probeBwrap()) cachedLinuxRunner = 'bwrap'
  else if (probeLandlock(launcherPath(), { timeoutMs: 2000 }) !== 'unusable') cachedLinuxRunner = 'landlock'
  else cachedLinuxRunner = null
  return cachedLinuxRunner
}

export function probeSandboxSupport() {
  if (cachedProbe) return cachedProbe
  const platform = process.platform
  if (platform === 'darwin') {
    const seatbelt = probeSeatbelt()
    cachedProbe = {
      platform,
      seatbelt,
      bwrap: false,
      landlock: false,
      windowsAcl: false,
      runner: seatbelt ? 'seatbelt' : null,
      available: seatbelt,
    }
    return cachedProbe
  }
  if (platform === 'linux') {
    const runner = selectLinuxRunner()
    const landlock = runner === 'landlock'
    const bwrap = runner === 'bwrap'
    cachedProbe = {
      platform,
      seatbelt: false,
      bwrap,
      landlock,
      windowsAcl: false,
      runner,
      available: Boolean(runner),
    }
    return cachedProbe
  }
  if (platform === 'win32') {
    const windowsAcl = probeWindowsAclRunner()
    cachedProbe = {
      platform,
      seatbelt: false,
      bwrap: false,
      landlock: false,
      windowsAcl,
      runner: windowsAcl ? 'windows-acl' : null,
      available: windowsAcl,
      note: windowsAcl
        ? undefined
        : '运行 npm run sync:dsh-windows-acl 从 DSH 同步 runner；或改用 WSL / 权限 full。',
    }
    return cachedProbe
  }
  cachedProbe = {
    platform,
    seatbelt: false,
    bwrap: false,
    landlock: false,
    windowsAcl: false,
    runner: null,
    available: false,
  }
  return cachedProbe
}

/**
 * @param {string[]} argv
 * @param {{ mode: string, workspaceRoot: string }} policy
 */
export function confineArgv(argv, policy) {
  if (!argv.length) return argv
  const mode = policy.mode === SANDBOX_MODE.READ_ONLY ? 'read-only' : 'workspace-write'
  const workspaceRoot = path.resolve(policy.workspaceRoot || process.cwd())
  const filePolicy = { mode, workspaceRoot }

  if (process.platform === 'darwin') {
    return ['sandbox-exec', ...seatbeltProfileArgs(filePolicy), '--', ...argv]
  }
  if (process.platform === 'linux') {
    const runner = selectLinuxRunner()
    if (runner === 'bwrap') return ['bwrap', ...bwrapProfileArgs(filePolicy), '--', ...argv]
    if (runner === 'landlock') return [launcherPath(), ...landlockProfileArgs(filePolicy), '--', ...argv]
  }
  if (process.platform === 'win32' && probeWindowsAclRunner()) {
    return confineArgvWindows(argv, filePolicy)
  }
  return argv
}

export function wrapBashInvocation(command, cwd, policy) {
  if (!policy || policy.mode === SANDBOX_MODE.OFF) {
    return { program: 'bash', args: ['-c', command], cwd }
  }
  const workspaceRoot = path.resolve(policy.workspaceRoot || cwd)
  const confined = confineArgv(['bash', '-c', command], { ...policy, workspaceRoot })
  return { program: confined[0], args: confined.slice(1), cwd }
}

export const DENIAL_SIGNATURES = {
  seatbelt: ['operation not permitted'],
  bwrap: ['read-only file system'],
  landlock: ['permission denied'],
  'windows-acl': ['windows-acl-run', 'access is denied'],
}

/** @param {string} stderr @param {string | null | undefined} runner */
export function isSandboxDenial(stderr, runner) {
  if (!stderr || !runner) return false
  const hay = stderr.toLowerCase()
  const sigs = DENIAL_SIGNATURES[runner] || []
  return sigs.some((s) => hay.includes(s.toLowerCase()))
}
