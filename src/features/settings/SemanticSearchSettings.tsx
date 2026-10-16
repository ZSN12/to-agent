import { useCallback, useEffect, useState } from 'react'
import { KeyRound, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { SemanticSearchSettings as SemanticSearchSettingsState } from '../../shared/model-api'
import { SettingsGroup, SettingsLayout, SettingsPanel, SettingsRow } from './SettingsLayout'

type Provider = SemanticSearchSettingsState['embeddingProvider']

const PROVIDERS: Array<{ id: Provider; name: string; description: string }> = [
  { id: 'jina', name: 'Jina', description: '面向代码的向量模型' },
  { id: 'openai', name: 'OpenAI', description: '使用 OpenAI Embeddings' },
]

export function SemanticSearchSettings() {
  const [settings, setSettings] = useState<SemanticSearchSettingsState | null>(null)
  const [provider, setProvider] = useState<Provider>('jina')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError('')
    const models = window.taskweaver?.models
    if (!models?.getSemanticSearchSettings) {
      setLoading(false)
      setError('设置接口尚未就绪，请重试。')
      return
    }
    try {
      const result = await models.getSemanticSearchSettings()
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSettings(result.data)
      setProvider(result.data.embeddingProvider)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadSettings() }, [loadSettings])

  const save = async (clearApiKey = false) => {
    if (saving) return
    setSaving(true)
    setError('')
    setNotice('')
    const models = window.taskweaver?.models
    if (!models?.saveSemanticSearchSettings) {
      setSaving(false)
      setError('设置接口尚未就绪，请重试。')
      return
    }
    try {
      const result = await models.saveSemanticSearchSettings({
        embeddingProvider: provider,
        ...(clearApiKey ? { clearApiKey: true } : apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSettings(result.data)
      setProvider(result.data.embeddingProvider)
      setApiKey('')
      setNotice(clearApiKey ? '密钥已移除，语义搜索已关闭。' : result.data.enabled ? '设置已保存，语义搜索已启用。' : '服务选择已保存，请填写对应密钥以启用搜索。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  const credential = settings?.credentials[provider]
  const providerName = PROVIDERS.find((item) => item.id === provider)?.name ?? provider

  return <SettingsLayout
    title="语义代码搜索"
    description="按代码的含义查找实现。配置密钥后，搜索工具会自动加入对话。"
    className="semantic-search-settings"
    actions={<button type="button" className="settings-secondary-button semantic-search-refresh" onClick={() => void loadSettings()} disabled={loading || saving}>
      <RefreshCw size={14} className={loading ? 'semantic-search-spin' : undefined} />
      <span>刷新</span>
    </button>}
  >
    <SettingsPanel
      title="Embedding 服务"
      description="选择用于生成代码向量的服务。"
      icon={<span className="semantic-search-icon"><Search size={17} /></span>}
      className="semantic-search-card"
    >
      <SettingsGroup title="选择服务" className="semantic-search-provider-group">
        <div className="semantic-search-provider-list" role="radiogroup" aria-label="Embedding 服务">
          {PROVIDERS.map((item) => {
            const selected = provider === item.id
            return <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`semantic-search-provider${selected ? ' selected' : ''}`}
              disabled={loading || saving || settings?.settingsWritable === false}
              onClick={() => { setProvider(item.id); setApiKey(''); setNotice('') }}
            >
              <span className="semantic-search-radio" aria-hidden="true" />
              <span className="semantic-search-provider-copy">
                <strong>{item.name}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          })}
        </div>
      </SettingsGroup>

      <SettingsRow
        label={<label htmlFor="semantic-search-api-key">{providerName} API 密钥</label>}
        description={<span className="semantic-search-disclosure">建立索引时，代码片段会发送到所选服务以生成向量。密钥保存在安全凭据存储中，不会显示在此页面。</span>}
        className="semantic-search-key-settings-row"
      >
        <div className="semantic-search-key-row">
          <span className="semantic-search-key-icon"><KeyRound size={16} /></span>
          <input
            id="semantic-search-api-key"
            type="password"
            autoComplete="new-password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={credential?.configured ? '密钥已保存；输入新值可替换' : `输入 ${providerName} API 密钥`}
            aria-describedby="semantic-search-key-status"
          />
          <span className={`semantic-search-key-status${credential?.configured ? ' configured' : ''}`} id="semantic-search-key-status">
            {loading ? '读取中' : credential?.configured ? '已配置' : '未配置'}
          </span>
        </div>
      </SettingsRow>

      {(error || (settings && (!settings.settingsAvailable || !settings.settingsWritable))) && <p className="semantic-search-message error" role="alert">
        {error || (settings?.settingsAvailable ? '当前设置来源为只读，无法从此处修改。' : '语义搜索设置尚未加载，请稍后刷新。')}
      </p>}
      {notice && <p className="semantic-search-message success" role="status">{notice}</p>}

      <div className="semantic-search-actions">
        {credential?.configured && credential.writable && <button type="button" className="settings-danger-button semantic-search-remove" onClick={() => void save(true)} disabled={loading || saving || settings?.settingsWritable === false}>
          <Trash2 size={14} />
          <span>移除密钥</span>
        </button>}
        <button type="button" className="settings-primary-button semantic-search-save" onClick={() => void save()} disabled={loading || saving || settings?.settingsWritable === false || (!apiKey.trim() && settings?.embeddingProvider === provider)}>
          {saving ? '保存中…' : apiKey.trim() ? '保存并启用' : '保存服务选择'}
        </button>
      </div>
    </SettingsPanel>

    <div className={`semantic-search-state${settings?.enabled ? ' enabled' : ''}`} role="status">
      <span className="semantic-search-state-dot" />
      <span>{loading ? '正在检查配置…' : settings?.enabled ? `${providerName} 语义搜索已启用` : '配置当前服务的 API 密钥后即可启用搜索'}</span>
    </div>
  </SettingsLayout>
}
