import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { resolveTaskWeaverModelsPath } from '../taskweaver-models-path.mjs'

export async function writeExportSnapshot(userDataPath, exportDoc) {
  const target = `${userDataPath}/opencodex-export.json`
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  await fs.mkdir(userDataPath, { recursive: true })
  try {
    await fs.writeFile(temporary, `${JSON.stringify(exportDoc, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await fs.rename(temporary, target)
    await fs.chmod(target, 0o600).catch(() => {})
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    throw error
  }
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
