import fs from 'node:fs/promises'
import path from 'node:path'
import { Document, parseDocument } from 'yaml'
import { resolveDshHome } from './dsh-pi-ai-credentials.mjs'

const SECTION = 'llm-pi-ai'
const BACKUP_REL = path.join('taskweaver', 'llm-pi-ai-settings.backup.yaml')

export async function isLlmPiAiNamespaceRegistered(api) {
  const response = await api.settings.describe({})
  const result = response?.result ?? response
  if (result?.ok === false) return false
  const namespaces = result?.value?.namespaces ?? []
  return namespaces.some((item) => item?.ns === SECTION)
}

/**
 * A corrupt `llm-pi-ai:` document section prevents @z/dsh-llm-pi-ai from registering
 * its settings namespace; quarantine it so the host can boot, then re-sync profiles.
 */
export async function quarantineBrokenLlmPiAiSection(userDataPath) {
  const dshHome = resolveDshHome(userDataPath)
  const settingsPath = path.join(dshHome, 'settings.yaml')
  let text
  try {
    text = await fs.readFile(settingsPath, 'utf8')
  } catch (err) {
    if (err?.code === 'ENOENT') return { quarantined: false }
    throw err
  }
  const document = parseDocument(text)
  const section = document.get(SECTION)
  if (section === undefined || section === null) {
    return { quarantined: false }
  }
  const backupPath = path.join(userDataPath, BACKUP_REL)
  await fs.mkdir(path.dirname(backupPath), { recursive: true })
  const backupDoc = new Document({ [SECTION]: section })
  await fs.writeFile(backupPath, `${String(backupDoc)}\n`, 'utf8')
  document.delete(SECTION)
  await fs.writeFile(settingsPath, `${String(document)}\n`, 'utf8')
  return { quarantined: true, backupPath }
}

/**
 * @param {string} userDataPath
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readQuarantinedLlmPiAiProviders(userDataPath) {
  const backupPath = path.join(userDataPath, BACKUP_REL)
  try {
    const text = await fs.readFile(backupPath, 'utf8')
    const doc = parseDocument(text).toJS()
    const providers = doc?.[SECTION]?.providers
    if (providers && typeof providers === 'object' && !Array.isArray(providers)) {
      return { ...providers }
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }
  return {}
}

/** Keep apiKeyEnv-only catalog stubs from a backup (e.g. xiaomi). */
export function pickCredentialOnlyProfiles(providers) {
  const out = {}
  for (const [id, value] of Object.entries(providers ?? {})) {
    if (!value || typeof value !== 'object') continue
    const keys = Object.keys(value)
    if (keys.length === 1 && keys[0] === 'apiKeyEnv' && typeof value.apiKeyEnv === 'string') {
      out[id] = { apiKeyEnv: value.apiKeyEnv.trim() }
    }
  }
  return out
}

const BRIDGE_SECTION = 'llm-taskweaver-bridge'
const BRIDGE_BACKUP_REL = path.join('taskweaver', 'llm-taskweaver-bridge-settings.backup.yaml')

export async function isLlmTaskweaverBridgeNamespaceRegistered(api) {
  const response = await api.settings.describe({})
  const result = response?.result ?? response
  if (result?.ok === false) return false
  const namespaces = result?.value?.namespaces ?? []
  return namespaces.some((item) => item?.ns === BRIDGE_SECTION)
}

export async function quarantineBrokenLlmTaskweaverBridgeSection(userDataPath) {
  const dshHome = resolveDshHome(userDataPath)
  const settingsPath = path.join(dshHome, 'settings.yaml')
  let text
  try {
    text = await fs.readFile(settingsPath, 'utf8')
  } catch (err) {
    if (err?.code === 'ENOENT') return { quarantined: false }
    throw err
  }
  const document = parseDocument(text)
  const section = document.get(BRIDGE_SECTION)
  if (section === undefined || section === null) return { quarantined: false }
  const backupPath = path.join(userDataPath, BRIDGE_BACKUP_REL)
  await fs.mkdir(path.dirname(backupPath), { recursive: true })
  const backupDoc = new Document({ [BRIDGE_SECTION]: section })
  await fs.writeFile(backupPath, `${String(backupDoc)}
`, 'utf8')
  document.delete(BRIDGE_SECTION)
  await fs.writeFile(settingsPath, `${String(document)}
`, 'utf8')
  return { quarantined: true, backupPath }
}

export async function readQuarantinedLlmTaskweaverBridgeProviders(userDataPath) {
  const backupPath = path.join(userDataPath, BRIDGE_BACKUP_REL)
  try {
    const text = await fs.readFile(backupPath, 'utf8')
    const doc = parseDocument(text).toJS()
    const providers = doc?.[BRIDGE_SECTION]?.providers
    if (providers && typeof providers === 'object' && !Array.isArray(providers)) return { ...providers }
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }
  return {}
}
