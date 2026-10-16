/**
 * Adapted from DeepSeek Harness @deepseek-ai/dsh-sandbox-local (MIT).
 * Source: dsh-source/packages/sandbox/sandbox-local/src/profiles.ts
 */
import os from 'node:os'
import path from 'node:path'
import { readFileSync, statSync } from 'node:fs'
import { canonicalPath, writableRoots } from './roots.mjs'
import { grantArgs as landlockGrantArgs } from './landlock.mjs'

/** @param {{ mode: 'read-only' | 'workspace-write', workspaceRoot: string }} policy */
export function bwrapProfileArgs(policy) {
  const args = ['--ro-bind', '/', '/', '--dev', '/dev', '--unshare-pid']
  if (policy.mode === 'workspace-write') args.push('--unshare-net')
  args.push('--proc', '/proc', '--die-with-parent')
  if (policy.mode === 'workspace-write') {
    args.push('--tmpfs', '/tmp')
    args.push('--bind', policy.workspaceRoot, policy.workspaceRoot)
  }
  return args
}

function sbplString(path) {
  return `"${path.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

/** Resolve the Git directories whose hooks/config are security-sensitive for this workspace. */
function gitMetadataPaths(workspaceRoot) {
  const gitPath = path.join(workspaceRoot, '.git')
  try {
    if (statSync(gitPath).isDirectory()) return { dirs: [canonicalPath(gitPath)] }

    const pointer = readFileSync(gitPath, 'utf8').match(/^gitdir:\s*(.+)\s*$/im)
    if (!pointer) return { dirs: [canonicalPath(gitPath)], pointerFile: gitPath }

    const worktreeGitDir = canonicalPath(path.resolve(workspaceRoot, pointer[1]))
    const dirs = [worktreeGitDir]
    try {
      const commonDir = readFileSync(path.join(worktreeGitDir, 'commondir'), 'utf8').trim()
      if (commonDir) dirs.push(canonicalPath(path.resolve(worktreeGitDir, commonDir)))
    } catch {
      // A regular repository or incomplete worktree has no commondir file.
    }
    return { dirs: [...new Set(dirs)], pointerFile: gitPath }
  } catch {
    // Keep the default paths protected for a not-yet-created repository.
    return { dirs: [canonicalPath(gitPath)] }
  }
}

/** @param {{ mode: 'read-only' | 'workspace-write', workspaceRoot: string }} policy */
export function seatbeltProfileArgs(policy) {
  const forms = ['(version 1)', '(allow default)']
  if (policy.mode === 'workspace-write') {
    forms.push('(deny network*)', '(allow network* (remote unix-socket))')
  }
  forms.push('(deny file-write*)', `(allow file-write* (literal ${sbplString('/dev/null')}))`)
  const roots = writableRoots(policy)
  if (roots.length > 0) {
    forms.push(`(allow file-write* ${roots.map((root) => `(subpath ${sbplString(root)})`).join(' ')})`)
  }
  if (policy.mode === 'workspace-write') {
    const workspaceRoot = canonicalPath(policy.workspaceRoot)
    const metadata = gitMetadataPaths(workspaceRoot)
    const protectedPaths = metadata.dirs.flatMap((dir) => [
      `(subpath ${sbplString(path.join(dir, 'hooks'))})`,
      `(literal ${sbplString(path.join(dir, 'config'))})`,
      `(literal ${sbplString(path.join(dir, 'config.worktree'))})`,
    ])
    if (metadata.pointerFile) protectedPaths.push(`(literal ${sbplString(metadata.pointerFile)})`)
    forms.push(`(deny file-write* ${protectedPaths.join(' ')})`)
  }
  const privateReadRoots = [
    path.join(os.homedir(), '.ssh'),
    path.join(os.homedir(), '.aws'),
    path.join(os.homedir(), '.config', 'gh'),
    path.join(os.homedir(), 'Library', 'Keychains'),
  ].map(canonicalPath)
  forms.push(`(deny file-read* ${privateReadRoots.map((root) => `(subpath ${sbplString(root)})`).join(' ')})`)
  return ['-p', forms.join(' ')]
}

/** @param {{ mode: 'read-only' | 'workspace-write', workspaceRoot: string }} policy */
export function landlockProfileArgs(policy) {
  const readWrite = ['/dev/null']
  if (policy.mode === 'workspace-write') {
    readWrite.push('/tmp', policy.workspaceRoot)
  }
  return landlockGrantArgs({ readOnly: ['/'], readWrite })
}
