import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export function createJsonStore(filePath, defaultValue) {
  async function read() {
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      return JSON.parse(raw)
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        return typeof defaultValue === 'function' ? defaultValue() : defaultValue
      }
      throw error
    }
  }

  async function write(value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await fs.rename(temporaryPath, filePath)
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => {})
      throw error
    }
    return value
  }

  async function update(mutator) {
    const current = await read()
    const next = await mutator(current)
    await write(next)
    return next
  }

  return { filePath, read, write, update }
}
