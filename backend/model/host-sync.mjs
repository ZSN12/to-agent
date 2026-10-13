import {
  dshValue,
  providerSettings,
  registryModels,
  registryModelProfile,
  sleep,
} from './shared.mjs'
import { piAiProviderModels } from './pi-ai-bundled.mjs'

/** 将签名 registry 行写入 DSH modelAdditions / overrides 并确认可路由。 */
export function createModelHostSync({ modelRegistryUpdater, dshRuntimeRoot, directoryClient }) {
  async function applyRegistryAdditions(directory, explicitRegistry = null, requestedKeys = []) {
    if (!modelRegistryUpdater || !directory?.api) return directory
    if (!requestedKeys.length) return directory
    const registry = explicitRegistry ?? (await modelRegistryUpdater.loadActiveRegistry()).registry
    const requested = new Set(requestedKeys)
    const remoteRows = registryModels(registry).filter((model) => requested.has(model.key) && !model.deprecated)
    const opsByNamespace = new Map()
    const expectedKeys = new Set()
    const routedKeys = new Set(
      (directory.groups ?? []).flatMap((group) => (group.models ?? []).map((model) => `${group.id}/${model.id}`)),
    )
    for (const providerRow of directory.providers ?? []) {
      if (providerRow.settingsNs !== 'llm-pi-ai') continue
      const group = directory.groups.find((item) => item.id === providerRow.provider)
      const installedIds = new Set(group?.models?.map((model) => model.id) ?? [])
      const { namespace, value } = providerSettings(directory, providerRow)
      if (!namespace || namespace.writable === false) continue
      const currentAdditions = Array.isArray(value?.modelAdditions) ? value.modelAdditions : []
      const additions = [...currentAdditions]
      const additionIds = new Set(additions.map((model) => model?.id).filter(Boolean))
      const currentOverrides = value?.modelOverrides && typeof value.modelOverrides === 'object'
        ? value.modelOverrides
        : {}
      const overrides = { ...currentOverrides }
      const remoteProvider = registry.providers?.[providerRow.provider] ?? {}
      const runtimeProviderModels = piAiProviderModels(dshRuntimeRoot, providerRow.provider)
      for (const model of remoteRows.filter((item) => item.provider === providerRow.provider)) {
        const modelKey = `${providerRow.provider}/${model.id}`
        if (installedIds.has(model.id) || additionIds.has(model.id) || routedKeys.has(modelKey)) continue
        const protocols = Array.isArray(remoteProvider.protocols) ? remoteProvider.protocols : []
        const configuredApi = typeof value?.api === 'string' ? value.api : null
        if (model.api && configuredApi && model.api !== configuredApi) continue
        if (model.api && protocols.length && !protocols.includes(model.api)) continue
        const installedApis = runtimeProviderModels
          ? Object.entries(runtimeProviderModels)
            .filter(([, entries]) => entries && Object.hasOwn(entries, model.id))
            .map(([api]) => api)
          : []
        if (installedApis.length) {
          // pi-ai rejects modelAdditions that shadow its built-in catalog.
          // Keep the installed protocol/provider implementation, and apply
          // only the signed registry's metadata through its supported override.
          if (!model.api || !installedApis.includes(model.api)) {
            throw new Error(`模型 ${modelKey} 的协议与 Z Runtime 内置目录不一致`)
          }
          const override = { ...registryModelProfile(model) }
          delete override.id
          overrides[model.id] = override
        } else {
          additions.push(registryModelProfile(model))
          additionIds.add(model.id)
        }
        expectedKeys.add(`${providerRow.provider}/${model.id}`)
      }
      const additionsChanged = JSON.stringify(additions) !== JSON.stringify(currentAdditions)
      const overridesChanged = JSON.stringify(overrides) !== JSON.stringify(currentOverrides)
      if (!additionsChanged && !overridesChanged) continue
      const bucket = opsByNamespace.get(namespace.ns) ?? { revision: namespace.revision, ops: [], rollbackOps: [] }
      const settingsPath = providerRow.settingsPath ?? []
      if (additionsChanged) {
        const settingPath = [...settingsPath, 'modelAdditions']
        bucket.ops.push({ op: 'set', path: settingPath, value: additions })
        bucket.rollbackOps.push({ op: 'set', path: settingPath, value: currentAdditions })
      }
      if (overridesChanged) {
        const settingPath = [...settingsPath, 'modelOverrides']
        bucket.ops.push({ op: 'set', path: settingPath, value: overrides })
        bucket.rollbackOps.push({ op: 'set', path: settingPath, value: currentOverrides })
      }
      opsByNamespace.set(namespace.ns, bucket)
    }
    if (!opsByNamespace.size) return directory
    for (const [ns, batch] of opsByNamespace) {
      dshValue(await directory.api.settings.mutate({
        ns,
        expectedRevision: batch.revision,
        ops: batch.ops,
      }), '注入 TaskWeaver 模型目录')
    }
    // The successful route check below reads the Host directly. Clear the
    // cached directory as well so the caller's next catalog read sees the
    // same confirmed model routes instead of the pre-mutation snapshot.
    directoryClient.invalidateModelDirectoryCache()
    let refreshed = await directoryClient.fetchDshModelDirectoryOnce()
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const routed = new Set(refreshed.groups.flatMap((group) => group.models.map((model) => `${group.id}/${model.id}`)))
      if ([...expectedKeys].every((key) => routed.has(key))) {
        directoryClient.seedModelDirectoryCache(refreshed)
        return refreshed
      }
      await sleep(250 * (attempt + 1))
      refreshed = await directoryClient.fetchDshModelDirectoryOnce()
    }
      // A settings write that did not become routable is not a successful add.
      // Restore the user's previous DSH settings before returning the failure.
    for (const [ns, batch] of opsByNamespace) {
      const latestNs = refreshed.namespaces.find((item) => item.ns === ns)
      if (!latestNs) continue
      try {
        dshValue(await refreshed.api.settings.mutate({
          ns,
          expectedRevision: latestNs.revision,
          ops: batch.rollbackOps,
        }), '回滚 TaskWeaver 模型目录映射')
      } catch (error) {
        console.error('回滚 DSH modelAdditions 失败:', error)
      }
    }
    directoryClient.invalidateModelDirectoryCache()
    const routed = new Set(refreshed.groups.flatMap((group) => group.models.map((model) => `${group.id}/${model.id}`)))
    const missing = [...expectedKeys].filter((key) => !routed.has(key))
    throw new Error(`Z Runtime 未注册新增模型：${missing.join(', ')}`)
  }
  return { applyRegistryAdditions }
}
