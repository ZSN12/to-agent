import { useMemo } from 'react'
import type { ChatMessage } from '../../types'
import type { LiveContextUsage, SessionStatsSnapshot } from '../../shared/app-api'
import { ComposerStatsDock } from '../chat/ComposerStatsDock'
import { sessionUsageHasData, summarizeSessionUsage } from '../chat/session-usage'

export function ConversationUsageFooter({
  messages,
  sessionStats,
  liveContext,
  modelContextWindow,
}: {
  messages: ChatMessage[]
  sessionStats?: SessionStatsSnapshot | null
  liveContext?: LiveContextUsage | null
  modelContextWindow?: number
}) {
  const sessionUsage = useMemo(() => summarizeSessionUsage(messages), [messages])
  if (sessionStats) {
    return <ComposerStatsDock stats={sessionStats} messages={messages} liveContext={liveContext} modelContextWindow={modelContextWindow} />
  }
  if (!sessionUsageHasData(sessionUsage) && !liveContext) return null
  return (
    <ComposerStatsDock
      stats={{
        userMessages: sessionUsage.rounds,
        assistantMessages: sessionUsage.rounds,
        toolCalls: 0,
        llmMs: 0,
        toolMs: 0,
        ttftMs: 0,
        ttftSteps: 0,
        decodeMs: 0,
        decodeTokens: 0,
        tokens: {
          input: sessionUsage.inputTokens,
          output: sessionUsage.outputTokens,
          cacheRead: sessionUsage.cacheReadTokens,
          cacheWrite: sessionUsage.cacheWriteTokens,
          total: sessionUsage.inputTokens + sessionUsage.outputTokens + sessionUsage.cacheReadTokens + sessionUsage.cacheWriteTokens,
        },
      }}
      messages={messages}
      liveContext={liveContext}
      modelContextWindow={modelContextWindow}
    />
  )
}
