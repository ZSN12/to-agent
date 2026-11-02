import type { DshTranscriptChatMessage, DshTranscriptRow } from '../../shared/app-api'
import type { DshProjectedToolCall, ToolTraceItem } from '../../shared/app-api'
import { clockLabelZh } from '../../shared/time-label'
import { isAutoVerificationPrompt } from '../chat/autoVerification'
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

function buildTurnBuckets<T>(
  items: readonly T[],
  turnOf: (item: T) => number | null,
  fallbackTurn: number | null,
) {
  const buckets = new Map<number | null, { items: T[]; positions: number[] }>()
  items.forEach((item, position) => {
    const turn = turnOf(item)
    let bucket = buckets.get(turn)
    if (!bucket) {
      bucket = { items: [], positions: [] }
      buckets.set(turn, bucket)
    }
    bucket.items.push(item)
    bucket.positions.push(position)
  })
  const merged = new Map<number, readonly T[]>()
  const empty: readonly T[] = []
  return (turn: number, includeFallback = false): readonly T[] => {
    // Map treats NaN as equal to itself, whereas the existing turn predicates
    // use strict equality and never match a NaN turn.
    const bucket = Number.isNaN(turn) ? undefined : buckets.get(turn)
    if (!includeFallback || turn === fallbackTurn) return bucket?.items ?? empty
    const fallback = buckets.get(fallbackTurn)
    if (!fallback) return bucket?.items ?? empty
    if (!bucket) return fallback.items
    const cached = merged.get(turn)
    if (cached) return cached
    const combined: T[] = []
    let selected = 0, unscoped = 0
    // Merge positions instead of sorting, preserving projection order when
    // unscoped rows are interleaved with the active turn.
    while (selected < bucket.items.length || unscoped < fallback.items.length) {
      if (unscoped >= fallback.items.length
        || (selected < bucket.items.length && bucket.positions[selected] < fallback.positions[unscoped])) {
        combined.push(bucket.items[selected++])
      } else combined.push(fallback.items[unscoped++])
    }
    merged.set(turn, combined)
    return combined
  }
}

/** Build once per projection; message rows only look up their own turn bucket. */
export function buildDshToolHistoryIndex(
  rows: readonly DshProjectedToolCall[] | undefined,
  traces: readonly ToolTraceItem[],
) {
  const rowsForTurn = buildTurnBuckets(rows ?? [], (row) => row.turn, 0)
  const tracesForTurn = buildTurnBuckets(traces, (trace) => trace.turn ?? null, null)
  return {
    forMessage(message: ChatMessage, isLatestAgent: boolean): { rows?: readonly DshProjectedToolCall[]; traces?: readonly ToolTraceItem[] } {
      const turn = dshTurnForMessage(message)
      if (turn === null) return isLatestAgent ? { rows, traces } : {}
      return {
        rows: rows === undefined ? undefined : rowsForTurn(turn, isLatestAgent),
        ...(isLatestAgent ? { traces: tracesForTurn(turn, true) } : {}),
      }
    },
    forTurn(turn: number) {
      return {
        rows: rows === undefined ? undefined : rowsForTurn(turn, true),
        traces: tracesForTurn(turn, true),
      }
    },
  }
}

/** Attach settled tool rows to their own assistant turn; live traces belong only to the latest turn. */
export function dshToolHistoryForMessage(
  message: ChatMessage,
  rows: readonly DshProjectedToolCall[] | undefined,
  traces: readonly ToolTraceItem[],
  isLatestAgent: boolean,
): { rows?: readonly DshProjectedToolCall[]; traces?: readonly ToolTraceItem[] } {
  return buildDshToolHistoryIndex(rows, traces).forMessage(message, isLatestAgent)
}

/** Neighbours used by edit, retry, regenerate and the latest-answer controls. */
export function buildChatMessageNavigation(messages: readonly ChatMessage[]) {
  const relations: {
    previousAssistantId: string | null
    previousUserIndex: number
    responseForUser?: ChatMessage
  }[] = []
  let previousAssistantId: string | null = null
  let previousUserIndex = -1
  let latestAssistantIndex = -1
  let latestUserMessageIndex = -1
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]
    relations.push({ previousAssistantId, previousUserIndex })
    if (message.author === 'user' && !message.behavior) latestUserMessageIndex = index
    if (isDshContextMessage(message) || message.compaction) continue
    if (message.author === 'user') {
      if (!message.behavior) previousUserIndex = index
    } else {
      previousAssistantId = message.id
      latestAssistantIndex = index
    }
  }
  let response: ChatMessage | undefined
  for (let index = messages.length - 1; index >= 0; index--) {
    relations[index].responseForUser = response
    const message = messages[index]
    if (isDshContextMessage(message) || message.compaction) continue
    if (message.author !== 'user') response = message
    else if (!message.behavior) response = undefined
  }
  return {
    relations,
    lastAgentMessageId: previousAssistantId,
    latestAssistantIndex,
    latestUserMessageIndex,
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

const USER_TEXT_MATCH_WINDOW_MS = 10 * 60 * 1000
const USER_TEXT_BUCKET_MS = 2 * USER_TEXT_MATCH_WINDOW_MS

type StoredUserTextCandidate = {
  message: ChatMessage
  index: number
  text?: string
}

function buildStoredUserTextCandidates(storedMessages: readonly ChatMessage[]) {
  const groups = Array.from({ length: 2 }, () => ({
    all: [] as StoredUserTextCandidate[],
    untimed: [] as StoredUserTextCandidate[],
    timed: new Map<number, StoredUserTextCandidate[]>(),
  }))
  storedMessages.forEach((message, index) => {
    if (message.author !== 'user' || message.roleMode) return
    const candidate = { message, index }
    const group = groups[message.behavior === 'steer' ? 1 : 0]
    group.all.push(candidate)
    if (typeof message.timestamp !== 'number' || !Number.isFinite(message.timestamp)) {
      group.untimed.push(candidate)
      return
    }
    const bucket = Math.floor(message.timestamp / USER_TEXT_BUCKET_MS)
    const candidates = group.timed.get(bucket)
    if (candidates) candidates.push(candidate)
    else group.timed.set(bucket, [candidate])
  })
  return (message: ChatMessage): readonly StoredUserTextCandidate[][] => {
    const group = groups[message.behavior === 'steer' ? 1 : 0]
    if (typeof message.timestamp !== 'number' || !Number.isFinite(message.timestamp)) return [group.all]
    // A window is only half a bucket wide. Include both neighbours, then use
    // the original exact time predicate below, including fractional boundary
    // values whose subtraction rounds onto the closed ten-minute limit.
    const bucket = Math.floor(message.timestamp / USER_TEXT_BUCKET_MS)
    const buckets = new Set([bucket - 1, bucket, bucket + 1])
    const lists = [group.untimed]
    for (const bucket of buckets) {
      const candidates = group.timed.get(bucket)
      if (candidates) lists.push(candidates)
    }
    return lists
  }
}

function firstCandidateAtOrAfter(candidates: readonly StoredUserTextCandidate[], index: number) {
  let low = 0, high = candidates.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (candidates[middle].index < index) low = middle + 1
    else high = middle
  }
  return low
}

function restoreStoredUserText(
  transcriptMessages: DshTranscriptChatMessage[],
  storedMessages: readonly ChatMessage[],
): DshTranscriptChatMessage[] {
  const candidatesForMessage = buildStoredUserTextCandidates(storedMessages)
  let nextStoredIndex = 0

  return transcriptMessages.map((message) => {
    if (message.author !== 'user') return message
    const hostText = message.text.trim()
    if (!hostText) return message

    const lists = candidatesForMessage(message)
    const positions = lists.map((list) => firstCandidateAtOrAfter(list, nextStoredIndex))
    while (true) {
      let selectedList = -1
      let selected: StoredUserTextCandidate | undefined
      for (let listIndex = 0; listIndex < lists.length; listIndex++) {
        const candidate = lists[listIndex][positions[listIndex]]
        if (candidate && (!selected || candidate.index < selected.index)) {
          selected = candidate
          selectedList = listIndex
        }
      }
      if (!selected) break
      positions[selectedList]++
      const candidate = selected.message
      if (typeof message.timestamp === 'number' && typeof candidate.timestamp === 'number'
        && Math.abs(message.timestamp - candidate.timestamp) > USER_TEXT_MATCH_WINDOW_MS) continue
      const originalText = selected.text ?? (selected.text = candidate.text.trim())
      if (!originalText || !hostText.includes(originalText)) continue

      nextStoredIndex = selected.index + 1
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
  const storedAssistants = stored.filter((message) => !message.roleMode
    && !isDshContextMessage(message)
    && message.author !== 'user'
    && (message.usage || message.statusNote || message.callout || message.errorCode || message.interrupted
      || message.fileChanges?.length || message.turnActivity || message.subagentOutputs?.length || message.verification))
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
        subagentOutputs: message.subagentOutputs ?? match.subagentOutputs,
        verification: message.verification ?? match.verification,
        statusNote: message.statusNote ?? match.statusNote,
        callout: message.callout ?? match.callout,
        errorCode: message.errorCode ?? match.errorCode,
        interrupted: message.interrupted || match.interrupted,
        fileChanges: message.fileChanges ?? match.fileChanges,
        turnActivity: message.turnActivity ?? match.turnActivity,
      }
    })
  }
  if (sending) {
    const lastStoredUser = [...stored].reverse().find((message) => message.author === 'user')
    // Automatic verification repair prompts are sent within the same turn and
    // never stored; look past them to the user's own latest message.
    const lastDshUser = [...base].reverse().find((message) => message.author === 'user' && !isAutoVerificationPrompt(message.text))
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
  const projectedIds = new Set(base.map((message) => message.id))
  const extras = stored.filter((message) => {
    // Role sessions are intentionally hidden from the active DSH projection.
    // Keep their durable user and assistant rows alongside the regular chat.
    if (message.roleMode) return !projectedIds.has(message.id)
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
    if (message.callout || message.statusNote) return true
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
