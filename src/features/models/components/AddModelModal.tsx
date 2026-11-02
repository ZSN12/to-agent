import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, RefreshCw, X } from 'lucide-react'
import type { CatalogModel, CustomProviderEntry, DiscoveredProviderModel, ModelAddItemResult, ModelAddItemResultListener, ProviderAuthStatus } from '../../../shared/model-api'
import { getCleanModelId } from '../format'
import { CustomProviderSection } from '../CustomProviderSection'
import { useModalFocusTrap } from '../../../shared/useModalFocusTrap'

export function AddModelModal({
  providers,
  candidates,
  existingModelKeys = [],
  loading,
  bridgeReady,
  catalogError,
  onClose,
  onRefresh,
  onSetProviderApiKey,
  onAddModel,
  onAddModels,
  onToast,
  onClearCatalogError,
  initialProviderId,
  initialTab,
  initialCustomEntry,
  initialCustomMode = 'edit',
  onStartOAuth,
}: {
  providers: ProviderAuthStatus[]
  candidates: CatalogModel[]
  existingModelKeys?: string[]
  loading: boolean
  bridgeReady: boolean
  catalogError?: string | null
  onClose: () => void
  onRefresh: () => void
  onSetProviderApiKey: (providerId: string, apiKey: string) => Promise<{ ok: boolean; error?: string }>
  onAddModel: (modelKey: string) => Promise<boolean>
  onAddModels: (modelKeys: string[], onItemResult?: ModelAddItemResultListener) => Promise<boolean>
  onToast?: (msg: string) => void
  onClearCatalogError?: () => void
  initialProviderId?: string
  initialTab?: 'builtin' | 'custom'
  initialCustomEntry?: CustomProviderEntry | null
  initialCustomMode?: 'edit' | 'add_model'
  onStartOAuth?: (providerId: string) => Promise<void>
}) {
  const savingRef = useRef(false)
  const discoveryRequestIdRef = useRef(0)
  const closeWhenIdle = useCallback(() => {
    if (!savingRef.current) onClose()
  }, [onClose])
  const dialogRef = useModalFocusTrap<HTMLDivElement>({ open: true, onEscape: closeWhenIdle })
  const [modalTab, setModalTab] = useState<'builtin' | 'subscription' | 'custom'>(initialTab ?? (initialCustomEntry ? 'custom' : 'builtin'))
  const [providerId, setProviderId] = useState(
    initialProviderId && providers.some((p) => p.id === initialProviderId)
      ? initialProviderId
      : (providers.find((provider) => provider.configured)?.id ?? providers[0]?.id ?? ''),
  )
  const [apiKey, setApiKey] = useState('')
  const [selectedModelKeys, setSelectedModelKeys] = useState<Set<string>>(() => new Set())
  const [modelQuery, setModelQuery] = useState('')
  // Skip straight to model selection only when the requested provider already
  // has credentials; otherwise the provider step is where the key is entered.
  const [step, setStep] = useState<'provider' | 'model'>(() => (
    initialTab !== 'custom'
      && Boolean(initialProviderId)
      && providers.some((item) => item.id === initialProviderId && item.configured)
      ? 'model'
      : 'provider'
  ))
  const [providerQuery, setProviderQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [addResults, setAddResults] = useState<Record<string, ModelAddItemResult>>({})
  const [discoveredWorkBuddyModels, setDiscoveredWorkBuddyModels] = useState<DiscoveredProviderModel[]>([])
  const [workBuddyDiscoveryLoading, setWorkBuddyDiscoveryLoading] = useState(false)
  const [workBuddyDiscoveryError, setWorkBuddyDiscoveryError] = useState<string | null>(null)
  const provider = providers.find((item) => item.id === providerId)
  const existingKeys = new Set(existingModelKeys)
  const visibleProviderModels = new Map<string, Pick<CatalogModel,
    'key' | 'provider' | 'id' | 'name' | 'verificationStatus' | 'workBuddyMultiplier' | 'workBuddyMultiplierStatus' | 'workBuddyMultiplierUpdatedAt'
  > & Partial<Pick<CatalogModel, 'contextWindow' | 'maxTokens'>>>()
  for (const model of candidates) {
    if (model.provider === providerId) visibleProviderModels.set(model.key, model)
  }
  if (providerId === 'workbuddy') {
    for (const model of discoveredWorkBuddyModels) {
      const id = String(model.id ?? '').trim()
      if (!id) continue
      const key = `workbuddy/${id}`
      const existing = visibleProviderModels.get(key)
      visibleProviderModels.set(key, {
        ...existing,
        key,
        provider: 'workbuddy',
        id,
        name: existing?.name || model.name || id,
        verificationStatus: model.verificationStatus ?? existing?.verificationStatus,
        ...((existing?.contextWindow ?? model.contextWindow) == null ? {} : { contextWindow: existing?.contextWindow ?? model.contextWindow }),
        ...((existing?.maxTokens ?? model.maxTokens) == null ? {} : { maxTokens: existing?.maxTokens ?? model.maxTokens }),
        workBuddyMultiplier: model.workBuddyMultiplier ?? existing?.workBuddyMultiplier,
        workBuddyMultiplierStatus: model.workBuddyMultiplierStatus ?? existing?.workBuddyMultiplierStatus,
        workBuddyMultiplierUpdatedAt: model.workBuddyMultiplierUpdatedAt ?? existing?.workBuddyMultiplierUpdatedAt,
      })
    }
  }
  const providerModels = [...visibleProviderModels.values()].filter((model) => !existingKeys.has(model.key))
  const matchingModels = providerModels.filter((model) => `${model.name} ${model.id} ${model.key}`.toLowerCase().includes(modelQuery.trim().toLowerCase()))
  const needsKey = provider ? !provider.configured : true
  const matchingProviders = providers.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(providerQuery.trim().toLowerCase()))

  const refreshWorkBuddyModels = useCallback(async () => {
    const requestId = ++discoveryRequestIdRef.current
    setWorkBuddyDiscoveryLoading(true)
    setWorkBuddyDiscoveryError(null)
    setDiscoveredWorkBuddyModels([])
    const discover = window.taskweaver?.models?.discoverProviderModels
    try {
      if (!discover) throw new Error('模型发现接口不可用，请重启 TaskWeaver 后重试。')
      const response = await discover({ providerId: 'workbuddy', force: true })
      if (!response?.ok) throw new Error(response?.error || '读取 WorkBuddy 模型目录失败')
      if (response.data.status !== 'ok') {
        throw new Error(response.data.error || (response.data.status === 'timeout' ? '读取 WorkBuddy 模型目录超时' : '读取 WorkBuddy 模型目录失败'))
      }
      if (requestId === discoveryRequestIdRef.current) {
        setDiscoveredWorkBuddyModels(response.data.models)
      }
    } catch (error) {
      if (requestId === discoveryRequestIdRef.current) {
        setWorkBuddyDiscoveryError(error instanceof Error ? error.message : '读取 WorkBuddy 模型目录失败')
      }
    } finally {
      if (requestId === discoveryRequestIdRef.current) setWorkBuddyDiscoveryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (modalTab === 'builtin' && step === 'model' && providerId === 'workbuddy') {
      void refreshWorkBuddyModels()
      return () => {
        discoveryRequestIdRef.current += 1
      }
    }
    discoveryRequestIdRef.current += 1
    setWorkBuddyDiscoveryLoading(false)
    setWorkBuddyDiscoveryError(null)
    setDiscoveredWorkBuddyModels([])
    return undefined
  }, [modalTab, providerId, refreshWorkBuddyModels, step])

  const refreshCurrentDirectory = () => {
    onRefresh()
    if (modalTab === 'builtin' && step === 'model' && providerId === 'workbuddy') {
      void refreshWorkBuddyModels()
    }
  }

  useEffect(() => {
    if (!providers.length || providers.some((item) => item.id === providerId)) return
    const preferred = initialProviderId && providers.some((item) => item.id === initialProviderId)
      ? initialProviderId
      : providers[0].id
    setProviderId(preferred)
  }, [initialProviderId, providerId, providers])

  const continueToModels = async (event: FormEvent) => {
    event.preventDefault()
    if (savingRef.current) return
    setLocalError(null)
    if (!provider) {
      const message = '请先选择模型提供方'
      setLocalError(message)
      onToast?.(message)
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      if (needsKey) {
        if (!apiKey.trim()) return
        const saved = await onSetProviderApiKey(provider.id, apiKey.trim())
        if (!saved.ok) {
          const message = saved.error || '保存 API 密钥失败，请检查密钥或稍后重试'
          setLocalError(message)
          onToast?.(message)
          return
        }
        setApiKey('')
      }
      setSelectedModelKeys(new Set())
      setAddResults({})
      setAddError(null)
      setStep('model')
    } catch (error) {
      const message = error instanceof Error ? error.message : '配置提供方时发生未知错误'
      setLocalError(message)
      onToast?.(message)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const toggleModelSelection = (key: string) => {
    setSelectedModelKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const addSelectedModels = async (event: FormEvent) => {
    event.preventDefault()
    if (selectedModelKeys.size === 0 || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setAddError(null)
    onClearCatalogError?.()
    const keys = [...selectedModelKeys]
    setAddResults((previous) => {
      const next = { ...previous }
      for (const key of keys) delete next[key]
      return next
    })
    const itemResults: ModelAddItemResult[] = []
    let closeAfterSuccess = false
    try {
      const onItemResult: ModelAddItemResultListener = (result) => {
        itemResults.push(result)
        setAddResults((previous) => ({ ...previous, [result.modelKey]: result }))
        if (result.ok) {
          setSelectedModelKeys((previous) => {
            const next = new Set(previous)
            next.delete(result.modelKey)
            return next
          })
        }
      }
      const ok = await onAddModels(keys, onItemResult)
      if (!ok) {
        const failed = itemResults.filter((result) => !result.ok)
        const addedCount = itemResults.filter((result) => result.ok).length
        const firstError = failed[0]?.error
        setAddError(
          `本次成功添加 ${addedCount} 个，${failed.length || keys.length - addedCount} 个未成功。${firstError ? `首个失败原因：${firstError}` : '查看失败模型旁的原因后重试。'}`,
        )
        return
      }
      onToast?.(`已添加 ${keys.length} 个模型`)
      closeAfterSuccess = true
    } catch (error) {
      const message = error instanceof Error ? error.message : '添加模型时发生未知错误'
      setAddError(message)
      onToast?.(message)
    } finally {
      savingRef.current = false
      setSaving(false)
      if (closeAfterSuccess) onClose()
    }
  }

  return (
    <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeWhenIdle() }}>
      <div
        ref={dialogRef}
        className={`model-editor model-editor-wide ${modalTab === 'builtin' && step === 'model' ? 'add-model-dialog-model-step' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-model-title"
        tabIndex={-1}
      >
        <div className="add-model-modal-heading">
          <div>
            <h2 id="add-model-title">添加模型</h2>
            <p className="add-model-modal-description">
              {modalTab === 'builtin'
                ? (step === 'provider'
                    ? '选择官方或主流第三方提供方并配置凭据，从本地模型目录中挑选要加入 TaskWeaver 的模型。'
                    : `${provider?.name ?? providerId} · 挑选要加入 TaskWeaver 的模型。`)
                : '连接中转站、自部署网关或其他兼容 OpenAI / Anthropic 协议的接口，直接加入模型。'}
            </p>
          </div>
          <button
            type="button"
            onClick={closeWhenIdle}
            aria-label="关闭"
            className="add-model-modal-close"
            disabled={saving}
          >
            <X size={18} />
          </button>
        </div>

        <div className="custom-provider-tabs add-model-modal-tabs" role="group" aria-label="添加模型方式">
          <button
            type="button"
            aria-pressed={modalTab === 'builtin'}
            className={modalTab === 'builtin' ? 'active' : ''}
            onClick={() => { if (!saving) { setModalTab('builtin'); setStep('provider') } }}
            disabled={saving}
          >
            第三方模型提供商
          </button>
          <button
            type="button"
            aria-pressed={modalTab === 'subscription'}
            className={modalTab === 'subscription' ? 'active' : ''}
            onClick={() => { if (!saving) setModalTab('subscription') }}
            disabled={saving}
          >
            订阅
          </button>
          <button
            type="button"
            aria-pressed={modalTab === 'custom'}
            className={modalTab === 'custom' ? 'active' : ''}
            onClick={() => { if (!saving) setModalTab('custom') }}
            disabled={saving}
          >
            自定义模型 API
          </button>
        </div>

        {modalTab === 'builtin' ? (
          step === 'provider' ? (
            <form onSubmit={continueToModels} className="add-model-form">
              <div className="model-editor-field add-model-field">
                <input
                  type="search"
                  placeholder="搜索模型提供方（如 DeepSeek、OpenAI、Anthropic、Google、Qwen…）"
                  value={providerQuery}
                  onChange={(event) => setProviderQuery(event.target.value)}
                  className="add-model-search"
                  autoFocus
                />
                <div
                  role="group"
                  aria-label="选择模型提供方"
                  className="add-model-list add-model-provider-list"
                >
                  {matchingProviders.length > 0 ? (
                    matchingProviders.map((item) => {
                      const isSelected = item.id === providerId
                      return (
                        <button
                          type="button"
                          key={item.id}
                          aria-pressed={isSelected}
                          aria-label={`${item.name}（${item.id}）`}
                          onClick={() => {
                            if (providerId === item.id) return
                            setProviderId(item.id)
                            setApiKey('')
                            setLocalError(null)
                          }}
                          onDoubleClick={continueToModels}
                          disabled={saving}
                          className={`add-model-option ${isSelected ? 'is-selected' : ''}`}
                        >
                          <span className="add-model-option-copy">
                            <span className="add-model-option-name">
                              {item.name}
                            </span>
                            <span className="add-model-option-id">
                              {item.id}
                            </span>
                          </span>
                          <span className="add-model-option-meta">
                            <span className={`add-model-status ${item.configured ? 'is-configured' : ''}`}>
                              {item.configured ? '✓ 已有凭据' : '待配置'}
                            </span>
                            {isSelected && (
                              <span className="add-model-selected-label">✓ 已选择</span>
                            )}
                          </span>
                        </button>
                      )
                    })
                  ) : (
                    <div className="provider-search-empty">
                      {loading && providers.length === 0 ? (
                        <span>正在加载提供方目录…</span>
                      ) : providers.length === 0 ? (
                        <>
                          <span>
                            {catalogError
                              ? catalogError
                              : '暂时无法获取提供方目录。应用可能仍在启动，请稍候再刷新。'}
                          </span>
                          <button type="button" className="settings-secondary-button" onClick={onRefresh}>刷新目录</button>
                        </>
                      ) : (
                        <>
                          <span>没有匹配的提供方</span>
                          <button type="button" className="settings-secondary-button" onClick={() => setProviderQuery('')}>清除筛选</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {needsKey ? (
                <label className="add-model-key-field">
                  <span>{provider?.name ?? providerId} API 密钥</span>
                  <input
                    type="password"
                    placeholder="输入该提供方的 API Key (如 sk-...)"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </label>
              ) : (
                <p className="add-model-configured-note">
                  ✓ {provider?.name} 已配置凭据，点击「选择模型」挑选要添加的模型。保存凭据不代表 API 连通性已验证。
                </p>
              )}

              {localError && (
                <div className="settings-inline-error" role="alert">{localError}</div>
              )}

              <div className="model-editor-actions add-model-actions">
                <button type="button" className="settings-secondary-button" onClick={closeWhenIdle} disabled={saving}>取消</button>
                <button
                  type="submit"
                  className="settings-primary-button"
                  disabled={!provider || (needsKey && !apiKey.trim()) || saving}
                >
                  {saving ? '正在配置…' : needsKey ? '保存并继续' : '选择模型'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={addSelectedModels} className="add-model-form add-model-form-select">
              <div className="model-editor-field add-model-field">
                <input
                  type="search"
                  placeholder="搜索模型名称或标识…"
                  value={modelQuery}
                  onChange={(event) => setModelQuery(event.target.value)}
                  className="add-model-search"
                  autoFocus
                />
                <div className="add-model-selection-tools">
                  <button
                    type="button"
                    className="settings-secondary-button"
                    onClick={() => setSelectedModelKeys(new Set(matchingModels.map((m) => m.key)))}
                    disabled={matchingModels.length === 0 || saving}
                  >
                    全选当前列表
                  </button>
                  <button
                    type="button"
                    className="settings-secondary-button"
                    onClick={() => setSelectedModelKeys(new Set())}
                    disabled={selectedModelKeys.size === 0 || saving}
                  >
                    清空选择
                  </button>
                  {selectedModelKeys.size > 0 && (
                    <span className="add-model-selection-count">
                      已选 {selectedModelKeys.size} 个
                    </span>
                  )}
                </div>
                {providerId === 'workbuddy' && (
                  <p className="add-model-configured-note" role="status">
                    {workBuddyDiscoveryLoading
                      ? '正在读取 WorkBuddy 本机提供的完整模型目录…'
                      : workBuddyDiscoveryError
                        ? workBuddyDiscoveryError
                        : discoveredWorkBuddyModels.length > 0
                          ? `已从 WorkBuddy 本机目录发现 ${discoveredWorkBuddyModels.length} 个模型。`
                          : '尚未从 WorkBuddy 本机目录发现模型。'}
                  </p>
                )}
                <div
                  role="group"
                  aria-label="选择要添加的模型"
                  className="add-model-list add-model-model-list"
                >
                  {matchingModels.length > 0 ? (
                    matchingModels.map((model) => {
                      const isSelected = selectedModelKeys.has(model.key)
                      return (
                        <button
                          type="button"
                          key={model.key}
                          role="checkbox"
                          aria-checked={isSelected}
                          aria-label={`${model.name}（${model.id}）`}
                          onClick={() => toggleModelSelection(model.key)}
                          onDoubleClick={addSelectedModels}
                          disabled={saving}
                          className={`add-model-option ${isSelected ? 'is-selected' : ''}`}
                        >
                          <div className="add-model-option-copy">
                            <span className="add-model-option-name">
                              {model.name}
                            </span>
                            <span className="add-model-option-id">
                              {getCleanModelId(model.id, model.provider)}
                            </span>
                            {addResults[model.key]?.ok === false && (
                              <span className="add-model-item-error" role="alert">
                                {addResults[model.key].error || '添加失败，请重试。'}
                              </span>
                            )}
                          </div>
                          <div className="add-model-option-meta">
                            {model.verificationStatus === 'unverified' && (
                              <span className="add-model-context-badge" title="此模型来自本机目录，当前服务未返回此模型；添加后仍需确认账号可用性。">
                                目录待确认
                              </span>
                            )}
                            {providerId === 'workbuddy' && (
                              <span
                                className="add-model-context-badge add-model-multiplier-badge"
                                title={model.workBuddyMultiplierUpdatedAt
                                  ? `WorkBuddy 本机倍率数据更新时间：${model.workBuddyMultiplierUpdatedAt}`
                                  : undefined}
                              >
                                {model.workBuddyMultiplier !== undefined && model.workBuddyMultiplier !== ''
                                  ? `倍率 ${model.workBuddyMultiplier}`
                                  : '倍率未提供'}
                              </span>
                            )}
                            {model.contextWindow && (
                              <span className="add-model-context-badge">
                                {Math.round(model.contextWindow / 1000)}k 上下文
                              </span>
                            )}
                            {isSelected && (
                              <span className="add-model-selected-label">✓ 已选择</span>
                            )}
                          </div>
                        </button>
                      )
                    })
                  ) : (
                    <div className="add-model-empty-list">
                      {providerModels.length === 0
                        ? providerId === 'workbuddy' && workBuddyDiscoveryLoading
                          ? '正在读取 WorkBuddy 模型目录…'
                          : providerId === 'workbuddy' && workBuddyDiscoveryError
                            ? workBuddyDiscoveryError
                            : candidates.some((model) => model.provider === providerId)
                          ? '该提供方的模型已全部添加。刷新目录可检查是否有新模型。'
                          : '该提供方暂无目录模型。保存 API 密钥后点「刷新目录」，将从提供方接口拉取最新模型列表。'
                        : '没有匹配的模型'}
                    </div>
                  )}
                </div>
              </div>
              {(catalogError || addError) && (
                <div className="settings-inline-error add-model-submit-error" role="alert">
                  {addError || catalogError}
                </div>
              )}
              <div className="model-editor-actions add-model-actions">
                <button type="button" className="settings-secondary-button" onClick={() => setStep('provider')} disabled={saving}>上一步</button>
                <button type="button" className="settings-secondary-button" onClick={refreshCurrentDirectory} disabled={loading || workBuddyDiscoveryLoading || saving}><RefreshCw size={14} className={loading || workBuddyDiscoveryLoading ? 'spin-icon' : ''} />刷新目录</button>
                <button type="submit" className="settings-primary-button" disabled={selectedModelKeys.size === 0 || saving} aria-busy={saving}>
                  {saving
                    ? `正在添加 ${selectedModelKeys.size} 个模型…`
                    : selectedModelKeys.size > 1
                      ? `添加 ${selectedModelKeys.size} 个模型`
                      : '添加到模型列表'}
                </button>
              </div>
            </form>
          )
        ) : modalTab === 'subscription' ? (
          <div className="add-model-subscription">
            <p className="add-model-subscription-intro">
              通过官方 OAuth 授权接入 Anthropic、GitHub Copilot、OpenAI Codex、Radius、xAI 等订阅服务。
            </p>
            <div className="add-model-subscription-list">
              {[
                { id: 'anthropic', name: 'Anthropic', label: 'Claude Pro / Max' },
                { id: 'github', name: 'GitHub Copilot', label: 'GitHub Copilot 订阅' },
                { id: 'openai-codex', name: 'OpenAI Codex', label: 'ChatGPT Plus / Pro' },
                { id: 'radius', name: 'Radius', label: 'Radius 订阅' },
                { id: 'xai', name: 'xAI', label: 'xAI / Grok 订阅' },
              ].map((p) => {
                const configured = providers.find((prov) => prov.id === p.id)?.configured ?? false
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onStartOAuth?.(p.id)}
                    className="add-model-subscription-option"
                  >
                    <div className="add-model-subscription-provider">
                      <div className="add-model-subscription-copy">
                        <span className="add-model-subscription-name">{p.name}</span>
                        <span className="add-model-subscription-label">{p.label}</span>
                      </div>
                    </div>
                    <div className="add-model-option-meta">
                      {configured ? (
                        <span className="add-model-status is-configured">
                          ✓ 已授权
                        </span>
                      ) : (
                        <span className="add-model-status">
                          待授权
                        </span>
                      )}
                      <ExternalLink size={14} className="add-model-external-link" />
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="model-editor-actions add-model-actions-bottom">
              <button type="button" className="settings-secondary-button" onClick={onClose}>关闭</button>
            </div>
          </div>
        ) : (
          <CustomProviderSection
            bridgeReady={bridgeReady}
            hideTabs
            showSavedList={false}
            initialEntry={initialCustomEntry}
            initialMode={initialCustomMode}
            onClose={onClose}
            onCatalogRefresh={onRefresh}
            onAddModel={async (key) => {
              const ok = await onAddModel(key)
              if (ok) {
                onToast?.(`已将 ${key} 加入已添加模型列表`)
                onClose()
              }
              return ok
            }}
            onToast={(msg) => onToast?.(msg)}
          />
        )}
      </div>
    </div>
  )
}
