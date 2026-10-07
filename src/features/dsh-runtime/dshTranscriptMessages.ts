import type { DshTranscriptChatMessage, DshTranscriptRow } from '../../shared/app-api'
import type { ChatMessage } from '../../types'

type DshContextMessage = DshTranscriptChatMessage & {
  dshContext: { plugin: string; form?: string }
}

export function isDshContextMessage(message: ChatMessage): message is DshContextMessage {
  const context = (message as DshTranscriptChatMessage).dshContext
  return typeof context?.plugin === 'string' && context.plugin.trim().length > 0
}

function formatMessageTime(timestamp?: number): string {
  if (!timestamp) {
    return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
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
          automatic: row.automatic ?? true,
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
      text: row.text ?? '',
      thinking: row.thinking,
      interrupted: row.interrupted,
      usage: row.usage,
      modelKey: row.modelKey,
    }
  })
}

/** Prefer DSH session transcript; keep TaskWeaver-only rows (multi-agent callouts, IPC errors). */
export function mergeStoredMessagesWithDshTranscript(
  stored: readonly ChatMessage[],
  transcript: readonly DshTranscriptRow[] | undefined,
  preferDsh: boolean,
  sending = false,
): ChatMessage[] {
  if (!preferDsh || !transcript?.length) return [...stored]
  let base = chatMessagesFromDshTranscript(transcript, { user: '你', agent: 'TaskWeaver' })
  const storedAssistants = stored.filter((message) => !isDshContextMessage(message)
    && message.author !== 'user'
    && (message.usage || message.callout || message.interrupted || message.fileChanges?.length))
  if (storedAssistants.length) {
    const matchedMetadata = new Set<number>()
    base = base.map((message) => {
      if (message.author === 'user' || isDshContextMessage(message)) return message
      const index = storedAssistants.findIndex((candidate, index) => !matchedMetadata.has(index)
        && !isDshContextMessage(candidate)
        && candidate.text === message.text
        && (candidate.thinking ?? '').trim() === (message.thinking ?? '').trim())
      if (index < 0) return message
      matchedMetadata.add(index)
      const match = storedAssistants[index]
      return {
        ...message,
        usage: message.usage ?? match.usage,
        modelKey: message.modelKey ?? match.modelKey,
        callout: message.callout ?? match.callout,
        interrupted: message.interrupted || match.interrupted,
        fileChanges: message.fileChanges ?? match.fileChanges,
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
  const matchedCompletedRows = new Set<number>()
  const extras = stored.filter((message) => {
    if (message.id.startsWith('z-turn-')) {
      // The stream commits synchronously; the native projection may lag a turn.
      // Retain that answer until its durable row arrives, matching occurrences
      // rather than globally dropping repeated identical short answers.
      const index = base.findIndex((candidate, index) => !matchedCompletedRows.has(index)
        && candidate.author !== 'user'
        && !isDshContextMessage(candidate)
        && candidate.text === message.text
        && (candidate.thinking ?? '').trim() === (message.thinking ?? '').trim())
      if (index < 0) return true
      matchedCompletedRows.add(index)
      return false
    }
    if (message.interrupted && message.author !== 'user') {
      return !base.some((candidate) =>
        candidate.author !== 'user'
        && !isDshContextMessage(candidate)
        && candidate.interrupted
        && candidate.text === message.text
        && candidate.thinking === message.thinking,
      )
    }
    if (message.callout) return true
    if (message.id.includes('-error')) return true
    if (message.author === 'orchestrator' && message.text?.startsWith('执行失败')) return true
    return false
  })
  if (!extras.length) return base
  const merged = [...base]
  for (const extra of extras) {
    const insertAt = extra.id.startsWith('z-turn-') && extra.timestamp
      ? merged.findIndex(message => message.timestamp && message.timestamp > extra.timestamp!)
      : -1
    if (insertAt < 0) merged.push(extra)
    else merged.splice(insertAt, 0, extra)
  }
  return merged
}
