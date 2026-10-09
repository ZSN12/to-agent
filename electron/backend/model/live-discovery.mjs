import { discoverModelsFromProviderApi } from '../provider-live-discovery.mjs'
import { resolveDshHome } from '../dsh-pi-ai-credentials.mjs'
import { dshValue, providerSettings, shouldLiveDiscoverProvider } from './shared.mjs'

/** 按需调用提供方 /v1/models 合并候选目录。 */
export function createModelLiveDiscovery({
  userDataPath,
  dshRuntimeRoot,
  serializeDshModel,
  isProviderCredentialConfigured,
}) {
  async function mergeLiveProviderModels(
    directory,
    candidateModels,
    availableKeys,
    providerById,
    profiles,
    registryByKey = new Map(),
    registryVersion = null,
    addedModelKeys = [],
  ) {
    if (!userDataPath || !dshRuntimeRoot) return
    const home = resolveDshHome(userDataPath)
    const failures = []
    for (const providerRow of directory.providers ?? []) {
      if (!shouldLiveDiscoverProvider(providerRow.provider, addedModelKeys)) continue
      let mayDiscover = providerRow.active
      if (!mayDiscover) {
        try {
          mayDiscover = await isProviderCredentialConfigured(directory, providerRow)
        } catch {
          mayDiscover = false
        }
      }
      if (!mayDiscover) continue
      const settings = providerSettings(directory, providerRow)
      let described = {}
      const ref = typeof settings.value?.apiKeyEnv === 'string' ? settings.value.apiKeyEnv.trim() : ''
      if (ref) {
        try {
          const response = dshValue(await directory.api.credentials.describe({ refs: [ref] }), '读取 DSH 凭据状态')
          described = response.credentials ?? {}
        } catch (error) {
          failures.push({ provider: providerRow.provider, error })
          continue
        }
      }
      let discovered = []
      try {
        discovered = await discoverModelsFromProviderApi({
          api: directory.api,
          dshValue,
          dshHome: home,
          dshRuntimeRoot,
          providerRow,
          providerSettings: settings,
          credentialsDescribe: described,
        })
      } catch (error) {
        failures.push({ provider: providerRow.provider, error })
        continue
      }
      if (!discovered.length) continue
      const knownIds = new Set(candidateModels.filter((m) => m.provider === providerRow.provider).map((m) => m.id))
      const provider = providerById.get(providerRow.provider) ?? {
        id: providerRow.provider,
        name: providerRow.displayName || providerRow.provider,
        active: true,
      }
      for (const row of discovered) {
        if (!row?.id || knownIds.has(row.id)) continue
        knownIds.add(row.id)
        const key = `${providerRow.provider}/${row.id}`
        if (provider.active) availableKeys.add(key)
        candidateModels.push(serializeDshModel(
          provider,
          { id: row.id, name: row.name || row.id },
          availableKeys,
          profiles[key] ?? null,
          registryByKey.get(key) ?? null,
          registryByKey.has(key) ? 'remote' : 'live',
          registryByKey.has(key) ? registryVersion : null,
          false,
        ))
      }
    }
    if (failures.length) {
      console.warn('部分提供方 API 模型发现失败:', failures.map((f) => `${f.provider}: ${f.error instanceof Error ? f.error.message : f.error}`).join('; '))
    }
  }
  return { mergeLiveProviderModels }
}
