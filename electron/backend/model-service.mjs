import { randomUUID } from 'node:crypto'
import { loadPriceRegistry, mergeRegistryCost, registryPriceMeta } from './price-registry.mjs'

/** @typedef {'cheap' | 'balanced' | 'strong'} ModelTier */

/**
 * 模型接入层（主进程单例）：目录与鉴权走内置运行时；档位与能力摘要走 profile-store。
 */
export function createModelService({ profileStore, priceRegistryPath, dshHostManager = null }) {
  let priceRegistry = loadPriceRegistry(priceRegistryPath)
  let catalogPriceMeta = registryPriceMeta(priceRegistry)

  function reloadPriceRegistry() {
    priceRegistry = loadPriceRegistry(priceRegistryPath)
    catalogPriceMeta = registryPriceMeta(priceRegistry)
  }
  let activeAuthorization = null

  function dshValue(response, operation) {
    const result = response?.result ?? response
    if (result?.ok === false) throw new Error(result.error?.message || `${operation}失败`)
    return result?.value ?? result
  }

  async function readAuthorizationFlows(api) {
    try {
      const response = await api.authorization.list({})
      const result = response?.result ?? response
      if (result?.ok === false) return []
      const value = result?.value ?? result
      return value?.flows ?? []
    } catch {
      return []
    }
  }

  function atPath(value, pathParts) {
    return pathParts.reduce((current, key) => current && typeof current === 'object' ? current[key] : undefined, value)
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  async function fetchDshModelDirectoryOnce() {
    if (!dshHostManager) throw new Error('DSH 模型目录未连接')
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

  async function getDshModelDirectory() {
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

  function providerSettings(directory, provider) {
    const ns = directory.namespaces.find((item) => item.ns === provider.settingsNs)
    return { namespace: ns, value: atPath(ns?.value, provider.settingsPath ?? []) }
  }

  function serializeDshModel(provider, model, availableKeys, profile = null) {
    const key = `${provider.id}/${model.id}`
    const defaultCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    const { cost, priceMeta } = mergeRegistryCost(key, defaultCost, priceRegistry)
    const efforts = model.reasoning?.efforts?.map((effort) => String(effort.id).toLowerCase()) ?? []
    const supportedThinkingLevels = ['off', 'low', 'medium', 'high'].filter((level) => level === 'off' || efforts.includes(level))
    return {
      key,
      provider: provider.id,
      id: model.id,
      name: model.name || model.id,
      api: 'dsh',
      reasoning: efforts.length > 0,
      contextWindow: 0,
      maxTokens: 0,
      costPerMillion: { input: cost.input, output: cost.output, cacheRead: cost.cacheRead, cacheWrite: cost.cacheWrite },
      priceMeta: priceMeta ?? catalogPriceMeta,
      available: availableKeys.has(key),
      isTierVariant: false,
      supportedThinkingLevels: efforts.length ? supportedThinkingLevels : undefined,
      defaultThinkingLevel: model.reasoning?.defaultEffort ?? (efforts.includes('high') ? 'high' : 'medium'),
      profile,
    }
  }

  async function resolveDshCredentialRef(directory, provider) {
    const { namespace, value } = providerSettings(directory, provider)
    if (!namespace || !provider.settingsNs) {
      throw new Error(`${provider.displayName || provider.provider} 没有可写的 DSH 凭据配置入口`)
    }
    const configuredRef = value?.apiKeyEnv
    const ref = typeof configuredRef === 'string' && configuredRef.trim()
      ? configuredRef.trim()
      : `TASKWEAVER_${provider.provider.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_API_KEY`
    return { namespace, ref, settingPath: [...provider.settingsPath, 'apiKeyEnv'] }
  }

  async function buildCatalogFromDirectory(directory) {
    const migratedFromAutoRoute = await profileStore.migrateLegacyAutoRouteActiveKey()
    const [profiles, activeModelKey, addedModelKeys, activeThinkingLevel] = await Promise.all([
      profileStore.listProfiles(),
      profileStore.getActiveModelKey(),
      profileStore.listAddedModelKeys(),
      profileStore.getThinkingLevel(),
    ])
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
        return serializeDshModel(provider, model, availableKeys, profiles[key] ?? null)
      })
    })
    // Groups are the DSH Host's routable model catalog. Re-serialize after all
    // route keys are known so each row has its final availability flag.
    const catalogByKey = new Map(candidateModels.map((model) => [model.key, model]))
    for (const model of candidateModels) model.available = availableKeys.has(model.key)
    const models = addedModelKeys.map((key) => catalogByKey.get(key) ?? (() => {
      const slash = key.indexOf('/')
      const provider = slash > 0 ? key.slice(0, slash) : ''
      const id = slash > 0 ? key.slice(slash + 1) : key
      return serializeDshModel(providerById.get(provider) ?? { id: provider }, { id, name: id }, availableKeys, profiles[key] ?? null)
    })())

    return {
      models,
      candidateModels,
      providers: [...providerById.keys()].sort(),
      activeModelKey,
      activeThinkingLevel: activeThinkingLevel || 'high',
      primaryModelReselectRequired: migratedFromAutoRoute,
    }
  }

  async function listCatalog() {
    const directory = await getDshModelDirectory()
    return buildCatalogFromDirectory(directory)
  }

  async function refreshCatalog() {
    return listCatalog()
  }

  function providerRowsForAuth(directory) {
    const byId = new Map()
    for (const provider of directory.providers ?? []) {
      byId.set(provider.provider, provider)
    }
    for (const group of directory.groups ?? []) {
      if (!byId.has(group.id)) {
        byId.set(group.id, {
          provider: group.id,
          displayName: group.name || group.id,
          active: true,
          settingsNs: undefined,
          settingsPath: [],
        })
      }
    }
    return [...byId.values()]
  }

  function resolveProviderRow(directory, providerId) {
    return directory.providers?.find((item) => item.provider === providerId)
      ?? providerRowsForAuth(directory).find((item) => item.provider === providerId)
      ?? null
  }

  async function buildProvidersAuthFromDirectory(directory) {
    const flows = await readAuthorizationFlows(directory.api)
    const flowByProvider = new Map(flows.map((flow) => [flow.key.split('/').at(-1), flow]))
    const rows = providerRowsForAuth(directory)
    return Promise.all(rows.map(async (provider) => {
      const { namespace, value } = providerSettings(directory, provider)
      const configuredRef = value?.apiKeyEnv
      let credential = null
      if (typeof configuredRef === 'string' && configuredRef.trim()) {
        const response = dshValue(await directory.api.credentials.describe({ refs: [configuredRef.trim()] }), '读取 DSH 凭据状态')
        credential = response.credentials?.[configuredRef.trim()] ?? null
      }
      const apiKeyConfigured = Boolean(credential?.configured)
      const authFlow = flowByProvider.get(provider.provider)
      return {
        id: provider.provider,
        name: provider.displayName || provider.provider,
        configured: apiKeyConfigured || Boolean(authFlow?.configured),
        authType: authFlow?.configured ? 'oauth' : (apiKeyConfigured ? 'api_key' : null),
        writable: namespace?.writable !== false && (credential?.writable ?? true),
        source: authFlow?.configured ? 'DSH account' : (credential?.source ?? null),
        authorizationMethods: authFlow?.methods ?? [],
        authorizationKey: authFlow?.key ?? null,
        authorizationInFlight: Boolean(authFlow?.inFlight),
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
      buildCatalogFromDirectory(directory),
      buildProvidersAuthFromDirectory(directory),
    ])
    return { catalog, auth, hostReady: true, providerCount: auth.length }
  }

  function formatOAuthError(error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/fetch failed/i.test(message)) {
      return '无法连接 OpenAI 授权服务器（fetch failed）。请检查网络、系统代理或防火墙后重试；若浏览器能打开 openai.com，可重启 TaskWeaver 后再试。'
    }
    if (/authorization service is absent|authorization or credentials service is absent/i.test(message)) {
      return 'DSH 未加载官方订阅授权插件。请完全退出并重新打开 TaskWeaver（会自动修复 Host 配置）。'
    }
    return message
  }

  async function startProviderAuthorization(providerId, onStatus = () => {}) {
    const directory = await getDshModelDirectory()
    const flows = await readAuthorizationFlows(directory.api)
    const flow = flows.find((item) => item.key.endsWith(`/${providerId}`))
    const method = flow?.methods?.find((item) => item.id === 'oauth')
    if (!flow || !method) {
      throw new Error(
        `${providerId} 没有可用的 DSH 官方 OAuth 登录方式。请完全退出并重新打开 TaskWeaver，确保 Agent Host 已加载授权插件。`,
      )
    }

    if (activeAuthorization) await cancelProviderAuthorization().catch(() => {})
    const attemptId = randomUUID()
    const beginController = new AbortController()
    const eventsController = new AbortController()
    const attempt = { providerId, key: flow.key, attemptId, beginController, eventsController, promptId: null }
    activeAuthorization = attempt
    let streamOpenedResolve
    const streamOpened = new Promise((resolve) => { streamOpenedResolve = resolve })
    const eventTask = (async () => {
      try {
        for await (const envelope of directory.api.events.host({}, eventsController.signal, streamOpenedResolve)) {
          const frame = envelope?.payload
          if (frame?.type !== 'host/remote-event') continue
          const args = frame.args ?? []
          if (frame.event === 'taskweaver/authorization-notice' && args[0] === attemptId) {
            const notice = args[2] ?? {}
            onStatus({
              status: notice.code ? 'device_code' : (notice.url ? 'auth_url' : 'progress'),
              url: notice.url,
              userCode: notice.code,
              instructions: notice.message,
              providerId,
              attemptId,
            })
          } else if (frame.event === 'taskweaver/authorization-prompt' && args[0] === attemptId) {
            const promptId = args[1]
            const prompt = args[3] ?? {}
            attempt.promptId = promptId
            onStatus({ status: 'prompt', providerId, attemptId, promptId, prompt })
          } else if (frame.event === 'authorization/settled' && args[0] === flow.key) {
            onStatus({ status: 'progress', instructions: args[1] === 'authorized' ? 'DSH 已保存官方订阅授权。' : '授权流程已结束。', providerId, attemptId })
          }
        }
      } catch (error) {
        if (!eventsController.signal.aborted) onStatus({ status: 'error', error: formatOAuthError(error), providerId, attemptId })
      }
    })()
    await streamOpened
    attempt.beginTask = (async () => {
      try {
        const result = dshValue(await directory.api.authorization.begin({ attemptId, key: flow.key, method: method.id }, beginController.signal), 'DSH 官方订阅登录')
        onStatus({ status: result.status === 'authorized' ? 'completed' : 'error', instructions: result.status === 'authorized' ? '已完成官方订阅登录。' : '登录已取消。', providerId, attemptId })
      } catch (error) {
        if (!beginController.signal.aborted) onStatus({ status: 'error', error: formatOAuthError(error), providerId, attemptId })
      } finally {
        eventsController.abort()
        if (activeAuthorization === attempt) activeAuthorization = null
      }
    })()
    void eventTask
    return { attemptId, providerId, authorizationKey: flow.key }
  }

  async function submitAuthorizationPrompt(answer) {
    const attempt = activeAuthorization
    if (!attempt?.promptId) throw new Error('当前没有等待输入的官方订阅授权问题')
    const { api } = await dshHostManager.start()
    dshValue(await api.authorization.answer({ attemptId: attempt.attemptId, promptId: attempt.promptId, answer: String(answer ?? '') }), '提交 DSH 官方订阅授权输入')
    attempt.promptId = null
    return true
  }

  async function cancelProviderAuthorization() {
    const attempt = activeAuthorization
    if (!attempt) return false
    activeAuthorization = null
    attempt.beginController.abort()
    attempt.eventsController.abort()
    try {
      const { api } = await dshHostManager.start()
      await api.authorization.cancel({ key: attempt.key, attemptId: attempt.attemptId })
    } catch { /* a disconnected host already withdrew the request */ }
    return true
  }

  async function logoutProvider(providerId) {
    const directory = await getDshModelDirectory()
    const flows = await readAuthorizationFlows(directory.api)
    const flow = flows.find((item) => item.key.endsWith(`/${providerId}`))
    if (!flow) throw new Error(`${providerId} 没有可撤销的官方订阅授权`)
    dshValue(await directory.api.authorization.logout({ key: flow.key }), '退出 DSH 官方订阅授权')
    return listCatalog()
  }

  async function setProviderApiKey(providerId, apiKey) {
    const normalizedKey = String(apiKey ?? '').trim()
    if (!normalizedKey) throw new Error('API 密钥不能为空')
    const directory = await getDshModelDirectory()
    const provider = resolveProviderRow(directory, providerId)
    if (!provider) throw new Error('DSH 模型目录中不存在该提供方')
    if (!provider.settingsNs) {
      throw new Error('该提供方未暴露 DSH 凭据配置入口，无法保存 API 密钥。')
    }
    const { namespace, ref, settingPath } = await resolveDshCredentialRef(directory, provider)
    if (namespace.writable === false) throw new Error(`${provider.displayName || providerId} 的 DSH 设置为只读，无法保存凭据`)
    dshValue(await directory.api.credentials.set({ ref, value: normalizedKey }), '保存 DSH 模型凭据')
    try {
      dshValue(await directory.api.settings.mutate({
        ns: namespace.ns,
        expectedRevision: namespace.revision,
        ops: [{ op: 'set', path: settingPath, value: ref }],
      }), '更新 DSH 提供方设置')
    } catch (error) {
      // Roll back only a newly-created reference; never erase a prior user key.
      const status = dshValue(await directory.api.credentials.describe({ refs: [ref] }), '校验 DSH 凭据')
      if (status.credentials?.[ref]?.configured) {
        // DSH does not expose secret values for rollback. Leave the opaque value
        // in its credential store rather than risk deleting a pre-existing key.
      }
      throw error
    }
    return listCatalog()
  }

  async function addModel(modelKey) {
    const catalog = await listCatalog()
    const model = catalog.candidateModels.find((candidate) => candidate.key === modelKey)
    if (!model) throw new Error('DSH 模型目录中不存在该模型；请先刷新目录')
    if (!model.available) throw new Error('该模型当前未由 DSH Host 注册为可用路由')
    const auth = await listProvidersAuth()
    if (!auth.find((provider) => provider.id === model.provider)?.configured) {
      throw new Error('请先在 DSH 中配置该模型提供方的凭据')
    }
    await profileStore.addModel(modelKey)
    return listCatalog()
  }

  async function removeProviderCredentials(providerId) {
    const directory = await getDshModelDirectory()
    const provider = resolveProviderRow(directory, providerId)
    if (!provider) throw new Error('DSH 模型目录中不存在该提供方')
    if (!provider.settingsNs) {
      throw new Error('该提供方未暴露 DSH 凭据配置入口，无法移除凭据。')
    }
    const { namespace, value } = providerSettings(directory, provider)
    const ref = value?.apiKeyEnv
    if (typeof ref !== 'string' || !ref.trim()) return logoutProvider(providerId)
    dshValue(await directory.api.credentials.unset({ ref: ref.trim() }), '移除 DSH 模型凭据')
    if (namespace.writable === false) throw new Error('凭据已移除，但该 DSH 设置为只读，无法清除凭据引用')
    return listCatalog()
  }

  async function removeModel(modelKey) {
    await profileStore.removeModel(modelKey)
    return listCatalog()
  }

  async function resolveModel(modelKey) {
    const catalog = await listCatalog()
    const model = catalog.candidateModels.find((candidate) => candidate.key === modelKey)
    if (!model) throw new Error(`DSH 模型目录中未找到模型：${modelKey}`)
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
    if (!model) throw new Error(`DSH 模型目录中未找到模型：${modelKey}`)
    return {
      provider,
      id,
      name: model.name || id,
      reasoning: Boolean(model.reasoning?.efforts?.length),
    }
  }

  async function dispose() {
    await cancelProviderAuthorization().catch(() => {})
  }

  return {
    listCatalog,
    refreshCatalog,
    loadModelBundle,
    listProvidersAuth,
    startProviderAuthorization,
    submitAuthorizationPrompt,
    cancelProviderAuthorization,
    logoutProvider,
    setProviderApiKey,
    addModel,
    removeModel,
    removeProviderCredentials,
    async getThinkingLevel() {
      return profileStore.getThinkingLevel()
    },
    async setThinkingLevel(level) {
      return profileStore.setThinkingLevel(level)
    },
    resolveModel,
    getDshModelConfig,
    dispose,
    reloadPriceRegistry,
  }
}
