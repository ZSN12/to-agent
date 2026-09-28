/**
 * Adapted from DeepSeek Harness @deepseek-ai/dsh-sandbox (MIT).
 * Source: dsh-source/packages/sandbox/sandbox/src/roots.ts
 */
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'

export function canonicalPath(path) {
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

/** @param {{ mode: 'read-only' | 'workspace-write', workspaceRoot: string }} policy */
export function writableRoots(policy) {
  if (policy.mode !== 'workspace-write') return []
  return [...new Set([policy.workspaceRoot, '/tmp', tmpdir()].map(canonicalPath))]
}
