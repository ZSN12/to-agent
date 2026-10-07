import type { ChatStreamEvent, PromptQueueSnapshot, ToolTraceItem } from '../../shared/app-api'
import type { AssistantContentBlock } from '../../types'

export interface ConversationStreamSnapshot {
  streamText: string | null
  streamThinking: { text: string; durationMs?: number } | null
  streamBlocks: AssistantContentBlock[]
  toolTraces: ToolTraceItem[]
  promptQueue: PromptQueueSnapshot
}

export function emptyConversationStream(): ConversationStreamSnapshot {
  return {
    streamText: null,
    streamThinking: null,
    streamBlocks: [],
    toolTraces: [],
    promptQueue: { steering: [], followUp: [] },
  }
}

function toolTraceKey(item: ToolTraceItem) {
  return `${item.taskId ?? 'main'}:${item.id}`
}

/** 将会话流事件折叠进可恢复的 snapshot（含后台会话）。 */
export function applyStreamEventToSnapshot(
  snapshot: ConversationStreamSnapshot,
  event: ChatStreamEvent,
): ConversationStreamSnapshot {
  const next: ConversationStreamSnapshot = {
    ...snapshot,
    streamBlocks: [...snapshot.streamBlocks],
    toolTraces: [...snapshot.toolTraces],
    promptQueue: {
      steering: [...snapshot.promptQueue.steering],
      followUp: [...snapshot.promptQueue.followUp],
    },
  }

  switch (event.type) {
    case 'start':
      return emptyConversationStream()
    case 'thinking_start':
      next.streamThinking = next.streamThinking?.text?.trim()
        ? { text: next.streamThinking.text, durationMs: next.streamThinking.durationMs ?? 0 }
        : { text: '', durationMs: next.streamThinking?.durationMs ?? 0 }
      return next
    case 'thinking_delta':
      next.streamThinking = {
        text: event.fullThinking ?? `${next.streamThinking?.text ?? ''}${event.delta ?? ''}`,
        durationMs: event.durationMs ?? next.streamThinking?.durationMs,
      }
      return next
    case 'thinking_end':
      next.streamThinking = {
        text: event.fullThinking ?? next.streamThinking?.text ?? '',
        durationMs: event.durationMs ?? next.streamThinking?.durationMs,
      }
      return next
    case 'delta':
      next.streamText = event.full ?? `${snapshot.streamText ?? ''}${event.delta ?? ''}`
      return next
    case 'progress':
      next.streamText = event.text
      return next
    case 'blocks':
      next.streamBlocks = event.segments
      return next
    case 'done':
      // This map is a recovery snapshot for an in-flight turn, not transcript
      // storage. Keeping a completed turn here makes the next `start` look like
      // an interrupted stream and can duplicate/replace the prior answer.
      return event.continuing
        ? { ...emptyConversationStream(), promptQueue: next.promptQueue }
        : emptyConversationStream()
    case 'error':
      return emptyConversationStream()
    case 'queue_update':
      next.promptQueue = {
        steering: Array.from(new Set(event.steering || [])),
        followUp: Array.from(new Set(event.followUp || [])),
      }
      return next
    case 'steering_queued':
      next.promptQueue.steering = Array.from(new Set([...next.promptQueue.steering, event.text]))
      return next
    case 'followup_queued':
      next.promptQueue.followUp = Array.from(new Set([...next.promptQueue.followUp, event.text]))
      return next
    case 'tool': {
      const index = next.toolTraces.findIndex((item) => toolTraceKey(item) === toolTraceKey(event))
      if (index < 0) next.toolTraces = [...next.toolTraces, event].slice(-80)
      else {
        const updated = [...next.toolTraces]
        updated[index] = { ...updated[index], ...event }
        next.toolTraces = updated
      }
      return next
    }
    default:
      return next
  }
}
