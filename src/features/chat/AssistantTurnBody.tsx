import type { AssistantContentBlock } from '../../types'
import { AgentMessageMarkdown } from './AgentMessageMarkdown'
import { DshThinkBlock } from './DshThinkBlock'
import { coalesceContentBlocks } from './coalesceContentBlocks'
import { isDebugBlocksEnabled } from './debug-blocks'
import { shouldPresentTextAsThinking } from './reasoning-heuristics'

export function AssistantTurnBody({
  blocks,
  fallbackThinking,
  fallbackText,
  thinkingDurationMs,
  isStreaming = false,
}: {
  blocks?: AssistantContentBlock[] | null
  fallbackThinking?: string
  fallbackText?: string
  thinkingDurationMs?: number
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
        const streamThisBlock = isStreaming && isLast && lastRaw?.kind === seg.kind
        const debugLabel = debug ? (
          <span className="block-debug-chip" title="stream segment id (pass:index:kind)">
            {seg.kind} · {seg.id}
          </span>
        ) : null
        if (seg.kind === 'thinking' || shouldPresentTextAsThinking(seg.text, streamThisBlock)) {
          return (
            <div key={seg.id} className="assistant-block-wrap">
              {debugLabel}
              <DshThinkBlock
                thinking={seg.text}
                durationMs={streamThisBlock ? undefined : thinkingDurationMs}
                isStreaming={streamThisBlock}
              />
            </div>
          )
        }
        return (
          <div key={seg.id} className="assistant-block-wrap">
            {debugLabel}
            <div className="assistant-text-block">
              <AgentMessageMarkdown text={seg.text} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
