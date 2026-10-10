/**
 * Adapted from DeepSeek Harness @deepseek-ai/dsh-sandbox-local (MIT).
 * Source: dsh-source/packages/sandbox/sandbox-local/src/profiles.ts
 */
import { writableRoots } from './roots.mjs'
import { grantArgs as landlockGrantArgs } from './landlock.mjs'

/** @param {{ mode: 'read-only' | 'workspace-write', workspaceRoot: string }} policy */
export function bwrapProfileArgs(policy) {
  const args = ['--ro-bind', '/', '/', '--dev', '/dev', '--unshare-pid', '--proc', '/proc', '--die-with-parent']
  if (policy.mode === 'workspace-write') {
    args.push('--tmpfs', '/tmp')
    args.push('--bind', policy.workspaceRoot, policy.workspaceRoot)
  }
  return args
}

function sbplString(path) {
  return `"${path.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

/** @param {{ mode: 'read-only' | 'workspace-write', workspaceRoot: string }} policy */
export function seatbeltProfileArgs(policy) {
  const forms = ['(version 1)', '(allow default)', '(deny file-write*)', `(allow file-write* (literal ${sbplString('/dev/null')}))`]
  const roots = writableRoots(policy)
  if (roots.length > 0) {
    forms.push(`(allow file-write* ${roots.map((root) => `(subpath ${sbplString(root)})`).join(' ')})`)
  }
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
