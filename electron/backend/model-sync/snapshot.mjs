import fs from 'node:fs/promises'
import { resolveTaskWeaverModelsPath } from '../taskweaver-models-path.mjs'

export async function writeExportSnapshot(userDataPath, exportDoc) {
  const target = `${userDataPath}/opencodex-export.json`
  await fs.writeFile(target, `${JSON.stringify(exportDoc, null, 2)}\n`, 'utf8')
  return target
}

/** @deprecated */
export const writeOpenCodexExportSnapshot = writeExportSnapshot

export async function readPreviouslyExported(userDataPath, modelsPath = resolveTaskWeaverModelsPath(userDataPath)) {
  try {
    const raw = await fs.readFile(`${userDataPath}/opencodex-export.json`, 'utf8')
    const doc = JSON.parse(raw)
    const block = doc?.providers?.opencodex
    if (block && typeof block === 'object' && Array.isArray(block.models) && block.models.length > 0) {
      return true
    }
  } catch {
    // no snapshot
  }
  try {
    const raw = await fs.readFile(modelsPath, 'utf8')
    const doc = JSON.parse(raw)
    const block = doc?.providers?.opencodex
    if (block && typeof block === 'object' && Array.isArray(block.models) && block.models.length > 0) {
      return true
    }
  } catch {
    // missing models.json
  }
  return false
}
