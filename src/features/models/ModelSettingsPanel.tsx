import { useCallback, useEffect, FormEvent, useMemo, useState } from 'react'
import { Check, Copy, Database, ExternalLink, KeyRound, Link2, LogOut, Pencil, Plus, RefreshCw, ScanSearch, ShieldAlert, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import type { CatalogModel, CustomProviderEntry, ModelProfilePatch, ProviderAuthStatus, OAuthStatusInfo, ScanLocalModelsResult, ModelUpdateStatus } from '../../shared/model-api'
import { formatCostPerMillion, getCleanModelName } from './format'
import { LocalScanModal } from './LocalScanModal'
import { CustomProviderSection } from './CustomProviderSection'

function OAuthLoginModal({
  status,
  providerId,
  onClose,
  onSubmitCode,
}: {
  status: OAuthStatusInfo | null
  providerId: string
  onClose: () => void
  onSubmitCode: (code: string) => Promise<boolean>
}) {
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const providerLabel = providerId === 'anthropic' ? 'Claude Pro/Max' : 'ChatGPT Plus/Pro'
  useEffect(() => {
    if (status?.status !== 'completed') return
    const timer = setTimeout(onClose, 700)
    return () => clearTimeout(timer)
  }, [onClose, status?.status])

  const copyUrl = () => {
    if (status?.url) {
      void navigator.clipboard.writeText(status.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setSubmitting(true)
    const ok = await onSubmitCode(code.trim())
    setSubmitting(false)
    if (ok) onClose()
  }

  return (
    <div
      className="settings-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="model-editor oauth-modal">
        <h2>{providerLabel} 官方订阅授权</h2>
        <p>{status?.instructions || `TaskWeaver 将通过 DSH 官方授权流程打开 ${providerId === 'anthropic' ? 'Anthropic' : 'OpenAI Codex'} 登录页面。凭据由 DSH 安全保存。`}</p>

        <div className="oauth-status-box">
          <div className="oauth-status-spinner" />
          <div className="oauth-status-text">
            <strong>{status?.status === 'error' ? '授权未完成' : status?.status === 'completed' ? '授权完成' : status?.status === 'prompt' ? status.prompt?.message : '正在等待官方授权完成…'}</strong>
            <span>
              {status?.error
                || (status?.status === 'completed'
                  ? '授权已写入 DSH 凭据库，可在模型列表中使用 Codex 模型。'
                  : '登录成功后凭据由 DSH 安全保存；若浏览器未自动打开，请使用下方链接。')}
            </span>
          </div>
        </div>

        {status?.url && (
          <div className="oauth-fallback-section">
            <label className="oauth-hint-label">若浏览器未自动打开，可手动复制此授权链接并在浏览器中访问：</label>
            <div className="oauth-url-row">
              <input type="text" readOnly value={status.url} className="oauth-url-input" />
              <button type="button" className="settings-secondary-button" onClick={copyUrl}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? '已复制' : '复制链接'}
              </button>
            </div>
          </div>
        )}

        {status?.status === 'prompt' && status.prompt?.kind === 'select' && status.prompt.options ? (
          <form onSubmit={submit} className="oauth-manual-form">
            <label>{status.prompt.message}
              <select value={code} onChange={(e) => setCode(e.target.value)}>
                <option value="">请选择…</option>
                {status.prompt.options.map((option) => <option key={option.id} value={option.id}>{option.label}{option.description ? ` — ${option.description}` : ''}</option>)}
              </select>
            </label>
            <div className="model-editor-actions">
              <button type="button" className="settings-secondary-button" onClick={onClose}>取消</button>
              <button className="settings-primary-button" disabled={!code.trim() || submitting}>{submitting ? '正在提交…' : '继续'}</button>
            </div>
          </form>
        ) : null}
        {(status?.status === 'prompt' && status.prompt?.kind !== 'select') || status?.url || status?.status === 'device_code' ? (
        <form onSubmit={submit} className="oauth-manual-form">
          <label>
            {status?.status === 'prompt' ? status.prompt?.message : '若浏览器未自动回调，可粘贴浏览器最终重定向链接或授权码：'}
            <input
              type={status?.prompt?.kind === 'secret' ? 'password' : 'text'}
              placeholder={status?.prompt?.placeholder || '粘贴授权内容'}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <div className="model-editor-actions">
            <button type="button" className="settings-secondary-button" onClick={onClose}>
              取消
            </button>
            <button className="settings-primary-button" disabled={!code.trim() || submitting}>
              {submitting ? '正在提交…' : status?.status === 'prompt' ? '继续' : '提交授权链接/码'}
            </button>
          </div>
        </form>
        ) : null}
      </div>
    </div>
  )
}

function ProviderKeyModal({
  provider,
  onClose,
  onSave,
}: {
  provider: ProviderAuthStatus
  onClose: () => void
  onSave: (apiKey: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!apiKey.trim()) return
    setSaving(true)
    setSaveError(null)
    const result = await onSave(apiKey.trim())
    setSaving(false)
    if (result.ok) onClose()
    else setSaveError(result.error ?? '保存失败')
  }

  return (
    <div
      className="settings-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form className="model-editor" onSubmit={submit}>
        <h2>配置 {provider.name} API 密钥</h2>
        <p>凭据仅保存在 TaskWeaver 的应用数据中。</p>
        <label>
          API 密钥
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        {saveError && <div className="settings-inline-error" role="alert">{saveError}</div>}
        <div className="model-editor-actions">
          <button type="button" className="settings-secondary-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="settings-primary-button" disabled={!apiKey.trim() || saving}>
            保存
          </button>
        </div>
      </form>
    </div>
  )
}

function AddModelModal({
  providers,
  candidates,
  loading,
  bridgeReady,
  catalogError,
  onClose,
  onRefresh,
  onSetProviderApiKey,
  onAddModel,
  onAddModels,
  onToast,
  initialProviderId,
  initialTab,
  initialCustomEntry,
  initialCustomMode = 'edit',
  onStartOAuth,
}: {
  providers: ProviderAuthStatus[]
  candidates: CatalogModel[]
  loading: boolean
  bridgeReady: boolean
  catalogError?: string | null
  onClose: () => void
  onRefresh: () => void
  onSetProviderApiKey: (providerId: string, apiKey: string) => Promise<{ ok: boolean; error?: string }>
  onAddModel: (modelKey: string) => Promise<boolean>
  onAddModels: (modelKeys: string[]) => Promise<boolean>
  onToast?: (msg: string) => void
  initialProviderId?: string
  initialTab?: 'builtin' | 'custom'
  initialCustomEntry?: CustomProviderEntry | null
  initialCustomMode?: 'edit' | 'add_model'
  onStartOAuth?: (providerId: string) => Promise<void>
}) {
  const [modalTab, setModalTab] = useState<'builtin' | 'subscription' | 'custom'>(initialTab ?? (initialCustomEntry ? 'custom' : 'builtin'))
  const [providerId, setProviderId] = useState(
    initialProviderId && providers.some((p) => p.id === initialProviderId)
      ? initialProviderId
      : (providers.find((provider) => provider.configured)?.id ?? providers[0]?.id ?? ''),
  )
  const [apiKey, setApiKey] = useState('')
  const [selectedModelKeys, setSelectedModelKeys] = useState<Set<string>>(() => new Set())
  const [modelQuery, setModelQuery] = useState('')
  const [step, setStep] = useState<'provider' | 'model'>('provider')
  const [providerMenuOpen, setProviderMenuOpen] = useState(false)
  const [providerQuery, setProviderQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const provider = providers.find((item) => item.id === providerId)
  const providerModels = candidates.filter((model) => model.provider === providerId)
  const matchingModels = providerModels.filter((model) => `${model.name} ${model.id} ${model.key}`.toLowerCase().includes(modelQuery.trim().toLowerCase()))
  const needsKey = provider ? !provider.configured : true
  const matchingProviders = providers.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(providerQuery.trim().toLowerCase()))

  useEffect(() => {
    if (!providers.length || providers.some((item) => item.id === providerId)) return
    const preferred = initialProviderId && providers.some((item) => item.id === initialProviderId)
      ? initialProviderId
      : providers[0].id
    setProviderId(preferred)
  }, [initialProviderId, providerId, providers])

  const continueToModels = async (event: FormEvent) => {
    event.preventDefault()
    setLocalError(null)
    if (!provider) {
      const message = '请先选择模型提供方'
      setLocalError(message)
      onToast?.(message)
      return
    }
    setSaving(true)
    try {
      if (needsKey) {
        if (!apiKey.trim()) {
          setSaving(false)
          return
        }
        const saved = await onSetProviderApiKey(provider.id, apiKey.trim())
        if (!saved.ok) {
          const message = saved.error || '保存 API 密钥失败，请检查密钥或稍后重试'
          setLocalError(message)
          onToast?.(message)
          setSaving(false)
          return
        }
        setApiKey('')
      }
      setSelectedModelKeys(new Set())
      setStep('model')
    } finally {
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
    if (selectedModelKeys.size === 0) return
    setSaving(true)
    const keys = [...selectedModelKeys]
    const ok = keys.length === 1
      ? await onAddModel(keys[0])
      : await onAddModels(keys)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="model-editor model-editor-wide" role="dialog" aria-modal="true" aria-labelledby="add-model-title">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 id="add-model-title">添加模型</h2>
            <p style={{ marginTop: 4 }}>
              {modalTab === 'builtin'
                ? (step === 'provider'
                    ? '选择官方或主流第三方提供方并配置凭据，从本地模型目录中挑选要加入 TaskWeaver 的模型。'
                    : `${provider?.name ?? providerId} · 挑选要加入 TaskWeaver 的模型。`)
                : '连接中转站、自部署网关或其他兼容 OpenAI / Anthropic 协议的接口，直接加入模型。'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="custom-provider-tabs" role="tablist" aria-label="添加模型方式" style={{ margin: '4px 0 8px' }}>
          <button
            type="button"
            role="tab"
            aria-selected={modalTab === 'builtin'}
            className={modalTab === 'builtin' ? 'active' : ''}
            onClick={() => { setModalTab('builtin'); setStep('provider') }}
          >
            第三方模型提供商
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modalTab === 'subscription'}
            className={modalTab === 'subscription' ? 'active' : ''}
            onClick={() => setModalTab('subscription')}
          >
            订阅
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modalTab === 'custom'}
            className={modalTab === 'custom' ? 'active' : ''}
            onClick={() => setModalTab('custom')}
          >
            自定义模型 API
          </button>
        </div>

        {modalTab === 'builtin' ? (
          step === 'provider' ? (
            <form onSubmit={continueToModels} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="model-editor-field" style={{ display: 'flex', flexDirection: 'column' }}>
                <input
                  type="search"
                  placeholder="搜索模型提供方（如 DeepSeek、OpenAI、Anthropic、Google、Qwen…）"
                  value={providerQuery}
                  onChange={(event) => setProviderQuery(event.target.value)}
                  style={{ width: '100%', marginBottom: 8 }}
                  autoFocus
                />
                <div
                  style={{
                    maxHeight: 220,
                    overflowY: 'auto',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 8,
                    background: 'rgba(0, 0, 0, 0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: 6,
                  }}
                >
                  {matchingProviders.length > 0 ? (
                    matchingProviders.map((item) => {
                      const isSelected = item.id === providerId
                      return (
                        <div
                          key={item.id}
                          onClick={() => setProviderId(item.id)}
                          onDoubleClick={continueToModels}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                            border: isSelected ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid transparent',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: 600, color: isSelected ? '#10b981' : '#fff', fontSize: 13 }}>
                              {item.name}
                            </span>
                            <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)' }}>
                              {item.id}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              style={{
                                fontSize: 10.5,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: item.configured ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.06)',
                                color: item.configured ? '#10b981' : 'rgba(255, 255, 255, 0.5)',
                              }}
                            >
                              {item.configured ? '✓ 已有凭据' : '待配置'}
                            </span>
                            {isSelected && (
                              <span style={{ color: '#10b981', fontSize: 12, fontWeight: 700 }}>✓ 已选择</span>
                            )}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="provider-search-empty">
                      {loading ? (
                        <span>正在加载提供方目录…</span>
                      ) : providers.length === 0 ? (
                        <>
                          <span>
                            {catalogError
                              ? catalogError
                              : '暂时无法获取提供方目录。DSH Agent Host 可能仍在启动，请稍候再点刷新。'}
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
                <label style={{ marginTop: 2 }}>
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
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#10b981' }}>
                  ✓ {provider?.name} 已配置可用凭据，点击「选择模型」挑选要添加的模型。
                </p>
              )}

              {localError && (
                <div className="settings-inline-error" role="alert">{localError}</div>
              )}

              <div className="model-editor-actions" style={{ paddingTop: 4 }}>
                <button type="button" className="settings-secondary-button" onClick={onClose}>取消</button>
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
            <form onSubmit={addSelectedModels} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="model-editor-field" style={{ display: 'flex', flexDirection: 'column' }}>
                <input
                  type="search"
                  placeholder="搜索模型名称或标识…"
                  value={modelQuery}
                  onChange={(event) => setModelQuery(event.target.value)}
                  style={{ width: '100%', marginBottom: 10 }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="settings-secondary-button"
                    onClick={() => setSelectedModelKeys(new Set(matchingModels.map((m) => m.key)))}
                    disabled={matchingModels.length === 0}
                  >
                    全选当前列表
                  </button>
                  <button
                    type="button"
                    className="settings-secondary-button"
                    onClick={() => setSelectedModelKeys(new Set())}
                    disabled={selectedModelKeys.size === 0}
                  >
                    清空选择
                  </button>
                  {selectedModelKeys.size > 0 && (
                    <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.55)', alignSelf: 'center' }}>
                      已选 {selectedModelKeys.size} 个
                    </span>
                  )}
                </div>
                <div
                  style={{
                    maxHeight: 280,
                    overflowY: 'auto',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 8,
                    background: 'rgba(0, 0, 0, 0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: 6,
                  }}
                >
                  {matchingModels.length > 0 ? (
                    matchingModels.map((model) => {
                      const isSelected = selectedModelKeys.has(model.key)
                      return (
                        <div
                          key={model.key}
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleModelSelection(model.key)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              toggleModelSelection(model.key)
                            }
                          }}
                          onDoubleClick={addSelectedModels}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                            border: isSelected ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid transparent',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: 600, color: isSelected ? '#10b981' : '#fff', fontSize: 13 }}>
                              {model.name}
                            </span>
                            <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)' }}>
                              {model.id}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {model.contextWindow && (
                              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255, 255, 255, 0.06)', color: 'rgba(255, 255, 255, 0.6)' }}>
                                {Math.round(model.contextWindow / 1000)}k 上下文
                              </span>
                            )}
                            {isSelected && (
                              <span style={{ color: '#10b981', fontSize: 12, fontWeight: 700 }}>✓ 已选择</span>
                            )}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(255, 255, 255, 0.4)', fontSize: 13 }}>
                      {providerModels.length === 0 ? '该提供方暂无可添加模型。保存 API 密钥后点「刷新目录」，将从提供方接口拉取最新模型列表。' : '没有匹配的模型'}
                    </div>
                  )}
                </div>
              </div>
              <div className="model-editor-actions" style={{ paddingTop: 4 }}>
                <button type="button" className="settings-secondary-button" onClick={() => setStep('provider')}>上一步</button>
                <button type="button" className="settings-secondary-button" onClick={onRefresh} disabled={loading}><RefreshCw size={14} className={loading ? 'spin-icon' : ''} />刷新目录</button>
                <button type="submit" className="settings-primary-button" disabled={selectedModelKeys.size === 0 || saving}>
                  {saving
                    ? '正在添加…'
                    : selectedModelKeys.size > 1
                      ? `添加 ${selectedModelKeys.size} 个模型`
                      : '添加到模型列表'}
                </button>
              </div>
            </form>
          )
        ) : modalTab === 'subscription' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255, 255, 255, 0.7)' }}>
              通过官方 OAuth 授权接入 Anthropic、GitHub Copilot、OpenAI Codex、Radius、xAI 等订阅服务。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              {[
                { id: 'anthropic', name: 'Anthropic', label: 'Claude Pro / Max' },
                { id: 'github', name: 'GitHub Copilot', label: 'GitHub Copilot 订阅' },
                { id: 'codex', name: 'OpenAI Codex', label: 'ChatGPT Plus / Pro' },
                { id: 'radius', name: 'Radius', label: 'Radius 订阅' },
                { id: 'xai', name: 'xAI', label: 'xAI / Grok 订阅' },
              ].map((p) => {
                const configured = providers.find((prov) => prov.id === p.id)?.configured ?? false
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onStartOAuth?.(p.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: 8,
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'
                      e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(0, 0, 0, 0.3)'
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>{p.name}</span>
                        <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' }}>{p.label}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {configured ? (
                        <span
                          style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            fontWeight: 500,
                          }}
                        >
                          ✓ 已授权
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: 'rgba(255, 255, 255, 0.06)',
                            color: 'rgba(255, 255, 255, 0.5)',
                          }}
                        >
                          待授权
                        </span>
                      )}
                      <ExternalLink size={14} style={{ color: 'rgba(255, 255, 255, 0.5)' }} />
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="model-editor-actions" style={{ marginTop: 'auto' }}>
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

function ProfileModal({
  model,
  onClose,
  onSave,
}: {
  model: CatalogModel
  onClose: () => void
  onSave: (patch: ModelProfilePatch) => Promise<boolean>
}) {
  const [tier, setTier] = useState(model.profile?.tier ?? 'balanced')
  const [capabilitySummary, setCapabilitySummary] = useState(model.profile?.capabilitySummary ?? '')
  const [enabledForAllocation, setEnabledForAllocation] = useState(model.profile?.enabledForAllocation !== false)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    const ok = await onSave({ tier, capabilitySummary, enabledForAllocation })
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <div
      className="settings-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form className="model-editor" onSubmit={submit}>
        <h2>分配元数据 · {getCleanModelName(model.key, model.name)}</h2>
        <p>{model.key}</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: '10px 0', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={enabledForAllocation}
            onChange={(event) => setEnabledForAllocation(event.target.checked)}
          />
          <span>参与多 Agent 自动分配（Routing Portfolio 候选）</span>
        </label>
        <label>
          内部能力基线（PolicyGate 先验）
          <select
            value={tier}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'cheap' || value === 'balanced' || value === 'strong') setTier(value)
            }}
          >
            <option value="cheap">低成本检索档 (cheap)</option>
            <option value="balanced">均衡执行档 (balanced)</option>
            <option value="strong">深度推理/审查档 (strong)</option>
          </select>
        </label>
        <label>
          能力摘要（供路由/分配参考）
          <textarea
            value={capabilitySummary}
            onChange={(event) => setCapabilitySummary(event.target.value)}
            rows={3}
            placeholder="例如：适合代码搜索与机械修改"
          />
        </label>
        <div className="model-editor-actions">
          <button type="button" className="settings-secondary-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="settings-primary-button" disabled={saving}>保存</button>
        </div>
      </form>
    </div>
  )
}

export function ModelSettingsPanel({
  auth,
  models,
  candidateModels,
  loading,
  bridgeReady,
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
}: {
  auth: ProviderAuthStatus[]
  models: CatalogModel[]
  candidateModels: CatalogModel[]
  loading: boolean
  bridgeReady: boolean
  error: string | null
  oauthStatus?: OAuthStatusInfo | null
  updateStatus?: ModelUpdateStatus | null
  onRefresh: () => void
  onCheckForUpdates?: () => Promise<boolean>
  onRollbackRegistry?: () => Promise<boolean>
  onSetProviderApiKey: (providerId: string, apiKey: string) => Promise<{ ok: boolean; error?: string }>
  onStartOAuthLogin?: (providerId?: string) => Promise<boolean>
  onCancelOAuthLogin?: () => Promise<boolean>
  onSubmitOAuthCode?: (code: string) => Promise<boolean>
  onLogoutOAuth?: (providerId: string) => Promise<boolean>
  onUpsertProfile: (modelKey: string, patch: ModelProfilePatch) => Promise<boolean>
  onAddModel: (modelKey: string) => Promise<boolean>
  onAddModels: (modelKeys: string[]) => Promise<boolean>
  onScanLocalOpenCodex: () => Promise<ScanLocalModelsResult>
  onRemoveModel: (modelKey: string) => Promise<boolean>
  onRemoveProviderCredentials: (providerId: string) => Promise<boolean>
  onToast?: (message: string) => void
}) {
  const [query, setQuery] = useState('')
  const [keyProvider, setKeyProvider] = useState<ProviderAuthStatus | null>(null)
  const [profileModel, setProfileModel] = useState<CatalogModel | null>(null)
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
  const [checkingUpdates, setCheckingUpdates] = useState(false)

  const isCodexConfigured = auth?.some((p) => p.id === 'openai-codex' && p.configured) ?? false

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

  const sourceGroups = useMemo(() => {
    const list: {
      id: string
      name: string
      kind: 'codex' | 'anthropic' | 'custom' | 'builtin'
      typeLabel: string
      configured: boolean
      writable?: boolean
      baseUrl?: string
      api?: string
      models: CatalogModel[]
      rawCustomEntry?: CustomProviderEntry
    }[] = []

    // Safety checks for undefined props
    if (!auth || !models) return list

    const q = query.trim().toLowerCase()
    const seenProviderIds = new Set<string>()

    // 1. OpenAI Codex
    const codexModels = models.filter((m) => m.provider === 'openai-codex')
    if (isCodexConfigured || codexModels.length > 0) {
      seenProviderIds.add('openai-codex')
      const matchedModels = codexModels.filter((m) => !q || `${m.name} ${m.id} ${m.key}`.toLowerCase().includes(q))
      const matchSource = !q || 'openai codex chatgpt 订阅'.includes(q)
      if (matchSource || matchedModels.length > 0) {
        list.push({
          id: 'openai-codex',
          name: 'ChatGPT 订阅 (Codex)',
          kind: 'codex',
          typeLabel: '官方订阅',
          configured: isCodexConfigured,
          models: q && !matchSource ? matchedModels : (q ? matchedModels : codexModels),
        })
      }
    }

    // Anthropic's official Claude Pro/Max subscription uses the DSH/Pi OAuth flow.
    const anthropic = auth.find((provider) => provider.id === 'anthropic')
    const anthropicModels = models.filter((model) => model.provider === 'anthropic')
    if (anthropic && (anthropic.authorizationMethods?.some((method) => method.id === 'oauth') || anthropic.configured || anthropicModels.length > 0)) {
      seenProviderIds.add('anthropic')
      const matchedModels = anthropicModels.filter((model) => !q || `${model.name} ${model.id} ${model.key}`.toLowerCase().includes(q))
      const matchSource = !q || 'anthropic claude 订阅'.includes(q)
      if (matchSource || matchedModels.length > 0) {
        list.push({
          id: 'anthropic', name: 'Claude 订阅 (Anthropic)', kind: 'anthropic', typeLabel: '官方订阅',
          configured: anthropic.configured,
          models: q && !matchSource ? matchedModels : (q ? matchedModels : anthropicModels),
        })
      }
    }

    // 2. 自定义网关 (Custom Providers)
    for (const cp of customList) {
      seenProviderIds.add(cp.id)
      const cpModels = models.filter((m) => m.provider === cp.id)
      const matchedModels = cpModels.filter((m) => !q || `${m.name} ${m.id} ${m.key}`.toLowerCase().includes(q))
      const matchSource = !q || `${cp.name} ${cp.id} ${cp.baseUrl}`.toLowerCase().includes(q)
      if (matchSource || matchedModels.length > 0) {
        list.push({
          id: cp.id,
          name: cp.name || cp.id,
          kind: 'custom',
          typeLabel: cp.api === 'openai-responses' ? 'OpenAI Responses API' : 'OpenAI 兼容 API',
          configured: true,
          baseUrl: cp.baseUrl,
          api: cp.api,
          models: q && !matchSource ? matchedModels : (q ? matchedModels : cpModels),
          rawCustomEntry: cp,
        })
      }
    }

    // 3. 已配置或已有模型的官方提供商
    const builtinProviders = auth.filter(
      (p) => (p.configured || models.some((m) => m.provider === p.id)) && p.id !== 'openai-codex' && p.id !== 'anthropic' && !p.id.startsWith('custom-'),
    )
    for (const p of builtinProviders) {
      seenProviderIds.add(p.id)
      const pModels = models.filter((m) => m.provider === p.id)
      const matchedModels = pModels.filter((m) => !q || `${m.name} ${m.id} ${m.key}`.toLowerCase().includes(q))
      const matchSource = !q || `${p.name} ${p.id}`.toLowerCase().includes(q)
      if (matchSource || matchedModels.length > 0) {
        list.push({
          id: p.id,
          name: p.name,
          kind: 'builtin',
          typeLabel: '官方提供方',
          configured: p.configured,
          writable: p.writable,
          models: q && !matchSource ? matchedModels : (q ? matchedModels : pModels),
        })
      }
    }

    // 4. 兜底：models 中如果有属于未被上面捕获的 provider（如本地扫描或外部注入）
    for (const m of models) {
      if (!seenProviderIds.has(m.provider)) {
        seenProviderIds.add(m.provider)
        const otherModels = models.filter((item) => item.provider === m.provider)
        const matchedModels = otherModels.filter((item) => !q || `${item.name} ${item.id} ${item.key}`.toLowerCase().includes(q))
        const matchSource = !q || m.provider.toLowerCase().includes(q)
        if (matchSource || matchedModels.length > 0) {
          list.push({
            id: m.provider,
            name: m.provider,
            kind: 'builtin',
            typeLabel: '本地/外部提供方',
            configured: true,
            models: q && !matchSource ? matchedModels : (q ? matchedModels : otherModels),
          })
        }
      }
    }

    return list
  }, [auth, customList, isCodexConfigured, models, query])

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
    setScanOpen(true)
    setScanLoading(true)
    setScanError(null)
    setScanResult(null)
    try {
      const result = await onScanLocalOpenCodex()
      setScanResult(result)
    } catch (error) {
      setScanError(error instanceof Error ? error.message : String(error))
    } finally {
      setScanLoading(false)
    }
  }

  const closeScanModal = () => {
    if (scanLoading) return
    setScanOpen(false)
    setScanError(null)
    setScanResult(null)
  }

  return (
    <section className="settings-page-content model-settings-page">
      <div className="settings-page-heading">
        <div>
          <h1>模型与来源</h1>
          <p>按来源分类管理模型与对应凭据；对话与编排仅使用你加入的模型。</p>
        </div>
        <div className="settings-page-heading-actions">
          <button
            type="button"
            className="settings-secondary-button"
            onClick={() => void handleScanLocal()}
            disabled={loading || !bridgeReady || scanLoading}
          >
            <ScanSearch size={16} />
            {scanLoading ? '扫描中…' : '扫描本地模型'}
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
        </div>
      </div>

      {updateStatus && (
        <div className={`model-registry-status model-registry-status-${updateStatus.state}`}>
          <div className="model-registry-status-copy">
            <div className="model-registry-status-title">
              <span className="model-registry-status-dot" />
              模型目录 {updateStatus.currentVersion || '内置版'}
              <span className="model-registry-status-badge">
                {{
                  idle: '就绪',
                  checking: '检查中',
                  'up-to-date': '已是最新',
                  updated: '已更新',
                  cached: '使用缓存',
                  failed: '更新失败',
                  'rolled-back': '已回滚',
                }[updateStatus.state]}
              </span>
            </div>
            <div className="model-registry-status-meta">
              {updateStatus.lastCheckedAt
                ? `上次检查 ${new Date(updateStatus.lastCheckedAt).toLocaleString()}`
                : '尚未检查远程更新'}
              {updateStatus.error ? ` · ${updateStatus.error}` : ''}
            </div>
            {updateStatus.runtime && (
              <div className="model-registry-status-meta">
                DSH {updateStatus.runtime.dsh?.version || '未知'} · pi-ai {updateStatus.runtime.piAi?.version || '未知'} · Overlay v{updateStatus.runtime.overlayVersion ?? '未知'}
              </div>
            )}
            {(updateStatus.changes.added.length > 0
              || updateStatus.changes.deprecated.length > 0
              || updateStatus.changes.changed.length > 0) && (
              <div className="model-registry-status-changes">
                <div>
                  新增 {updateStatus.changes.added.length} · 弃用 {updateStatus.changes.deprecated.length} · 能力变化 {updateStatus.changes.changed.length}
                </div>
                {updateStatus.changes.added.length > 0 && (
                  <div className="model-registry-status-change-list" title={updateStatus.changes.added.join('\n')}>
                    新增模型：{updateStatus.changes.added.slice(0, 6).join('、')}
                    {updateStatus.changes.added.length > 6 ? ` 等 ${updateStatus.changes.added.length} 项` : ''}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="model-registry-status-actions">
            {updateStatus.previousVersion && onRollbackRegistry && (
              <button type="button" className="settings-secondary-button" onClick={() => void onRollbackRegistry()}>
                回滚目录
              </button>
            )}
            <button
              type="button"
              className="settings-secondary-button"
              disabled={checkingUpdates || updateStatus.state === 'checking'}
              onClick={() => {
                if (!onCheckForUpdates) return
                setCheckingUpdates(true)
                void onCheckForUpdates().finally(() => setCheckingUpdates(false))
              }}
            >
              <RefreshCw size={15} className={checkingUpdates || updateStatus.state === 'checking' ? 'spin' : ''} />
              {checkingUpdates || updateStatus.state === 'checking' ? '检查中…' : '检查模型更新'}
            </button>
          </div>
        </div>
      )}

      {error && <div className="settings-inline-error" role="alert">{error}</div>}

      {loading && !models ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <p>正在加载模型目录…</p>
        </div>
      ) : !auth || !models ? (
        <div className="settings-inline-error" role="alert">
          无法加载模型数据，请刷新页面重试。
        </div>
      ) : (
        <>
          <div className="model-settings-toolbar" style={{ marginBottom: 16 }}>
            <input
              type="search"
              placeholder="搜索来源或模型（名称/ID/URL）…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索模型或来源"
            />
            <span className="model-list-count">
              {sourceGroups.length} 个来源 · {models.length} 个已添加模型
            </span>
          </div>

      <div className="provider-source-cards-stack">
        {sourceGroups.length === 0 ? (
          <div className="model-settings-panel-card empty-sources-guide">
            <div style={{ textAlign: 'center', padding: '36px 20px' }}>
              <Database size={36} style={{ color: 'var(--accent-green)', opacity: 0.8, marginBottom: 12 }} />
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 6 }}>
                {query.trim() ? '没有匹配的来源或模型' : '还没有添加任何模型来源'}
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 440, margin: '0 auto 18px' }}>
                {query.trim()
                  ? '尝试搜索其他关键词，或点击右上角「添加模型与来源」接入新来源。'
                  : 'TaskWeaver 按来源分类组织管理模型。点击下方按钮添加官方提供商、直连 ChatGPT 订阅，或接入自定义中转站 API。'}
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
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
                  扫描本地模型
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
                      <span className="provider-source-id">{source.id}</span>
                      <span className="provider-source-type-pill">{source.typeLabel}</span>
                      <span className={`provider-status-label ${source.configured ? 'ok' : ''}`}>
                        {source.configured ? '凭据可用' : '未配置'}
                      </span>
                    </div>
                    {source.baseUrl && (
                      <code className="provider-source-url">{source.baseUrl}</code>
                    )}
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
                  source.models.map((model) => (
                    <article key={model.key} className="provider-source-model-row">
                      <div className="source-model-info">
                        <div className="source-model-title-line">
                          <strong className="source-model-name">{getCleanModelName(model.key, model.name)}</strong>
                          <code className="source-model-id">{model.id}</code>
                          {model.contextWindow && (
                            <span className="source-model-tag context">
                              {Math.round(model.contextWindow / 1000)}k 上下文
                            </span>
                          )}
                          <span className="source-model-tag cost">
                            输出 {formatCostPerMillion(model.costPerMillion.output)}
                          </span>
                          <span className={`source-model-tag allocation ${model.profile?.enabledForAllocation === false ? 'disabled' : ''}`}>
                            {model.profile?.enabledForAllocation === false ? '不参与子任务分配' : '可参与子任务分配'}
                          </span>
                          {model.deprecated && <span className="provider-tag">已弃用</span>}
                          {model.verificationStatus === 'unverified' && <span className="provider-tag">当前不可验证</span>}
                          {!model.available && <span className="provider-tag">连接不可用</span>}
                        </div>
                        {model.profile?.capabilitySummary && (
                          <p className="source-model-summary">{model.profile.capabilitySummary}</p>
                        )}
                      </div>
                      <div className="source-model-actions">
                        <button
                          type="button"
                          className="settings-secondary-button"
                          onClick={() => setProfileModel(model)}
                          disabled={!model.available}
                        >
                          <Pencil size={13} />
                          分配元数据
                        </button>
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
                  ))
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

      <div className="settings-footnote" style={{ marginTop: 24 }}>
        <ShieldAlert size={15} />
        <span>
          {bridgeReady
          ? 'API 凭据由 TaskWeaver 加密保存在本机；保存凭据不等于已验证服务连通。'
            : '当前为纯 Web 预览，模型 API 仅在 Electron 主进程可用。'}
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
          onStartOAuth={handleStartOAuth}
        />
      )}
      {profileModel && (
        <ProfileModal
          model={profileModel}
          onClose={() => setProfileModel(null)}
          onSave={(patch) => onUpsertProfile(profileModel.key, patch)}
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
    </section>
  )
}
