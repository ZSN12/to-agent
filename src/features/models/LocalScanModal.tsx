import { FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ScanSearch, X } from 'lucide-react'
import type { ScanLocalModelsResult, ScannedLocalModel } from '../../shared/model-api'
import { useModalFocusTrap } from '../../shared/useModalFocusTrap'
import { getCleanModelId } from './format'

const SOURCE_LABELS: Record<string, string> = {
  cursor: 'Cursor',
  'google-antigravity': 'Antigravity',
  workbuddy: 'WorkBuddy',
  bai: '百炼 / 其他',
  other: '其他',
}

function sourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source
}

export function LocalScanModal({
  open,
  loading,
  error,
  result,
  onClose,
  onConfirm,
}: {
  open: boolean
  loading: boolean
  error: string | null
  result: ScanLocalModelsResult | null
  onClose: () => void
  onConfirm: (keys: string[]) => Promise<boolean>
}) {
  const titleId = useId()
  const descriptionId = useId()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')
  const dialogRef = useModalFocusTrap<HTMLFormElement>({
    open,
    onEscape: !saving ? onClose : undefined,
    getInitialFocus: () => searchInputRef.current ?? cancelButtonRef.current,
  })

  useEffect(() => {
    if (!result) {
      setSelected(new Set())
      return
    }
    // 默认不勾选，避免每次扫描误点「添加」把几十个模型全加进列表
    setSelected(new Set())
    setFilter('')
  }, [result])

  const groups = useMemo(() => {
    if (!result) return []
    const q = filter.trim().toLowerCase()
    const filtered = result.models.filter((m) => {
      if (!q) return true
      return (
        m.key.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
      )
    })
    const map = new Map<string, ScannedLocalModel[]>()
    for (const model of filtered) {
      const list = map.get(model.source) ?? []
      list.push(model)
      map.set(model.source, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [result, filter])

  const selectableKeys = useMemo(() => {
    if (!result) return []
    return result.models.filter((m) => m.available && !m.alreadyAdded).map((m) => m.key)
  }, [result])

  const toggle = (key: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const selectAllSelectable = () => setSelected(new Set(selectableKeys))
  const clearSelection = () => setSelected(new Set())
  const selectCursorOnly = () => {
    if (!result) return
    setSelected(
      new Set(
        result.models
          .filter((m) => m.source === 'cursor' && m.available && !m.alreadyAdded)
          .map((m) => m.key),
      ),
    )
  }

  const selectWorkBuddyOnly = () => {
    if (!result) return
    setSelected(
      new Set(
        result.models
          .filter((m) => m.source === 'workbuddy' && m.available && !m.alreadyAdded)
          .map((m) => m.key),
      ),
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const keys = [...selected]
    if (!keys.length) return
    setSaving(true)
    const ok = await onConfirm(keys)
    setSaving(false)
    if (ok) onClose()
  }

  if (!open) return null

  return (
    <div
      className="settings-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <form
        ref={dialogRef}
        className="model-editor local-scan-modal"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <span className="sr-only" id={descriptionId}>选择可用模型后，使用添加所选按钮保存。</span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 id={titleId} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ScanSearch size={18} aria-hidden="true" />
            扫描本地官方 Agent
          </h2>
          <button
            type="button"
            className="settings-icon-button"
            onClick={onClose}
            disabled={saving}
            aria-label="关闭"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, rgba(255,255,255,0.6))',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>
        {loading && (
          <p className="local-scan-status">正在发现本机 Cursor / Antigravity / WorkBuddy 等订阅模型并写入内置反代…</p>
        )}
        {error && !loading && (
          <div className="settings-inline-error" role="alert">{error}</div>
        )}
        {result && !loading && (
          <>
            <p className="local-scan-hint">
              已发现 {result.models.length} 个可集成模型
              {result.proxyUrl ? `（遗留代理 ${result.proxyUrl}）` : ''}。默认不勾选，请按需选择后加入「已添加模型」。
            </p>
            {result.discoveryWarnings?.map((warning) => (
              <div key={warning} className="local-scan-warning" role="status">
                {warning}
              </div>
            ))}
            <div className="local-scan-toolbar">
              <input
                ref={searchInputRef}
                type="search"
                placeholder="筛选模型…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="筛选扫描结果"
              />
              <button type="button" className="settings-secondary-button" onClick={selectCursorOnly}>
                仅选 Cursor
              </button>
              <button type="button" className="settings-secondary-button" onClick={selectWorkBuddyOnly}>
                仅选 WorkBuddy
              </button>
              <button type="button" className="settings-secondary-button" onClick={selectAllSelectable}>
                全选可添加
              </button>
              <button
                type="button"
                className="settings-secondary-button"
                onClick={clearSelection}
                disabled={selected.size === 0}
              >
                清空选择
              </button>
            </div>
            <div className="local-scan-list" role="group" aria-label="可扫描的本地模型">
              {groups.map(([source, items]) => (
                <div key={source} className="local-scan-group" role="group" aria-label={sourceLabel(source)}>
                  <div className="local-scan-group-title">{sourceLabel(source)}</div>
                  {items.map((model) => {
                    const disabled = !model.available || model.alreadyAdded
                    const checked = model.alreadyAdded || selected.has(model.key)
                    return (
                      <button
                        type="button"
                        key={model.key}
                        className={`local-scan-row ${disabled ? 'disabled' : ''} ${checked && !disabled ? 'selected' : ''}`}
                        role="checkbox"
                        aria-checked={checked}
                        aria-label={`${model.name}（${model.id}）`}
                        disabled={disabled}
                        onClick={() => {
                          toggle(model.key, !selected.has(model.key))
                        }}
                      >
                        <div className="local-scan-row-main">
                          <span className="local-scan-name">{model.name}</span>
                          <span className="local-scan-id">{getCleanModelId(model.id, model.provider)}</span>
                        </div>
                        {model.alreadyAdded && <span className="local-scan-tag">已添加</span>}
                        {!model.available && !model.alreadyAdded && (
                          <span
                            className="local-scan-tag warn"
                            title="扫描时没有连通此模型对应的本机 API。确认对应应用或服务已运行后重新扫描。"
                          >
                            本地接口未就绪
                          </span>
                        )}
                        <span className="local-scan-check" aria-hidden="true">
                          {checked ? <Check size={16} strokeWidth={2.5} /> : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
              {groups.length === 0 && (
                <p className="settings-list-empty">没有匹配的模型。</p>
              )}
            </div>
          </>
        )}
        <div className="model-editor-actions">
          <button ref={cancelButtonRef} type="button" className="settings-secondary-button" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button
            className="settings-primary-button"
            disabled={loading || saving || selected.size === 0 || !result}
          >
            {saving ? '正在添加…' : `添加所选（${selected.size}）`}
          </button>
        </div>
      </form>
    </div>
  )
}
