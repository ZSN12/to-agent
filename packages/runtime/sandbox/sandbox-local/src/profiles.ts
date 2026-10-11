/**
 * Internal platform-profile builders for the local sandbox provider.
 *
 * @module @taskweaver/dsh-sandbox-local/profiles
 */

import os from 'node:os'
import path from 'node:path'
import { readFileSync, statSync } from 'node:fs'
import { canonicalPath, writableRoots } from '@taskweaver/dsh-sandbox'
import type { SandboxPolicy } from '@taskweaver/dsh-sandbox'

/**
 * Build the bwrap profile arguments for one file-effect policy.
 * @param policy - file-effect policy to express as bwrap mounts.
 * @returns profile arguments before the trailing separator and command argv.
 */
export function bwrapProfileArgs(policy: SandboxPolicy): string[] {
  const args = ['--ro-bind', '/', '/', '--dev', '/dev', '--unshare-pid', '--proc', '/proc', '--die-with-parent']
  if (policy.mode === 'workspace-write') {
    args.push('--tmpfs', '/tmp')
    args.push('--bind', policy.workspaceRoot, policy.workspaceRoot)
  }
  return args
}

/** Quote one path as an SBPL string literal. */
function sbplString(path: string): string {
  return `"${path.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`)}"`
}

/** Resolve the Git directories whose hooks/config are security-sensitive for this workspace. */
function gitMetadataPaths(workspaceRoot: string): { dirs: string[]; pointerFile?: string } {
  const gitPath = path.join(workspaceRoot, '.git')
  try {
    if (statSync(gitPath).isDirectory()) return { dirs: [canonicalPath(gitPath)] }

    const pointer = readFileSync(gitPath, 'utf8').match(/^gitdir:\s*(.+)\s*$/im)
    if (!pointer) return { dirs: [canonicalPath(gitPath)], pointerFile: gitPath }

    const worktreeGitDir = canonicalPath(path.resolve(workspaceRoot, pointer[1]!))
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

/**
 * Build the sandbox-exec arguments and SBPL profile for one policy. The
 * writable roots come from the shared {@link writableRoots} helper (canonical,
 * deduplicated) so the Seatbelt grant and the in-process fs fence
 * (`@taskweaver/dsh-fs-sandbox`) can never drift apart.
 * @param policy - file-effect policy to express as an SBPL profile.
 * @returns sandbox-exec arguments before the trailing separator and command argv.
 */
export function seatbeltProfileArgs(policy: SandboxPolicy): string[] {
  const forms = ['(version 1)', '(allow default)', '(deny file-write*)', `(allow file-write* (literal ${sbplString('/dev/null')}))`]
  const roots = writableRoots(policy)
  if (roots.length > 0) {
    forms.push(`(allow file-write* ${roots.map(root => `(subpath ${sbplString(root)})`).join(' ')})`)
  }
  if (policy.mode === 'workspace-write') {
    const workspaceRoot = canonicalPath(policy.workspaceRoot)
    const metadata = gitMetadataPaths(workspaceRoot)
    const protectedPaths = metadata.dirs.flatMap(dir => [
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
  forms.push(`(deny file-read* ${privateReadRoots.map(root => `(subpath ${sbplString(root)})`).join(' ')})`)
  return ['-p', forms.join(' ')]
}
