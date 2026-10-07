import fs from 'node:fs/promises'
import { ensureOpenCodexProxyReachable, readOpenCodexBaseUrlFromModelsJson } from './opencodex-health.mjs'
import { isOcxBundled, resolveOcxExecutable } from './opencodex-binary.mjs'
import { resolveTaskWeaverModelsPath } from './taskweaver-models-path.mjs'

/**
 * @param {{ models?: { key?: string }[], candidateModels?: { key?: string }[] }} catalog
 */
export function catalogReferencesOpenCodex(catalog) {
  const keys = [
    ...(catalog?.models ?? []).map((row) => row?.key),
    ...(catalog?.candidateModels ?? []).map((row) => row?.key),
  ].filter(Boolean)
  return keys.some((key) => String(key).startsWith('opencodex/'))
}

/**
 * Start or verify local OpenCodex when the user already uses opencodex models.
 * Does not install ocx — use models:scanLocal / optional npm bundle for that.
 */
export async function autoStartOpenCodexIfNeeded({
  userDataPath,
  catalog,
  ensureProxy = ensureOpenCodexProxyReachable,
}) {
  const modelsPath = resolveTaskWeaverModelsPath(userDataPath)
  const baseUrl = await readOpenCodexBaseUrlFromModelsJson(modelsPath)
  const usesOpenCodex = catalogReferencesOpenCodex(catalog) || Boolean(baseUrl)
  if (!usesOpenCodex) {
    return { started: false, reason: 'no-opencodex-models' }
  }
  const ocx = resolveOcxExecutable()
  const result = await ensureProxy(modelsPath, { upgradeGlobalIfStale: false })
  return {
    started: result.up,
    baseUrl: result.baseUrl,
    ocx,
    bundled: isOcxBundled(),
    composerContinuationOk: result.composerContinuationOk,
    proxyVersion: result.proxyVersion,
    reason: result.up
      ? (result.composerContinuationOk ? 'proxy-ready' : 'proxy-stale-version')
      : 'proxy-unreachable',
  }
}

/**
 * @param {string} userDataPath
 */
export async function writeOpenCodexExportSnapshot(userDataPath, exportDoc) {
  const target = `${userDataPath}/opencodex-export.json`
  await fs.writeFile(target, `${JSON.stringify(exportDoc, null, 2)}\n`, 'utf8')
  return target
}
