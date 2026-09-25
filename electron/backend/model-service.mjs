import path from 'node:path'
import { ModelRuntime } from '../agent/agent-runtime.mjs'
import { listModelsFromExport, modelSourceNamespace, syncOpenCodexFromCli } from './opencodex-sync.mjs'
import { createCredentialStore } from './credential-store.mjs'
import { loadPriceRegistry, mergeRegistryCost, registryPriceMeta } from './price-registry.mjs'
import {
  createTaskWeaverAuthorizationUrl,
  startTaskWeaverOAuthServer,
  exchangeAuthorizationCode,
  parseAuthorizationCodeInput,
} from './codex-oauth.mjs'

/** @typedef {'cheap' | 'balanced' | 'strong'} ModelTier */

/**
 * 模型接入层（主进程单例）：目录与鉴权走内置运行时；档位与能力摘要走 profile-store。
 */
export function createModelService({ profileStore, appDataPath, safeStorage, priceRegistryPath }) {
  let priceRegistry = loadPriceRegistry(priceRegistryPath)
  let catalogPriceMeta = registryPriceMeta(priceRegistry)

  function reloadPriceRegistry() {
    priceRegistry = loadPriceRegistry(priceRegistryPath)
    catalogPriceMeta = registryPriceMeta(priceRegistry)
  }
  /** @type {import('../agent/runtime-types.d.ts').ModelRuntime | null} */
  let runtime = null
  /** @type {Promise<import('../agent/runtime-types.d.ts').ModelRuntime> | null} */
  let initPromise = null
  const credentials = createCredentialStore({
    filePath: path.join(appDataPath, 'taskweaver', 'credentials.enc'),
    safeStorage,
  })

  async function getRuntime() {
    if (runtime) return runtime
    if (!initPromise) {
      initPromise = ModelRuntime.create({
        allowModelNetwork: false,
        credentials,
        modelsPath: path.join(appDataPath, 'taskweaver', 'models.json'),
        modelsStorePath: path.join(appDataPath, 'taskweaver', 'models-store.json'),
      })
    }
    runtime = await initPromise
    return runtime
  }

  function modelKey(model) {
    return `${model.provider}/${model.id}`
  }

  function serializeModel(model, availableKeys) {
    const key = modelKey(model)
    const { cost, priceMeta } = mergeRegistryCost(key, model.cost, priceRegistry)
    return {
      key,
      provider: model.provider,
      id: model.id,
      name: model.name,
      api: model.api,
      reasoning: model.reasoning,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      costPerMillion: {
        input: cost.input,
        output: cost.output,
        cacheRead: cost.cacheRead,
        cacheWrite: cost.cacheWrite,
      },
      priceMeta: priceMeta ?? catalogPriceMeta,
      available: availableKeys.has(key),
    }
  }

  async function listCatalog() {
    const rt = await getRuntime()
    const [all, available, profiles, activeModelKey, addedModelKeys, activeThinkingLevel] = await Promise.all([
      Promise.resolve(rt.getModels()),
      rt.getAvailable(),
      profileStore.listProfiles(),
      profileStore.getActiveModelKey(),
      profileStore.listAddedModelKeys(),
      profileStore.getThinkingLevel(),
    ])
    const availableKeys = new Set(available.map(modelKey))
    const providers = [...new Set(all.map((m) => m.provider))].sort()

    const candidateModels = all.map((m) => {
      const key = modelKey(m)
      const profile = profiles[key] ?? null
      return {
        ...serializeModel(m, availableKeys),
        profile: profile
          ? {
              tier: profile.tier,
              capabilitySummary: profile.capabilitySummary,
              enabledForAllocation: profile.enabledForAllocation,
              notes: profile.notes,
            }
          : null,
      }
    })

    const added = new Set(addedModelKeys)
    return {
      models: candidateModels.filter((model) => added.has(model.key)),
      candidateModels: candidateModels.filter((model) => availableKeys.has(model.key)),
      providers,
      activeModelKey,
      activeThinkingLevel: activeThinkingLevel || 'high',
    }
  }

  async function refreshCatalog() {
    const rt = await getRuntime()
    try {
      await rt.refresh({ allowNetwork: true, force: true })
    } catch {
      // 离线或网络失败时仍返回当前快照
    }
    return listCatalog()
  }

  async function listProvidersAuth() {
    const rt = await getRuntime()
    const providers = rt.getProviders()
    const stored = new Set((await credentials.list()).map((entry) => entry.providerId))
    const checks = await Promise.all(
      providers.map(async (p) => {
        const auth = await rt.checkAuth(p.id)
        return {
          id: p.id,
          name: p.name ?? p.id,
          configured: Boolean(auth),
          authType: auth?.type ?? null,
          writable: stored.has(p.id),
          source: stored.has(p.id) ? 'taskweaver' : auth?.source ?? null,
        }
      }),
    )
    return checks
  }

  async function setProviderApiKey(providerId, apiKey) {
    const rt = await getRuntime()
    if (!rt.getProviders().some((provider) => provider.id === providerId)) throw new Error('未知的模型提供方')
    const normalizedKey = String(apiKey ?? '').trim()
    if (!normalizedKey) throw new Error('API 密钥不能为空')
    await credentials.modify(providerId, async () => ({ type: 'api_key', key: normalizedKey }))
    await rt.refresh({ allowNetwork: false, force: true })
    return listCatalog()
  }

  async function addModel(modelKey) {
    const rt = await getRuntime()
    const [provider, ...parts] = String(modelKey ?? '').split('/')
    const id = parts.join('/')
    if (!provider || !id) throw new Error('模型标识无效')
    const model = rt.getModel(provider, id)
    if (!model) throw new Error('模型目录中不存在该模型')
    const available = await rt.getAvailable(provider)
    if (!available.some((item) => item.id === id)) throw new Error('请先配置该模型提供方的连接凭据')
    await profileStore.addModel(modelKey)
    return listCatalog()
  }

  async function removeProviderCredentials(providerId) {
    const rt = await getRuntime()
    if (!rt.getProviders().some((provider) => provider.id === providerId)) throw new Error('未知的模型提供方')
    try {
      await rt.logout(providerId)
    } catch {
      // ignore
    }
    await credentials.delete(providerId)
    await rt.refresh({ allowNetwork: false, force: true })
    return listCatalog()
  }

  let pendingOAuth = null

  async function loginProviderOAuth(providerId = 'openai-codex', onStatusUpdate) {
    if (pendingOAuth) {
      pendingOAuth.cancel()
      pendingOAuth = null
    }

    if (providerId === 'openai-codex') {
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

      pendingOAuth = {
        providerId,
        cancel,
        submitCode: submitCodeResolve,
      }

      onStatusUpdate?.({
        status: 'auth_url',
        url,
        instructions: '已在浏览器打开 OpenAI 授权页面，完成授权后将自动连接到 TaskWeaver。',
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

        const credential = await exchangeAuthorizationCode(code, verifier)
        await credentials.modify(providerId, async () => credential)

        const rt = await getRuntime()
        await rt.refresh({ allowNetwork: false, force: true })

        // 默认激活 gpt-5.5
        const available = await rt.getAvailable(providerId)
        const defaultModel = available.find((m) => m.id === 'gpt-5.5' || m.id === 'gpt-5.4') ?? available[0]
        if (defaultModel) {
          const key = modelKey(defaultModel)
          const added = await profileStore.listAddedModelKeys()
          if (!added.includes(key)) {
            await profileStore.addModel(key)
          }
          const active = await profileStore.getActiveModelKey()
          if (!active) {
            await profileStore.setActiveModelKey(key)
          }
        }
        return listCatalog()
      } finally {
        server.close()
        if (pendingOAuth?.cancel === cancel) {
          pendingOAuth = null
        }
      }
    }

    throw new Error(`暂不支持 ${providerId} 的 OAuth 登录`)
  }

  function submitOAuthCode(code) {
    if (pendingOAuth?.submitCode) {
      pendingOAuth.submitCode(code)
      return true
    }
    return false
  }

  function cancelOAuthLogin() {
    if (pendingOAuth) {
      pendingOAuth.cancel()
      pendingOAuth = null
      return true
    }
    return false
  }

  async function logoutProvider(providerId) {
    return removeProviderCredentials(providerId)
  }

  async function removeModel(modelKey) {
    await profileStore.removeModel(modelKey)
    return listCatalog()
  }

  async function resolveModel(modelKey) {
    const rt = await getRuntime()
    const [provider, ...idParts] = modelKey.split('/')
    const id = idParts.join('/')
    if (!provider || !id) {
      throw new Error(`Invalid model key: ${modelKey}`)
    }
    const model = rt.getModel(provider, id)
    if (!model) {
      throw new Error(`Model not found: ${modelKey}`)
    }
    const available = await rt.getAvailable()
    const availableKeys = new Set(available.map(modelKey))
    const profile = await profileStore.getProfile(modelKey)
    return {
      ...serializeModel(model, availableKeys),
      profile,
    }
  }

  async function scanLocalOpenCodexModels() {
    const modelsPath = path.join(appDataPath, 'taskweaver', 'models.json')
    const { baseUrl, providerIds, exportDoc } = await syncOpenCodexFromCli({
      modelsPath,
      credentials,
      ensureProxy: true,
    })
    const providerSet = new Set(providerIds.length ? providerIds : ['opencodex'])
    const exported = listModelsFromExport(exportDoc, [...providerSet])

    const rt = await getRuntime()
    if (typeof rt.reloadConfig === 'function') {
      await rt.reloadConfig()
    } else {
      await rt.refresh({ allowNetwork: false, force: true })
    }

    const [runtimeModels, available, addedModelKeys] = await Promise.all([
      Promise.resolve(rt.getModels()),
      rt.getAvailable(),
      profileStore.listAddedModelKeys(),
    ])
    const runtimeByKey = new Map(
      runtimeModels
        .filter((m) => providerSet.has(m.provider))
        .map((m) => [modelKey(m), m]),
    )
    const availableKeys = new Set(available.map(modelKey))
    const added = new Set(addedModelKeys)

    const sourceRows = exported.length
      ? exported
      : [...runtimeByKey.entries()].map(([key, m]) => ({
          key,
          name: m.name,
          id: m.id,
          provider: m.provider,
          source: modelSourceNamespace(m.id),
        }))

    const models = sourceRows
      .map((row) => {
        const runtime = runtimeByKey.get(row.key)
        const key = row.key
        return {
          key,
          name: runtime?.name ?? row.name,
          id: row.id,
          provider: row.provider,
          source: row.source,
          available: availableKeys.has(key) || Boolean(runtime),
          alreadyAdded: added.has(key),
        }
      })
      .sort((a, b) => a.key.localeCompare(b.key))

    return {
      proxyUrl: baseUrl,
      providerIds: [...providerSet],
      syncedAt: new Date().toISOString(),
      models,
    }
  }

  async function dispose() {
    runtime = null
    initPromise = null
  }

  return {
    getRuntime,
    listCatalog,
    refreshCatalog,
    listProvidersAuth,
    setProviderApiKey,
    loginProviderOAuth,
    submitOAuthCode,
    cancelOAuthLogin,
    logoutProvider,
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
    dispose,
    modelKey,
    reloadPriceRegistry,
    scanLocalOpenCodexModels,
  }
}
