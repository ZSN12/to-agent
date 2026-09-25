import type { AssistantContentBlock } from '../../types'
import { AgentMessageMarkdown } from './AgentMessageMarkdown'
import { DshThinkBlock } from './DshThinkBlock'

export function AssistantTurnBody({
  blocks,
  fallbackThinking,
  fallbackText,
  isStreaming = false,
}: {
  blocks?: AssistantContentBlock[] | null
  fallbackThinking?: string
  fallbackText?: string
  isStreaming?: boolean
}) {
  const segments =
    blocks && blocks.length > 0
      ? blocks
      : [
          ...(fallbackThinking?.trim()
            ? [{ id: 'legacy-think', kind: 'thinking' as const, text: fallbackThinking }]
            : []),
          ...(fallbackText?.trim() ? [{ id: 'legacy-text', kind: 'text' as const, text: fallbackText }] : []),
        ]

  if (!segments.length) return null

  return (
    <div className="assistant-turn-body">
      {segments.map((seg, index) => {
        const isLast = index === segments.length - 1
        if (seg.kind === 'thinking') {
          return (
            <DshThinkBlock
              key={seg.id}
              thinking={seg.text}
              isStreaming={isStreaming && isLast && seg.kind === 'thinking'}
            />
          )
        }
        return (
          <div key={seg.id} className="assistant-text-block">
            <AgentMessageMarkdown text={seg.text} />
          </div>
        )
      })}
    </div>
  )
}
