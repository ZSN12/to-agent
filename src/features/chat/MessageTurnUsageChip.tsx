import { useEffect, useId, useRef, useState } from 'react'
import { Database } from 'lucide-react'
import type { ChatUsage } from '../../types'
import {
  billedInputTokens,
  formatDshCatalogTokens,
  formatTokensFull,
} from './session-usage'

function cacheHitLabel(cacheRead: number, billed: number): string | null {
  if (billed <= 0) return null
  const pct = (cacheRead / billed) * 100
  if (pct >= 99.95) return '100%'
  const one = Math.round(pct * 10) / 10
  if (Math.abs(one - Math.round(one)) < 0.05) return `${Math.round(one)}%`
  return `${one.toFixed(1)}%`
}

export function MessageTurnUsageChip({
  usage,
  modelKey,
}: {
  usage?: ChatUsage
  modelKey?: string | null
}) {
  const [open, setOpen] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelId = useId()

  const input = usage?.inputTokens ?? 0
  const output = usage?.outputTokens ?? 0
  const cacheRead = usage?.cacheReadTokens ?? 0
  const cacheWrite = usage?.cacheWriteTokens ?? 0
  const billed = billedInputTokens(input, cacheRead, cacheWrite)
  const total = billed + output
  const hit = cacheHitLabel(cacheRead, billed)

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])

  if (!usage || total <= 0) return null

  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setOpen(true)
  }
  const hide = () => {
    hideTimer.current = setTimeout(() => setOpen(false), 120)
  }

  return (
    <span
      className="message-turn-usage"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <button
        type="button"
        className="message-turn-usage-chip"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`本轮用量 ${formatDshCatalogTokens(total)} tok`}
      >
        <Database size={12} strokeWidth={1.75} aria-hidden />
        <span>用量 {formatDshCatalogTokens(total)} tok</span>
      </button>
      {open && (
        <div
          id={panelId}
          className="message-turn-usage-panel"
          role="dialog"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <div className="message-turn-usage-head">
            <span className="message-turn-usage-title">
              <Database size={14} strokeWidth={1.75} aria-hidden />
              本轮用量
            </span>
            <span className="message-turn-usage-total">{formatTokensFull(total)} tok</span>
          </div>
          <div className="message-turn-usage-rows">
            {modelKey ? (
              <div className="message-turn-usage-row">
                <span>提供方 / 模型</span>
                <span>{modelKey}</span>
              </div>
            ) : null}
            {hit !== null && (
              <div className="message-turn-usage-row">
                <span>缓存命中</span>
                <span>{hit}</span>
              </div>
            )}
            <div className="message-turn-usage-row">
              <span>未缓存输入</span>
              <span>{formatTokensFull(input)} tok</span>
            </div>
            <div className="message-turn-usage-row">
              <span>缓存读取</span>
              <span>{formatTokensFull(cacheRead)} tok</span>
            </div>
            {cacheWrite > 0 && (
              <div className="message-turn-usage-row">
                <span>缓存写入</span>
                <span>{formatTokensFull(cacheWrite)} tok</span>
              </div>
            )}
            <div className="message-turn-usage-row">
              <span>输出</span>
              <span>{formatTokensFull(output)} tok</span>
            </div>
          </div>
        </div>
      )}
    </span>
  )
}
