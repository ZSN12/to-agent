import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { parseDocument } from 'yaml'

const PI_AI_SETTINGS_NS = 'llm-pi-ai'
const PI_AI_DATA_REL = 'node_modules/@earendil-works/pi-ai/dist/providers/data'

/**
 * Read a managed credential ref from TASKWEAVER_HOME (refs layer + process env).
 * ApiProxy never returns secret values; the main process reads the local store.
 */
export async function readCredentialRefValue(dshHome, ref) {
  const name = String(ref ?? '').trim()
  if (!name) return undefined
  const fromEnv = process.env[name]
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim()
  const file = path.join(dshHome, '.credentials.yaml')
  try {
    const text = await fsp.readFile(file, 'utf8')
    const root = parseDocument(text).toJS() ?? {}
    const value = root?.refs?.[name]
    if (typeof value === 'string' && value.trim()) return value.trim()
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  return undefined
}

/** OpenAI-compatible listing base URL shipped with pi-ai for this provider id. */
export function resolvePiAiListingBaseUrl(dshRuntimeRoot, providerId) {
  if (!dshRuntimeRoot) return undefined
  const file = path.join(dshRuntimeRoot, PI_AI_DATA_REL, `${providerId}.json`)
  if (!fs.existsSync(file)) return undefined
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    const bucket = data['openai-completions'] ?? data['openai-responses']
    if (!bucket || typeof bucket !== 'object') return undefined
    for (const entry of Object.values(bucket)) {
      if (entry && typeof entry.baseUrl === 'string' && entry.baseUrl.trim()) {
        return entry.baseUrl.trim()
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

export function resolveProviderLiveDiscoveryConfig(dshRuntimeRoot, providerRow, providerSettings) {
  const configuredBaseUrl = typeof providerSettings?.value?.baseURL === 'string'
    ? providerSettings.value.baseURL.trim()
    : ''
  const baseURL = configuredBaseUrl || resolvePiAiListingBaseUrl(dshRuntimeRoot, providerRow.provider)
  if (!baseURL) return null
  const api = typeof providerSettings?.value?.api === 'string' && providerSettings.value.api.trim()
    ? providerSettings.value.api.trim()
    : 'openai-completions'
  return { provider: providerRow.provider, baseURL, api }
}

/**
 * Live model ids from the provider's OpenAI-compatible GET /models.
 * Omits `provider` in the DSH request so discovery hits the wire instead of the static pi-ai catalog.
 */
export async function discoverModelsFromProviderApi({
  api,
  dshValue,
  dshHome,
  dshRuntimeRoot,
  providerRow,
  providerSettings,
  credentialsDescribe,
  signal,
}) {
  const config = resolveProviderLiveDiscoveryConfig(dshRuntimeRoot, providerRow, providerSettings)
  if (!config) return []
  const { provider: providerId, baseURL, api: protocol } = config

  const { value } = providerSettings
  const ref = typeof value?.apiKeyEnv === 'string' ? value.apiKeyEnv.trim() : ''
  if (!ref) return []

  const described = credentialsDescribe?.[ref]
  if (!described?.configured) return []

  const apiKey = await readCredentialRefValue(dshHome, ref)
  if (!apiKey) return []

  const reply = await api.llm.discoverModels({
    settingsNs: PI_AI_SETTINGS_NS,
    baseURL,
    api: protocol,
    apiKey,
  }, signal)
  const payload = dshValue(reply, `${providerId} 模型发现`)
  return payload?.models ?? []
}
