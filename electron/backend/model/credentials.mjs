import {
  createTaskWeaverAuthorizationUrl,
  exchangeAuthorizationCode,
  parseAuthorizationCodeInput,
  startTaskWeaverOAuthServer,
} from '../codex-oauth.mjs'
import {
  deletePiAiGrant,
  hasPiAiGrant,
  resolveDshHome,
  writePiAiGrant,
} from '../dsh-pi-ai-credentials.mjs'
import { reasoningCatalogFromHostModel } from '../reasoning-effort-catalog.mjs'
import {
  TASKWEAVER_NATIVE_OAUTH,
  dshValue,
  formatOAuthError,
  providerRowsForAuth,
  providerSettings,
  resolveProviderRow,
} from './shared.mjs'

/** 凭据、OAuth 与模型增删。 */
export function createModelCredentials({
  userDataPath,
  profileStore,
  modelRegistryUpdater,
  directoryClient,
  hostSync,
  catalogApi,
  resolveDshCredentialRef,
}) {
  const {
    getDshModelDirectory,
    fetchDshModelDirectoryOnce,
    reloadDshHostAfterCredentialChange,
  } = directoryClient
  const { applyRegistryAdditions } = hostSync
  const {
    listCatalog,
    refreshCatalog,
    buildCatalogFromDirectory,
    reconcileDirectoryRoutesForAddedModels,
  } = catalogApi

  /** @type {{ providerId: string, cancel: () => void, submitCode: (value: string) => void } | null} */
  let pendingNativeOAuth = null

  function dshHome() {
    if (!userDataPath) throw new Error('TaskWeaver 用户数据目录未配置，无法读写 Z Runtime 凭据')
    return resolveDshHome(userDataPath)
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
    const directory = await reconcileDirectoryRoutesForAddedModels(await getDshModelDirectory())
    const [catalog, auth] = await Promise.all([
      buildCatalogFromDirectory(directory, { liveDiscovery: false }),
      buildProvidersAuthFromDirectory(directory),
    ])
    return { catalog, auth, hostReady: true, providerCount: auth.length }
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
      throw new Error(message)
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
      const status = dshValue(await directory.api.credentials.describe({ refs: [ref] }), '校验 DSH 凭据')
      if (status.credentials?.[ref]?.configured) {
        // leave opaque credential store unchanged on rollback failure
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
    const reasoningCatalog = reasoningCatalogFromHostModel(model)
    return {
      provider,
      id,
      name: model.name || id,
      reasoning: reasoningCatalog.reasoning,
      ...(reasoningCatalog.supportedThinkingLevels.length ? {
        supportedThinkingLevels: reasoningCatalog.supportedThinkingLevels,
        reasoningEfforts: reasoningCatalog.reasoningEfforts,
        defaultThinkingLevel: reasoningCatalog.defaultThinkingLevel,
      } : {}),
    }
  }

  function disposeOAuth() {
    if (pendingNativeOAuth) {
      pendingNativeOAuth.cancel()
      pendingNativeOAuth = null
    }
  }

  return {
    buildProvidersAuthFromDirectory,
    listProvidersAuth,
    loadModelBundle,
    startProviderAuthorization,
    submitOAuthCode,
    submitAuthorizationPrompt,
    cancelProviderAuthorization,
    logoutProvider,
    setProviderApiKey,
    addModel,
    removeProviderCredentials,
    removeModel,
    resolveModel,
    getDshModelConfig,
    disposeOAuth,
  }
}
