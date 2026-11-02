import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Database, KeyRound, Link2, LogOut, Pencil, Plus, Radio, ScanSearch, ShieldAlert, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react'
import type { CatalogModel, CustomProviderEntry, DiscoveredProviderModel, ModelAddItemResultListener, ModelProfilePatch, ProviderAuthStatus, OAuthStatusInfo, ScanLocalModelsResult, ModelUpdateStatus, ProbedModelItem, ProbeModelsResult } from '../../shared/model-api'
import { formatCostPerMillion, getCleanModelId, getCleanModelName } from './format'
import { LocalScanModal } from './LocalScanModal'
import { ProbeModelsModal } from './ProbeModelsModal'
import { OpenUsageSection } from './OpenUsageSection'
import { LocalAgentStatusStrip, useLocalAgentBridgeStatus } from './LocalAgentStatusStrip'
import { SettingsLayout } from '../settings/SettingsLayout'
import { OAuthLoginModal, ProviderKeyModal } from './components/ModelSettingsModals'
import { AddModelModal } from './components/AddModelModal'
import { ModelRoleAssignmentModal } from './components/ModelRoleAssignmentModal'
import { buildModelSourceGroups } from './utils/model-source-groups'
import './model-settings-panel.css'

type ProviderModelDiscoveryViewResult = {
  providerId: string
  providerName: string
  source: 'catalog' | 'online' | 'timeout' | 'error'
  models: DiscoveredProviderModel[]
  error?: string
}

export function ModelSettingsPanel({
  auth,
  models,
  candidateModels,
  loading,
  bridgeReady,
  catalogStale = false,
  error,
  oauthStatus,
  updateStatus,
  onRefresh,
  onCheckForUpdates,
  onRollbackRegistry,
  onSetProviderApiKey,
  onStartOAuthLogin,
  onCancelOAuthLogin,
  onSubmitOAuthCode,
  onLogoutOAuth,
  onUpsertProfile,
  onAddModel,
  onAddModels,
  onScanLocalOpenCodex,
  onRemoveModel,
  onRemoveProviderCredentials,
  onToast,
  onClearCatalogError,
}: {
  auth: ProviderAuthStatus[]
  models: CatalogModel[]
  candidateModels: CatalogModel[]
  loading: boolean
  bridgeReady: boolean
  catalogStale?: boolean
  error: string | null
  oauthStatus?: OAuthStatusInfo | null
  updateStatus?: ModelUpdateStatus | null
  onRefresh: () => void
  onCheckForUpdates?: (force?: boolean) => Promise<boolean>
  onRollbackRegistry?: () => Promise<boolean>
  onSetProviderApiKey: (providerId: string, apiKey: string) => Promise<{ ok: boolean; error?: string }>
  onStartOAuthLogin?: (providerId?: string) => Promise<boolean>
  onCancelOAuthLogin?: () => Promise<boolean>
  onSubmitOAuthCode?: (code: string) => Promise<boolean>
  onLogoutOAuth?: (providerId: string) => Promise<boolean>
  onUpsertProfile: (modelKey: string, patch: ModelProfilePatch) => Promise<boolean>
  onAddModel: (modelKey: string) => Promise<boolean>
  onAddModels: (modelKeys: string[], onItemResult?: ModelAddItemResultListener) => Promise<boolean>
  onScanLocalOpenCodex: () => Promise<ScanLocalModelsResult>
  onRemoveModel: (modelKey: string) => Promise<boolean>
  onRemoveProviderCredentials: (providerId: string) => Promise<boolean>
  onToast?: (message: string) => void
  onClearCatalogError?: () => void
}) {
  const [query, setQuery] = useState('')
  const [keyProvider, setKeyProvider] = useState<ProviderAuthStatus | null>(null)
  const [modelRoleModalOpen, setModelRoleModalOpen] = useState(false)
  const [addingModel, setAddingModel] = useState(false)
  const [targetProviderId, setTargetProviderId] = useState<string | undefined>()
  const [targetTab, setTargetTab] = useState<'builtin' | 'custom'>('builtin')
  const [targetCustomEntry, setTargetCustomEntry] = useState<CustomProviderEntry | null>(null)
  const [targetCustomMode, setTargetCustomMode] = useState<'edit' | 'add_model'>('add_model')
  const [customList, setCustomList] = useState<CustomProviderEntry[]>([])
  const [showOAuthModal, setShowOAuthModal] = useState(false)
  const [oauthProviderId, setOauthProviderId] = useState('openai-codex')
  const [scanOpen, setScanOpen] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<ScanLocalModelsResult | null>(null)
  const scanRequestIdRef = useRef(0)
  const scanPromiseRef = useRef<Promise<ScanLocalModelsResult> | null>(null)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [probeOpen, setProbeOpen] = useState(false)
  const [probeLoading, setProbeLoading] = useState(false)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [probeResult, setProbeResult] = useState<ProbeModelsResult | null>(null)
  const [probeTargetSource, setProbeTargetSource] = useState<{ id: string; name: string } | null>(null)
  const [providerDiscoveryLoading, setProviderDiscoveryLoading] = useState(false)
  const [providerDiscoveryResults, setProviderDiscoveryResults] = useState<ProviderModelDiscoveryViewResult[] | null>(null)
  const [migrateLoading, setMigrateLoading] = useState(false)
  const {
    status: localAgentStatus,
    loading: localAgentLoading,
    refresh: refreshLocalAgentStatus,
    login: loginLocalAgent,
    saveAntigravityOAuthCredentials,
  } = useLocalAgentBridgeStatus()

  const isCodexConfigured = auth?.some((p) => p.id === 'openai-codex' && p.configured) ?? false
  const hasLegacyOpenCodexModels = useMemo(
    () => models.some((m) => m.key.startsWith('opencodex/')),
    [models],
  )

  const loadCustomList = useCallback(async () => {
    if (!window.taskweaver?.models?.listCustomProviders) return
    try {
      const res = await window.taskweaver.models.listCustomProviders()
      if (res?.ok && res.data) setCustomList(res.data)
    } catch (err) {
      console.error('加载自定义提供方列表失败:', err)
    }
  }, [])

  useEffect(() => {
    void loadCustomList()
  }, [loadCustomList])

  const handleProbeForSource = async (source: { id: string; name: string; rawCustomEntry?: { baseUrl: string } }) => {
    setProbeTargetSource({ id: source.id, name: source.name })
    setProbeOpen(true)
    setProbeLoading(true)
    setProbeError(null)
    setProbeResult(null)
    try {
      const res = await window.taskweaver?.models?.probeProviderModels({
        providerId: source.id,
        baseUrl: source.rawCustomEntry?.baseUrl,
      })
      if (!res?.ok) {
        setProbeError(res?.error ?? '探测模型失败，请检查网络或提供商地址')
      } else if (!res.data) {
        setProbeError('探测模型失败，未返回有效数据')
      } else {
        setProbeResult(res.data)
      }
    } catch (err: any) {
      setProbeError(err?.message || '探测模型失败')
    } finally {
      setProbeLoading(false)
    }
  }

  const handleSyncOfficialModels = async () => {
    setCheckingUpdates(true)
    try {
      if (onCheckForUpdates) {
        const ok = await onCheckForUpdates(true)
        if (ok) {
          onToast?.('已成功检查并同步官方模型目录！')
        }
      }
      onRefresh()
    } catch (err: any) {
      onToast?.(err?.message || '检查官方模型目录更新失败')
    } finally {
      setCheckingUpdates(false)
    }
  }

  const handleConfirmImportProbedModels = async (models: ProbedModelItem[]) => {
    if (!probeTargetSource) return false
    try {
      const res = await window.taskweaver?.models?.batchAddCustomModels({
        providerId: probeTargetSource.id,
        models: models.map((m) => ({
          id: m.id,
          name: m.name,
          contextWindow: m.contextWindow,
          reasoning: m.reasoning,
        })),
      })
      if (!res?.ok) {
        onToast?.(res?.error ?? '批量收录模型失败')
        return false
      }
      onToast?.(`已成功批量收录 ${res.data?.addedCount ?? models.length} 个最新模型！`)
      onRefresh()
      void loadCustomList()
      return true
    } catch (err: any) {
      onToast?.(err?.message ?? '批量收录模型失败')
      return false
    }
  }

  const handleOpenAddForSource = (
    providerId?: string,
    tab: 'builtin' | 'custom' = 'builtin',
    customEntry?: CustomProviderEntry | null,
    customMode: 'edit' | 'add_model' = 'add_model',
  ) => {
    setTargetProviderId(providerId)
    setTargetTab(tab)
    setTargetCustomEntry(customEntry ?? null)
    setTargetCustomMode(customMode)
    setAddingModel(true)
  }

  const sourceGroups = useMemo(
    () => buildModelSourceGroups({ auth, models, customList, query, isCodexConfigured }),
    [auth, customList, isCodexConfigured, models, query],
  )

  const handleDiscoverAvailableModels = async () => {
    const targets = sourceGroups.filter((source) =>
      source.configured && (source.kind === 'builtin' || source.kind === 'custom'))
    if (providerDiscoveryLoading || !targets.length) return
    setProviderDiscoveryLoading(true)
    setProviderDiscoveryResults(null)
    try {
      const settled = await Promise.allSettled(targets.map(async (source) => {
        // The already-loaded pi-ai catalog is authoritative for built-in providers;
        // reading it locally avoids a network request for an endpoint we already know.
        const bundledModels = source.kind === 'builtin'
          ? candidateModels.filter((model) => model.provider === source.id && model.source === 'bundled')
          : []
        if (bundledModels.length) {
          return {
            providerId: source.id,
            providerName: source.name,
            source: 'catalog' as const,
            models: bundledModels.map((model) => ({
              id: model.id,
              name: model.name || model.id,
              contextWindow: model.contextWindow || undefined,
              maxTokens: model.maxTokens || undefined,
            })),
          }
        }

        const discover = window.taskweaver?.models?.discoverProviderModels
        if (!discover) throw new Error('模型发现接口不可用')
        const response = await discover({ providerId: source.id })
        if (!response?.ok) throw new Error(response?.error || '模型发现失败')
        if (response.data.status === 'timeout' || response.data.status === 'error') {
          return {
            providerId: source.id,
            providerName: source.name,
            source: response.data.status,
            models: [],
            error: response.data.error || (response.data.status === 'timeout' ? '模型发现超时' : '模型发现失败'),
          }
        }
        return {
          providerId: source.id,
          providerName: source.name,
          source: 'online' as const,
          models: response.data.models,
        }
      }))
      setProviderDiscoveryResults(settled.map((result, index) => {
        if (result.status === 'fulfilled') return result.value
        const source = targets[index]
        return {
          providerId: source.id,
          providerName: source.name,
          source: 'error' as const,
          models: [],
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        }
      }))
    } finally {
      setProviderDiscoveryLoading(false)
    }
  }

  const handleStartOAuth = async (providerId: string) => {
    setOauthProviderId(providerId)
    setShowOAuthModal(true)
    if (onStartOAuthLogin) {
      await onStartOAuthLogin(providerId)
    }
  }

  const handleCloseOAuth = async () => {
    setShowOAuthModal(false)
    if (onCancelOAuthLogin) {
      await onCancelOAuthLogin()
    }
  }

  const handleScanLocal = async () => {
    const requestId = ++scanRequestIdRef.current
    setScanOpen(true)
    setScanLoading(true)
    setScanError(null)
    setScanResult(null)
    try {
      let scanPromise = scanPromiseRef.current
      if (!scanPromise) {
        scanPromise = onScanLocalOpenCodex()
        scanPromiseRef.current = scanPromise
        const startedScan = scanPromise
        void startedScan.then(
          () => {
            if (scanPromiseRef.current === startedScan) scanPromiseRef.current = null
          },
          () => {
            if (scanPromiseRef.current === startedScan) scanPromiseRef.current = null
          },
        )
      }
      const result = await scanPromise
      if (requestId !== scanRequestIdRef.current) return
      setScanResult(result)
      await refreshLocalAgentStatus()
    } catch (error) {
      if (requestId !== scanRequestIdRef.current) return
      setScanError(error instanceof Error ? error.message : String(error))
    } finally {
      if (requestId === scanRequestIdRef.current) setScanLoading(false)
    }
  }

  const handleMigrateLegacyOpenCodex = async () => {
    const client = window.taskweaver?.models
    if (!client?.migrateLegacyOpenCodexRoutes) return
    setMigrateLoading(true)
    try {
      const res = await client.migrateLegacyOpenCodexRoutes()
      if (!res.ok) {
        onToast?.(res.error ?? '迁移失败')
        return
      }
      const count = res.data?.migrated?.length ?? 0
      onToast?.(count ? `已迁移 ${count} 个模型到内置桥路由` : '没有需要迁移的遗留模型')
      onRefresh()
      await refreshLocalAgentStatus()
    } finally {
      setMigrateLoading(false)
    }
  }

  const closeScanModal = () => {
    scanRequestIdRef.current += 1
    setScanOpen(false)
    setScanLoading(false)
    setScanError(null)
    setScanResult(null)
  }

  return (
    <SettingsLayout
      title="模型与来源"
      description="管理模型来源、登录状态和可用模型目录。"
      className="model-settings-page"
      actions={(
        <>
          {updateStatus?.previousVersion && onRollbackRegistry && (
            <button
              type="button"
              className="settings-secondary-button"
              onClick={() => void onRollbackRegistry()}
            >
              回滚目录
            </button>
          )}
          <button
            type="button"
            className="settings-secondary-button"
            onClick={() => void handleSyncOfficialModels()}
            disabled={loading || !bridgeReady || checkingUpdates}
            title="在线探测官方厂商最新开放的模型版本并同步至模型目录"
          >
            <Radio size={16} className={checkingUpdates ? 'animate-spin' : ''} />
            {checkingUpdates ? '正在探测官方模型…' : '探测官方最新模型'}
          </button>
          <button
            type="button"
            className="settings-secondary-button"
            onClick={() => void handleScanLocal()}
            disabled={loading || !bridgeReady || scanLoading}
          >
            <ScanSearch size={16} />
            {scanLoading ? '扫描中…' : '扫描本地官方 Agent'}
          </button>
          <button
            type="button"
            className="settings-primary-button"
            onClick={() => handleOpenAddForSource(undefined, 'builtin')}
            disabled={loading || !bridgeReady}
          >
            <Plus size={17} />
            添加模型与来源
          </button>
          <button
            type="button"
            className="settings-secondary-button"
            onClick={() => setModelRoleModalOpen(true)}
            disabled={loading || models.length === 0}
            title="把已添加模型拖入审查、编写或查询分组"
          >
            <SlidersHorizontal size={16} />
            模型分档设计
          </button>
        </>
      )}
    >

      <OpenUsageSection />

      <LocalAgentStatusStrip
        status={localAgentStatus}
        loading={localAgentLoading}
        onRefresh={refreshLocalAgentStatus}
        onLogin={loginLocalAgent}
        onSaveAntigravityOAuthCredentials={saveAntigravityOAuthCredentials}
        legacyOpenCodex={Boolean(localAgentStatus?.legacyOpenCodex || hasLegacyOpenCodexModels)}
        onMigrateLegacy={handleMigrateLegacyOpenCodex}
        migrateLoading={migrateLoading}
      />

      {error && (
        <div className="settings-inline-error settings-inline-error-dismissible" role="alert">
          <span>
            {/^fetch failed$/i.test(error.trim())
              ? '网络请求失败（fetch failed）。多为本地 Agent 扫描或 ChatGPT 授权时的瞬时错误；可关闭本条后重试「扫描本地官方 Agent」，或在 ChatGPT 订阅区重新授权。'
              : error}
          </span>
          {onClearCatalogError && (
            <button type="button" className="settings-inline-error-dismiss" onClick={onClearCatalogError}>
              关闭
            </button>
          )}
        </div>
      )}

      {catalogStale && (
        <div className="model-catalog-stale" role="status">
          当前显示本地缓存的模型目录，正在后台同步最新状态。
        </div>
      )}

      {loading && !models ? (
        <div className="model-settings-loading">
          <p>正在加载模型目录…</p>
        </div>
      ) : !auth || !models ? (
        <div className="settings-inline-error" role="alert">
          无法加载模型数据，请刷新页面重试。
        </div>
      ) : (
        <>
          <div className="model-settings-toolbar model-settings-toolbar-expanded">
            <input
              type="search"
              placeholder="搜索来源或模型（名称/ID/URL）…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索模型或来源"
            />
            <div className="model-settings-toolbar-actions">
              <span className="model-list-count">
                {sourceGroups.length} 个来源 · {models.length} 个已添加模型
              </span>
              <button
                type="button"
                className="settings-secondary-button"
                onClick={() => void handleDiscoverAvailableModels()}
                disabled={providerDiscoveryLoading || !sourceGroups.some((source) =>
                  source.configured && (source.kind === 'builtin' || source.kind === 'custom'))}
                aria-busy={providerDiscoveryLoading}
                title="并行查询已配置来源；只展示结果，不写入模型配置"
              >
                <Radio size={14} />
                {providerDiscoveryLoading ? '正在获取…' : '获取可用模型'}
              </button>
            </div>
          </div>

          {providerDiscoveryResults && (
            <section className="model-settings-panel-card model-discovery-card" aria-label="可用模型发现结果">
              <div className="model-discovery-head">
                <div>
                  <strong>可用模型发现结果</strong>
                  <p className="model-discovery-description">
                    来自 pi-ai 内置目录或在线查询；结果仅供查看，没有修改配置。
                  </p>
                </div>
                <button
                  type="button"
                  className="settings-secondary-button"
                  onClick={() => setProviderDiscoveryResults(null)}
                  aria-label="关闭模型发现结果"
                >
                  <X size={14} />
                  关闭
                </button>
              </div>
              <div className="model-discovery-results">
                {providerDiscoveryResults.map((result) => (
                  <div key={result.providerId} className="model-discovery-provider">
                    <div className="model-discovery-provider-head">
                      <strong>{result.providerName}</strong>
                      <span className={`provider-status-label ${result.source === 'catalog' || result.source === 'online' ? 'ok' : ''}`}>
                        {result.source === 'error' ? '失败' : result.source === 'timeout' ? '超时' : result.source === 'catalog' ? '内置目录' : '在线发现'}
                      </span>
                      {(result.source === 'catalog' || result.source === 'online') && (
                        <span className="model-list-count">{result.models.length} 个模型</span>
                      )}
                    </div>
                    {result.error ? (
                      <p className="settings-inline-error model-discovery-message">{result.error}</p>
                    ) : result.models.length ? (
                      <div className="model-discovery-models">
                        {result.models.map((model) => (
                            <span className="model-discovery-model" key={model.id}>
                              <code title={model.name}>{getCleanModelId(model.id, result.providerId)}</code>
                              {model.workBuddyMultiplier !== undefined && model.workBuddyMultiplier !== '' && (
                                <small
                                  className="source-model-tag multiplier"
                                  title={model.workBuddyMultiplierUpdatedAt
                                    ? `WorkBuddy 本机倍率数据更新时间：${model.workBuddyMultiplierUpdatedAt}`
                                    : undefined}
                                >
                                  倍率 {model.workBuddyMultiplier}
                                </small>
                              )}
                            </span>
                        ))}
                      </div>
                    ) : (
                      <p className="model-discovery-message">未返回可用模型。</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

      <div className="provider-source-cards-stack">
        {sourceGroups.length === 0 ? (
          <div className="model-settings-panel-card empty-sources-guide">
            <div className="empty-sources-guide-content">
              <Database size={36} className="empty-sources-guide-icon" />
              <h3 className="empty-sources-guide-title">
                {query.trim() ? '没有匹配的来源或模型' : '还没有添加任何模型来源'}
              </h3>
              <p className="empty-sources-guide-description">
                {query.trim()
                  ? '尝试搜索其他关键词，或点击右上角「添加模型与来源」接入新来源。'
                  : 'TaskWeaver 按来源分类组织管理模型。点击下方按钮添加官方提供商、直连 ChatGPT 订阅，或接入自定义中转站 API。'}
              </p>
              <div className="empty-sources-guide-actions">
                <button
                  type="button"
                  className="settings-primary-button"
                  onClick={() => handleOpenAddForSource(undefined, 'builtin')}
                >
                  <Plus size={16} />
                  添加模型与来源
                </button>
                <button
                  type="button"
                  className="settings-secondary-button"
                  onClick={() => void handleScanLocal()}
                >
                  <ScanSearch size={16} />
                  扫描本地官方 Agent
                </button>
              </div>
            </div>
          </div>
        ) : (
          sourceGroups.map((source) => (
            <section className="provider-source-card" key={source.id}>
              <div className="provider-source-card-head">
                <div className="provider-source-identity">
                  <span className="provider-logo">
                    {source.kind === 'custom' ? <Link2 size={18} /> : <Database size={18} />}
                  </span>
                  <div>
                    <div className="provider-source-title-row">
                      <strong className="provider-source-name">{source.name}</strong>
                      <span className={`provider-status-label ${source.configured ? 'ok' : ''}`}>
                        {source.authType === 'local_subscription'
                          ? '订阅已登录'
                          : source.configured ? '凭据可用' : '未配置'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="provider-source-actions">
                  <button
                    type="button"
                    className="settings-secondary-button"
                    onClick={() => handleOpenAddForSource(source.id, source.kind === 'custom' ? 'custom' : 'builtin', source.rawCustomEntry, 'add_model')}
                    title={`向 ${source.name} 添加模型`}
                  >
                    <Plus size={14} />
                    添加模型
                  </button>

                  {source.kind === 'codex' || source.kind === 'anthropic' ? (
                    source.configured ? (
                      <button
                        type="button"
                        className="settings-secondary-button btn-logout-codex"
                        onClick={async () => {
                          const providerId = source.id
                          const subscription = providerId === 'anthropic' ? 'Claude' : 'ChatGPT'
                          if (window.confirm(`确定要解除当前的 ${subscription} 官方订阅授权吗？`)) {
                            if (onLogoutOAuth) await onLogoutOAuth(providerId)
                            else await onRemoveProviderCredentials(providerId)
                          }
                        }}
                      >
                        <LogOut size={14} />
                        退出订阅
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="settings-primary-button btn-codex-login"
                        onClick={() => handleStartOAuth(source.id)}
                        disabled={loading}
                      >
                        <Sparkles size={14} />
                        {source.id === 'anthropic' ? '使用 Claude 登录 (OAuth)' : '使用 ChatGPT 登录 (OAuth)'}
                      </button>
                    )
                  ) : source.kind === 'custom' ? (
                    <>
                      <button
                        type="button"
                        className="settings-secondary-button"
                        onClick={() => void handleProbeForSource(source)}
                        title="在线向该提供商探测最新开放的可用模型"
                      >
                        <Radio size={14} />
                        探测最新模型
                      </button>
                      <button
                        type="button"
                        className="settings-secondary-button"
                        onClick={() => handleOpenAddForSource(source.id, 'custom', source.rawCustomEntry, 'edit')}
                      >
                        <Pencil size={14} />
                        编辑
                      </button>
                      <button
                        type="button"
                        className="settings-danger-button"
                        onClick={async () => {
                          if (window.confirm(`删除自定义提供方 ${source.id}？其配置与凭据将被移除。`)) {
                            await window.taskweaver?.models?.removeCustomProvider(source.id)
                            onRefresh()
                            void loadCustomList()
                          }
                        }}
                        title="删除此自定义网关"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="settings-secondary-button"
                        onClick={() => {
                          const p = auth.find((item) => item.id === source.id)
                          if (p) setKeyProvider(p)
                        }}
                      >
                        <KeyRound size={14} />
                        {source.writable ? '更新密钥' : '配置密钥'}
                      </button>
                      {source.writable && (
                        <button
                          type="button"
                          className="settings-danger-button"
                          onClick={() => {
                            if (window.confirm(`删除 ${source.name} 保存在 TaskWeaver 中的凭据？`)) {
                              void onRemoveProviderCredentials(source.id)
                            }
                          }}
                          title="删除已保存凭据"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 下方对应此来源的模型列表 */}
              <div className="provider-source-models">
                {source.models.length > 0 ? (
                  source.models.map((model) => {
                    const isWorkBuddyModel = model.provider === 'workbuddy'
                    const workBuddyMultiplier = model.workBuddyMultiplier?.trim()
                    return (
                    <article key={model.key} className="provider-source-model-row">
                      <div className="source-model-info">
                        <div className="source-model-title-line">
                          <strong className="source-model-name">{getCleanModelName(model.key, model.name)}</strong>
                          {model.contextWindow && (
                            <span className="source-model-tag context">
                              {Math.round(model.contextWindow / 1000)}k 上下文
                            </span>
                          )}
                          {!isWorkBuddyModel && model.workBuddyMultiplier !== undefined && model.workBuddyMultiplier !== '' && (
                            <span
                              className="source-model-tag multiplier"
                              title={model.workBuddyMultiplierUpdatedAt
                                ? `WorkBuddy 本机倍率数据更新时间：${model.workBuddyMultiplierUpdatedAt}`
                                : undefined}
                            >
                              倍率 {model.workBuddyMultiplier}
                            </span>
                          )}
                          <span
                            className={`source-model-tag ${isWorkBuddyModel ? 'multiplier' : 'cost'}`}
                            title={isWorkBuddyModel
                              ? model.workBuddyMultiplierUpdatedAt
                                ? `WorkBuddy 积分倍率数据更新时间：${model.workBuddyMultiplierUpdatedAt}`
                                : 'WorkBuddy 本机积分倍率'
                              : undefined}
                          >
                            {isWorkBuddyModel
                              ? `积分倍率 ${workBuddyMultiplier || '—'}`
                              : `输出 ${formatCostPerMillion(model.costPerMillion.output)}`}
                          </span>
                          {model.deprecated && <span className="provider-tag">已弃用</span>}
                        </div>
                      </div>
                      <div className="source-model-actions">
                        <button
                          type="button"
                          className="settings-danger-button"
                          onClick={() => void onRemoveModel(model.key)}
                          title="从 TaskWeaver 移除该模型"
                        >
                          <Trash2 size={13} />
                          移除
                        </button>
                      </div>
                    </article>
                    )
                  })
                ) : (
                  <div className="provider-source-empty-models">
                    <span>该来源暂未添加模型</span>
                    <button
                      type="button"
                      className="settings-secondary-button btn-xs"
                      onClick={() => handleOpenAddForSource(source.id, source.kind === 'custom' ? 'custom' : 'builtin', source.rawCustomEntry, 'add_model')}
                    >
                      <Plus size={13} />
                      挑选模型加入
                    </button>
                  </div>
                )}
              </div>
            </section>
          ))
        )}
      </div>

      <div className="settings-footnote model-settings-footnote">
        <ShieldAlert size={15} />
        <span>
          {bridgeReady
          ? 'API 凭据由 TaskWeaver 加密保存在本机；保存凭据不等于已验证服务连通。'
            : '当前为纯 Web 预览，模型 API 仅在 TaskWeaver 桌面端可用。'}
        </span>
      </div>
        </>
      )}

      {keyProvider && (
        <ProviderKeyModal
          provider={keyProvider}
          onClose={() => setKeyProvider(null)}
          onSave={(key) => onSetProviderApiKey(keyProvider.id, key)}
        />
      )}
      {addingModel && (
        <AddModelModal
          providers={auth}
          candidates={candidateModels}
          existingModelKeys={models.map((model) => model.key)}
          loading={loading}
          bridgeReady={bridgeReady}
          catalogError={error}
          initialProviderId={targetProviderId}
          initialTab={targetTab}
          initialCustomEntry={targetCustomEntry}
          initialCustomMode={targetCustomMode}
          onClose={() => {
            setAddingModel(false)
            setTargetProviderId(undefined)
            setTargetCustomEntry(null)
          }}
          onRefresh={() => {
            onRefresh()
            void loadCustomList()
          }}
          onSetProviderApiKey={onSetProviderApiKey}
          onAddModel={onAddModel}
          onAddModels={onAddModels}
          onToast={(msg) => onToast?.(msg)}
          onClearCatalogError={onClearCatalogError}
          onStartOAuth={handleStartOAuth}
        />
      )}
      {modelRoleModalOpen && (
        <ModelRoleAssignmentModal
          models={models ?? []}
          onClose={() => setModelRoleModalOpen(false)}
          onSaveProfile={onUpsertProfile}
          onToast={onToast}
        />
      )}
      {showOAuthModal && (
        <OAuthLoginModal
          status={oauthStatus ?? null}
          providerId={oauthProviderId}
          onClose={handleCloseOAuth}
          onSubmitCode={async (code) => {
            if (onSubmitOAuthCode) {
              const ok = await onSubmitOAuthCode(code)
              if (ok) setShowOAuthModal(false)
              return ok
            }
            return false
          }}
        />
      )}
      <LocalScanModal
        open={scanOpen}
        loading={scanLoading}
        error={scanError}
        result={scanResult}
        onClose={closeScanModal}
        onConfirm={onAddModels}
      />
      <ProbeModelsModal
        open={probeOpen}
        loading={probeLoading}
        error={probeError}
        result={probeResult}
        providerName={probeTargetSource?.name || '自定义网关'}
        onClose={() => {
          setProbeOpen(false)
          setProbeError(null)
          setProbeResult(null)
          setProbeTargetSource(null)
        }}
        onConfirm={handleConfirmImportProbedModels}
      />
    </SettingsLayout>
  )
}
