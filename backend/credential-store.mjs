import fs from 'node:fs/promises'
import path from 'node:path'
import { isShellBackend } from './platform/runtime-mode.mjs'

const INSECURE_STORE_PREFIX = 'tw-b64:'
let warnedInsecureCredentialStore = false

function isPackagedBuild() {
  return process.env.TASKWEAVER_PACKAGED === '1' || process.env.TASKWEAVER_PACKAGED === 'true'
}

function looksLikeChromiumKeychainBlob(trimmed) {
  try {
    const bytes = Buffer.from(String(trimmed).trim(), 'base64')
    return bytes.length >= 3 && bytes[0] === 0x76 && bytes[1] === 0x31 && bytes[2] === 0x30
  } catch {
    return false
  }
}

/** Dev smoke only, unsigned macOS .app, or native shell backend (no Chromium safeStorage). */
function allowInsecureCredentialStore(safeStorage) {
  if (isShellBackend()) return true
  if (process.env.TASKWEAVER_INSECURE_CREDENTIAL_STORE === '1') return true
  if (process.platform !== 'darwin' || !isPackagedBuild()) return false
  if (safeStorage?.isEncryptionAvailable?.()) return false
  if (!warnedInsecureCredentialStore) {
    warnedInsecureCredentialStore = true
    console.warn('[TaskWeaver] 系统钥匙串加密不可用，自定义提供方凭据将使用本机文件编码保存（仅限未签名的本地安装包）。')
  }
  return true
}

function encodeFilePayload(credentials) {
  const json = JSON.stringify(credentials)
  return `${INSECURE_STORE_PREFIX}${Buffer.from(json, 'utf8').toString('base64')}`
}

function decodeFilePayload(trimmed) {
  if (!trimmed.startsWith(INSECURE_STORE_PREFIX)) {
    throw new Error('无法解密旧版钥匙串凭据；请重新保存 API 密钥。')
  }
  return JSON.parse(Buffer.from(trimmed.slice(INSECURE_STORE_PREFIX.length), 'base64').toString('utf8'))
}

/** TaskWeaver-owned encrypted credential store implementing the runtime contract. */
export function createCredentialStore({ filePath, safeStorage }) {
  let queue = Promise.resolve()

  function encodePayload(credentials) {
    if (isShellBackend() || allowInsecureCredentialStore(safeStorage) && !safeStorage?.isEncryptionAvailable?.()) {
      return encodeFilePayload(credentials)
    }
    if (safeStorage?.isEncryptionAvailable?.()) {
      const json = JSON.stringify(credentials)
      return safeStorage.encryptString(json).toString('base64')
    }
    throw new Error('系统安全存储当前不可用，未保存模型凭据')
  }

  function decodePayload(raw) {
    const trimmed = String(raw ?? '').trim()
    if (isShellBackend()) {
      if (trimmed.startsWith(INSECURE_STORE_PREFIX)) return decodeFilePayload(trimmed)
      if (looksLikeChromiumKeychainBlob(trimmed)) {
        throw new Error('无法解密旧版钥匙串凭据；请在「模型与来源」重新保存 API 密钥。')
      }
      throw new Error('Shell 后端无法读取当前 credentials.enc 格式；请重新保存模型密钥或删除该文件。')
    }
    if (trimmed.startsWith(INSECURE_STORE_PREFIX)) {
      if (!allowInsecureCredentialStore(safeStorage)) {
        throw new Error('系统安全存储当前不可用，无法读取模型凭据')
      }
      return decodeFilePayload(trimmed)
    }
    if (!safeStorage?.isEncryptionAvailable?.()) {
      if (allowInsecureCredentialStore(safeStorage)) {
        throw new Error('无法解密旧版钥匙串凭据；请在「模型与来源」重新保存 API 密钥，或删除本机 credentials.enc 后重试。')
      }
      throw new Error('系统安全存储当前不可用，无法读取模型凭据')
    }
    return JSON.parse(safeStorage.decryptString(Buffer.from(trimmed, 'base64')))
  }

  async function readAll() {
    try {
      const encrypted = await fs.readFile(filePath, 'utf8')
      return decodePayload(encrypted)
    } catch (error) {
      if (error?.code === 'ENOENT') return {}
      if (allowInsecureCredentialStore(safeStorage) && /无法解密旧版钥匙串|Shell 后端无法读取|安全存储当前不可用/.test(String(error?.message ?? ''))) {
        console.warn('[TaskWeaver] 跳过无法解密的 credentials.enc，请重新配置模型密钥。')
        return {}
      }
      throw error
    }
  }

  async function writeAll(credentials, retries = 2) {
    const encrypted = encodePayload(credentials)
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
    const temporary = `${filePath}.${process.pid}.tmp`

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await fs.writeFile(temporary, `${encrypted}\n`, { encoding: 'utf8', mode: 0o600 })
        await fs.rename(temporary, filePath)
        await fs.chmod(filePath, 0o600)
        return
      } catch (error) {
        const isTransient = error?.code === 'EBUSY' || error?.code === 'EAGAIN' || error?.code === 'EPERM'
        const isLastAttempt = attempt === retries

        try {
          await fs.unlink(temporary)
        } catch {}

        if (isTransient && !isLastAttempt) {
          await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
          continue
        }

        throw new Error(`无法保存凭据: ${error?.message || String(error)}${isTransient ? ' (重试已耗尽)' : ''}`)
      }
    }
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
