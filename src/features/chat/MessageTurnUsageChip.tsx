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
  usageKind,
  tokensShadowed,
}: {
  usage?: ChatUsage
  modelKey?: string | null
  usageKind?: 'compaction'
  tokensShadowed?: number | null
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
        aria-label={usageKind === 'compaction'
          ? `压缩操作计费 ${formatDshCatalogTokens(total)} tok`
          : `本轮用量 ${formatDshCatalogTokens(total)} tok`}
      >
        <Database size={12} strokeWidth={1.75} aria-hidden />
        <span>{usageKind === 'compaction' ? '压缩计费' : '用量'} {formatDshCatalogTokens(total)} tok</span>
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
              {usageKind === 'compaction' ? '压缩操作计费' : '本轮用量'}
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
            {usage.ttftMs != null && usage.ttftMs > 0 && (
              <div className="message-turn-usage-row">
                <span>首 token</span>
                <span>{usage.ttftMs} ms</span>
              </div>
            )}
            {usage.toolMs != null && usage.toolMs > 0 && (
              <div className="message-turn-usage-row">
                <span>工具耗时</span>
                <span>{usage.toolMs} ms</span>
              </div>
            )}
            {usage.llmMs != null && usage.llmMs > 0 && (
              <div className="message-turn-usage-row">
                <span>模型等待</span>
                <span>{usage.llmMs} ms</span>
              </div>
            )}
            {usage.elapsedMs > 0 && (
              <div className="message-turn-usage-row">
                <span>本轮总耗时</span>
                <span>{usage.elapsedMs} ms</span>
              </div>
            )}
            {usageKind === 'compaction' && (
              <p className="message-turn-usage-tip">
                {tokensShadowed && tokensShadowed > 0
                  ? `约 ${formatTokensFull(tokensShadowed)} tok 已从会话历史折叠。`
                  : '历史条目已折叠。'}
                下方「未缓存输入」是生成摘要时一次性读入旧历史的 API 计费，不是压缩后上下文仍这么大；下一条正常聊天应明显变小。可看输入框旁上下文环验证。
              </p>
            )}
            {usageKind !== 'compaction' && input >= 80_000 && cacheRead === 0 && (
              <p className="message-turn-usage-tip">
                未缓存输入偏高：多为整段会话历史重新计费，不是本条用户字数。可新开线程、发送 <code>/compact</code>，或避免在同一线程堆叠大量工具输出。
              </p>
            )}
          </div>
        </div>
      )}
    </span>
  )
}
