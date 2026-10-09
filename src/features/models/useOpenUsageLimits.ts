import { useCallback, useEffect, useState } from 'react'
import type { OpenUsageLimitsSnapshot } from '../../shared/app-api'
import { DEFAULT_OPENUSAGE_URL, isLikelyLoopbackHttpUrl } from './openusage-limits-summary'

export function useOpenUsageLimits({ autoFetch = true } = {}) {
  const [snapshot, setSnapshot] = useState<OpenUsageLimitsSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [baseUrl, setBaseUrl] = useState(DEFAULT_OPENUSAGE_URL)
  const [baseUrlDraft, setBaseUrlDraft] = useState(DEFAULT_OPENUSAGE_URL)
  const [baseUrlError, setBaseUrlError] = useState<string | null>(null)
  const [activeBaseUrl, setActiveBaseUrl] = useState<string | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null)

  const loadPreferences = useCallback(async () => {
    const prefsApi = window.taskweaver?.preferences
    if (!prefsApi) return
    const res = await prefsApi.get()
    if (res?.ok && res.data) {
      const url = res.data.openUsageBaseUrl?.trim() || DEFAULT_OPENUSAGE_URL
      setBaseUrl(url)
      setBaseUrlDraft(url)
    }
  }, [])

  const refresh = useCallback(async (force = false) => {
    setLoading(true)
    setHint(null)
    try {
      const api = window.taskweaver?.openusage
      if (!api) {
        setConnected(false)
        setHint('当前环境未暴露 OpenUsage IPC')
        return
      }
      const res = await api.getLimits({ force })
      if (res?.ok && res.data?.ok && res.data.data) {
        setSnapshot(res.data.data)
        setConnected(true)
        setActiveBaseUrl(res.data.baseUrl ?? baseUrl)
        setLastFetchedAt(Date.now())
        setHint(null)
      } else {
        setSnapshot(null)
        setConnected(false)
        setActiveBaseUrl(res?.ok ? res.data.baseUrl ?? baseUrl : null)
        setHint(
          (!res?.ok && 'message' in res ? String(res.message) : undefined)
          ?? (res?.ok && !res.data.ok ? String(res.data.error) : undefined)
          ?? '无法读取 OpenUsage；请确认服务已启动并检查 API 地址。',
        )
      }
    } catch (e) {
      setSnapshot(null)
      setConnected(false)
      setHint(String(e instanceof Error ? e.message : e))
    } finally {
      setLoading(false)
    }
  }, [baseUrl])

  useEffect(() => {
    void (async () => {
      await loadPreferences()
      if (autoFetch) await refresh(false)
    })()
  }, [autoFetch, loadPreferences, refresh])

  const commitBaseUrl = useCallback(async () => {
    const draft = baseUrlDraft.trim()
    if (!isLikelyLoopbackHttpUrl(draft)) {
      setBaseUrlError('请填写本机 HTTP 地址，例如 http://127.0.0.1:6736')
      return false
    }
    setBaseUrlError(null)
    const prefsApi = window.taskweaver?.preferences
    if (!prefsApi) return false
    const res = await prefsApi.set({ openUsageBaseUrl: draft })
    if (!res?.ok) {
      setBaseUrlError(res && 'message' in res ? String(res.message) : '保存失败')
      return false
    }
    const saved = res.data?.openUsageBaseUrl ?? draft
    setBaseUrl(saved)
    setBaseUrlDraft(saved)
    await refresh(true)
    return true
  }, [baseUrlDraft, refresh])

  return {
    snapshot,
    loading,
    hint,
    connected,
    baseUrl,
    baseUrlDraft,
    setBaseUrlDraft,
    baseUrlError,
    activeBaseUrl,
    lastFetchedAt,
    refresh,
    commitBaseUrl,
  }
}
