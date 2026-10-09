import { useState } from 'react'
import type { DshProjectedToolCall } from '../../shared/app-api'
import type { ToolTraceItem } from '../../shared/app-api'
import type { ChatMessage } from '../../types'
import { AssistantTurnBody } from './AssistantTurnBody'
import { ChangedFilesSummary } from './ChangedFilesSummary'
import { CompactionRow } from './CompactionRow'
import { DshStateDot } from './DshStateDot'
import { IconBranchOutline16, IconCheckOutline16, IconCopyOutline16 } from './DshIcons'
import { MessageTurnUsageChip } from './MessageTurnUsageChip'
import { TurnActivitySummaryRow } from './TurnActivitySummary'
import { DeepDivingIndicator } from './DeepDivingIndicator'
import { formatMessageTime } from './formatMessageTime'
import { formatDshRunDuration } from './session-usage'
import { visibleToolActivity } from './visibleToolActivity'

export function Message({
  message,
  dshToolRows,
  toolTraceItems,
  workspacePath,
  onFork,
  isStreaming = false,
  thinkingIsStreaming,
  streamActivity,
  onShowToolDetails,
  onOpenWorkspacePath,
  fallbackModelKey,
  isFocused = false,
}: {
  message: ChatMessage
  dshToolRows?: readonly DshProjectedToolCall[]
  toolTraceItems?: readonly ToolTraceItem[]
  workspacePath?: string | null
  onFork?: (messageId: string) => void
  isStreaming?: boolean
  thinkingIsStreaming?: boolean
  streamActivity?: string | null
  onShowToolDetails?: (item: ToolTraceItem) => void
  onOpenWorkspacePath?: (relativePath: string) => void
  fallbackModelKey?: string | null
  isFocused?: boolean
}) {
  const isUser = message.author === 'user'
  const [copied, setCopied] = useState(false)

  const copyMessage = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = message.text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.append(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  const runMs = !isUser ? message.usage?.elapsedMs : undefined
  const runLabel =
    typeof runMs === 'number' && runMs >= 1000 ? `用时 ${formatDshRunDuration(runMs)}` : null
  const billed =
    message.usage
      ? (message.usage.inputTokens ?? 0) + (message.usage.cacheReadTokens ?? 0) + (message.usage.cacheWriteTokens ?? 0)
      : 0
  const hasTurnUsage = !isUser && message.usage && (billed > 0 || message.usage.outputTokens > 0)
  const activeToolTrace = [...(toolTraceItems ?? [])].reverse().find((item) => item.status === 'running')
  const visibleActivity = activeToolTrace
    ? visibleToolActivity(activeToolTrace, workspacePath)
    : streamActivity

  return (
    <article
      id={`msg-${message.id}`}
      className={`message dsh-flow-item ${isUser ? 'user-message' : 'agent-message'}${message.interrupted ? ' interrupted-turn' : ''}${isStreaming ? ' message-streaming' : ''}${isFocused ? ' message-focused' : ''}`}
      data-testid={isUser ? 'user-message' : 'assistant-message'}
      aria-label={isUser ? '用户消息' : 'TaskWeaver 回复'}
      data-time-hover-root
    >
      <div className="message-content">
        {!isUser && message.compaction && (
          <CompactionRow
            automatic={message.compaction.automatic}
            summary={message.compaction.summary}
            tokensBefore={message.compaction.tokensBefore}
          />
        )}
        {!isUser && isStreaming && (
          <DeepDivingIndicator
            startTime={message.timestamp}
            activity={visibleActivity}
            completedToolCount={(toolTraceItems ?? []).filter((item) => item.status !== 'running').length}
            isThinking={thinkingIsStreaming}
            hasVisibleText={Boolean(message.text.trim())}
          />
        )}
        {!isUser && !message.compaction && (
          <AssistantTurnBody
            blocks={message.contentBlocks}
            fallbackThinking={message.thinking}
            fallbackText={message.text}
            thinkingIsStreaming={thinkingIsStreaming}
            isStreaming={isStreaming}
            dshToolRows={dshToolRows}
            toolTraceItems={toolTraceItems}
            workspacePath={workspacePath}
            onShowToolDetails={onShowToolDetails}
            onOpenWorkspacePath={onOpenWorkspacePath}
          />
        )}
        {!isUser && (
          <ChangedFilesSummary
            traces={toolTraceItems}
            fileChanges={message.fileChanges}
            workspacePath={workspacePath}
            onOpenWorkspacePath={onOpenWorkspacePath}
            compactListOnly
          />
        )}
        {!isUser && ((dshToolRows?.length ?? 0) === 0 && (toolTraceItems?.length ?? 0) === 0) && (isStreaming ? message.id === 'streaming-assistant' : true) && (
          <TurnActivitySummaryRow
            persisted={message.turnActivity}
            traces={toolTraceItems}
            fileChanges={message.fileChanges}
            isStreaming={isStreaming}
          />
        )}
        {isUser && message.text && (
          <div className="user-message-stack">
            <div className="message-text user-message-bubble">{message.text}</div>
          </div>
        )}
        {message.callout ? (
          <div className="dsh-turn-error-row" role="status">
            <DshStateDot state="error" size={8} className="dsh-turn-error-dot" />
            <div className="dsh-turn-error-copy">
              <span className="dsh-turn-error-title">本轮运行失败</span>
              <span className="dsh-turn-error-message">{message.callout}</span>
            </div>
          </div>
        ) : message.interrupted ? (
          <span className="dsh-turn-stopped-badge">已停止</span>
        ) : null}
      </div>
      {!isStreaming && (
        <div className="message-footer">
          <div className="message-footer-toolbar">
            <button
              className="message-action-btn message-copy"
              type="button"
              onClick={() => void copyMessage()}
              aria-label={copied ? '已复制消息' : '复制消息'}
              data-tooltip={copied ? '已复制' : '复制'}
              title={copied ? '已复制' : '复制'}
            >
              {copied ? <IconCheckOutline16 size={14} /> : <IconCopyOutline16 size={14} />}
            </button>
            {onFork && message.id !== 'streaming-assistant' && (
              <button
                className="message-action-btn message-fork"
                type="button"
                onClick={() => onFork(message.id)}
                aria-label="分支到新聊天"
                data-tooltip="分支到新聊天"
                title="分支到新聊天"
              >
                <IconBranchOutline16 size={14} />
              </button>
            )}
            <time className="message-footer-time">
              {formatMessageTime(message.time, message.timestamp, message.id)}
              {!isUser && hasTurnUsage && (
                <>
                  <span className="message-footer-dot" aria-hidden>
                    ·
                  </span>
                  <MessageTurnUsageChip
                    usage={message.usage}
                    modelKey={message.modelKey ?? fallbackModelKey}
                    usageKind={message.usageKind}
                    tokensShadowed={message.compaction?.tokensBefore ?? null}
                  />
                </>
              )}
              {runLabel && (
                <>
                  <span className="message-footer-dot" aria-hidden>
                    ·
                  </span>
                  {runLabel}
                </>
              )}
            </time>
          </div>
        </div>
      )}
    </article>
  )
}
