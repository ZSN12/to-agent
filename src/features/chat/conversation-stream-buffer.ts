import type { ChatStreamEvent, PromptQueueSnapshot, ToolTraceItem } from '../../shared/app-api'
import type { AssistantContentBlock } from '../../types'

export interface ConversationStreamSnapshot {
  streamText: string | null
  streamThinking: { text: string; durationMs?: number; isActive?: boolean } | null
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
  switch (event.type) {
    case 'start':
      return emptyConversationStream()
    case 'role_progress':
      return event.status === 'started' && event.streamToRenderer !== false ? emptyConversationStream() : snapshot
    case 'thinking_start':
      return {
        ...snapshot,
        streamThinking: snapshot.streamThinking?.text?.trim()
          ? { text: snapshot.streamThinking.text, durationMs: snapshot.streamThinking.durationMs ?? 0, isActive: true }
          : { text: '', durationMs: snapshot.streamThinking?.durationMs ?? 0, isActive: true },
      }
    case 'thinking_delta':
      return {
        ...snapshot,
        streamThinking: {
          text: event.fullThinking ?? `${snapshot.streamThinking?.text ?? ''}${event.delta ?? ''}`,
          durationMs: event.durationMs ?? snapshot.streamThinking?.durationMs,
          isActive: true,
        },
      }
    case 'thinking_end':
      return {
        ...snapshot,
        streamThinking: {
          text: event.fullThinking ?? snapshot.streamThinking?.text ?? '',
          durationMs: event.durationMs ?? snapshot.streamThinking?.durationMs,
          isActive: false,
        },
      }
    case 'delta':
      return {
        ...snapshot,
        streamText: event.full ?? `${snapshot.streamText ?? ''}${event.delta ?? ''}`,
        streamThinking: snapshot.streamThinking && snapshot.streamThinking.isActive
          ? { ...snapshot.streamThinking, isActive: false }
          : snapshot.streamThinking,
      }
    case 'progress':
      return {
        ...snapshot,
        streamText: event.text,
      }
    case 'blocks':
      return {
        ...snapshot,
        streamBlocks: event.segments,
      }
    case 'block_delta':
      return {
        ...snapshot,
        streamBlocks: applyStreamBlockDelta(snapshot.streamBlocks, event),
      }
    case 'done':
      // This map is a recovery snapshot for an in-flight turn, not transcript
      // storage. Keeping a completed turn here makes the next `start` look like
      // an interrupted stream and can duplicate/replace the prior answer.
      return event.continuing
        ? { ...emptyConversationStream(), promptQueue: snapshot.promptQueue }
        : emptyConversationStream()
    case 'error':
      return emptyConversationStream()
    case 'queue_update':
      return {
        ...snapshot,
        promptQueue: {
          steering: Array.from(new Set(event.steering || [])),
          followUp: Array.from(new Set(event.followUp || [])),
        },
      }
    case 'steering_queued':
      return {
        ...snapshot,
        promptQueue: {
          steering: Array.from(new Set([...snapshot.promptQueue.steering, event.text])),
          followUp: snapshot.promptQueue.followUp,
        },
      }
    case 'followup_queued':
      return {
        ...snapshot,
        promptQueue: {
          steering: snapshot.promptQueue.steering,
          followUp: Array.from(new Set([...snapshot.promptQueue.followUp, event.text])),
        },
      }
    case 'tool': {
      const streamThinking = event.status === 'running' && snapshot.streamThinking
        ? { ...snapshot.streamThinking, isActive: false }
        : snapshot.streamThinking
      const index = snapshot.toolTraces.findIndex((item) => toolTraceKey(item) === toolTraceKey(event))
      let toolTraces: ToolTraceItem[]
      if (index < 0) {
        toolTraces = [...snapshot.toolTraces, event].slice(-80)
      } else {
        toolTraces = [...snapshot.toolTraces]
        toolTraces[index] = { ...toolTraces[index], ...event }
      }
      return {
        ...snapshot,
        streamThinking,
        toolTraces,
      }
    }
    default:
      return snapshot
  }
}

/** Apply one keyed streaming block patch without serializing prior block text again. */
export function applyStreamBlockDelta(
  blocks: AssistantContentBlock[],
  event: Extract<ChatStreamEvent, { type: 'block_delta' }>,
): AssistantContentBlock[] {
  const lastIndex = blocks.length - 1
  const index = lastIndex >= 0 && blocks[lastIndex]?.id === event.id
    ? lastIndex
    : blocks.findIndex((block) => block.id === event.id)
  if (index < 0) return [...blocks, { id: event.id, kind: event.kind, text: event.delta }]
  const current = blocks[index]
  if (!current || current.kind !== event.kind) {
    return [...blocks.slice(0, index), { id: event.id, kind: event.kind, text: event.delta }, ...blocks.slice(index + 1)]
  }
  const updated = [...blocks]
  updated[index] = { ...current, text: current.text + event.delta }
  return updated
}
