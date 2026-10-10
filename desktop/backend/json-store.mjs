import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

// Atomic rename prevents partial files, but not lost read-modify-write updates.
// Share admission order across instances for the same file in this process.
// This is not a cross-process filesystem lock.
const mutationQueues = new Map()
let corruptionHandler = null

export function setJsonStoreCorruptionHandler(handler) {
  if (handler !== null && typeof handler !== 'function') {
    throw new TypeError('json-store corruption handler must be a function or null')
  }
  corruptionHandler = handler
}

function notifyCorruption(details) {
  console.error('[json-store] invalid JSON was quarantined; defaults will be used', details.filePath, details.quarantinePath)
  try {
    const result = corruptionHandler?.(details)
    if (result && typeof result.then === 'function') {
      void result.catch((error) => console.warn('[json-store] recovery notice failed:', error))
    }
  } catch (error) {
    console.warn('[json-store] recovery notice failed:', error)
  }
}

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
    let raw
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        return typeof defaultValue === 'function' ? defaultValue() : defaultValue
      }
      throw error
    }

    try {
      return JSON.parse(raw)
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      const quarantinePath = `${filePath}.corrupt-${Date.now()}-${randomUUID()}`
      await fs.rename(filePath, quarantinePath)
      notifyCorruption({ filePath, quarantinePath })
      return typeof defaultValue === 'function' ? defaultValue() : defaultValue
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
    read: () => enqueue(() => readFile()),
    write: value => enqueue(() => writeFile(value)),
    update,
  }
}
