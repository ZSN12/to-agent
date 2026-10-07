import { Minimize2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  COMPACTION_SUGGEST_CLEAR_PERCENT,
  shouldSuggestContextCompaction,
} from '../../shared/context-compaction-policy'

export function CompactSuggestBanner({
  conversationKey,
  contextPercent,
  sending,
  onCompact,
}: {
  conversationKey?: string | null
  contextPercent?: number | null
  sending?: boolean
  onCompact: () => void
}) {
  const storageKey = conversationKey ? `tw-compact-suggest-dismiss:${conversationKey}` : null
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!storageKey) {
      setDismissed(false)
      return
    }
    try {
      setDismissed(window.localStorage.getItem(storageKey) === '1')
    } catch {
      setDismissed(false)
    }
  }, [storageKey])

  useEffect(() => {
    if (!storageKey || !Number.isFinite(contextPercent)) return
    if (contextPercent! < COMPACTION_SUGGEST_CLEAR_PERCENT) {
      try {
        window.localStorage.removeItem(storageKey)
      } catch {
        /* ignore */
      }
      setDismissed(false)
    }
  }, [contextPercent, storageKey])

  const decision = shouldSuggestContextCompaction({
    contextPercent,
    dismissedForConversation: dismissed,
    sending,
  })

  if (!decision.suggest) return null

  const dismiss = () => {
    setDismissed(true)
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, '1')
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <div className="compact-suggest-banner" role="status">
      <Minimize2 size={16} aria-hidden />
      <p className="compact-suggest-copy">{decision.message}</p>
      <button type="button" className="compact-suggest-primary" onClick={onCompact}>
        压缩上下文
      </button>
      <button type="button" className="compact-suggest-ghost" aria-label="本次对话不再提示" onClick={dismiss}>
        <X size={14} />
      </button>
    </div>
  )
}
