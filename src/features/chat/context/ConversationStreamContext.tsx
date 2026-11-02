import { createContext, useContext, type ReactNode } from 'react'
import type {
  DshProjectedToolCall,
  HostTodoItem,
  LiveContextUsage,
  PromptBudgetSnapshot,
  SessionStatsSnapshot,
  ToolTraceItem,
} from '../../../shared/app-api'
import type { AssistantContentBlock } from '../../../types'

export interface ConversationStreamState {
  sending: boolean
  compacting: boolean
  compactedSeq: number | null
  streamText: string | null
  streamStartedAt: number | null
  streamActivity: string | null
  streamThinking: { text: string; durationMs?: number; isActive?: boolean } | null
  streamBlocks: AssistantContentBlock[]
  retryBanner: { attempt: number; maxAttempts?: number; delayMs?: number; message?: string } | null
  toolTraces: ToolTraceItem[]
  dshToolRows: DshProjectedToolCall[]
  activeDshTurn?: number | null
  liveContext?: LiveContextUsage | null
  promptBudget?: PromptBudgetSnapshot | null
  sessionStats?: SessionStatsSnapshot | null
  hostPlanModeActive?: boolean | null
  hostTodos?: HostTodoItem[] | null
}

const DEFAULT_STREAM_STATE: ConversationStreamState = {
  sending: false,
  compacting: false,
  compactedSeq: null,
  streamText: '',
  streamStartedAt: null,
  streamActivity: '',
  streamThinking: null,
  streamBlocks: [],
  retryBanner: null,
  toolTraces: [],
  dshToolRows: [],
  activeDshTurn: undefined,
  liveContext: undefined,
  promptBudget: null,
  sessionStats: null,
  hostPlanModeActive: false,
  hostTodos: [],
}

const ConversationStreamContext = createContext<ConversationStreamState>(DEFAULT_STREAM_STATE)

export function ConversationStreamProvider({
  value,
  children,
}: {
  value: ConversationStreamState
  children: ReactNode
}) {
  return (
    <ConversationStreamContext.Provider value={value}>
      {children}
    </ConversationStreamContext.Provider>
  )
}

export function useConversationStream(): ConversationStreamState {
  return useContext(ConversationStreamContext)
}
