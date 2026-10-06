import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

// Atomic rename prevents partial files, but not lost read-modify-write updates.
// Share admission order across instances for the same file in this process.
// This is not a cross-process filesystem lock.
const mutationQueues = new Map()

export function createJsonStore(filePath, defaultValue) {
  const queueKey = path.resolve(filePath)
  function enqueue(operation) {
    const previous = mutationQueues.get(queueKey) ?? Promise.resolve()
    const result = previous.then(operation)
    const tail = result.catch(() => {})
    mutationQueues.set(queueKey, tail)
    void tail.then(() => {
      if (mutationQueues.get(queueKey) === tail) mutationQueues.delete(queueKey)
    })
    return result
  }

  async function readFile() {
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

  async function writeFile(value) {
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
    return enqueue(async () => {
      const current = await readFile()
      const next = await mutator(current)
      await writeFile(next)
      return next
    })
  }

  return {
    filePath,
    async read() { await mutationQueues.get(queueKey); return readFile() },
    write: value => enqueue(() => writeFile(value)),
    update,
  }
}
