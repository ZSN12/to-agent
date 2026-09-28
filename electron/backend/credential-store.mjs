import fs from 'node:fs/promises'
import path from 'node:path'

/** TaskWeaver-owned encrypted credential store implementing the runtime contract. */
export function createCredentialStore({ filePath, safeStorage }) {
  let queue = Promise.resolve()

  async function readAll() {
    try {
      const encrypted = await fs.readFile(filePath, 'utf8')
      if (!safeStorage?.isEncryptionAvailable?.()) throw new Error('系统安全存储当前不可用，无法读取模型凭据')
      const payload = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      return JSON.parse(payload)
    } catch (error) {
      if (error?.code === 'ENOENT') return {}
      throw error
    }
  }

  async function writeAll(credentials) {
    if (!safeStorage?.isEncryptionAvailable?.()) throw new Error('系统安全存储当前不可用，未保存模型凭据')
    const encrypted = safeStorage.encryptString(JSON.stringify(credentials)).toString('base64')
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
    const temporary = `${filePath}.${process.pid}.tmp`
    await fs.writeFile(temporary, `${encrypted}\n`, { encoding: 'utf8', mode: 0o600 })
    await fs.rename(temporary, filePath)
    await fs.chmod(filePath, 0o600)
  }

  function serialize(operation) {
    const next = queue.then(operation, operation)
    queue = next.catch(() => {})
    return next
  }

  return {
    async read(providerId) {
      const all = await readAll()
      return all[providerId]
    },
    async list() {
      const all = await readAll()
      return Object.entries(all).map(([providerId, credential]) => ({ providerId, type: credential.type }))
    },
    async modify(providerId, fn) {
      return serialize(async () => {
        const all = await readAll()
        const next = await fn(all[providerId])
        if (next !== undefined) {
          all[providerId] = next
          await writeAll(all)
          return next
        }
        return all[providerId]
      })
    },
    async delete(providerId) {
      return serialize(async () => {
        const all = await readAll()
        delete all[providerId]
        await writeAll(all)
      })
    },
  }
}
