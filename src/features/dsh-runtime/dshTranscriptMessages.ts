import type { DshTranscriptChatMessage, DshTranscriptRow } from '../../shared/app-api'
import type { DshProjectedToolCall, ToolTraceItem } from '../../shared/app-api'
import { clockLabelZh } from '../../shared/time-label'
import type { ChatMessage } from '../../types'

type DshContextMessage = DshTranscriptChatMessage & {
  dshContext: { plugin: string; form?: string }
}

export function isDshContextMessage(message: ChatMessage): message is DshContextMessage {
  const context = (message as DshTranscriptChatMessage).dshContext
  return typeof context?.plugin === 'string' && context.plugin.trim().length > 0
}

/** Read the display-only DSH turn number carried by a projected assistant row. */
export function dshTurnForMessage(message: ChatMessage): number | null {
  const turn = (message as DshTranscriptChatMessage).dshTurn
  return Number.isSafeInteger(turn) && (turn ?? 0) > 0 ? turn ?? null : null
}

/** Attach settled tool rows to their own assistant turn; live traces belong only to the latest turn. */
export function dshToolHistoryForMessage(
  message: ChatMessage,
  rows: readonly DshProjectedToolCall[] | undefined,
  traces: readonly ToolTraceItem[],
  isLatestAgent: boolean,
): { rows?: readonly DshProjectedToolCall[]; traces?: readonly ToolTraceItem[] } {
  const turn = dshTurnForMessage(message)
  if (turn === null) return isLatestAgent ? { rows, traces } : {}
  return {
    rows: rows?.filter((row) => row.turn === turn || (isLatestAgent && row.turn === 0)),
    ...(isLatestAgent
      ? { traces: traces.filter((trace) => trace.turn === turn || trace.turn == null) }
      : {}),
  }
}

function formatMessageTime(timestamp?: number): string {
  return clockLabelZh(timestamp ?? Date.now())
}

export function chatMessagesFromDshTranscript(
  transcript: readonly DshTranscriptRow[],
  names: { user: string; agent: string },
): DshTranscriptChatMessage[] {
  return transcript.map((row) => {
    if (row.role === 'compaction') {
      return {
        id: `dsh-compact-${row.dshKey}`,
        author: 'orchestrator',
        name: names.agent,
        time: formatMessageTime(row.timestamp),
        timestamp: row.timestamp,
        text: '',
        compaction: {
          automatic: row.compactionTrigger
            ? row.compactionTrigger !== 'manual'
            : (row.automatic ?? true),
          summary: row.summary,
          tokensBefore: row.tokensBefore ?? null,
        },
      }
    }
    if (row.role === 'user') {
      return {
        id: `dsh-user-${row.dshKey}`,
        author: 'user',
        name: names.user,
        time: formatMessageTime(row.timestamp),
        timestamp: row.timestamp,
        text: row.text ?? '',
        images: row.images,
        behavior: row.behavior,
      }
    }
    if (row.role === 'context') {
      const plugin = row.plugin?.trim().slice(0, 128) || '未知插件'
      const form = row.form?.trim().slice(0, 64) || undefined
      return {
        id: `dsh-context-${row.dshKey}`,
        // ChatMessage has no context author in the legacy UI type. The explicit
        // dshContext discriminant keeps this row out of every assistant path.
        author: 'agent',
        name: plugin,
        time: formatMessageTime(row.timestamp),
        timestamp: row.timestamp,
        text: row.text ?? '',
        dshContext: { plugin, form },
      }
    }
    return {
      id: `dsh-asst-${row.dshKey}`,
      author: 'orchestrator',
      name: names.agent,
      time: formatMessageTime(row.timestamp),
      timestamp: row.timestamp,
      ...(Number.isSafeInteger(row.turn) && (row.turn ?? 0) > 0 ? { dshTurn: row.turn } : {}),
      text: row.text ?? '',
      thinking: row.thinking,
      interrupted: row.interrupted,
      usage: row.usage,
      modelKey: row.modelKey,
    }
  })
}

function restoreStoredUserText(
  transcriptMessages: DshTranscriptChatMessage[],
  storedMessages: readonly ChatMessage[],
): DshTranscriptChatMessage[] {
  const storedUsers = storedMessages.filter((message) => message.author === 'user')
  let nextStoredIndex = 0

  return transcriptMessages.map((message) => {
    if (message.author !== 'user') return message
    const hostText = message.text.trim()
    if (!hostText) return message

    for (let index = nextStoredIndex; index < storedUsers.length; index += 1) {
      const candidate = storedUsers[index]
      const originalText = candidate.text.trim()
      if (!originalText || !hostText.includes(originalText)) continue
      if ((message.behavior === 'steer') !== (candidate.behavior === 'steer')) continue
      if (typeof message.timestamp === 'number' && typeof candidate.timestamp === 'number'
        && Math.abs(message.timestamp - candidate.timestamp) > 10 * 60 * 1000) continue

      nextStoredIndex = index + 1
      return {
        ...message,
        // The Host transcript stores the fully assembled model prompt. Keep
        // that internal context out of the visible user bubble and show what
        // the person actually typed.
        text: candidate.text,
        images: message.images ?? candidate.images,
      }
    }
    return message
  })
}

function assistantMatchKey(text: string, thinking?: string): string {
  return JSON.stringify([text, (thinking ?? '').trim()])
}

function exactAssistantMatchKey(text: string, thinking?: string): string {
  return JSON.stringify([text, thinking ?? null])
}

/** Prefer DSH session transcript; keep TaskWeaver-only rows (multi-agent callouts, IPC errors). */
export function mergeStoredMessagesWithDshTranscript(
  stored: readonly ChatMessage[],
  transcript: readonly DshTranscriptRow[] | undefined,
  preferDsh: boolean,
  sending = false,
): ChatMessage[] {
  if (!preferDsh || !transcript?.length) return [...stored]
  let base = restoreStoredUserText(
    chatMessagesFromDshTranscript(transcript, { user: '你', agent: 'TaskWeaver' }),
    stored,
  )
  const storedAssistants = stored.filter((message) => !isDshContextMessage(message)
    && message.author !== 'user'
    && (message.usage || message.callout || message.interrupted || message.fileChanges?.length || message.turnActivity))
  if (storedAssistants.length) {
    const storedIndexesByKey = new Map<string, number[]>()
    storedAssistants.forEach((message, index) => {
      const key = assistantMatchKey(message.text, message.thinking)
      const indexes = storedIndexesByKey.get(key) ?? []
      indexes.push(index)
      storedIndexesByKey.set(key, indexes)
    })
    const nextStoredIndexByKey = new Map<string, number>()
    base = base.map((message) => {
      if (message.author === 'user' || isDshContextMessage(message)) return message
      const key = assistantMatchKey(message.text, message.thinking)
      const indexes = storedIndexesByKey.get(key)
      const offset = nextStoredIndexByKey.get(key) ?? 0
      const index = indexes?.[offset]
      if (index === undefined) return message
      nextStoredIndexByKey.set(key, offset + 1)
      const match = storedAssistants[index]
      return {
        ...message,
        usage: message.usage ?? match.usage,
        modelKey: message.modelKey ?? match.modelKey,
        callout: message.callout ?? match.callout,
        interrupted: message.interrupted || match.interrupted,
        fileChanges: message.fileChanges ?? match.fileChanges,
        turnActivity: message.turnActivity ?? match.turnActivity,
      }
    })
  }
  if (sending) {
    const lastStoredUser = [...stored].reverse().find((message) => message.author === 'user')
    const lastDshUser = [...base].reverse().find((message) => message.author === 'user')
    if (lastStoredUser && lastStoredUser.text !== lastDshUser?.text) {
      base = [...base, lastStoredUser]
    }
  }
  const completedIndexesByKey = new Map<string, number[]>()
  const interruptedKeys = new Set<string>()
  base.forEach((message, index) => {
    if (message.author === 'user' || isDshContextMessage(message)) return
    const key = assistantMatchKey(message.text, message.thinking)
    const indexes = completedIndexesByKey.get(key) ?? []
    indexes.push(index)
    completedIndexesByKey.set(key, indexes)
    if (message.interrupted) interruptedKeys.add(exactAssistantMatchKey(message.text, message.thinking))
  })
  const nextCompletedIndexByKey = new Map<string, number>()
  const extras = stored.filter((message) => {
    if (message.id.startsWith('z-turn-')) {
      // The stream commits synchronously; the native projection may lag a turn.
      // Retain that answer until its durable row arrives, matching occurrences
      // rather than globally dropping repeated identical short answers.
      const key = assistantMatchKey(message.text, message.thinking)
      const indexes = completedIndexesByKey.get(key)
      const offset = nextCompletedIndexByKey.get(key) ?? 0
      if (indexes?.[offset] === undefined) return true
      nextCompletedIndexByKey.set(key, offset + 1)
      return false
    }
    if (message.interrupted && message.author !== 'user') {
      return !interruptedKeys.has(exactAssistantMatchKey(message.text, message.thinking))
    }
    if (message.callout) return true
    if (message.id.includes('-error')) return true
    if (message.author === 'orchestrator' && message.text?.startsWith('执行失败')) return true
    return false
  })
  if (!extras.length) return base
  const merged = [...base]
  for (const extra of extras) {
    // Keep TaskWeaver-only failures in their original place in the conversation.
    // Appending non-z-turn rows made an old failed attempt appear after newer replies.
    const insertAt = typeof extra.timestamp === 'number' && Number.isFinite(extra.timestamp)
      ? merged.findIndex(message => typeof message.timestamp === 'number'
        && Number.isFinite(message.timestamp)
        && message.timestamp > extra.timestamp!)
      : -1
    if (insertAt < 0) merged.push(extra)
    else merged.splice(insertAt, 0, extra)
  }
  return merged
}
