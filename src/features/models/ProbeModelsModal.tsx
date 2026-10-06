import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Check, Radio, Search, Sparkles, X } from 'lucide-react'
import type { ProbedModelItem, ProbeModelsResult } from '../../shared/model-api'

export function ProbeModelsModal({
  open,
  loading,
  error,
  result,
  providerName,
  onClose,
  onConfirm,
}: {
  open: boolean
  loading: boolean
  error: string | null
  result: ProbeModelsResult | null
  providerName: string
  onClose: () => void
  onConfirm: (models: ProbedModelItem[]) => Promise<boolean>
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!result) {
      setSelectedIds(new Set())
      return
    }
    // 默认勾选所有未添加的模型，方便一键导入最新模型
    const newModelIds = result.models.filter((m) => !m.installed).map((m) => m.id)
    setSelectedIds(new Set(newModelIds))
    setFilter('')
  }, [result])

  const filteredModels = useMemo(() => {
    if (!result) return []
    const q = filter.trim().toLowerCase()
    if (!q) return result.models
    return result.models.filter(
      (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
    )
  }, [result, filter])

  const uninstalledFilteredIds = useMemo(() => {
    return filteredModels.filter((m) => !m.installed).map((m) => m.id)
  }, [filteredModels])

  const toggle = (id: string, on: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of uninstalledFilteredIds) next.add(id)
      return next
    })
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!result || selectedIds.size === 0) return
    const modelsToImport = result.models.filter((m) => selectedIds.has(m.id))
    setSubmitting(true)
    const ok = await onConfirm(modelsToImport)
    setSubmitting(false)
    if (ok) onClose()
  }

  if (!open) return null

  return (
    <div
      className="settings-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className="model-editor model-editor-wide" role="dialog" aria-modal="true">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Radio size={20} style={{ color: 'var(--accent-green, #10b981)' }} />
              <h2 style={{ margin: 0 }}>探测最新模型 · {providerName}</h2>
            </div>
            <p style={{ marginTop: 4, color: 'var(--text-secondary, rgba(255,255,255,0.6))', fontSize: 13 }}>
              已连通提供商 API，检测最新开放支持的模型列表并对比本地目录。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="关闭"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, rgba(255,255,255,0.4))',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div className="oauth-status-spinner" style={{ margin: '0 auto 16px' }} />
            <strong style={{ display: 'block', fontSize: 15, marginBottom: 6 }}>正在向提供方嗅探最新模型列表…</strong>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
              请求端点 <code>/v1/models</code>，正在自动提取模型能力与上下文信息
            </span>
          </div>
        ) : error ? (
          <div style={{ padding: '30px 20px', textAlign: 'center' }}>
            <p className="settings-inline-error" style={{ marginBottom: 16 }}>{error}</p>
            <button type="button" className="settings-secondary-button" onClick={onClose}>
              关闭
            </button>
          </div>
        ) : result ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'rgba(255,255,255,0.4)' }} />
                <input
                  type="search"
                  placeholder="搜索探测到的模型（ID 或名称）…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  style={{ width: '100%', paddingLeft: 30 }}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="settings-secondary-button btn-xs" onClick={selectAll}>
                  全选未添加
                </button>
                <button type="button" className="settings-secondary-button btn-xs" onClick={clearSelection}>
                  清空选择
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 12,
                color: 'rgba(255,255,255,0.6)',
                padding: '2px 4px',
              }}
            >
              <span>
                共探测到 <strong>{result.total}</strong> 个可用模型 · 发现 <strong>{result.newCount}</strong> 个未收录新模型
              </span>
              <span>已勾选 {selectedIds.size} 个</span>
            </div>

            <div
              style={{
                maxHeight: 340,
                minHeight: 200,
                overflowY: 'auto',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 8,
                background: 'rgba(0, 0, 0, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: 6,
              }}
            >
              {filteredModels.length > 0 ? (
                filteredModels.map((m) => {
                  const isChecked = selectedIds.has(m.id)
                  return (
                    <label
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: 6,
                        cursor: m.installed ? 'default' : 'pointer',
                        background: isChecked
                          ? 'rgba(16, 185, 129, 0.12)'
                          : m.installed
                          ? 'rgba(255, 255, 255, 0.02)'
                          : 'transparent',
                        border: isChecked ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid transparent',
                        opacity: m.installed ? 0.6 : 1,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={isChecked || m.installed}
                          disabled={m.installed || submitting}
                          onChange={(e) => toggle(m.id, e.target.checked)}
                          style={{ cursor: m.installed ? 'not-allowed' : 'pointer' }}
                        />
                        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 600, color: isChecked ? '#10b981' : '#fff', fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {m.name || m.id}
                          </span>
                          <code style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)' }}>{m.id}</code>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {m.reasoning && (
                          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                            <Sparkles size={10} style={{ verticalAlign: -1, marginRight: 2 }} />
                            推理模型
                          </span>
                        )}
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255, 255, 255, 0.06)', color: 'rgba(255, 255, 255, 0.7)' }}>
                          {Math.round(m.contextWindow / 1000)}k 上下文
                        </span>
                        {m.installed ? (
                          <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)', padding: '2px 6px' }}>已在库中</span>
                        ) : isChecked ? (
                          <span style={{ color: '#10b981', fontSize: 12, fontWeight: 600 }}>
                            <Check size={12} style={{ verticalAlign: -1, marginRight: 2 }} />
                            待添加
                          </span>
                        ) : null}
                      </div>
                    </label>
                  )
                })
              ) : (
                <div style={{ padding: '30px 0', textAlign: 'center', color: 'rgba(255, 255, 255, 0.4)', fontSize: 13 }}>
                  没有匹配的模型
                </div>
              )}
            </div>

            <div className="model-editor-actions" style={{ marginTop: 'auto', paddingTop: 8 }}>
              <button type="button" className="settings-secondary-button" onClick={onClose} disabled={submitting}>
                取消
              </button>
              <button
                type="submit"
                className="settings-primary-button"
                disabled={selectedIds.size === 0 || submitting}
              >
                {submitting ? '正在收录…' : `收录到模型库 (${selectedIds.size} 个)`}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  )
}
