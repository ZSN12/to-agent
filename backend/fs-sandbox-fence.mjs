/**
 * In-process file mutation fence — aligned with DSH @deepseek-ai/dsh-fs-sandbox.
 * Source: dsh-source/packages/fs/fs-sandbox/src/containment.ts
 */
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { canonicalPath, writableRoots } from './vendor/dsh-sandbox/roots.mjs'
import { resolveThroughSymlinks } from './security-path.mjs'

const MISSING_CODES = new Set(['ENOENT', 'ENOTDIR'])

function isMissing(error) {
  return MISSING_CODES.has(error?.code)
}

function comparablePath(p, caseSensitive) {
  return caseSensitive ? p : p.toLowerCase()
}

function isLexicallyUnder(p, root, caseSensitive) {
  const target = comparablePath(p, caseSensitive)
  const base = comparablePath(root, caseSensitive)
  if (target === base) return true
  const prefix = base.endsWith(path.sep) ? base : base + path.sep
  return target.startsWith(prefix)
}

async function statIfPresent(p) {
  try {
    return await stat(p, { bigint: true })
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino
}

/**
 * @param {string} targetPath canonical or resolvable path
 * @param {string} root canonical writable root
 */
export async function isPathUnder(targetPath, root, caseSensitive = process.platform !== 'win32') {
  const pathKey = canonicalPath(targetPath)
  const rootKey = canonicalPath(root)
  if (isLexicallyUnder(pathKey, rootKey, caseSensitive)) return true

  const rootInfo = await statIfPresent(rootKey)
  if (!rootInfo) return false

  let ancestor = pathKey
  while (true) {
    const ancestorInfo = await statIfPresent(ancestor)
    if (ancestorInfo && sameIdentity(ancestorInfo, rootInfo)) return true
    const parent = path.dirname(ancestor)
    if (parent === ancestor) return false
    ancestor = parent
  }
}

/**
 * @param {{ mode: string, workspaceRoot: string }} filePolicy
 * @param {string} workspacePath
 * @param {string | null} candidate tool path from input
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
export async function checkFileMutationAllowed(filePolicy, workspacePath, candidate) {
  if (!filePolicy || filePolicy.mode === 'off') return { allowed: true }
  if (filePolicy.mode === 'read-only') {
    return {
      allowed: false,
      reason: '当前文件沙箱策略为 read-only：禁止 write/edit 修改任何文件（与 DSH fs-sandbox 一致）',
    }
  }
  if (!candidate) return { allowed: true }

  const workspaceRoot = path.resolve(filePolicy.workspaceRoot || workspacePath)
  const target = path.isAbsolute(candidate) ? candidate : path.resolve(workspaceRoot, candidate)
  let canonicalTarget
  try {
    canonicalTarget = canonicalPath(await realpath(target))
  } catch (error) {
    if (!isMissing(error)) {
      // 解析失败时无法验证真实位置，fail-closed：拒绝并交给上层升级提示
      return {
        allowed: false,
        reason: `文件沙箱 workspace-write：无法解析目标路径的真实位置（${error?.code ?? error?.message ?? 'unknown'}），已拒绝写入。目标：${canonicalPath(target)}`,
      }
    }
    // 末段尚未创建：仅按已存在父级解析真实路径，防止中间符号链接目录逃逸
    try {
      canonicalTarget = canonicalPath(await resolveThroughSymlinks(target))
    } catch (resolveError) {
      return {
        allowed: false,
        reason: `文件沙箱 workspace-write：无法解析目标路径的父级真实路径（${resolveError?.code ?? resolveError?.message ?? 'unknown'}），已拒绝写入。目标：${canonicalPath(target)}`,
      }
    }
  }

  const roots = writableRoots({ mode: 'workspace-write', workspaceRoot })
  for (const root of roots) {
    if (await isPathUnder(canonicalTarget, root)) return { allowed: true }
  }
  return {
    allowed: false,
    reason: `文件沙箱 workspace-write：目标路径不在可写根目录内（工作区或平台临时目录）。目标：${canonicalTarget}`,
  }
}
