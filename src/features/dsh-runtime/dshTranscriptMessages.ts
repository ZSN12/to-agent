import type { DshTranscriptRow } from '../../shared/app-api'
import type { ChatMessage } from '../../types'

function formatMessageTime(timestamp?: number): string {
  if (!timestamp) {
    return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function chatMessagesFromDshTranscript(
  transcript: readonly DshTranscriptRow[],
  names: { user: string; agent: string },
): ChatMessage[] {
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
  const storedAssistants = stored.filter((message) => message.author !== 'user' && message.usage)
  if (storedAssistants.length) {
    base = base.map((message) => {
      if (message.author === 'user' || (message.usage && message.modelKey)) return message
      const match = storedAssistants.find((candidate) => candidate.text === message.text)
      if (!match) return message
      return {
        ...message,
        usage: message.usage ?? match.usage,
        modelKey: message.modelKey ?? match.modelKey,
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
  const extras = stored.filter((message) => {
    if (message.interrupted && message.author !== 'user') {
      return !base.some((candidate) =>
        candidate.author !== 'user'
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
  return [...base, ...extras]
}
