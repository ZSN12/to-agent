import { ArrowLeft, Check, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ModelOption, ThinkingLevel } from '../../types'
import { effortDisplayMeta } from './modelSelectHelpers'

export function ModelSelect({
  value,
  options,
  onChange,
  thinkingLevel = 'medium',
  onThinkingLevelChange,
  loading,
}: {
  value: ModelOption | null
  options: ModelOption[]
  onChange: (model: ModelOption) => void
  thinkingLevel?: ThinkingLevel
  onThinkingLevelChange?: (level: ThinkingLevel) => void
  loading?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'main' | 'models' | 'thinking'>('main')
  const rootRef = useRef<HTMLDivElement>(null)

  const handleClose = () => {
    setOpen(false)
    setView('main')
  }

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) handleClose()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const supportedLevels = useMemo(() => {
    if (value?.reasoning === false) return []
    if (value?.reasoningEfforts?.length) return value.reasoningEfforts.map((effort) => effort.id)
    if (value?.supportedThinkingLevels?.length) return value.supportedThinkingLevels
    return []
  }, [value?.reasoning, value?.reasoningEfforts, value?.supportedThinkingLevels])

  const thinkingConfigurable = supportedLevels.length > 0

  useEffect(() => {
    if (!value || !thinkingConfigurable) return
    if (!supportedLevels.includes(thinkingLevel)) {
      const fallback = value.defaultThinkingLevel && supportedLevels.includes(value.defaultThinkingLevel)
        ? value.defaultThinkingLevel
        : supportedLevels[0]
      onThinkingLevelChange?.(fallback as ThinkingLevel)
    }
  }, [value, supportedLevels, thinkingLevel, thinkingConfigurable, onThinkingLevelChange])

  return (
    <div className="model-select" ref={rootRef}>
      <button
        className="model-trigger"
        type="button"
        onClick={() => {
          if (open) {
            handleClose()
          } else {
            setView('main')
            setOpen(true)
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={loading || options.length === 0}
      >
        <span className="model-trigger-name">{value?.name ?? (loading ? '加载模型…' : '无可用模型')}</span>
        {value && thinkingConfigurable && (
          <span className="model-trigger-level">{effortDisplayMeta(thinkingLevel, value.reasoningEfforts).en}</span>
        )}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && options.length > 0 && (
        <div className="model-menu model-cascading-menu" role="menu" aria-label="模型与推理等级配置">
          {view === 'main' && (
            <div className="model-menu-main">
              <button
                type="button"
                className="model-menu-entry"
                onClick={() => setView('models')}
              >
                <span className="model-menu-entry-label">模型</span>
                <span className="model-menu-entry-value">
                  <span className="truncate">{value?.name ?? '选择模型'}</span>
                  <ChevronRight size={14} />
                </span>
              </button>

              {thinkingConfigurable ? (
                <button
                  type="button"
                  className="model-menu-entry"
                  onClick={() => setView('thinking')}
                >
                  <span className="model-menu-entry-label">推理等级</span>
                  <span className="model-menu-entry-value">
                    <span>{effortDisplayMeta(thinkingLevel, value?.reasoningEfforts).en}</span>
                    <ChevronRight size={14} />
                  </span>
                </button>
              ) : (
                <div className="model-menu-entry model-menu-entry-static" aria-disabled="true">
                  <span className="model-menu-entry-label">推理等级</span>
                  <span className="model-menu-entry-value">
                    <span className="model-item-desc">该模型未在目录中声明可调档位</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {view === 'models' && (
            <div className="model-menu-sub">
              <div className="model-sub-header">
                <button
                  type="button"
                  className="model-sub-back-btn"
                  onClick={() => setView('main')}
                  title="返回上一级"
                >
                  <ArrowLeft size={14} />
                  <span>返回</span>
                </button>
                <span className="model-sub-title">选择模型</span>
              </div>
              <div className="model-sub-list">
                {options.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    className={`model-sub-item ${m.id === value?.id ? 'active' : ''}`}
                    onClick={() => {
                      onChange(m)
                      handleClose()
                    }}
                  >
                    <span className="model-item-name">{m.name}</span>
                    {m.id === value?.id && <Check size={16} className="model-item-check" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === 'thinking' && (
            <div className="model-menu-sub">
              <div className="model-sub-header">
                <button
                  type="button"
                  className="model-sub-back-btn"
                  onClick={() => setView('main')}
                  title="返回上一级"
                >
                  <ArrowLeft size={14} />
                  <span>返回</span>
                </button>
                <span className="model-sub-title">推理等级</span>
              </div>
              {!thinkingConfigurable ? (
                <div className="model-sub-list">
                  <div className="model-sub-item" aria-disabled="true">
                    <div className="model-thinking-item-left">
                      <span className="model-item-name">无可选推理档位</span>
                      <span className="model-item-desc">仅展示 Host 模型目录声明的 efforts；未声明时不使用固定四档兜底</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="model-sub-list">
                  {supportedLevels.map((lvl) => {
                  const meta = effortDisplayMeta(lvl, value?.reasoningEfforts)
                  const isActive = lvl === thinkingLevel
                  return (
                    <button
                      type="button"
                      key={lvl}
                      className={`model-sub-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        onThinkingLevelChange?.(lvl)
                        handleClose()
                      }}
                    >
                      <div className="model-thinking-item-left">
                        <span className="model-item-name">{meta.en}</span>
                        <span className="model-item-desc">{meta.zh} · {meta.desc}</span>
                      </div>
                      {isActive && <Check size={16} className="model-item-check" />}
                    </button>
                  )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
