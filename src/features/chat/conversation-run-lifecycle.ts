import type { ChatStreamEvent } from '../../shared/app-api'
import type { ChatMessage } from '../../types'

/** A turn may finish while the same run still owns accepted queued prompts. */
export function endsConversationRun(event: ChatStreamEvent): boolean {
  if ('taskId' in event && event.taskId) return false
  return event.type === 'error' || (event.type === 'done' && !event.continuing)
}

/** Commit completed native turns before the next start resets transient copy. */
export function completedStreamMessage(event: ChatStreamEvent, timestamp = Date.now()): ChatMessage | null {
  if ((event.type !== 'done' && event.type !== 'error') || !event.turnId || !event.conversationId) return null
  if ('taskId' in event && event.taskId) return null
  if (!event.full?.trim() && !event.fullThinking?.trim()) return null
  return {
    id: `z-turn-${event.turnId}`,
    author: 'orchestrator',
    name: 'TaskWeaver',
    timestamp: event.startedAt ?? timestamp,
    time: new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    text: event.full || '',
    thinking: event.fullThinking,
    thinkingDurationMs: event.thinkingDurationMs,
    contentBlocks: event.contentBlocks,
    interrupted: event.type === 'error' || event.interrupted,
    ...(event.type === 'error' ? { callout: '执行失败，已保留此前输出。', usage: event.usage } : {}),
  }
}

/** IPC replies can arrive after a newer queued turn has begun streaming. */
export function mayResetStreamAfterReply(accepted: boolean | undefined, running: boolean): boolean {
  return !accepted && !running
}
