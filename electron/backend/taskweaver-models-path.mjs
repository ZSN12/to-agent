import fs from 'node:fs/promises'
import path from 'node:path'

const MODELS_REL = path.join('taskweaver', 'models.json')

/** Canonical pi `models.json` location (毕设设计方案). */
export function resolveTaskWeaverModelsPath(userDataPath) {
  return path.join(userDataPath, MODELS_REL)
}

export function resolveLegacyModelsPath(userDataPath) {
  return path.join(userDataPath, 'models.json')
}

/**
 * One-time migration: `userData/models.json` → `userData/taskweaver/models.json`.
 * @returns {{ migrated: boolean, modelsPath: string }}
 */
export async function migrateLegacyModelsJson(userDataPath) {
  const modelsPath = resolveTaskWeaverModelsPath(userDataPath)
  const legacyPath = resolveLegacyModelsPath(userDataPath)
  try {
    await fs.access(modelsPath)
    return { migrated: false, modelsPath }
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }
  try {
    await fs.access(legacyPath)
  } catch (err) {
    if (err?.code === 'ENOENT') return { migrated: false, modelsPath }
    throw err
  }
  await fs.mkdir(path.dirname(modelsPath), { recursive: true })
  await fs.rename(legacyPath, modelsPath)
  return { migrated: true, modelsPath }
}
