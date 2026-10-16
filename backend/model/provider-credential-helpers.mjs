import { hasPiAiGrant, resolveRuntimeHome } from '../dsh-pi-ai-credentials.mjs'
import { fetchOpenCodexProviderLogins } from '../opencodex-service.mjs'
import { integrationByRouteId } from '../model-sync/local-agent-registry.mjs'
import { taskweaverApiKeyEnvRef } from '../pi-models-to-dsh-profile.mjs'
import { UI_VERIFY_MOCK_MODEL_KEY } from '../ui-verify-mock.mjs'
import {
  TASKWEAVER_NATIVE_OAUTH,
  atPath,
  dshValue,
  findSettingsNamespace,
  hasPiAiSettingsNamespace,
  normalizeSettingsNs,
  providerRowsForAuth,
  providerSettings,
  resolveProviderRow,
  sleep,
} from './shared.mjs'

export function createProviderCredentialHelpers({
  userDataPath,
  directoryClient,
  fetchBridgeLogins = fetchOpenCodexProviderLogins,
  isUiVerifyMockModelEnabled = () => false,
}) {
  const { fetchDshModelDirectoryOnce } = directoryClient
  let bridgeLoginCache = null
  let bridgeLoginCacheExpiresAt = 0
  let bridgeLoginStatusInFlight = null

  function dshHome() {
    if (!userDataPath) throw new Error('TaskWeaver 用户数据目录未配置，无法读写 Z Runtime 凭据')
    return resolveRuntimeHome(userDataPath)
  }

  async function resolveDshCredentialRef(directory, provider) {
    const row = resolveProviderRow(directory, provider.provider ?? provider)
      ?? (typeof provider === 'object' ? provider : null)
    if (!row) {
      throw new Error(`${provider?.provider ?? provider} 没有可写的 Z Runtime 凭据配置入口`)
    }
    const settingsNs = normalizeSettingsNs(row.settingsNs)
      || (hasPiAiSettingsNamespace(directory) ? 'llm-pi-ai' : '')
    if (!settingsNs) {
      throw new Error(`${row.displayName || row.provider} 没有可写的 Z Runtime 凭据配置入口`)
    }
    const settingsPath = row.settingsPath?.length
      ? row.settingsPath
      : (settingsNs === 'llm-pi-ai' ? ['providers', row.provider] : [])
    let activeDirectory = directory
    let namespace = findSettingsNamespace(activeDirectory.namespaces, settingsNs)
    for (let attempt = 0; !namespace && attempt < 12; attempt += 1) {
      await sleep(300 * (attempt + 1))
      activeDirectory = await fetchDshModelDirectoryOnce()
      namespace = findSettingsNamespace(activeDirectory.namespaces, settingsNs)
    }
    const value = namespace ? atPath(namespace.value, settingsPath ?? []) : undefined
    const configuredRef = value?.apiKeyEnv
    const ref = typeof configuredRef === 'string' && configuredRef.trim()
      ? configuredRef.trim()
      : `TASKWEAVER_${row.provider.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_API_KEY`
    return {
      directory: activeDirectory,
      namespace,
      settingsNs,
      ref,
      settingPath: [...settingsPath, 'apiKeyEnv'],
      bootstrapSettings: !namespace,
    }
  }

  async function isProviderCredentialConfigured(directory, providerRow) {
    const providerId = providerRow.provider
    const bridgeAuthorization = await getBridgeProviderAuthorization(providerId)
    if (bridgeAuthorization) return bridgeAuthorization.configured
    if (TASKWEAVER_NATIVE_OAUTH[providerId] && userDataPath) {
      return hasPiAiGrant(dshHome(), providerId)
    }
    const { value } = providerSettings(directory, providerRow)
    const ref = typeof value?.apiKeyEnv === 'string' && value.apiKeyEnv.trim()
      ? value.apiKeyEnv.trim()
      : (hasPiAiSettingsNamespace(directory) ? taskweaverApiKeyEnvRef(providerId) : '')
    if (!ref) return false
    const response = dshValue(await directory.api.credentials.describe({ refs: [ref] }), '读取 DSH 凭据状态')
    return Boolean(response.credentials?.[ref]?.configured)
  }

  async function getBridgeProviderAuthorization(providerId) {
    const integration = integrationByRouteId(providerId)
    if (!integration) return null

    const now = Date.now()
    if (bridgeLoginCache && now < bridgeLoginCacheExpiresAt) {
      return bridgeAuthorizationFromLogins(integration, bridgeLoginCache)
    }
    if (!bridgeLoginStatusInFlight) {
      bridgeLoginStatusInFlight = Promise.resolve()
        .then(() => fetchBridgeLogins(userDataPath))
        .catch(() => ({}))
        .then((logins) => {
          bridgeLoginCache = logins && typeof logins === 'object' ? logins : {}
          // Share the status read across the concurrent auth/catalog refresh,
          // but let a post-login scan observe the new state almost immediately.
          bridgeLoginCacheExpiresAt = Date.now() + 1_000
          return bridgeLoginCache
        })
        .finally(() => {
          bridgeLoginStatusInFlight = null
        })
    }
    return bridgeAuthorizationFromLogins(integration, await bridgeLoginStatusInFlight)
  }

  function bridgeAuthorizationFromLogins(integration, logins) {
    return {
      configured: !integration.loginProvider || logins[integration.loginProvider] === true,
      authType: 'local_subscription',
      source: integration.label,
    }
  }

  async function applyCredentialBasedAvailability(directory, providerById, availableKeys, candidateModels, addedModelKeys) {
    const rows = providerRowsForAuth(directory)
    for (const row of rows) {
      let configured = false
      try {
        configured = await isProviderCredentialConfigured(directory, row)
      } catch {
        configured = false
      }
      if (!configured) {
        if (integrationByRouteId(row.provider)) {
          for (const model of candidateModels) {
            if (model.provider === row.provider) availableKeys.delete(model.key)
          }
        }
        continue
      }
      const entry = providerById.get(row.provider) ?? {
        id: row.provider,
        name: row.displayName || row.provider,
        active: false,
      }
      entry.active = true
      providerById.set(row.provider, entry)
      for (const model of candidateModels) {
        if (model.provider === row.provider && model.routeRegistered) availableKeys.add(model.key)
      }
      for (const key of addedModelKeys) {
        const model = candidateModels.find((candidate) => candidate.key === key)
        if (key.startsWith(`${row.provider}/`) && model?.routeRegistered) availableKeys.add(key)
      }
    }
    if (isUiVerifyMockModelEnabled()) {
      const mockModel = candidateModels.find((model) => model.key === UI_VERIFY_MOCK_MODEL_KEY)
      if (mockModel?.routeRegistered) availableKeys.add(mockModel.key)
    }
    for (const model of candidateModels) model.available = model.routeRegistered && availableKeys.has(model.key)
  }

  return {
    resolveDshCredentialRef,
    isProviderCredentialConfigured,
    getBridgeProviderAuthorization,
    applyCredentialBasedAvailability,
  }
}
