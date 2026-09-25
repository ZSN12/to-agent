import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CatalogModel,
  ModelCatalog,
  ModelProfilePatch,
  ProviderAuthStatus,
  OAuthStatusInfo,
  ScanLocalModelsResult,
  ThinkingLevel,
} from '../../shared/model-api'
import { getModelsClient, isModelsBridgeAvailable } from './client'
import { catalogModelToOption } from './format'
import type { ModelOption } from '../../types'

export function useModelCatalog() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [auth, setAuth] = useState<ProviderAuthStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const bridgeReady = isModelsBridgeAvailable()

  const load = useCallback(async () => {
    const client = getModelsClient()
    if (!client) {
      setLoading(false)
      setError('未检测到 Electron 模型桥接，请使用 npm run dev 启动桌面端。')
      return
    }
    setLoading(true)
    setError(null)
    const [listRes, authRes] = await Promise.all([client.list(), client.listProvidersAuth()])
    if (!listRes.ok) {
      setError(listRes.error)
      setLoading(false)
      return
    }
    if (!authRes.ok) {
      setError(authRes.error)
      setLoading(false)
      return
    }
    setCatalog(listRes.data)
    setAuth(authRes.data)
    setLoading(false)
  }, [])

  const refresh = useCallback(async () => {
    const client = getModelsClient()
    if (!client) return
    setLoading(true)
    const res = await client.refresh()
    if (!res.ok) {
      setError(res.error)
      setLoading(false)
      return
    }
    setCatalog(res.data)
    const authRes = await client.listProvidersAuth()
    if (authRes.ok) setAuth(authRes.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const availableModels = useMemo(
    () => catalog?.models.filter((m) => m.available) ?? [],
    [catalog],
  )

  const composerOptions: ModelOption[] = useMemo(
    () => availableModels.map(catalogModelToOption),
    [availableModels],
  )

  const activeThinkingLevel: ThinkingLevel = catalog?.activeThinkingLevel ?? 'high'

  const setActiveModel = useCallback(async (modelKey: string) => {
    const client = getModelsClient()
    if (!client) return false
    const res = await client.setActive(modelKey)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setCatalog((current) => (current ? { ...current, activeModelKey: res.data } : current))
    return true
  }, [])

  const setThinkingLevel = useCallback(async (level: ThinkingLevel) => {
    const client = getModelsClient()
    if (!client?.setThinkingLevel) return false
    const res = await client.setThinkingLevel(level)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setCatalog((current) => (current ? { ...current, activeThinkingLevel: res.data } : current))
    return true
  }, [])

  const setProviderApiKey = useCallback(async (providerId: string, apiKey: string) => {
    const client = getModelsClient()
    if (!client) return false
    const res = await client.setProviderApiKey(providerId, apiKey)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setCatalog(res.data)
    const authRes = await client.listProvidersAuth()
    if (authRes.ok) setAuth(authRes.data)
    return true
  }, [])

  const addModel = useCallback(async (modelKey: string) => {
    const client = getModelsClient()
    if (!client) return false
    const res = await client.add(modelKey)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setCatalog(res.data)
    const authRes = await client.listProvidersAuth()
    if (authRes.ok) setAuth(authRes.data)
    return true
  }, [])

  const addModels = useCallback(
    async (modelKeys: string[]) => {
      for (const modelKey of modelKeys) {
        const ok = await addModel(modelKey)
        if (!ok) return false
      }
      return true
    },
    [addModel],
  )

  const scanLocalOpenCodex = useCallback(async (): Promise<ScanLocalModelsResult> => {
    const client = getModelsClient()
    if (!client?.scanLocal) {
      throw new Error('当前环境不支持扫描本地模型，请使用桌面端启动。')
    }
    setError(null)
    const res = await client.scanLocal()
    if (!res.ok) {
      setError(res.error)
      throw new Error(res.error)
    }
    const listRes = await client.list()
    if (listRes.ok) setCatalog(listRes.data)
    const authRes = await client.listProvidersAuth()
    if (authRes.ok) setAuth(authRes.data)
    return res.data
  }, [])

  const removeModel = useCallback(async (modelKey: string) => {
    const client = getModelsClient()
    if (!client) return false
    const res = await client.remove(modelKey)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setCatalog(res.data)
    return true
  }, [])

  const removeProviderCredentials = useCallback(async (providerId: string) => {
    const client = getModelsClient()
    if (!client) return false
    const res = await client.removeProviderCredentials(providerId)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setCatalog(res.data)
    const authRes = await client.listProvidersAuth()
    if (authRes.ok) setAuth(authRes.data)
    return true
  }, [])

  const upsertProfile = useCallback(async (modelKey: string, patch: ModelProfilePatch) => {
    const client = getModelsClient()
    if (!client) return false
    const res = await client.upsertProfile(modelKey, patch)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    await load()
    return true
  }, [load])

  const resolveActiveOption = useCallback(
    (models: CatalogModel[], activeKey: string | null): ModelOption | null => {
      if (!models.length) return null
      const hit = activeKey ? models.find((m) => m.key === activeKey) : undefined
      const model = hit ?? models[0]
      return catalogModelToOption(model)
    },
    [],
  )

  const [oauthStatus, setOauthStatus] = useState<OAuthStatusInfo | null>(null)

  useEffect(() => {
    const client = getModelsClient()
    if (!client?.onOAuthStatus) return
    const unsubscribe = client.onOAuthStatus((info) => {
      setOauthStatus(info)
      if (info.status === 'completed') {
        void refresh()
      }
    })
    return () => unsubscribe()
  }, [refresh])

  const startOAuthLogin = useCallback(async (providerId: string = 'openai-codex') => {
    const client = getModelsClient()
    if (!client) return false
    setError(null)
    setOauthStatus({ status: 'auth_url' })
    const res = await client.startOAuth(providerId)
    if (!res.ok) {
      setError(res.error)
      setOauthStatus({ status: 'error', error: res.error })
      return false
    }
    setCatalog(res.data)
    const authRes = await client.listProvidersAuth()
    if (authRes.ok) setAuth(authRes.data)
    setOauthStatus({ status: 'completed' })
    return true
  }, [])

  const cancelOAuthLogin = useCallback(async () => {
    const client = getModelsClient()
    if (!client) return false
    setOauthStatus(null)
    const res = await client.cancelOAuth()
    return res.ok
  }, [])

  const submitOAuthCode = useCallback(async (code: string) => {
    const client = getModelsClient()
    if (!client) return false
    const res = await client.submitOAuthCode(code)
    return res.ok
  }, [])

  const logoutOAuth = useCallback(async (providerId: string) => {
    const client = getModelsClient()
    if (!client) return false
    const res = await client.logoutOAuth(providerId)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setCatalog(res.data)
    const authRes = await client.listProvidersAuth()
    if (authRes.ok) setAuth(authRes.data)
    return true
  }, [])

  return {
    bridgeReady,
    catalog,
    auth,
    loading,
    error,
    availableModels,
    composerOptions,
    activeThinkingLevel,
    setThinkingLevel,
    oauthStatus,
    load,
    refresh,
    setActiveModel,
    setProviderApiKey,
    startOAuthLogin,
    cancelOAuthLogin,
    submitOAuthCode,
    logoutOAuth,
    addModel,
    addModels,
    scanLocalOpenCodex,
    removeModel,
    removeProviderCredentials,
    upsertProfile,
    resolveActiveOption,
  }
}
