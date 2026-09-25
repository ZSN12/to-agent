import { FormEvent, useMemo, useState } from 'react'
import { Check, Copy, Database, ExternalLink, KeyRound, LogOut, Pencil, Plus, RefreshCw, ScanSearch, ShieldAlert, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import type { CatalogModel, ModelProfilePatch, ProviderAuthStatus, OAuthStatusInfo, ScanLocalModelsResult } from '../../shared/model-api'
import { formatCostPerMillion } from './format'
import { LocalScanModal } from './LocalScanModal'

function OAuthLoginModal({
  status,
  onClose,
  onSubmitCode,
}: {
  status: OAuthStatusInfo | null
  onClose: () => void
  onSubmitCode: (code: string) => Promise<boolean>
}) {
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)

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
        <h2>ChatGPT Plus/Pro 订阅授权</h2>
        <p>TaskWeaver 已尝试在系统默认浏览器中打开 OpenAI 官方授权页面。请在浏览器中完成登录与授权。</p>

        <div className="oauth-status-box">
          <div className="oauth-status-spinner" />
          <div className="oauth-status-text">
            <strong>正在等待浏览器授权完成…</strong>
            <span>授权成功后，OpenAI 会自动通知 TaskWeaver，此弹窗将自动关闭并保存凭据。</span>
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

        <form onSubmit={submit} className="oauth-manual-form">
          <label>
            备用：若无法自动回调，可将浏览器最终重定向的完整链接或授权码粘贴到此处：
            <input
              type="text"
              placeholder="http://localhost:1455/auth/callback?code=..."
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <div className="model-editor-actions">
            <button type="button" className="settings-secondary-button" onClick={onClose}>
              取消
            </button>
            <button className="settings-primary-button" disabled={!code.trim() || submitting}>
              {submitting ? '正在验证…' : '提交授权链接/码'}
            </button>
          </div>
        </form>
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
  onSave: (apiKey: string) => Promise<boolean>
}) {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!apiKey.trim()) return
    setSaving(true)
    const ok = await onSave(apiKey.trim())
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
        <div className="model-editor-actions">
          <button type="button" className="settings-secondary-button" onClick={onClose}>
            取消
          </button>
          <button className="settings-primary-button" disabled={!apiKey.trim() || saving}>
            保存
          </button>
        </div>
      </form>
    </div>
  )
}

function AddModelModal({ providers, candidates, loading, onClose, onRefresh, onSetProviderApiKey, onAddModel }: {
  providers: ProviderAuthStatus[]
  candidates: CatalogModel[]
  loading: boolean
  onClose: () => void
  onRefresh: () => void
  onSetProviderApiKey: (providerId: string, apiKey: string) => Promise<boolean>
  onAddModel: (modelKey: string) => Promise<boolean>
}) {
  const [providerId, setProviderId] = useState(providers.find((provider) => provider.configured)?.id ?? providers[0]?.id ?? '')
  const [apiKey, setApiKey] = useState('')
  const [modelKey, setModelKey] = useState('')
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [step, setStep] = useState<'provider' | 'model'>('provider')
  const [providerMenuOpen, setProviderMenuOpen] = useState(false)
  const [providerQuery, setProviderQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const provider = providers.find((item) => item.id === providerId)
  const providerModels = candidates.filter((model) => model.provider === providerId)
  const matchingModels = providerModels.filter((model) => `${model.name} ${model.id} ${model.key}`.toLowerCase().includes(modelQuery.trim().toLowerCase()))
  const selectedModel = providerModels.find((model) => model.key === modelKey)
  const needsKey = provider ? !provider.configured : true
  const matchingProviders = providers.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(providerQuery.trim().toLowerCase()))

  const continueToModels = async (event: FormEvent) => {
    event.preventDefault()
    if (!provider) return
    setSaving(true)
    if (needsKey) {
      if (!apiKey.trim()) { setSaving(false); return }
      const saved = await onSetProviderApiKey(provider.id, apiKey.trim())
      if (!saved) { setSaving(false); return }
      setApiKey('')
    }
    setModelKey('')
    setStep('model')
    setSaving(false)
  }

  const addSelectedModel = async (event: FormEvent) => {
    event.preventDefault()
    if (!modelKey) return
    setSaving(true)
    const ok = await onAddModel(modelKey)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      {step === 'provider' ? (
        <form className="model-editor" onSubmit={continueToModels}>
          <h2>添加模型</h2>
          <p>选择提供方并保存凭据后，从本地模型目录候选中挑选要加入 TaskWeaver 的模型。</p>
          <div className="model-editor-field">
            <label htmlFor="model-provider-search">模型提供方</label>
            <div className="provider-picker">
              <input
                id="model-provider-search"
                role="combobox"
                aria-expanded={providerMenuOpen}
                aria-controls="model-provider-options"
                aria-autocomplete="list"
                placeholder="搜索提供方…"
                value={providerMenuOpen ? providerQuery : provider ? `${provider.name}${provider.configured ? ' · 已有凭据' : ''}` : providerQuery}
                onFocus={() => { setProviderMenuOpen(true); setProviderQuery('') }}
                onChange={(event) => { setProviderQuery(event.target.value); setProviderMenuOpen(true) }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setProviderMenuOpen(false)
                  if (event.key === 'Enter' && matchingProviders[0]) { event.preventDefault(); setProviderId(matchingProviders[0].id); setProviderMenuOpen(false); setProviderQuery('') }
                }}
                required={!providerId}
              />
              {providerMenuOpen && <div className="provider-picker-menu" id="model-provider-options" role="listbox">
                {matchingProviders.length ? matchingProviders.map((item) => (
                  <button key={item.id} type="button" role="option" aria-selected={item.id === providerId} onClick={() => { setProviderId(item.id); setProviderMenuOpen(false); setProviderQuery('') }}>
                    <span>{item.name}</span><small>{item.configured ? '凭据可用' : item.id}</small>
                  </button>
                )) : <div className="provider-picker-empty">没有匹配的提供方</div>}
              </div>}
            </div>
          </div>
          {needsKey && <label>API 密钥
            <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="new-password" required />
          </label>}
          <div className="model-editor-actions">
            <button type="button" className="settings-secondary-button" onClick={onClose}>取消</button>
            <button className="settings-primary-button" disabled={!provider || (needsKey && !apiKey.trim()) || saving}>
              {saving ? '正在配置…' : needsKey ? '保存并继续' : '选择模型'}
            </button>
          </div>
        </form>
      ) : (
        <form className="model-editor" onSubmit={addSelectedModel}>
          <h2>选择模型</h2>
          <p>{provider?.name ?? providerId} · 候选项只用于选择，确认后才会加入模型列表。</p>
          <div className="model-editor-field">
            <label htmlFor="model-candidate-search">模型</label>
            <div className="provider-picker">
              <input
                id="model-candidate-search"
                role="combobox"
                aria-expanded={modelMenuOpen}
                aria-controls="model-candidate-options"
                aria-autocomplete="list"
                placeholder="搜索模型…"
                value={modelMenuOpen ? modelQuery : selectedModel ? `${selectedModel.name} · ${selectedModel.id}` : modelQuery}
                onFocus={() => { setModelMenuOpen(true); setModelQuery('') }}
                onChange={(event) => { setModelQuery(event.target.value); setModelMenuOpen(true) }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setModelMenuOpen(false)
                  if (event.key === 'Enter' && matchingModels[0]) { event.preventDefault(); setModelKey(matchingModels[0].key); setModelMenuOpen(false); setModelQuery('') }
                }}
              />
              {modelMenuOpen && <div className="provider-picker-menu" id="model-candidate-options" role="listbox">
                {matchingModels.length ? matchingModels.map((model) => (
                  <button key={model.key} type="button" role="option" aria-selected={model.key === modelKey} onClick={() => { setModelKey(model.key); setModelMenuOpen(false); setModelQuery('') }}>
                    <span>{model.name}</span><small>{model.id}</small>
                  </button>
                )) : <div className="provider-picker-empty">没有匹配的模型</div>}
              </div>}
            </div>
          </div>
          {providerModels.length === 0 && <p className="settings-list-empty">当前没有可选模型。保存提供方凭据后刷新本地模型目录。</p>}
          <div className="model-editor-actions">
            <button type="button" className="settings-secondary-button" onClick={() => setStep('provider')}>上一步</button>
            <button type="button" className="settings-secondary-button" onClick={onRefresh} disabled={loading}><RefreshCw size={14} className={loading ? 'spin-icon' : ''} />刷新目录</button>
            <button className="settings-primary-button" disabled={!modelKey || saving}>{saving ? '正在添加…' : '添加到模型列表'}</button>
          </div>
        </form>
      )}
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
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    const ok = await onSave({ tier, capabilitySummary })
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
        <h2>分配元数据 · {model.name}</h2>
        <p>{model.key}</p>
        <label>
          档位
          <select
            value={tier}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'cheap' || value === 'balanced' || value === 'strong') setTier(value)
            }}
          >
            <option value="cheap">低成本</option>
            <option value="balanced">均衡</option>
            <option value="strong">高能力</option>
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
          <button className="settings-primary-button" disabled={saving}>保存</button>
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
  onRefresh,
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
}: {
  auth: ProviderAuthStatus[]
  models: CatalogModel[]
  candidateModels: CatalogModel[]
  loading: boolean
  bridgeReady: boolean
  error: string | null
  oauthStatus?: OAuthStatusInfo | null
  onRefresh: () => void
  onSetProviderApiKey: (providerId: string, apiKey: string) => Promise<boolean>
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
}) {
  const [query, setQuery] = useState('')
  const [keyProvider, setKeyProvider] = useState<ProviderAuthStatus | null>(null)
  const [profileModel, setProfileModel] = useState<CatalogModel | null>(null)
  const [addingModel, setAddingModel] = useState(false)
  const [showOAuthModal, setShowOAuthModal] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<ScanLocalModelsResult | null>(null)

  const isCodexConfigured = auth.some((p) => p.id === 'openai-codex' && p.configured)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return models.filter((m) => {
      if (!q) return true
      return (
        m.key.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
      )
    })
  }, [models, query])

  const visibleAuth = auth.filter((provider) => provider.configured && provider.id !== 'openai-codex')

  const handleStartOAuth = async () => {
    setShowOAuthModal(true)
    if (onStartOAuthLogin) {
      await onStartOAuthLogin('openai-codex')
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
          <h1>模型</h1>
          <p>仅显示你明确添加到 TaskWeaver 的模型；凭据由应用安全独立管理。</p>
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
            onClick={() => setAddingModel(true)}
            disabled={loading || !bridgeReady}
          >
            <Plus size={17} />
            添加模型
          </button>
        </div>
      </div>

      {error && <div className="settings-inline-error" role="alert">{error}</div>}

      {/* ChatGPT Plus / Pro Codex 订阅专区 */}
      <div className="codex-subscription-card">
        <div className="codex-card-content">
          <div className="codex-badge-row">
            <span className="codex-pill-badge">OpenAI Codex 官方订阅</span>
            {isCodexConfigured && (
              <span className="codex-status-tag connected">
                <ShieldCheck size={14} /> 已连接 ChatGPT 订阅
              </span>
            )}
          </div>
          <h2 className="codex-card-title">ChatGPT Plus / Pro / Team 直连</h2>
          <p className="codex-card-desc">
            直接接入你的 ChatGPT Plus / Pro 订阅授权，无需 API Key 充值，即可解锁 GPT-5.5、GPT-5.4、GPT-5.3 等 Codex 系列顶尖编程模型。
          </p>
        </div>
        <div className="codex-card-actions">
          {isCodexConfigured ? (
            <button
              type="button"
              className="settings-secondary-button btn-logout-codex"
              onClick={async () => {
                if (window.confirm('确定要解除当前的 ChatGPT 订阅授权吗？')) {
                  if (onLogoutOAuth) await onLogoutOAuth('openai-codex')
                  else await onRemoveProviderCredentials('openai-codex')
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
              onClick={handleStartOAuth}
              disabled={loading}
            >
              <Sparkles size={16} />
              使用 ChatGPT 登录 (OAuth)
            </button>
          )}
        </div>
      </div>

      <h2 className="model-settings-subtitle">API 密钥凭据</h2>
      <div className="provider-list provider-auth-list">
        {visibleAuth.length === 0 && !loading ? (
          <p className="settings-list-empty">还没有配置其他 API 密钥。点击“添加模型”配置 DeepSeek、Anthropic 等提供方。</p>
        ) : visibleAuth.map((provider) => (
          <article className="provider-row" key={provider.id}>
            <div className="provider-identity">
              <span className="provider-logo"><Database size={18} /></span>
              <div>
                <strong>{provider.name}</strong>
                <span>{provider.id}</span>
              </div>
              <span className={`provider-status-label ${provider.configured ? 'ok' : ''}`}>
                {provider.writable ? '本机已保存' : provider.configured ? '外部凭据' : '未配置'}
              </span>
            </div>
            <div className="provider-actions">
              <button
                type="button"
                className="settings-secondary-button"
                onClick={() => setKeyProvider(provider)}
              >
                <Plus size={14} />
                {provider.writable ? '更新密钥' : '添加密钥'}
              </button>
              {provider.writable && <button
                type="button"
                className="settings-danger-button"
                onClick={() => {
                  if (window.confirm(`删除 ${provider.name} 保存在 TaskWeaver 中的凭据？已添加模型会保留，但需要重新配置后才能使用。`)) {
                    void onRemoveProviderCredentials(provider.id)
                  }
                }}
                aria-label={`删除 ${provider.name} 凭据`}
                title="删除已保存凭据"
              >
                <Trash2 size={14} />
                删除
              </button>}
            </div>
          </article>
        ))}
      </div>

      <div className="model-settings-toolbar">
        <input
          type="search"
          placeholder="搜索已添加模型…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="搜索模型"
        />
        <label className="model-filter-available">
          已添加模型
        </label>
        <span className="model-list-count">{filtered.length} 项</span>
      </div>

      <div className="provider-list model-catalog-list">
        {filtered.length === 0 && !loading ? (
          <p className="settings-list-empty">{models.length === 0 ? '还没有添加模型。点击右上角“添加模型”开始。' : '没有符合当前筛选条件的模型。'}</p>
        ) : filtered.map((model) => (
          <article className="provider-row" key={model.key}>
            <div className="provider-identity">
              <span className="provider-logo"><Database size={18} /></span>
              <div>
                <strong>{model.name}</strong>
                <span>
                  {model.key} · 输出 {formatCostPerMillion(model.costPerMillion.output)}
                  {model.profile?.tier ? ` · ${model.profile.tier}` : ''}
                </span>
              </div>
              {!model.available && <span className="provider-tag">连接不可用</span>}
            </div>
            <div className="provider-actions">
              <button
                type="button"
                className="settings-secondary-button"
                onClick={() => setProfileModel(model)}
                disabled={!model.available}
              >
                <Pencil size={14} />
                分配元数据
              </button>
              <button type="button" className="settings-danger-button" onClick={() => void onRemoveModel(model.key)} aria-label={`移除 ${model.name}`} title="从 TaskWeaver 移除">
                <Trash2 size={14} />
                移除
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="settings-footnote">
        <ShieldAlert size={15} />
        <span>
          {bridgeReady
          ? 'API 凭据由 TaskWeaver 加密保存在本机；保存凭据不等于已验证服务连通。'
            : '当前为纯 Web 预览，模型 API 仅在 Electron 主进程可用。'}
        </span>
      </div>

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
          onClose={() => setAddingModel(false)}
          onRefresh={onRefresh}
          onSetProviderApiKey={onSetProviderApiKey}
          onAddModel={onAddModel}
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
