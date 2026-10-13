import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { formatKeychainRef, isKeychainRef, parseKeychainRef } from './secret-store.mjs'
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
export function createCredentialStore({ filePath, safeStorage, secrets = null }) {
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
    if (secrets) return readKeychainAll()
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

  async function readKeychainAll() {
    let raw
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return {}
      throw error
    }

    const trimmed = raw.trim()
    if (trimmed.startsWith(INSECURE_STORE_PREFIX)) {
      const legacy = decodeFilePayload(trimmed)
      await writeKeychainAll(legacy)
      return legacy
    }
    if (looksLikeChromiumKeychainBlob(trimmed)) {
      const archivePath = `${filePath}.chromium-legacy-${randomUUID()}`
      try {
        await fs.rename(filePath, archivePath)
        await fs.chmod(archivePath, 0o600)
        console.warn('[TaskWeaver] 已归档无法由原生后端解密的旧版 Chromium 凭据；请在「模型与来源」重新保存模型密钥。')
        return {}
      } catch (error) {
        if (error?.code === 'ENOENT') return {}
        throw new Error(`无法归档旧版 Chromium 凭据，原文件已保留：${error?.message || String(error)}`)
      }
    }

    let refs
    try {
      refs = JSON.parse(trimmed)
    } catch {
      throw new Error('凭据文件不是可识别的 Keychain 索引；原文件已保留，请重新保存模型密钥。')
    }
    if (!refs || typeof refs !== 'object' || Array.isArray(refs)) {
      throw new Error('凭据 Keychain 索引格式无效；原文件已保留。')
    }

    const credentials = {}
    for (const [providerId, ref] of Object.entries(refs)) {
      if (!isKeychainRef(ref)) {
        throw new Error(`提供方 ${providerId} 的凭据没有 Keychain 引用；原文件已保留，请重新保存该模型密钥。`)
      }
      const serialized = await secrets.get(parseKeychainRef(ref))
      if (typeof serialized !== 'string') {
        throw new Error(`Keychain 中缺少提供方 ${providerId} 的凭据；原文件已保留，请重新保存该模型密钥。`)
      }
      try {
        credentials[providerId] = JSON.parse(serialized)
      } catch {
        throw new Error(`提供方 ${providerId} 的 Keychain 凭据格式无效；原文件已保留。`)
      }
    }
    return credentials
  }

  async function readKeychainProvider(providerId) {
    let raw
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return undefined
      throw error
    }

    const trimmed = raw.trim()
    if (trimmed.startsWith(INSECURE_STORE_PREFIX) || looksLikeChromiumKeychainBlob(trimmed)) {
      const migrated = await readKeychainAll()
      return migrated[providerId]
    }

    let refs
    try {
      refs = JSON.parse(trimmed)
    } catch {
      throw new Error('凭据文件不是可识别的 Keychain 索引；原文件已保留，请重新保存模型密钥。')
    }
    if (!refs || typeof refs !== 'object' || Array.isArray(refs)) {
      throw new Error('凭据 Keychain 索引格式无效；原文件已保留。')
    }

    if (!Object.hasOwn(refs, providerId)) return undefined
    const ref = refs[providerId]
    if (!isKeychainRef(ref)) {
      throw new Error(`提供方 ${providerId} 的凭据没有 Keychain 引用；原文件已保留，请重新保存该模型密钥。`)
    }
    const serialized = await secrets.get(parseKeychainRef(ref))
    if (typeof serialized !== 'string') {
      throw new Error(`Keychain 中缺少提供方 ${providerId} 的凭据；原文件已保留，请重新保存该模型密钥。`)
    }
    try {
      return JSON.parse(serialized)
    } catch {
      throw new Error(`提供方 ${providerId} 的 Keychain 凭据格式无效；原文件已保留。`)
    }
  }

  async function readKeychainRefs() {
    try {
      const raw = (await fs.readFile(filePath, 'utf8')).trim()
      if (raw.startsWith(INSECURE_STORE_PREFIX)) return []
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
      return Object.values(parsed).filter(isKeychainRef).map(parseKeychainRef)
    } catch {
      return []
    }
  }

  async function persistPayload(payload, retries) {
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
    const temporary = `${filePath}.${process.pid}.tmp`

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await fs.writeFile(temporary, `${payload}\n`, { encoding: 'utf8', mode: 0o600 })
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

  async function writeKeychainAll(credentials, retries = 2) {
    const previousRefs = await readKeychainRefs()
    const refs = {}
    const createdRefs = []
    try {
      for (const [providerId, credential] of Object.entries(credentials)) {
        const account = `credentials:v1:${Buffer.from(providerId, 'utf8').toString('base64url')}:${randomUUID()}`
        await secrets.set(account, JSON.stringify(credential))
        refs[providerId] = formatKeychainRef(account)
        createdRefs.push(account)
      }
      await persistPayload(JSON.stringify(refs), retries)
    } catch (error) {
      await Promise.all(createdRefs.map((account) => secrets.delete(account).catch(() => {})))
      throw error
    }

    const retained = new Set(Object.values(refs).map(parseKeychainRef))
    await Promise.all(previousRefs
      .filter((account) => !retained.has(account))
      .map((account) => secrets.delete(account).catch(() => {})))
  }

  async function writeAll(credentials, retries = 2) {
    if (secrets) return writeKeychainAll(credentials, retries)
    return persistPayload(encodePayload(credentials), retries)
  }

  function serialize(operation) {
    const next = queue.then(operation, operation)
    queue = next.catch(() => {})
    return next
  }

  return {
    async read(providerId) {
      if (secrets) return readKeychainProvider(providerId)
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
