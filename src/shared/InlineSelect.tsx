import { Check, ChevronDown, Search } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'

export type InlineSelectOption = {
  value: string
  label: string
  description?: string
}

export function InlineSelect({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = '请选择',
  triggerLabel,
  disabled = false,
  searchable = false,
  searchPlaceholder = '搜索选项…',
  emptyMessage = '没有匹配的选项',
  className = '',
  menuClassName = '',
  portalMenu = false,
}: {
  value: string
  options: readonly InlineSelectOption[]
  onChange: (value: string) => void
  ariaLabel: string
  placeholder?: string
  triggerLabel?: string
  disabled?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
  menuClassName?: string
  portalMenu?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()
  const [portalPosition, setPortalPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const selectedOption = options.find((option) => option.value === value)
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return options
    return options.filter((option) => `${option.label} ${option.description ?? ''}`.toLocaleLowerCase().includes(normalizedQuery))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const handleOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutsidePointer)
    return () => document.removeEventListener('mousedown', handleOutsidePointer)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !portalMenu) return
    const updatePosition = () => {
      const bounds = triggerRef.current?.getBoundingClientRect()
      if (!bounds) return
      const gutter = 12
      const width = Math.min(Math.max(bounds.width, 320), window.innerWidth - gutter * 2)
      const left = Math.max(gutter, Math.min(bounds.right - width, window.innerWidth - width - gutter))
      const availableBelow = Math.max(0, window.innerHeight - bounds.bottom - gutter)
      const availableAbove = Math.max(0, bounds.top - gutter)
      const estimatedHeight = Math.min(350, 60 + Math.min(filteredOptions.length, 7) * 40)
      const opensAbove = availableBelow < Math.min(estimatedHeight, 180) && availableAbove > availableBelow
      const maxHeight = Math.max(120, Math.min(350, opensAbove ? availableAbove : availableBelow))
      const height = Math.min(estimatedHeight, maxHeight)
      const top = opensAbove ? Math.max(gutter, bounds.top - 6 - height) : bounds.bottom + 6
      setPortalPosition({ top, left, width, maxHeight })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [filteredOptions.length, open, portalMenu])

  useEffect(() => {
    if (!open) return
    if (searchable) searchRef.current?.focus()
    else triggerRef.current?.focus()
  }, [open, searchable])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    document.getElementById(`${listboxId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, listboxId, open])

  useEffect(() => {
    if (activeIndex >= filteredOptions.length) setActiveIndex(Math.max(0, filteredOptions.length - 1))
  }, [activeIndex, filteredOptions.length])

  const close = (restoreFocus = false) => {
    setOpen(false)
    setQuery('')
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const show = () => {
    if (disabled || options.length === 0) return
    setQuery('')
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)))
    setOpen(true)
  }

  const choose = (option: InlineSelectOption | undefined) => {
    if (!option) return
    onChange(option.value)
    close(true)
  }

  const moveActive = (direction: -1 | 1) => {
    setActiveIndex((index) => filteredOptions.length
      ? (index + direction + filteredOptions.length) % filteredOptions.length
      : 0)
  }

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) show()
      else moveActive(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault()
      choose(filteredOptions[activeIndex])
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && !open) {
      event.preventDefault()
      show()
      return
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      close(true)
    }
  }

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(filteredOptions[activeIndex])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key === 'Tab') {
      close()
    }
  }

  const menu = open ? (
    <div
      ref={menuRef}
      className={`inline-select-menu-wrap ${menuClassName}`.trim()}
      style={portalMenu ? {
        position: 'fixed',
        top: portalPosition?.top ?? 0,
        left: portalPosition?.left ?? 0,
        width: portalPosition?.width ?? 320,
        maxHeight: portalPosition?.maxHeight ?? 350,
        visibility: !portalPosition ? 'hidden' : undefined,
      } : undefined}
    >
      {searchable && (
        <div className="inline-select-search">
          <Search size={14} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            role="combobox"
            aria-label={`搜索${ariaLabel}`}
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={filteredOptions.length ? `${listboxId}-option-${activeIndex}` : undefined}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
      )}
      <div className="inline-select-menu" id={listboxId} role="listbox" aria-label={ariaLabel}>
        {filteredOptions.map((option, index) => {
          const selected = option.value === value
          return (
            <div
              key={option.value}
              id={`${listboxId}-option-${index}`}
              className={`inline-select-option${selected ? ' is-selected' : ''}${activeIndex === index ? ' is-active' : ''}`}
              role="option"
              aria-selected={selected}
              onMouseMove={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <span className="inline-select-option-copy">
                <strong>{option.label}</strong>
                {option.description && <small>{option.description}</small>}
              </span>
              {selected && <Check size={15} aria-hidden="true" />}
            </div>
          )
        })}
        {filteredOptions.length === 0 && <div className="inline-select-empty">{emptyMessage}</div>}
      </div>
    </div>
  ) : null

  return (
    <div className={`inline-select ${className}${open ? ' is-open' : ''}`.trim()} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="inline-select-trigger"
        role={searchable ? undefined : 'combobox'}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && !searchable && filteredOptions.length ? `${listboxId}-option-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => open ? close() : show()}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="inline-select-current">
          <strong>{triggerLabel ?? selectedOption?.label ?? placeholder}</strong>
          {!triggerLabel && selectedOption?.description && <small>{selectedOption.description}</small>}
        </span>
        <ChevronDown size={15} className={open ? 'is-open' : undefined} aria-hidden="true" />
      </button>
      {menu && !portalMenu && menu}
      {menu && portalMenu && createPortal(menu, document.body)}
    </div>
  )
}
