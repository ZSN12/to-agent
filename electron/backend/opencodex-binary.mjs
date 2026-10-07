import fs from 'node:fs'
import path from 'node:path'

/** @type {{ appPath?: string, resourcesPath?: string, isPackaged?: boolean } | null} */
let runtimeContext = null

export function setOcxRuntimeContext(context) {
  runtimeContext = context && typeof context === 'object' ? context : null
}

/**
 * Resolve `ocx` executable: bundled in app → npm optional dep → ~/.local/bin → PATH.
 * @returns {string}
 */
export function resolveOcxExecutable() {
  const candidates = []
  const { appPath, resourcesPath, isPackaged } = runtimeContext ?? {}

  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'opencodex', 'ocx'))
    candidates.push(path.join(resourcesPath, 'opencodex', 'bin', 'ocx'))
  }
  if (appPath) {
    candidates.push(path.join(appPath, 'node_modules', '.bin', 'ocx'))
    const pkgRoot = path.join(appPath, 'node_modules', '@bitkyc08', 'opencodex')
    candidates.push(path.join(pkgRoot, 'bin', 'ocx'))
    if (!isPackaged) {
      candidates.push(path.join(appPath, 'node_modules', '@bitkyc08', 'opencodex', 'dist', 'cli.js'))
    }
  }

  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (home) {
    candidates.push(path.join(home, '.local', 'bin', 'ocx'))
  }

  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate
    } catch {
      // ignore
    }
  }
  return 'ocx'
}

export function isOcxBundled() {
  const resolved = resolveOcxExecutable()
  return resolved !== 'ocx' && path.isAbsolute(resolved)
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
  if (!parsed) return false
  return compareOcxSemver(parsed, OCX_COMPOSER_CONTINUATION_MIN_VERSION) >= 0
}
