import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Check, Link2, Plus, Radio, Trash2, Zap } from 'lucide-react'
import type { CustomProviderEntry, ProbedModelItem } from '../../shared/model-api'

type ApiKind = 'openai-completions' | 'openai-responses'

const API_OPTIONS: { value: ApiKind; label: string }[] = [
  { value: 'openai-completions', label: 'OpenAI Chat Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
]

export function CustomProviderSection({
  bridgeReady,
  onCatalogRefresh,
  onAddModel,
  onToast,
  onClose,
  hideTabs = false,
  showSavedList = true,
  initialEntry,
  initialMode = 'edit',
}: {
  bridgeReady: boolean
  onCatalogRefresh: () => void
  onAddModel?: (modelKey: string) => Promise<boolean>
  onToast?: (msg: string) => void
  onClose?: () => void
  /** 在「接入与凭据」分组内使用时隐藏顶部 Tab */
  hideTabs?: boolean
  /** 是否在下方展示已保存的自定义网关列表 */
  showSavedList?: boolean
  initialEntry?: CustomProviderEntry | null
  initialMode?: 'edit' | 'add_model'
}) {
  const [tab, setTab] = useState<'builtin' | 'custom'>('custom')
  const [list, setList] = useState<CustomProviderEntry[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [providerId, setProviderId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [api, setApi] = useState<ApiKind>('openai-completions')
  const [apiKey, setApiKey] = useState('')
  const [modelId, setModelId] = useState('')
  const [modelName, setModelName] = useState('')
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testingTools, setTestingTools] = useState(false)
  const [probing, setProbing] = useState(false)
  const [probedModels, setProbedModels] = useState<ProbedModelItem[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    if (!showSavedList || !window.taskweaver?.models?.listCustomProviders) return
    setLoadingList(true)
    const res = await window.taskweaver.models.listCustomProviders()
    setLoadingList(false)
    if (res?.ok && res.data) setList(res.data)
  }, [showSavedList])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const fillFromEntry = useCallback((entry: CustomProviderEntry, mode: 'edit' | 'add_model' = 'edit') => {
    setEditingId(entry.id)
    setProviderId(entry.id.replace(/^custom-/, ''))
    setDisplayName(entry.name)
    setBaseUrl(entry.baseUrl)
    setApi(entry.api === 'openai-responses' ? 'openai-responses' : 'openai-completions')
    setApiKey('')
    if (mode === 'edit') {
      const first = entry.models[0]
      if (first) {
        setModelId(first.id)
        setModelName(first.name)
      }
    } else {
      setModelId('')
      setModelName('')
    }
    setTab('custom')
  }, [])

  useEffect(() => {
    if (initialEntry) fillFromEntry(initialEntry, initialMode)
  }, [initialEntry, initialMode, fillFromEntry])

  const resetForm = () => {
    setEditingId(null)
    setProviderId('')
    setDisplayName('')
    setBaseUrl('')
    setApi('openai-completions')
    setApiKey('')
    setModelId('')
    setModelName('')
  }

  const handleTest = async () => {
    if (!window.taskweaver?.models?.testCustomProvider) return
    if (!baseUrl.trim() || !apiKey.trim()) {
      onToast?.('请先填写 API 地址与 API Key 再测试')
      return
    }
    setTesting(true)
    try {
      const res = await window.taskweaver.models.testCustomProvider({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        modelId: modelId.trim() || 'default',
        api,
      })
      if (res?.ok && res.data?.ok) {
        onToast?.(`模型生成测试通过（${res.data.method ?? 'ok'}）`)
      } else {
        onToast?.(!res?.ok && 'error' in res ? res.error : '模型生成测试失败')
      }
    } catch (err: any) {
      onToast?.(err?.message ?? '模型生成测试失败')
    } finally {
      setTesting(false)
    }
  }

  const handleToolTest = async () => {
    if (!window.taskweaver?.models?.testCustomProviderToolCall) return
    if (!baseUrl.trim() || !apiKey.trim()) {
      onToast?.('请先填写 API 地址与 API Key 再测试工具调用')
      return
    }
    setTestingTools(true)
    try {
      const res = await window.taskweaver.models.testCustomProviderToolCall({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        modelId: modelId.trim() || 'default',
        api,
      })
      if (res?.ok && res.data?.supported) {
        onToast?.(`工具调用测试通过（${res.data.method ?? 'ok'}；测试函数未执行任何操作）`)
      } else if (res?.ok && res.data?.ok) {
        onToast?.('接口可生成内容，但模型没有发出测试工具调用；当前路由未通过 Agent 工具能力验证')
      } else {
        onToast?.(!res?.ok && 'error' in res ? res.error : '工具调用测试失败')
      }
    } catch (err: any) {
      onToast?.(err?.message ?? '工具调用测试失败')
    } finally {
      setTestingTools(false)
    }
  }

  const handleProbe = async () => {
    if (!baseUrl.trim()) {
      onToast?.('请先填写 API 地址再探测')
      return
    }
    if (!editingId && !apiKey.trim()) {
      onToast?.('新建提供方需要填写 API Key')
      return
    }
    setProbing(true)
    try {
      const res = await window.taskweaver?.models?.probeProviderModels({
        providerId: editingId ?? undefined,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
      })
      if (!res?.ok) {
        onToast?.(res?.error ?? '未探测到可用模型，请检查地址或 Key')
      } else if (res.data?.models?.length) {
        setProbedModels(res.data.models)
        onToast?.(`探测成功：发现 ${res.data.total} 个可用模型`)
        if (!modelId && res.data.models[0]) {
          setModelId(res.data.models[0].id)
          setModelName(res.data.models[0].name)
        }
      } else {
        onToast?.('未探测到可用模型，请检查地址或 Key')
      }
    } catch (err: any) {
      onToast?.(err?.message ?? '探测失败')
    } finally {
      setProbing(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!bridgeReady || !window.taskweaver?.models?.upsertCustomProvider) return
    if (!baseUrl.trim()) {
      onToast?.('请填写 API 地址')
      return
    }
    if (!editingId && !apiKey.trim()) {
      onToast?.('新建提供方需要填写 API Key')
      return
    }
    const mid = modelId.trim() || 'default'
    const mname = modelName.trim() || mid
    setBusy(true)
    const res = await window.taskweaver.models.upsertCustomProvider({
      providerId: providerId.trim() || displayName.trim() || 'gateway',
      name: displayName.trim() || undefined,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      modelId: mid,
      modelName: mname,
      api,
    })
    setBusy(false)
    if (!res?.ok) {
      onToast?.(res?.error ?? '保存失败')
      return
    }
    onToast?.(`已保存自定义提供方，模型 ${res.data.modelKey}`)
    onCatalogRefresh()
    void loadList()
    if (onAddModel && res.data.modelKey) {
      const added = await onAddModel(res.data.modelKey)
      if (added) onToast?.(`已加入模型列表：${res.data.modelKey}`)
    }
    resetForm()
  }

  const handleRemove = async (id: string) => {
    if (!window.confirm(`删除自定义提供方 ${id}？models.json 中的配置与加密凭据将被移除。`)) return
    const res = await window.taskweaver?.models?.removeCustomProvider(id)
    if (!res?.ok) {
      onToast?.(res?.error ?? '删除失败')
      return
    }
    onToast?.('已删除自定义提供方')
    onCatalogRefresh()
    void loadList()
    if (editingId === id) resetForm()
  }

  const showCustom = hideTabs || tab === 'custom'

  return (
    <div className={`custom-provider-section ${hideTabs ? 'custom-provider-section-embedded' : ''}`}>
      {!hideTabs && (
        <div className="custom-provider-tabs" role="tablist" aria-label="添加模型方式">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'builtin'}
            className={tab === 'builtin' ? 'active' : ''}
            onClick={() => setTab('builtin')}
          >
            第三方模型提供商
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'custom'}
            className={tab === 'custom' ? 'active' : ''}
            onClick={() => setTab('custom')}
          >
            自定义模型 API
          </button>
        </div>
      )}

      {!hideTabs && tab === 'builtin' ? (
        <p className="custom-provider-hint">
          使用页头「添加模型」选择 DeepSeek、Anthropic、OpenRouter 等内置提供方，或「扫描本地模型」接入 OpenCodex / Cursor / 反重力 通道。
        </p>
      ) : showCustom ? (
        <>
          {!bridgeReady && (
            <p className="settings-inline-error">当前为 Web 预览，自定义 API 仅在 Electron 桌面端可用。</p>
          )}

          <form className="custom-provider-form" onSubmit={(e) => { void handleSubmit(e) }}>
            <div className="custom-provider-form-grid">
              <label>
                提供方 ID
                <input
                  type="text"
                  placeholder="acme-gateway"
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                  disabled={!!editingId}
                />
                <span className="custom-provider-field-hint">以小写字母开头；保存时自动加 <code>custom-</code> 前缀</span>
              </label>
              <label>
                显示名称
                <input
                  type="text"
                  placeholder="我的中转"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </label>
              <label className="custom-provider-span-2">
                API 地址
                <input
                  type="url"
                  placeholder="https://gateway.example.com/v1"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  required
                />
              </label>
              <label>
                API 协议
                <select value={api} onChange={(e) => setApi(e.target.value as ApiKind)}>
                  {API_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label>
                API Key
                <input
                  type="password"
                  placeholder={editingId ? '留空则保留已保存的 Key' : 'sk-…'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <label>
                模型 ID
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="deepseek-chat"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  {probedModels.length > 0 && (
                    <select
                      style={{ maxWidth: 160, fontSize: 12 }}
                      onChange={(e) => {
                        const m = probedModels.find((item) => item.id === e.target.value)
                        if (m) {
                          setModelId(m.id)
                          setModelName(m.name)
                        }
                      }}
                      value={modelId}
                    >
                      <option value="" disabled>快速选择已探测模型 ({probedModels.length})</option>
                      {probedModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.id}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
              <label>
                模型显示名
                <input
                  type="text"
                  placeholder="DeepSeek Chat"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                />
              </label>
            </div>
            <div className="custom-provider-form-actions">
              <button
                type="button"
                className="settings-secondary-button"
                disabled={probing || !bridgeReady}
                onClick={() => { void handleProbe() }}
                title="向 API 地址探测所有可用模型并快速选取"
              >
                <Radio size={14} />
                {probing ? '探测中…' : '探测可用模型'}
              </button>
              <button type="button" className="settings-secondary-button" disabled={testing || !bridgeReady} onClick={() => { void handleTest() }}>
                <Zap size={14} />
                {testing ? '测试中…' : '测试连接'}
              </button>
              <button
                type="button"
                className="settings-secondary-button"
                disabled={testingTools || !bridgeReady}
                onClick={() => { void handleToolTest() }}
                title="发送一次短工具调用请求；测试函数不访问文件或执行外部操作"
              >
                <Zap size={14} />
                {testingTools ? '测试工具中…' : '测试工具调用'}
              </button>
              {editingId && (
                <button type="button" className="settings-secondary-button" onClick={resetForm}>
                  新建另一条
                </button>
              )}
              {onClose && (
                <button type="button" className="settings-secondary-button" onClick={onClose}>
                  取消
                </button>
              )}
              <button type="submit" className="settings-primary-button" disabled={busy || !bridgeReady}>
                <Check size={14} />
                {busy ? '保存中…' : editingId ? '更新提供方' : '保存并提供模型'}
              </button>
            </div>
          </form>

          {showSavedList && (
            <div className="custom-provider-list-wrap">
              <h4 className="model-settings-group-title">已保存的自定义网关</h4>
              {loadingList ? (
                <p className="settings-list-empty">加载中…</p>
              ) : list.length === 0 ? (
                <p className="settings-list-empty">暂无。填写上方表单添加中转站或自建 API。</p>
              ) : (
                <ul className="custom-provider-list">
                  {list.map((entry) => (
                    <li key={entry.id} className="provider-row" style={{ alignItems: 'flex-start' }}>
                      <div className="provider-identity" style={{ flex: 1 }}>
                        <span className="provider-logo"><Link2 size={16} /></span>
                        <div>
                          <strong>{entry.name}</strong>
                          <span>{entry.id} · {entry.api}</span>
                          <code style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--text-hint)', wordBreak: 'break-all' }}>
                            {entry.baseUrl}
                          </code>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {entry.models.map((m) => m.id).join('、')}
                          </span>
                        </div>
                      </div>
                      <div className="provider-actions">
                        <button type="button" className="settings-secondary-button" onClick={() => fillFromEntry(entry)}>
                          编辑
                        </button>
                        {entry.models.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className="settings-secondary-button"
                            title="加入已添加模型列表"
                            onClick={() => {
                              void onAddModel?.(`${entry.id}/${m.id}`).then((ok) => {
                                if (ok) onToast?.(`已添加 ${entry.id}/${m.id}`)
                              })
                            }}
                          >
                            <Plus size={13} />
                            {m.id}
                          </button>
                        ))}
                        <button type="button" className="settings-danger-button" onClick={() => { void handleRemove(entry.id) }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
