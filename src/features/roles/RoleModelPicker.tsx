import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import type { ModelOption } from '../../types'
import { displayModelRoute } from './model-route-label'

type MenuPosition = { left: number; top: number; width: number; maxHeight: number }

export function RoleModelPicker({
  models,
  value,
  onChange,
}: {
  models: ModelOption[]
  value: string
  onChange: (modelKey: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()
  const currentModel = models.find((model) => model.id === value)

  const filteredModels = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return models
    return models.filter((model) => [model.displayName, model.name, model.id]
      .some((candidate) => candidate?.toLocaleLowerCase().includes(normalizedQuery)))
  }, [models, query])

  const updatePosition = useCallback(() => {
    const trigger = rootRef.current?.getBoundingClientRect()
    if (!trigger) return
    const margin = 12
    const gap = 6
    const availableBelow = Math.max(0, window.innerHeight - trigger.bottom - margin - gap)
    const availableAbove = Math.max(0, trigger.top - margin - gap)
    const shouldOpenAbove = availableBelow < 330 && availableAbove > availableBelow
    const availableOnChosenSide = shouldOpenAbove ? availableAbove : availableBelow
    const maxHeight = Math.max(120, Math.min(330, availableOnChosenSide))
    const requestedTop = shouldOpenAbove ? trigger.top - maxHeight - gap : trigger.bottom + gap
    const top = Math.max(margin, Math.min(requestedTop, window.innerHeight - margin - maxHeight))
    setPosition({
      left: Math.max(margin, Math.min(trigger.left, window.innerWidth - trigger.width - margin)),
      top,
      width: Math.min(trigger.width, window.innerWidth - margin * 2),
      maxHeight,
    })
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setPosition(null)
  }, [])

  const show = () => {
    if (models.length === 0) return
    setQuery('')
    setActiveIndex(Math.max(0, models.findIndex((model) => model.id === value)))
    updatePosition()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    updatePosition()
    searchRef.current?.focus()
    const handleOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) close()
    }
    const handleViewportChange = () => updatePosition()
    document.addEventListener('mousedown', handleOutsidePointer)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [close, open, updatePosition])

  useEffect(() => {
    if (activeIndex >= filteredModels.length) setActiveIndex(Math.max(0, filteredModels.length - 1))
  }, [activeIndex, filteredModels.length])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    document.getElementById(`${listboxId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, listboxId, open])

  const choose = (model: ModelOption) => {
    onChange(model.id)
    close()
  }

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => filteredModels.length ? (index + 1) % filteredModels.length : 0)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => filteredModels.length ? (index - 1 + filteredModels.length) % filteredModels.length : 0)
      return
    }
    if (event.key === 'Enter' && filteredModels[activeIndex]) {
      event.preventDefault()
      choose(filteredModels[activeIndex])
    }
    if (event.key === 'Tab') close()
  }

  return (
    <div className="role-model-picker" ref={rootRef}>
      <button
        type="button"
        className="role-model-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`绑定模型：${currentModel?.displayName ?? currentModel?.name ?? '选择模型'}`}
        disabled={models.length === 0}
        onClick={() => open ? close() : show()}
      >
        <span className="role-model-trigger-copy">
          <strong>{currentModel?.displayName ?? currentModel?.name ?? (models.length ? '选择模型' : '暂无已添加的模型')}</strong>
          {currentModel && currentModel.displayName && currentModel.displayName !== currentModel.name && (
            <small>{currentModel.name}</small>
          )}
        </span>
        <span className="role-model-trigger-meta">{models.length ? `${models.length} 个模型` : ''}</span>
        <ChevronDown size={15} className={open ? 'is-open' : undefined} aria-hidden="true" />
      </button>

      {open && position && createPortal(
        <div
          ref={popoverRef}
          className="role-model-popover"
          style={{
            '--role-model-popover-height': `${position.maxHeight}px`,
            left: `${position.left}px`,
            top: `${position.top}px`,
            width: `${position.width}px`,
          } as CSSProperties}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="role-model-search-wrap">
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              role="combobox"
              aria-label="搜索模型"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={filteredModels.length ? `${listboxId}-option-${activeIndex}` : undefined}
              placeholder="搜索名称或模型 ID…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={handleSearchKeyDown}
            />
            {query && <button type="button" aria-label="清除搜索" onClick={() => { setQuery(''); setActiveIndex(0); searchRef.current?.focus() }}><X size={14} /></button>}
          </div>
          <div className="role-model-results" id={listboxId} role="listbox" aria-label="可用模型">
            {filteredModels.map((model, index) => {
              const selected = model.id === value
              return (
                <div
                  key={model.id}
                  id={`${listboxId}-option-${index}`}
                  className={`role-model-option${selected ? ' is-selected' : ''}${activeIndex === index ? ' is-active' : ''}`}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => choose(model)}
                >
                  <span className="role-model-option-copy">
                    <strong>{model.displayName ?? model.name}</strong>
                    <small>{displayModelRoute(model.displayName && model.displayName !== model.name ? model.name : model.id)}</small>
                  </span>
                  {selected && <Check size={16} aria-hidden="true" />}
                </div>
              )
            })}
            {filteredModels.length === 0 && <div className="role-model-empty">没有匹配的模型</div>}
          </div>
          <div className="role-model-shortcuts"><span>↑ ↓ 选择</span><span>Enter 确认</span><span>Esc 关闭</span></div>
        </div>,
        document.body,
      )}
    </div>
  )
}
