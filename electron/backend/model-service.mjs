import fs from 'node:fs'
import path from 'node:path'
import {
  createTaskWeaverAuthorizationUrl,
  exchangeAuthorizationCode,
  parseAuthorizationCodeInput,
  startTaskWeaverOAuthServer,
} from './codex-oauth.mjs'
import {
  deletePiAiGrant,
  hasPiAiGrant,
  resolveDshHome,
  writePiAiGrant,
} from './dsh-pi-ai-credentials.mjs'
import { discoverModelsFromProviderApi } from './provider-live-discovery.mjs'
import { loadPriceRegistry, mergeRegistryCost, registryPriceMeta } from './price-registry.mjs'
import { taskweaverApiKeyEnvRef } from './pi-models-to-dsh-profile.mjs'

/** Providers that use TaskWeaver-native OAuth (written to DSH llm-pi-ai grant records). */
const TASKWEAVER_NATIVE_OAUTH = {
  'openai-codex': {
    label: 'ChatGPT 订阅 (OAuth)',
    instructions: '已在浏览器打开 OpenAI 授权页面，完成授权后将自动连接到 TaskWeaver。',
  },
}

/** @typedef {'cheap' | 'balanced' | 'strong'} ModelTier */

/**
 * 模型接入层（主进程单例）：目录与鉴权走内置运行时；档位与能力摘要走 profile-store。
 */
export function createModelService({
  profileStore,
  priceRegistryPath,
  dshHostManager = null,
  userDataPath = null,
  dshRuntimeRoot = null,
  modelRegistryUpdater = null,
}) {
  let priceRegistry = loadPriceRegistry(priceRegistryPath)
  let catalogPriceMeta = registryPriceMeta(priceRegistry)

  function reloadPriceRegistry() {
    priceRegistry = loadPriceRegistry(priceRegistryPath)
    catalogPriceMeta = registryPriceMeta(priceRegistry)
  }
  /** @type {{ providerId: string, cancel: () => void, submitCode: (value: string) => void } | null} */
  let pendingNativeOAuth = null

  function dshHome() {
    if (!userDataPath) throw new Error('TaskWeaver 用户数据目录未配置，无法读写 Z Runtime 凭据')
    return resolveDshHome(userDataPath)
  }

  function dshValue(response, operation) {
    const result = response?.result ?? response
    if (result?.ok === false) throw new Error(result.error?.message || `${operation}失败`)
    return result?.value ?? result
  }

  function atPath(value, pathParts) {
    return pathParts.reduce((current, key) => current && typeof current === 'object' ? current[key] : undefined, value)
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  async function fetchDshModelDirectoryOnce() {
    if (!dshHostManager) throw new Error('Z 模型目录未连接')
    const { api } = await dshHostManager.start()
    const [providerReply, modelReply, settingsReply] = await Promise.all([
      api.llm.providers({}),
      api.llm.models({}),
      api.settings.describe({}),
    ])
    const providerData = dshValue(providerReply, '读取 DSH 提供方')
    const modelData = dshValue(modelReply, '读取 DSH 模型目录')
    const settingsData = dshValue(settingsReply, '读取 DSH 设置')
    return {
      api,
      providers: providerData.providers ?? [],
      groups: modelData.groups ?? [],
      failures: modelData.failures ?? [],
      namespaces: settingsData.namespaces ?? [],
    }
  }

  /**
   * DSH 模型目录 TTL 缓存。
   * 同一次 chat:send 内 listCatalog / listProvidersAuth / getDshModelConfig 会连读多遍目录，
   * 每遍都是 3 个 Host 请求（llm.providers + llm.models + settings.describe）。
   * TTL 内复用同一份结果，并发读共享同一个 in-flight Promise；
   * refreshCatalog() 强制绕过缓存，凭据变更（reloadDshHostAfterCredentialChange）主动失效。
   */
  const MODEL_DIRECTORY_TTL_MS = 5000
  /** @type {{ value: Awaited<ReturnType<typeof fetchDshModelDirectoryOnce>>, expiresAt: number } | null} */
  let modelDirectoryCache = null
  /** @type {Promise<Awaited<ReturnType<typeof fetchDshModelDirectoryOnce>>> | null} */
  let modelDirectoryInflight = null

  function invalidateModelDirectoryCache() {
    modelDirectoryCache = null
    modelDirectoryInflight = null
  }

  async function fetchDshModelDirectoryWithRetry() {
    let lastError
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const directory = await fetchDshModelDirectoryOnce()
        if (attempt > 0 && (directory.providers.length || directory.groups.length)) {
          console.info(`DSH 模型目录在第 ${attempt + 1} 次尝试后可用`)
        }
        return directory
      } catch (error) {
        lastError = error
        if (attempt < 5) await sleep(400 * (attempt + 1))
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  function getDshModelDirectory({ force = false } = {}) {
    if (!force) {
      if (modelDirectoryCache && Date.now() < modelDirectoryCache.expiresAt) {
        return Promise.resolve(modelDirectoryCache.value)
      }
      if (modelDirectoryInflight) return modelDirectoryInflight
    }
    const pending = fetchDshModelDirectoryWithRetry().then(
      (directory) => {
        modelDirectoryCache = { value: directory, expiresAt: Date.now() + MODEL_DIRECTORY_TTL_MS }
        if (modelDirectoryInflight === pending) modelDirectoryInflight = null
        return directory
      },
      (error) => {
        if (modelDirectoryInflight === pending) modelDirectoryInflight = null
        throw error
      },
    )
    modelDirectoryInflight = pending
    return pending
  }

  function normalizeSettingsNs(value) {
    return String(value ?? '').trim()
  }

  function findSettingsNamespace(namespaces, settingsNs) {
    const target = normalizeSettingsNs(settingsNs)
    if (!target) return undefined
    return (namespaces ?? []).find((item) => normalizeSettingsNs(item?.ns) === target)
  }

  function providerSettings(directory, provider) {
    const ns = findSettingsNamespace(directory.namespaces, provider.settingsNs)
    return { namespace: ns, value: atPath(ns?.value, provider.settingsPath ?? []) }
  }

  function registryModels(registry) {
    return Object.entries(registry?.models ?? {}).flatMap(([key, value]) => {
      if (!value || typeof value !== 'object') return []
      const slash = key.indexOf('/')
      const provider = value.provider || (slash > 0 ? key.slice(0, slash) : '')
      const id = value.id || (slash > 0 ? key.slice(slash + 1) : '')
      return provider && id ? [{ ...value, key: `${provider}/${id}`, provider, id }] : []
    })
  }

  function registryModelProfile(model) {
    const profile = { id: model.id, name: model.name || model.id }
    if (Number.isInteger(model.contextWindow) && model.contextWindow > 0) profile.contextWindow = model.contextWindow
    if (Number.isInteger(model.maxTokens) && model.maxTokens > 0) profile.maxTokens = model.maxTokens
    if (Array.isArray(model.input) && model.input.length) profile.input = model.input
    if (model.reasoningEfforts === false) profile.reasoningEfforts = false
    else if (model.reasoningEfforts && typeof model.reasoningEfforts === 'object') {
      profile.reasoningEfforts = model.reasoningEfforts
    }
    return profile
  }

  function schemaValuesAtPath(schema, pathParts) {
    const refs = schema?.refs ?? {}
    let node = refs[String(schema?.uid)]
    const resolve = (value) => typeof value === 'number' || typeof value === 'string'
      ? (refs[String(value)] ?? value)
      : value
    node = resolve(node)
    for (const part of pathParts) {
      node = resolve(node)
      let child = node?.dict?.[part] ?? node?.fields?.[part]
      // Provider settings live under a dynamic dictionary keyed by provider id.
      if (child === undefined && node?.type === 'dict') child = node.inner
      if (child === undefined) return []
      node = resolve(child)
    }
    const values = new Set()
    const visit = (current, seen = new Set()) => {
      current = resolve(current)
      if (!current || typeof current !== 'object' || seen.has(current)) return
      seen.add(current)
      if (current.type === 'const' && typeof current.value === 'string') values.add(current.value)
      for (const ref of current.list ?? []) visit(ref, seen)
      for (const ref of Object.values(current.dict ?? {})) visit(ref, seen)
      if (current.inner !== undefined) visit(current.inner, seen)
    }
    visit(node)
    return [...values]
  }

  function piAiProviderModels(providerId) {
    if (!dshRuntimeRoot) return null
    const packageSuffix = path.join('@earendil-works', 'pi-ai', 'dist', 'providers', 'data')
    const candidates = [
      path.join(dshRuntimeRoot, 'runtime-packages', packageSuffix, `${providerId}.json`),
      path.join(dshRuntimeRoot, 'node_modules', packageSuffix, `${providerId}.json`),
      path.join(dshRuntimeRoot, 'node_modules', '.pnpm', 'node_modules', packageSuffix, `${providerId}.json`),
    ]
    const pnpmRoot = path.join(dshRuntimeRoot, 'node_modules', '.pnpm')
    try {
      for (const entry of fs.readdirSync(pnpmRoot)) {
        if (entry.startsWith('@earendil-works+pi-ai@')) {
          candidates.push(path.join(pnpmRoot, entry, 'node_modules', packageSuffix, `${providerId}.json`))
        }
      }
    } catch { /* packed runtime may not use pnpm's virtual store */ }
    for (const file of candidates) {
      try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
      } catch { /* try the next packaged layout */ }
    }
    return null
  }

  /** Persist signed catalog additions in DSH itself, then re-read its real routable catalog. */
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
      const runtimeProviderModels = piAiProviderModels(providerRow.provider)
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
          const { id: _id, ...override } = registryModelProfile(model)
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
    let refreshed = await fetchDshModelDirectoryOnce()
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const routed = new Set(refreshed.groups.flatMap((group) => group.models.map((model) => `${group.id}/${model.id}`)))
      if ([...expectedKeys].every((key) => routed.has(key))) return refreshed
      await sleep(250 * (attempt + 1))
      refreshed = await fetchDshModelDirectoryOnce()
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
    const routed = new Set(refreshed.groups.flatMap((group) => group.models.map((model) => `${group.id}/${model.id}`)))
    const missing = [...expectedKeys].filter((key) => !routed.has(key))
    throw new Error(`Z Runtime 未注册新增模型：${missing.join(', ')}`)
  }

  function serializeDshModel(
    provider,
    model,
    availableKeys,
    profile = null,
    registryEntry = null,
    source = 'bundled',
    registryVersion = null,
    routeRegistered = true,
  ) {
    const key = `${provider.id}/${model.id}`
    const defaultCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    const remotePricing = registryEntry?.pricing ?? registryEntry?.costPerMillion
    const bundledPrice = mergeRegistryCost(key, defaultCost, priceRegistry)
    const cost = remotePricing && typeof remotePricing === 'object'
      ? {
          input: Number(remotePricing.input) || 0,
          output: Number(remotePricing.output) || 0,
          cacheRead: Number(remotePricing.cacheRead) || 0,
          cacheWrite: Number(remotePricing.cacheWrite) || 0,
        }
      : bundledPrice.cost
    const priceMeta = remotePricing
      ? { source: 'taskweaver-remote-registry', synced_at: registryEntry?.updatedAt ?? null, confidence: registryEntry?.confidence ?? 'curated' }
      : bundledPrice.priceMeta
    const efforts = model.reasoning?.efforts?.map((effort) => String(effort.id).toLowerCase()) ?? []
    const supportedThinkingLevels = ['off', 'low', 'medium', 'high'].filter((level) => level === 'off' || efforts.includes(level))
    return {
      key,
      provider: provider.id,
      id: model.id,
      name: registryEntry?.name || model.name || model.id,
      api: registryEntry?.api || 'dsh',
      reasoning: efforts.length > 0,
      contextWindow: Number(registryEntry?.contextWindow) || 0,
      maxTokens: Number(registryEntry?.maxTokens) || 0,
      costPerMillion: { input: cost.input, output: cost.output, cacheRead: cost.cacheRead, cacheWrite: cost.cacheWrite },
      priceMeta: priceMeta ?? catalogPriceMeta,
      available: availableKeys.has(key),
      isTierVariant: false,
      supportedThinkingLevels: efforts.length ? supportedThinkingLevels : undefined,
      defaultThinkingLevel: efforts.length
        ? (model.reasoning?.defaultEffort ?? (efforts.includes('high') ? 'high' : 'medium'))
        : undefined,
      profile,
      source,
      deprecated: Boolean(registryEntry?.deprecated),
      replacementModelKey: registryEntry?.replacementModel || null,
      capabilityCompleteness: registryEntry
        ? ['contextWindow', 'maxTokens', 'api'].filter((field) => registryEntry[field]).length / 3
        : 0,
      registryVersion,
      capabilitySummary: registryEntry?.capabilitySummary || '',
      taskTags: Array.isArray(registryEntry?.taskTags) ? registryEntry.taskTags : [],
      verificationStatus: registryEntry ? 'verified' : (source === 'bundled' ? 'bundled' : 'unverified'),
      routeRegistered,
    }
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

  /** TaskWeaver 已确认凭据时，与 DSH `provider.active` 对齐可用性（OAuth 写盘后 Host 可能尚未标 active）。 */
  async function applyCredentialBasedAvailability(directory, providerById, availableKeys, candidateModels, addedModelKeys) {
    const rows = providerRowsForAuth(directory)
    for (const row of rows) {
      let configured = false
      try {
        configured = await isProviderCredentialConfigured(directory, row)
      } catch {
        configured = false
      }
      if (!configured) continue
      const entry = providerById.get(row.provider) ?? {
        id: row.provider,
        name: row.displayName || row.provider,
        active: false,
      }
      entry.active = true
      providerById.set(row.provider, entry)
      for (const model of candidateModels) {
        // Credentials authorize a provider, but only llm.models confirms a
        // model is actually routable. Registry candidates must stay unavailable
        // until their signed profile has been installed in the runtime.
        if (model.provider === row.provider && model.routeRegistered) availableKeys.add(model.key)
      }
      for (const key of addedModelKeys) {
        const model = candidateModels.find((candidate) => candidate.key === key)
        if (key.startsWith(`${row.provider}/`) && model?.routeRegistered) availableKeys.add(key)
      }
    }
    for (const model of candidateModels) model.available = model.routeRegistered && availableKeys.has(model.key)
  }

  async function reloadDshHostAfterCredentialChange() {
    // Host 重启意味着 provider/凭据已变，目录缓存必须失效，否则 UI 会读到旧配置。
    invalidateModelDirectoryCache()
    if (!dshHostManager) return
    try {
      await dshHostManager.stop()
      await dshHostManager.start()
    } catch (error) {
      console.warn('DSH Host 凭据变更后重载失败:', error instanceof Error ? error.message : error)
    }
  }

  async function mergeLiveProviderModels(
    directory,
    candidateModels,
    availableKeys,
    providerById,
    profiles,
    registryByKey = new Map(),
    registryVersion = null,
  ) {
    if (!userDataPath || !dshRuntimeRoot) return
    const home = dshHome()
    const failures = []
    for (const providerRow of directory.providers ?? []) {
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

  async function buildCatalogFromDirectory(directory, { liveDiscovery = false } = {}) {
    const migratedFromAutoRoute = await profileStore.migrateLegacyAutoRouteActiveKey()
    const [profiles, activeModelKey, addedModelKeys, activeThinkingLevel] = await Promise.all([
      profileStore.listProfiles(),
      profileStore.getActiveModelKey(),
      profileStore.listAddedModelKeys(),
      profileStore.getThinkingLevel(),
    ])
    const activeRegistry = modelRegistryUpdater
      ? await modelRegistryUpdater.loadActiveRegistry()
      : { registry: null, source: 'bundled' }
    const registryByKey = new Map(registryModels(activeRegistry.registry).map((model) => [model.key, model]))
    const registryVersion = activeRegistry.registry?.registryVersion ?? null
    const persistedAdditionKeys = new Set(directory.providers.flatMap((providerRow) => {
      const value = providerSettings(directory, providerRow).value
      return (Array.isArray(value?.modelAdditions) ? value.modelAdditions : [])
        .flatMap((model) => model?.id ? [`${providerRow.provider}/${model.id}`] : [])
    }))
    const providerById = new Map(directory.providers.map((provider) => [provider.provider, {
      id: provider.provider,
      name: provider.displayName || provider.provider,
      active: Boolean(provider.active),
    }]))
    for (const group of directory.groups) {
      if (!providerById.has(group.id)) providerById.set(group.id, { id: group.id, name: group.name || group.id, active: true })
    }
    const availableKeys = new Set()
    const candidateModels = directory.groups.flatMap((group) => {
      const provider = providerById.get(group.id) ?? { id: group.id, name: group.name || group.id, active: true }
      return group.models.map((model) => {
        const key = `${group.id}/${model.id}`
        if (provider.active) availableKeys.add(key)
        const registryEntry = registryByKey.get(key) ?? null
        return serializeDshModel(
          provider,
          model,
          availableKeys,
          profiles[key] ?? null,
          registryEntry,
          registryEntry ? 'remote' : (persistedAdditionKeys.has(key) ? 'remote' : 'bundled'),
          registryEntry ? registryVersion : null,
        )
      })
    })
    // Groups are the DSH Host's routable model catalog. Re-serialize after all
    // route keys are known so each row has its final availability flag.
    const catalogByKey = new Map(candidateModels.map((model) => [model.key, model]))
    for (const model of candidateModels) model.available = availableKeys.has(model.key)
    if (liveDiscovery) {
      await mergeLiveProviderModels(
        directory,
        candidateModels,
        availableKeys,
        providerById,
        profiles,
        registryByKey,
        registryVersion,
      )
      for (const model of candidateModels) catalogByKey.set(model.key, model)
    }
    // Signed registry rows are visible in the picker even when the bundled
    // DSH catalog does not know them yet. The exact selection is written into
    // DSH modelAdditions only when the user adds it, then confirmed through
    // llm.models before it becomes an available TaskWeaver model.
    const providerRowsById = new Map((directory.providers ?? []).map((row) => [row.provider, row]))
    for (const entry of registryModels(activeRegistry.registry)) {
      if (catalogByKey.has(entry.key) || entry.deprecated) continue
      const providerRow = providerRowsById.get(entry.provider)
      if (!providerRow || providerRow.settingsNs !== 'llm-pi-ai') continue
      const configuredApi = providerSettings(directory, providerRow).value?.api
      if (typeof configuredApi === 'string' && configuredApi && entry.api !== configuredApi) continue
      const provider = providerById.get(entry.provider) ?? { id: entry.provider, name: entry.provider, active: false }
      const model = serializeDshModel(
        provider,
        { id: entry.id, name: entry.name || entry.id },
        availableKeys,
        profiles[entry.key] ?? null,
        entry,
        'remote',
        registryVersion,
        false,
      )
      candidateModels.push(model)
      catalogByKey.set(entry.key, model)
    }
    await applyCredentialBasedAvailability(directory, providerById, availableKeys, candidateModels, addedModelKeys)
    const models = addedModelKeys.map((key) => {
      const fromCatalog = catalogByKey.get(key)
      if (fromCatalog) {
        fromCatalog.available = availableKeys.has(key)
        return fromCatalog
      }
      const slash = key.indexOf('/')
      const provider = slash > 0 ? key.slice(0, slash) : ''
      const id = slash > 0 ? key.slice(slash + 1) : key
      const registryEntry = registryByKey.get(key) ?? null
      const model = serializeDshModel(
        providerById.get(provider) ?? { id: provider },
        { id, name: id },
        availableKeys,
        profiles[key] ?? null,
        registryEntry,
        registryEntry ? 'remote' : 'user',
        registryEntry ? registryVersion : null,
        false,
      )
      if (!registryEntry && persistedAdditionKeys.has(key)) model.verificationStatus = 'unverified'
      model.available = availableKeys.has(key)
      return model
    })

    const activeModel = models.find((item) => item.key === activeModelKey)
    const resolvedThinkingLevel = activeThinkingLevel
      ?? activeModel?.defaultThinkingLevel
      ?? 'medium'

    return {
      models,
      candidateModels,
      providers: [...providerById.keys()].sort(),
      activeModelKey,
      activeThinkingLevel: resolvedThinkingLevel,
      primaryModelReselectRequired: migratedFromAutoRoute,
    }
  }

  async function listCatalog() {
    const directory = await getDshModelDirectory()
    return buildCatalogFromDirectory(directory, { liveDiscovery: true })
  }

  async function refreshCatalog() {
    const directory = await getDshModelDirectory({ force: true })
    return buildCatalogFromDirectory(directory, { liveDiscovery: true })
  }

  async function validateRegistryMapping(registry) {
    const directory = await fetchDshModelDirectoryOnce()
    const providerRows = new Map((directory.providers ?? []).map((item) => [item.provider, item]))
    const groups = new Map((directory.groups ?? []).map((group) => [group.id, group]))
    const namespace = findSettingsNamespace(directory.namespaces, 'llm-pi-ai')
    const models = registryModels(registry).filter((model) => !model.deprecated)
    const unsupportedProviders = new Set()
    const unsupportedMappings = []
    for (const model of models) {
      const provider = providerRows.get(model.provider)
      const group = groups.get(model.provider)
      if (!provider) {
        unsupportedProviders.add(model.provider)
        continue
      }
      const alreadyRoutable = (group?.models ?? []).some((item) => item.id === model.id)
      if (alreadyRoutable) continue
      const runtimeProviderModels = provider.settingsNs === 'llm-pi-ai'
        ? piAiProviderModels(model.provider)
        : null
      const knownRuntimeApis = runtimeProviderModels
        ? Object.entries(runtimeProviderModels)
          .filter(([, entries]) => entries && Object.hasOwn(entries, model.id))
          .map(([api]) => api)
        : []
      if (knownRuntimeApis.length) {
        if (model.api && !knownRuntimeApis.includes(model.api)) {
          unsupportedMappings.push(`${model.key}（协议与 Runtime 内置模型目录不一致）`)
        }
        continue
      }
      const registryProvider = registry.providers?.[model.provider]
      if (provider.settingsNs !== 'llm-pi-ai' || !namespace || namespace.writable === false) {
        unsupportedMappings.push(`${model.key}（运行时不支持在线添加模型）`)
        continue
      }
      const protocols = Array.isArray(registryProvider?.protocols) ? registryProvider.protocols : []
      const supportedProtocols = schemaValuesAtPath(namespace.schema, ['providers', model.provider, 'api'])
      if (!protocols.length || protocols.some((protocol) => !supportedProtocols.includes(protocol))) {
        unsupportedMappings.push(`${model.key}（提供方协议与当前 Runtime 不兼容）`)
        continue
      }
      if (!model.api || !protocols.includes(model.api) || !supportedProtocols.includes(model.api)) {
        unsupportedMappings.push(`${model.key}（缺少受支持的模型协议）`)
      }
    }
    if (unsupportedProviders.size) {
      throw new Error(`当前 Z Host 未注册提供方：${[...unsupportedProviders].join(', ')}`)
    }
    if (unsupportedMappings.length) {
      throw new Error(`当前 Z Host 无法映射模型目录：${unsupportedMappings.slice(0, 8).join('；')}${unsupportedMappings.length > 8 ? '；…' : ''}`)
    }
    return true
  }

  function hasPiAiSettingsNamespace(directory) {
    if (findSettingsNamespace(directory.namespaces, 'llm-pi-ai')) return true
    return (directory.providers ?? []).some((row) => row.settingsNs === 'llm-pi-ai')
  }

  function defaultPiAiProviderRow(providerId, displayName = providerId) {
    return {
      provider: providerId,
      displayName: displayName || providerId,
      settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', providerId],
      active: false,
    }
  }

  function synthesizeProviderRowFromGroup(directory, group) {
    if (String(group.id).startsWith('custom-') || !hasPiAiSettingsNamespace(directory)) {
      return {
        provider: group.id,
        displayName: group.name || group.id,
        active: true,
        settingsNs: undefined,
        settingsPath: [],
      }
    }
    return { ...defaultPiAiProviderRow(group.id, group.name || group.id), active: true }
  }

  function providerRowsForAuth(directory) {
    const byId = new Map()
    for (const provider of directory.providers ?? []) {
      byId.set(provider.provider, provider)
    }
    for (const group of directory.groups ?? []) {
      if (!byId.has(group.id)) {
        byId.set(group.id, synthesizeProviderRowFromGroup(directory, group))
      }
    }
    return [...byId.values()]
  }

  function resolveProviderRow(directory, providerId) {
    const fromProviders = directory.providers?.find((item) => item.provider === providerId)
    if (fromProviders) {
      if (fromProviders.settingsNs || String(providerId).startsWith('custom-')) return fromProviders
      if (hasPiAiSettingsNamespace(directory)) {
        return {
          ...defaultPiAiProviderRow(providerId, fromProviders.displayName || providerId),
          ...fromProviders,
          settingsNs: 'llm-pi-ai',
          settingsPath: fromProviders.settingsPath?.length
            ? fromProviders.settingsPath
            : ['providers', providerId],
        }
      }
      return fromProviders
    }
    const fromDirectory = providerRowsForAuth(directory).find((item) => item.provider === providerId)
    if (fromDirectory) return fromDirectory
    if (!String(providerId).startsWith('custom-') && hasPiAiSettingsNamespace(directory)) {
      return defaultPiAiProviderRow(providerId)
    }
    return null
  }

  async function buildProvidersAuthFromDirectory(directory) {
    const rows = providerRowsForAuth(directory)
    const home = userDataPath ? dshHome() : null
    return Promise.all(rows.map(async (provider) => {
      const { namespace, value } = providerSettings(directory, provider)
      const configuredRef = value?.apiKeyEnv
      let credential = null
      if (typeof configuredRef === 'string' && configuredRef.trim()) {
        const response = dshValue(await directory.api.credentials.describe({ refs: [configuredRef.trim()] }), '读取 DSH 凭据状态')
        credential = response.credentials?.[configuredRef.trim()] ?? null
      }
      const apiKeyConfigured = Boolean(credential?.configured)
      const nativeOAuth = TASKWEAVER_NATIVE_OAUTH[provider.provider]
      const oauthConfigured = nativeOAuth && home
        ? await hasPiAiGrant(home, provider.provider)
        : false
      const configured = apiKeyConfigured || oauthConfigured
      return {
        id: provider.provider,
        name: provider.displayName || provider.provider,
        configured,
        authType: oauthConfigured ? 'oauth' : (apiKeyConfigured ? 'api_key' : null),
        writable: namespace?.writable !== false && (credential?.writable ?? true),
        source: oauthConfigured ? 'TaskWeaver OAuth' : (credential?.source ?? null),
        authorizationMethods: nativeOAuth ? [{ id: 'oauth', label: nativeOAuth.label }] : [],
        authorizationKey: nativeOAuth ? `llm-pi-ai/${provider.provider}` : null,
        authorizationInFlight: pendingNativeOAuth?.providerId === provider.provider,
      }
    }))
  }

  async function listProvidersAuth() {
    const directory = await getDshModelDirectory()
    return buildProvidersAuthFromDirectory(directory)
  }

  async function loadModelBundle() {
    const directory = await getDshModelDirectory()
    const [catalog, auth] = await Promise.all([
      buildCatalogFromDirectory(directory, { liveDiscovery: false }),
      buildProvidersAuthFromDirectory(directory),
    ])
    return { catalog, auth, hostReady: true, providerCount: auth.length }
  }

  function formatOAuthError(error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/unsupported_country_region_territory/i.test(message)) {
      return message
    }
    if (/fetch failed/i.test(message)) {
      return '无法连接 OpenAI 授权服务器（fetch failed）。请检查网络、系统代理或防火墙后重试；若浏览器能打开 openai.com，请开启系统代理使 TaskWeaver 与浏览器走同一路径。'
    }
    if (/授权兑换失败 \(403\)|授权兑换被拒绝 \(403\)/i.test(message)) {
      return message
    }
    return message
  }

  async function activateDefaultCodexModel(catalog) {
    const codexModels = catalog.candidateModels.filter((m) => m.provider === 'openai-codex' && m.available)
    const defaultModel = codexModels.find((m) => m.id === 'gpt-5.5' || m.id === 'gpt-5.4') ?? codexModels[0]
    if (!defaultModel) return catalog
    const added = await profileStore.listAddedModelKeys()
    if (!added.includes(defaultModel.key)) await profileStore.addModel(defaultModel.key)
    const active = await profileStore.getActiveModelKey()
    if (!active) await profileStore.setActiveModelKey(defaultModel.key)
    return listCatalog()
  }

  async function loginOpenAiCodexNative(providerId, onStatus = () => {}) {
    if (pendingNativeOAuth) {
      pendingNativeOAuth.cancel()
      pendingNativeOAuth = null
    }
    const meta = TASKWEAVER_NATIVE_OAUTH[providerId]
    if (!meta) throw new Error(`暂不支持 ${providerId} 的 OAuth 登录`)

    const { verifier, state, url } = createTaskWeaverAuthorizationUrl()
    const server = await startTaskWeaverOAuthServer(state)
    const abortController = new AbortController()

    let submitCodeResolve = null
    const submitCodePromise = new Promise((resolve) => {
      submitCodeResolve = resolve
    })

    const cancel = () => {
      abortController.abort()
      server.close()
    }

    pendingNativeOAuth = { providerId, cancel, submitCode: submitCodeResolve }

    onStatus({
      status: 'auth_url',
      url,
      instructions: meta.instructions,
      providerId,
    })

    try {
      const raceResult = await Promise.race([
        server.waitForCode(),
        submitCodePromise.then((input) => ({ code: parseAuthorizationCodeInput(input) })),
        new Promise((_, reject) => {
          abortController.signal.addEventListener('abort', () => reject(new Error('OAuth 授权已取消')))
        }),
      ])

      const code = raceResult?.code
      if (!code) throw new Error('未获取到有效的授权码')

      onStatus({ status: 'progress', instructions: '正在兑换授权码…', providerId })
      const credential = await exchangeAuthorizationCode(code, verifier)
      await writePiAiGrant(dshHome(), providerId, credential)
      await reloadDshHostAfterCredentialChange()
      onStatus({ status: 'completed', instructions: 'ChatGPT 订阅已绑定至 TaskWeaver。', providerId })
      const catalog = await refreshCatalog()
      return activateDefaultCodexModel(catalog)
    } catch (error) {
      const message = formatOAuthError(error)
      onStatus({ status: 'error', error: message, providerId })
      throw error instanceof Error ? error : new Error(message)
    } finally {
      server.close()
      if (pendingNativeOAuth?.cancel === cancel) pendingNativeOAuth = null
    }
  }

  async function startProviderAuthorization(providerId, onStatus = () => {}) {
    if (TASKWEAVER_NATIVE_OAUTH[providerId]) {
      await loginOpenAiCodexNative(providerId, onStatus)
      return { providerId, authorizationKey: `llm-pi-ai/${providerId}` }
    }
    throw new Error(`暂不支持 ${providerId} 的 OAuth 登录`)
  }

  async function submitOAuthCode(code) {
    if (!pendingNativeOAuth?.submitCode) throw new Error('当前没有进行中的 OAuth 登录')
    pendingNativeOAuth.submitCode(code)
    return true
  }

  async function submitAuthorizationPrompt(answer) {
    return submitOAuthCode(answer)
  }

  async function cancelProviderAuthorization() {
    if (pendingNativeOAuth) {
      pendingNativeOAuth.cancel()
      pendingNativeOAuth = null
      return true
    }
    return false
  }

  async function logoutProvider(providerId) {
    if (TASKWEAVER_NATIVE_OAUTH[providerId]) {
      await deletePiAiGrant(dshHome(), providerId)
      return listCatalog()
    }
    throw new Error(`${providerId} 没有可撤销的 OAuth 授权`)
  }

  async function setProviderApiKey(providerId, apiKey) {
    const normalizedKey = String(apiKey ?? '').trim()
    if (!normalizedKey) throw new Error('API 密钥不能为空')
    const directory = await getDshModelDirectory()
    const provider = resolveProviderRow(directory, providerId)
    if (!provider) throw new Error('Z 模型目录中不存在该提供方')
    if (!provider.settingsNs) {
      throw new Error('该提供方未暴露 Z Runtime 凭据配置入口，无法保存 API 密钥。')
    }
    const {
      directory: writableDirectory,
      namespace,
      settingsNs,
      ref,
      settingPath,
      bootstrapSettings,
    } = await resolveDshCredentialRef(directory, provider)
    if (namespace?.writable === false) {
      throw new Error(`${provider.displayName || providerId} 的 Z Runtime 设置为只读，无法保存凭据`)
    }
    dshValue(await writableDirectory.api.credentials.set({ ref, value: normalizedKey }), '保存 DSH 模型凭据')
    try {
      const mutatePayload = {
        ns: namespace?.ns ?? settingsNs,
        ops: [{ op: 'set', path: settingPath, value: ref }],
        ...(namespace ? { expectedRevision: namespace.revision } : {}),
      }
      const mutated = dshValue(
        await writableDirectory.api.settings.mutate(mutatePayload),
        bootstrapSettings ? '初始化 DSH 提供方设置' : '更新 DSH 提供方设置',
      )
      if (bootstrapSettings && mutated?.revision === undefined) {
        throw new Error(`${provider.displayName || providerId} 的 Z Runtime 设置写入未得到确认`)
      }
    } catch (error) {
      // Roll back only a newly-created reference; never erase a prior user key.
      const status = dshValue(await directory.api.credentials.describe({ refs: [ref] }), '校验 DSH 凭据')
      if (status.credentials?.[ref]?.configured) {
        // DSH does not expose secret values for rollback. Leave the opaque value
        // in its credential store rather than risk deleting a pre-existing key.
      }
      throw error
    }
    await reloadDshHostAfterCredentialChange()
    return listCatalog()
  }

  async function addModel(modelKey) {
    let catalog = await listCatalog()
    let model = catalog.candidateModels.find((candidate) => candidate.key === modelKey)
    if (!model) throw new Error('Z 模型目录中不存在该模型；请先刷新目录')
    const auth = await listProvidersAuth()
    if (!auth.find((provider) => provider.id === model.provider)?.configured) {
      throw new Error('请先在 Z Runtime 中配置该模型提供方的凭据')
    }
    if (!model.routeRegistered) {
      const { registry } = await modelRegistryUpdater.loadActiveRegistry()
      const registryEntry = registry.models?.[modelKey]
      if (!registryEntry || registryEntry.deprecated) {
        throw new Error('此模型不在受信任的模型目录中，无法写入 Z Runtime')
      }
      const directory = await fetchDshModelDirectoryOnce()
      await applyRegistryAdditions(directory, registry, [modelKey])
      catalog = await listCatalog()
      model = catalog.candidateModels.find((candidate) => candidate.key === modelKey)
    }
    if (!model?.routeRegistered || !model.available) throw new Error('Z Host 尚未确认该模型可路由')
    await profileStore.addModel(modelKey)
    return listCatalog()
  }

  async function removeProviderCredentials(providerId) {
    const directory = await getDshModelDirectory()
    const provider = resolveProviderRow(directory, providerId)
    if (!provider) throw new Error('Z Runtime 模型目录中不存在该提供方')
    if (!provider.settingsNs) {
      throw new Error('该提供方未暴露 Z Runtime 凭据配置入口，无法移除凭据。')
    }
    const { namespace, value } = providerSettings(directory, provider)
    const ref = value?.apiKeyEnv
    if (typeof ref !== 'string' || !ref.trim()) {
      if (TASKWEAVER_NATIVE_OAUTH[providerId]) return logoutProvider(providerId)
      throw new Error('该提供方未配置 API 密钥引用')
    }
    dshValue(await directory.api.credentials.unset({ ref: ref.trim() }), '移除 DSH 模型凭据')
    if (namespace.writable === false) throw new Error('凭据已移除，但该 Z Runtime 设置为只读，无法清除凭据引用')
    return listCatalog()
  }

  async function removeModel(modelKey) {
    await profileStore.removeModel(modelKey)
    return listCatalog()
  }

  async function resolveModel(modelKey) {
    const catalog = await listCatalog()
    const model = catalog.candidateModels.find((candidate) => candidate.key === modelKey)
    if (!model) throw new Error(`Z 模型目录中未找到模型：${modelKey}`)
    const profile = await profileStore.getProfile(modelKey)
    return {
      ...model,
      profile,
    }
  }

  async function getDshModelConfig(modelKey) {
    const directory = await getDshModelDirectory()
    const [provider, ...idParts] = String(modelKey ?? '').split('/')
    const id = idParts.join('/')
    if (!provider || !id) throw new Error('模型标识无效')
    const group = directory.groups.find((item) => item.id === provider)
    const model = group?.models.find((item) => item.id === id)
    if (!model) throw new Error(`Z 模型目录中未找到模型：${modelKey}`)
    const reasoningEfforts = model.reasoning?.efforts
      ?.map((effort) => String(effort.id ?? '').toLowerCase())
      .filter(Boolean) ?? []
    const supportedThinkingLevels = [...new Set(['off', ...reasoningEfforts])]
    return {
      provider,
      id,
      name: model.name || id,
      reasoning: reasoningEfforts.length > 0,
      ...(reasoningEfforts.length ? {
        supportedThinkingLevels,
        defaultThinkingLevel: model.reasoning?.defaultEffort
          ?? (reasoningEfforts.includes('high') ? 'high' : reasoningEfforts.includes('medium') ? 'medium' : reasoningEfforts[0]),
      } : {}),
    }
  }

  async function dispose() {
    if (pendingNativeOAuth) {
      pendingNativeOAuth.cancel()
      pendingNativeOAuth = null
    }
    await cancelProviderAuthorization().catch(() => {})
  }

  return {
    listCatalog,
    refreshCatalog,
    loadModelBundle,
    listProvidersAuth,
    startProviderAuthorization,
    submitOAuthCode,
    submitAuthorizationPrompt,
    cancelProviderAuthorization,
    logoutProvider,
    setProviderApiKey,
    addModel,
    removeModel,
    removeProviderCredentials,
    async getThinkingLevel() {
      const explicit = await profileStore.getThinkingLevel()
      if (explicit) return explicit
      const catalog = await listCatalog()
      const activeModel = catalog.models.find((item) => item.key === catalog.activeModelKey)
      return activeModel?.defaultThinkingLevel ?? 'medium'
    },
    async setThinkingLevel(level) {
      return profileStore.setThinkingLevel(level)
    },
    resolveModel,
    getDshModelConfig,
    validateRegistryMapping,
    dispose,
    reloadPriceRegistry,
  }
}
