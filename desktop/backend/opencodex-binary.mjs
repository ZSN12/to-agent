import fs from 'node:fs'
import path from 'node:path'
import { TASKWEAVER_OPENCODEX_PACKAGE } from './opencodex-package-root.mjs'

/** @type {{ appPath?: string, resourcesPath?: string, isPackaged?: boolean } | null} */
let runtimeContext = null

export function setOcxRuntimeContext(context) {
  runtimeContext = context && typeof context === 'object' ? context : null
}

/**
 * Resolve `ocx` executable: bundled in app → vendored local source.
 * 彻底禁止回退到系统全局 PATH 或 ~/.local/bin，杜绝外部上游版本污染。
 * @returns {string}
 */
export function resolveOcxExecutable() {
  const candidates = []
  const { appPath, resourcesPath, isPackaged } = runtimeContext ?? {}

  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'opencodex', 'ocx'))
    candidates.push(path.join(resourcesPath, 'opencodex', 'bin', 'ocx'))
    candidates.push(path.join(
      resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      ...TASKWEAVER_OPENCODEX_PACKAGE.split('/'),
      'bin',
      'ocx.mjs',
    ))
  }
  if (appPath) {
    const pkgRoot = path.join(appPath, 'node_modules', ...TASKWEAVER_OPENCODEX_PACKAGE.split('/'))
    candidates.push(path.join(pkgRoot, 'bin', 'ocx.mjs'))
    candidates.push(path.join(pkgRoot, 'bin', 'ocx'))
    candidates.push(path.join(appPath, 'vendor', 'opencodex', 'bin', 'ocx.mjs'))
    if (!isPackaged) {
      candidates.push(path.join(pkgRoot, 'dist', 'cli.js'))
    }
  }

  // 开发环境根目录直接回退到本地 vendor/opencodex 源码
  candidates.push(path.resolve(process.cwd(), 'vendor', 'opencodex', 'bin', 'ocx.mjs'))

  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate
    } catch {
      // ignore
    }
  }

  // 如果本地源码均未找到，返回明确的本地缺失标识而不是任意系统命令
  return path.resolve(process.cwd(), 'vendor', 'opencodex', 'bin', 'ocx.mjs')
}

/**
 * Resolve the real Bun binary used by the external OpenCodex CLI process.
 * Electron's ASAR loader is unavailable to that process, so packaged builds
 * ship Bun as an extra resource and pass it through OPENCODEX_BUN_PATH.
 */
export function resolveOcxBunExecutable() {
  const candidates = []
  const { appPath, resourcesPath } = runtimeContext ?? {}
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'opencodex-runtime', 'bun.exe'))
    candidates.push(path.join(resourcesPath, 'opencodex-runtime', 'bun'))
    candidates.push(path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'bun', 'bin', 'bun.exe'))
  }
  if (appPath) {
    candidates.push(path.join(appPath, 'node_modules', 'bun', 'bin', 'bun.exe'))
    candidates.push(path.join(appPath, 'node_modules', 'bun', 'bin', 'bun'))
  }
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).size >= 1_000_000) return candidate
    } catch {
      // Ignore missing, inaccessible, or placeholder Bun packages.
    }
  }
  return null
}

export function isTaskWeaverOcxPath(executablePath) {
  const normalized = String(executablePath ?? '').replace(/\\/g, '/').toLowerCase()
  return normalized.includes('/@taskweaver/opencodex/')
    || normalized.includes('/vendor/opencodex/')
    || /\/resources\/opencodex\/(?:bin\/)?ocx(?:\.mjs)?$/.test(normalized)
}

/** composer-2.5 工具续写必须走 userMessageAction（ocx adapter 合入后的版本）。 */
export const OCX_COMPOSER_CONTINUATION_MIN_VERSION = '2.79.0'

export function parseOcxSemver(text) {
  const match = String(text ?? '').match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), raw: `${match[1]}.${match[2]}.${match[3]}` }
}

export function compareOcxSemver(a, b) {
  const left = typeof a === 'string' ? parseOcxSemver(a) : a
  const right = typeof b === 'string' ? parseOcxSemver(b) : b
  if (!left || !right) return 0
  return (left.major - right.major) || (left.minor - right.minor) || (left.patch - right.patch)
}

export function ocxSupportsComposerToolContinuation(versionText) {
  const parsed = parseOcxSemver(versionText)
  if (!parsed || compareOcxSemver(parsed, OCX_COMPOSER_CONTINUATION_MIN_VERSION) < 0) return false
  // The upstream 2.79.0 daemon has Composer continuation, but not TaskWeaver's
  // bare-tool-name alias patch. Accept only a proxy built from our fork.
  const match = String(versionText ?? '').match(/\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?/)
  return Boolean(match?.[1]?.toLowerCase().startsWith('-taskweaver'))
}
