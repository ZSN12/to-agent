import { memo, useEffect, useRef, useState } from 'react'
import { Pencil, RefreshCw, RotateCcw, Undo2 } from 'lucide-react'
import type { DshProjectedImageRef, DshProjectedToolCall } from '../../shared/app-api'
import type { ToolTraceItem } from '../../shared/app-api'
import type { ChatMessage } from '../../types'
import { copyTextToClipboard } from '../../shared/clipboard'
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
import { getBridge } from '../app/getBridge'
import { AttachmentImagePreview } from './AttachmentImagePreview'

function DshUserImageAttachments({
  images,
  conversationId,
}: {
  images: readonly DshProjectedImageRef[]
  conversationId?: string | null
}) {
  const imageKey = images.map((image) => image.attachmentId).join('\n')
  const imagesRef = useRef(images)
  const containerRef = useRef<HTMLDivElement>(null)
  imagesRef.current = images
  const [sources, setSources] = useState<Map<string, string>>(() => new Map())
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setSources(new Map())
    setFailed(new Set())
    setSelectedId(null)
    const bridge = getBridge()
    const getImageAttachment = bridge?.chat?.getImageAttachment
    if (!conversationId || !getImageAttachment) {
      setFailed(new Set(imagesRef.current.map((image) => image.attachmentId)))
      return () => { active = false }
    }
    const loadImages = async () => {
      for (const image of imagesRef.current) {
        try {
          const result = await getImageAttachment({ conversationId, attachmentId: image.attachmentId })
          if (!active) return
          if (!result.ok || !result.data?.data) {
            setFailed((previous) => new Set(previous).add(image.attachmentId))
            continue
          }
          setSources((previous) => new Map(previous).set(
            image.attachmentId,
            `data:${result.data.attachment.mediaType};base64,${result.data.data}`,
          ))
        } catch {
          if (!active) return
          setFailed((previous) => new Set(previous).add(image.attachmentId))
        }
      }
    }
    const container = containerRef.current
    if (!container || typeof IntersectionObserver === 'undefined') {
      void loadImages()
    } else {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          void loadImages()
        }
      }, { rootMargin: '240px' })
      observer.observe(container)
      return () => { active = false; observer.disconnect() }
    }
    return () => { active = false }
  }, [conversationId, imageKey])

  const selected = images.find((image) => image.attachmentId === selectedId)
  const selectedSource = selected ? sources.get(selected.attachmentId) : undefined
  const scaledLabel = (image: DshProjectedImageRef) => image.originalDimensions
    ? `已从 ${image.originalDimensions.width}×${image.originalDimensions.height} 缩放`
    : ''

  return (
    <>
      <div ref={containerRef} className="dsh-user-image-attachments" aria-label="消息图片">
        {images.map((image, index) => {
          const src = sources.get(image.attachmentId)
          return (
            <div className="dsh-user-image-item" key={image.attachmentId}>
              {src ? (
                <button type="button" className="dsh-user-image-open" onClick={() => setSelectedId(image.attachmentId)} aria-label={`查看图片 ${image.name || index + 1}`}>
                  <AttachmentImagePreview src={src} alt={image.name || `消息图片 ${index + 1}`} />
                </button>
              ) : (
                <div className={`dsh-user-image-placeholder${failed.has(image.attachmentId) ? ' is-error' : ''}`} role="status">
                  {failed.has(image.attachmentId) ? '图片暂不可用' : '正在读取图片…'}
                </div>
              )}
              {scaledLabel(image) && <small>{scaledLabel(image)}</small>}
            </div>
          )
        })}
      </div>
      {selected && selectedSource && (
        <div className="dsh-image-lightbox-backdrop" role="presentation" onClick={() => setSelectedId(null)} onKeyDown={(event) => { if (event.key === 'Escape') setSelectedId(null) }} tabIndex={-1}>
          <section className="dsh-image-lightbox" role="dialog" aria-modal="true" aria-label={selected.name || '查看消息图片'} onClick={(event) => event.stopPropagation()}>
            <button type="button" className="dsh-image-lightbox-close" onClick={() => setSelectedId(null)} aria-label="关闭图片预览">×</button>
            <img src={selectedSource} alt={selected.name || '消息图片'} />
            {(selected.name || scaledLabel(selected)) && <div className="dsh-image-lightbox-caption">{selected.name}{selected.name && scaledLabel(selected) ? ' · ' : ''}{scaledLabel(selected)}</div>}
          </section>
        </div>
      )}
    </>
  )
}

/** Memoized: settled rows must not re-render on every streamed frame. */
export const Message = memo(function Message({
  message,
  dshToolRows,
  toolTraceItems,
  workspacePath,
  conversationId,
  onFork,
  onRewind,
  onEditAndResend,
  onRegenerate,
  onRetry,
  isStreaming = false,
  thinkingIsStreaming,
  streamActivity,
  dagTaskCount,
  onOpenDagPanel,
  onShowToolDetails,
  onOpenWorkspacePath,
  fallbackModelKey,
  isFocused = false,
}: {
  message: ChatMessage
  dshToolRows?: readonly DshProjectedToolCall[]
  toolTraceItems?: readonly ToolTraceItem[]
  workspacePath?: string | null
  conversationId?: string | null
  onFork?: (messageId: string) => void
  onRewind?: (messageId: string) => void
  onEditAndResend?: (text: string) => void
  onRegenerate?: () => void
  onRetry?: () => void
  isStreaming?: boolean
  thinkingIsStreaming?: boolean
  streamActivity?: string | null
  dagTaskCount?: number
  onOpenDagPanel?: () => void
  onShowToolDetails?: (item: ToolTraceItem) => void
  onOpenWorkspacePath?: (relativePath: string) => void
  fallbackModelKey?: string | null
  isFocused?: boolean
}) {
  const isUser = message.author === 'user'
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState(message.text)

  const copyMessage = async () => {
    try {
      if (await copyTextToClipboard(message.text)) {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      } else {
        setCopied(false)
      }
    } catch {
      setCopied(false)
    }
  }

  const submitEdit = () => {
    if (!editDraft.trim() || !onEditAndResend) return
    setEditing(false)
    onEditAndResend(editDraft)
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
  const isCallingTool = Boolean(activeToolTrace)
    || /^正在执行(?:\s|工具)/.test(streamActivity?.trim() ?? '')

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
            isCallingTool={isCallingTool}
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
            conversationId={conversationId}
            dagTaskCount={dagTaskCount}
            onOpenDagPanel={onOpenDagPanel}
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
        {isUser && (message.text || message.images?.length) ? (
          <div className="user-message-stack">
            {message.text && (editing ? (
              <div className="user-message-edit">
                <textarea
                  autoFocus
                  value={editDraft}
                  onChange={(event) => setEditDraft(event.target.value)}
                  aria-label="编辑并重发消息"
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault()
                      submitEdit()
                    }
                    if (event.key === 'Escape') setEditing(false)
                  }}
                />
                <div className="user-message-edit-actions">
                  <button type="button" onClick={() => setEditing(false)}>取消</button>
                  <button type="button" className="is-primary" onClick={submitEdit} disabled={!editDraft.trim()}>
                    编辑并重发
                  </button>
                </div>
              </div>
            ) : <div className="message-text user-message-bubble">{message.text}</div>)}
            {Boolean(message.images?.length) && <DshUserImageAttachments images={message.images!} conversationId={conversationId} />}
          </div>
        ) : null}
        {message.callout ? (
          <div className="dsh-turn-error-row" role="status">
            <DshStateDot state="error" size={8} className="dsh-turn-error-dot" />
            <div className="dsh-turn-error-copy">
              <span className="dsh-turn-error-title">本轮运行失败</span>
              <span className="dsh-turn-error-message">{message.callout}</span>
            </div>
            {onRetry && (
              <button type="button" className="dsh-turn-error-retry" onClick={onRetry}>
                <RefreshCw size={14} />
                <span>{message.errorCode === 'MAX_STEPS' ? '继续' : '重试'}</span>
              </button>
            )}
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
            {isUser && onEditAndResend && !message.behavior && (
              <button
                className="message-action-btn message-edit-resend"
                type="button"
                onClick={() => { setEditDraft(message.text); setEditing(true) }}
                aria-label="编辑并重发"
                data-tooltip="编辑并重发"
                title="编辑并重发"
              >
                <Pencil size={14} />
              </button>
            )}
            {!isUser && onRegenerate && (
              <button
                className="message-action-btn message-regenerate"
                type="button"
                onClick={onRegenerate}
                aria-label="重新生成"
                data-tooltip="重新生成"
                title="重新生成"
              >
                <RotateCcw size={14} />
              </button>
            )}
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
            {onRewind && message.id !== 'streaming-assistant' && (
              <button
                className="message-action-btn message-rewind"
                type="button"
                onClick={() => onRewind(message.id)}
                aria-label="回到这里"
                data-tooltip="回到这里"
                title="回到这里"
              >
                <Undo2 size={14} />
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
})
