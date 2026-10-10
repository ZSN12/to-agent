import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { findExecutableInPath } from '../../backend/env-service.mjs'

/** electron-builder extraResources directory name for the bundled Node binary. */
export const HOST_NODE_RESOURCE_DIR = 'host-node'

/** Matches root package.json engines.node (>=22.18). */
export const MIN_HOST_NODE_VERSION = [22, 18, 0]

function parseSemver(version) {
  const match = String(version).trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function compareSemver(left, right) {
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return 0
}

function readNodeRuntimeVersion(executable) {
  try {
    return execFileSync(executable, ['-p', 'process.versions.node'], {
      encoding: 'utf8',
      timeout: 10_000,
    }).trim()
  } catch {
    return null
  }
}

function assertUsableHostNode(executable, label) {
  const resolved = path.resolve(executable)
  if (!fs.existsSync(resolved)) {
    throw new Error(`${label} 指定的 Node 不存在：${resolved}`)
  }
  const version = readNodeRuntimeVersion(resolved)
  const parsed = parseSemver(version)
  if (!parsed || compareSemver(parsed, MIN_HOST_NODE_VERSION) < 0) {
    throw new Error(
      `${label} Node 版本过低（${version ?? '未知'}），Z Host 需要 >= ${MIN_HOST_NODE_VERSION.join('.')}`,
    )
  }
  return resolved
}

/**
 * @param {string | null | undefined} resourcesPath
 * @returns {string | null}
 */
export function resolveBundledHostNodeExecutable(resourcesPath) {
  if (!resourcesPath) return null
  const candidates = [
    path.join(resourcesPath, HOST_NODE_RESOURCE_DIR, 'bin', 'node'),
  ]
  if (process.platform === 'darwin') {
    candidates.push(path.join(resourcesPath, HOST_NODE_RESOURCE_DIR, `darwin-${process.arch}`, 'bin', 'node'))
  }
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    try {
      return assertUsableHostNode(candidate, '内置')
    } catch {
      continue
    }
  }
  return null
}

/**
 * Resolve the Node binary used to spawn the embedded Z Host (and related headless runners).
 * @param {{ env?: NodeJS.ProcessEnv, resourcesPath?: string | null, isPackaged?: boolean }} [options]
 * @returns {{ executable: string, source: 'env' | 'bundled' | 'path' }}
 */
export function resolveHostNodeExecutable({
  env = process.env,
  resourcesPath = env.TASKWEAVER_RESOURCES_PATH ?? null,
  isPackaged = env.TASKWEAVER_PACKAGED === '1' || env.TASKWEAVER_PACKAGED === 'true',
} = {}) {
  const override = env.TASKWEAVER_HOST_NODE
  if (typeof override === 'string' && override.trim()) {
    return {
      executable: assertUsableHostNode(override.trim(), 'TASKWEAVER_HOST_NODE'),
      source: 'env',
    }
  }
  if (isPackaged) {
    const bundled = resolveBundledHostNodeExecutable(resourcesPath)
    if (bundled) return { executable: bundled, source: 'bundled' }
    throw new Error(
      'TaskWeaver 安装包缺少内置 Node（Contents/Resources/host-node）。请重新构建并安装应用，'
      + '或设置环境变量 TASKWEAVER_HOST_NODE 指向 Node 22.18+。',
    )
  }
  const fromPath = findExecutableInPath('node', env.PATH)
  if (fromPath) {
    return { executable: assertUsableHostNode(fromPath, 'PATH'), source: 'path' }
  }
  throw new Error(
    '未找到可用于 Z Host 的 Node（需要 >= 22.18）。请安装 Node（如 brew install node）'
    + '或设置 TASKWEAVER_HOST_NODE。',
  )
}
