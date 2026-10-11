import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

/** Replace a JSON file atomically; a failed write leaves the previous file intact. */
export async function writeJsonAtomically(filePath, document, {
  mode = 0o600,
  fsOperations = fs,
} = {}) {
  const temporaryPath = `${filePath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`
  await fsOperations.mkdir(path.dirname(filePath), { recursive: true })
  try {
    await fsOperations.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: 'utf8',
      mode,
      flag: 'wx',
    })
    await fsOperations.rename(temporaryPath, filePath)
  } catch (error) {
    await fsOperations.rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}
