import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CatalogModel,
  ModelCatalog,
  ModelProfilePatch,
  ProviderAuthStatus,
  OAuthStatusInfo,
  ScanLocalModelsResult,
  ThinkingLevel,
  ModelUpdateStatus,
} from '../../shared/model-api'
import { getModelsClient, isModelsBridgeAvailable } from './client'
import { catalogModelToOption } from './format'
import type { ModelOption } from '../../types'
export function useModelCatalog() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [auth, setAuth] = useState<ProviderAuthStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<ModelUpdateStatus | null>(null)
  const bridgeReady = isModelsBridgeAvailable()
  const loadInFlight = useRef<Promise<void> | null>(null)
  const hasCompletedInitialLoad = useRef(false)

  const load = useCallback(async () => {
    if (loadInFlight.current) return loadInFlight.current
    const flight = (async () => {
      if (!hasCompletedInitialLoad.current) setLoading(true)
      setError(null)
      const client = getModelsClient()
      if (!client) throw new Error('未检测到 Electron 模型桥接，请使用 npm run dev 启动桌面端。')

      const ready = await window.taskweaver?.backendReady()
      if (!ready?.ok) throw new Error(ready?.error ?? '后端 IPC 尚未就绪，请稍后重试。')
      if (ready.data?.ready !== true) throw new Error(ready.data?.error ?? '后端服务初始化失败，请重试或重启应用。')

      const loadBundle = client.loadBundle ?? (async () => {
        const [listRes, authRes] = await Promise.all([client.list(), client.listProvidersAuth()])
        if (!listRes.ok) return { ok: false as const, error: listRes.error ?? '获取模型列表失败' }
        if (!authRes.ok) return { ok: false as const, error: authRes.error ?? '获取认证状态失败' }
        const authRows = authRes.data ?? []
        return {
          ok: true as const,
          data: { catalog: listRes.data!, auth: authRows, hostReady: true, providerCount: authRows.length },
        }
      })
      const res = await loadBundle()
      if (!res.ok) throw new Error(res.error ?? '加载模型目录失败')
      const bundle = res.data!
      setCatalog(bundle.catalog ?? null)
      setAuth(bundle.auth ?? [])
      if (bundle.providerCount === 0 && bundle.hostReady) {
        setError('Z Host 已连接，但提供方目录为空。请稍候再试或重启应用。')
      }
    })().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : '加载模型目录时发生错误')
    }).finally(() => {
      hasCompletedInitialLoad.current = true
      setLoading(false)
      loadInFlight.current = null
    })
    loadInFlight.current = flight
    return flight
  }, [])

  const refresh = useCallback(async (): Promise<{ ok: boolean; providerCount: number; error: string | null }> => {
    const client = getModelsClient()
    if (!client) return { ok: false, providerCount: 0, error: '未检测到 Electron 模型桥接' }
    const showBlockingLoad = auth.length === 0
    if (showBlockingLoad) setLoading(true)
    setError(null)
    try {
      const loadBundle = client.loadBundle ?? (async () => {
        const listRes = await client.refresh()
        if (!listRes.ok) return { ok: false as const, error: listRes.error ?? '刷新模型目录失败' }
        const authRes = await client.listProvidersAuth()
        if (!authRes.ok) return { ok: false as const, error: authRes.error ?? '获取提供方目录失败' }
        const auth = authRes.data ?? []
        return {
          ok: true as const,
          data: { catalog: listRes.data!, auth, hostReady: true, providerCount: auth.length },
        }
      })
      const res = await loadBundle()
      if (!res.ok) {
        const message = res.error ?? '刷新模型目录失败'
        setError(message)
        if (showBlockingLoad) setLoading(false)
        return { ok: false, providerCount: 0, error: message }
      }
      const bundle = res.data!
      setCatalog(bundle.catalog ?? null)
      setAuth(bundle.auth ?? [])
      const emptyMessage = bundle.providerCount === 0
        ? 'Z Host 已连接，但提供方目录为空。请稍候再试或重启应用。'
        : null
      if (emptyMessage) setError(emptyMessage)
      if (showBlockingLoad) setLoading(false)
      return {
        ok: true,
        providerCount: bundle.providerCount,
        error: emptyMessage,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '刷新模型目录时发生错误'
      setError(message)
      if (showBlockingLoad) setLoading(false)
      return { ok: false, providerCount: 0, error: message }
    }
  }, [auth.length])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const client = getModelsClient()
    if (!client?.getUpdateStatus) return
    void client.getUpdateStatus().then((result) => {
      if (result.ok) setUpdateStatus(result.data)
    })
    if (!client.onUpdateStatus) return
    return client.onUpdateStatus(setUpdateStatus)
  }, [])

  const checkForModelUpdates = useCallback(async (force = true) => {
    const client = getModelsClient()
    if (!client?.checkForUpdates) return false
    const result = await client.checkForUpdates({ force })
    if (!result.ok) {
      setError(result.error ?? '检查模型目录更新失败')
      return false
    }
    setUpdateStatus(result.data)
    if (result.data.state === 'updated' || result.data.state === 'rolled-back') await load()
    return result.data.state !== 'failed'
  }, [load])

  const rollbackModelRegistry = useCallback(async () => {
    const client = getModelsClient()
    if (!client?.rollbackRegistry) return false
    const result = await client.rollbackRegistry()
    if (!result.ok) {
      setError(result.error ?? '回滚模型目录失败')
      return false
    }
    setUpdateStatus(result.data)
    await load()
    return true
  }, [load])

  const availableModels = useMemo(
    () => catalog?.models.filter((m) => m.available) ?? [],
    [catalog],
  )

  const composerOptions: ModelOption[] = useMemo(
    () => availableModels.map(catalogModelToOption),
    [availableModels],
  )

  const activeThinkingLevel: ThinkingLevel = catalog?.activeThinkingLevel ?? 'medium'

  const setActiveModel = useCallback(async (modelKey: string) => {
    const client = getModelsClient()
    if (!client) return false
    const res = await client.setActive(modelKey)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    const levelRes = await client.getThinkingLevel?.()
    setCatalog((current) => {
      if (!current) return current
      return {
        ...current,
        activeModelKey: res.data,
        activeThinkingLevel: levelRes?.ok ? levelRes.data : current.activeThinkingLevel,
      }
    })
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
    if (!client) {
      const message = '当前环境无法访问模型服务'
      setError(message)
      return { ok: false, error: message }
    }
    const res = await client.setProviderApiKey(providerId, apiKey)
    if (!res.ok) {
      const message = res.error ?? '设置 API 密钥失败'
      setError(message)
      return { ok: false, error: message }
    }
    setError(null)
    setCatalog(res.data ?? null)
    const authRes = await client.listProvidersAuth()
    if (authRes.ok) setAuth(authRes.data ?? [])
    return { ok: true }
  }, [])

  const addModel = useCallback(async (modelKey: string) => {
    const client = getModelsClient()
    if (!client) return false
    const res = await client.add(modelKey)
    if (!res.ok) {
      setError(res.error ?? '添加模型失败')
      return false
    }
    setCatalog(res.data ?? null)
    const authRes = await client.listProvidersAuth()
    if (authRes.ok) setAuth(authRes.data ?? [])
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
      throw new Error('当前环境不支持扫描本地官方 Agent，请使用桌面端启动。')
    }
    setError(null)
    const res = await client.scanLocal()
    if (!res.ok) {
      throw new Error(res.error ?? '扫描本地官方 Agent 失败')
    }
    const payload = res.data
    if (payload?.error) {
      throw new Error(payload.error)
    }
    const listRes = await client.list()
    if (listRes.ok) setCatalog(listRes.data ?? null)
    const authRes = await client.listProvidersAuth()
    if (authRes.ok) setAuth(authRes.data ?? [])
    return payload
  }, [])

  const removeModel = useCallback(async (modelKey: string) => {
    const client = getModelsClient()
    if (!client) return false
    const res = await client.remove(modelKey)
    if (!res.ok) {
      setError(res.error ?? '删除模型失败')
      return false
    }
    setCatalog(res.data ?? null)
    return true
  }, [])

  const removeProviderCredentials = useCallback(async (providerId: string) => {
    const client = getModelsClient()
    if (!client) return false
    const res = await client.removeProviderCredentials(providerId)
    if (!res.ok) {
      setError(res.error ?? '删除凭据失败')
      return false
    }
    setCatalog(res.data ?? null)
    const authRes = await client.listProvidersAuth()
    if (authRes.ok) setAuth(authRes.data ?? [])
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
    setOauthStatus({ status: 'progress', providerId, instructions: '正在启动 ChatGPT 订阅授权…' })
    const res = await client.startOAuth(providerId)
    if (!res.ok) {
      setError(res.error ?? 'OAuth 登录失败')
      setOauthStatus({ status: 'error', error: res.error ?? 'OAuth 登录失败' })
      return false
    }
    setCatalog(res.data ?? null)
    const authRes = await client.listProvidersAuth()
    if (authRes.ok) setAuth(authRes.data ?? [])
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
      setError(res.error ?? 'OAuth 登出失败')
      return false
    }
    setCatalog(res.data ?? null)
    const authRes = await client.listProvidersAuth()
    if (authRes.ok) setAuth(authRes.data ?? [])
    return true
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return {
    bridgeReady,
    catalog,
    auth,
    loading,
    error,
    clearError,
    availableModels,
    composerOptions,
    activeThinkingLevel,
    setThinkingLevel,
    oauthStatus,
    updateStatus,
    load,
    refresh,
    checkForModelUpdates,
    rollbackModelRegistry,
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
