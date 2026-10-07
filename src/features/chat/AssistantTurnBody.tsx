import type { AssistantContentBlock } from '../../types'
import { lazy, Suspense } from 'react'
import { DshThinkBlock } from './DshThinkBlock'
import { coalesceContentBlocks } from './coalesceContentBlocks'
import { isDebugBlocksEnabled } from './debug-blocks'
import { isStructuredThinkingBlock } from './reasoning-heuristics'

const AgentMessageMarkdown = lazy(() => import('./AgentMessageMarkdown').then((module) => ({ default: module.AgentMessageMarkdown })))

export function AssistantTurnBody({
  blocks,
  fallbackThinking,
  fallbackText,
  thinkingDurationMs,
  thinkingIsStreaming,
  isStreaming = false,
}: {
  blocks?: AssistantContentBlock[] | null
  fallbackThinking?: string
  fallbackText?: string
  thinkingDurationMs?: number
  thinkingIsStreaming?: boolean
  isStreaming?: boolean
}) {
  const rawSegments =
    blocks && blocks.length > 0
      ? blocks
      : [
          ...(fallbackThinking?.trim()
            ? [{ id: 'legacy-think', kind: 'thinking' as const, text: fallbackThinking }]
            : []),
          ...(fallbackText?.trim() ? [{ id: 'legacy-text', kind: 'text' as const, text: fallbackText }] : []),
        ]

  if (!rawSegments.length) return null

  const segments = coalesceContentBlocks(rawSegments)
  const debug = isDebugBlocksEnabled()
  const lastRaw = rawSegments[rawSegments.length - 1]

  return (
    <div className="assistant-turn-body">
      {segments.map((seg, index) => {
        const isLast = index === segments.length - 1
        const streamThisBlock = isStreaming
          && isLast
          && lastRaw?.kind === seg.kind
          && (seg.kind !== 'thinking' || thinkingIsStreaming !== false)
        const debugLabel = debug ? (
          <span className="block-debug-chip" title="stream segment id (pass:index:kind)">
            {seg.kind} · {seg.id}
          </span>
        ) : null
        if (isStructuredThinkingBlock(seg)) {
          return (
            <div key={seg.id} className="assistant-block-wrap">
              {debugLabel}
              <DshThinkBlock
                thinking={seg.text}
                durationMs={thinkingDurationMs}
                isStreaming={streamThisBlock}
              />
            </div>
          )
        }
        return (
          <div key={seg.id} className="assistant-block-wrap">
            {debugLabel}
            <div className="assistant-text-block">
              <Suspense fallback={<div className="message-text message-markdown">{seg.text}</div>}>
                <AgentMessageMarkdown text={seg.text} />
              </Suspense>
            </div>
          </div>
        )
      })}
    </div>
  )
}
