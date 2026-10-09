import { Loader2, Minimize2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  COMPACTION_SUGGEST_CLEAR_PERCENT,
  shouldSuggestContextCompaction,
} from '../../shared/context-compaction-policy'

export function CompactSuggestBanner({
  conversationKey,
  contextPercent,
  sending,
  compacting,
  compactedSeq,
  onCompact,
}: {
  conversationKey?: string | null
  contextPercent?: number | null
  sending?: boolean
  /** A Host `/compact` is in flight for this conversation. */
  compacting?: boolean
  /** Increments when a compaction landed for this conversation. */
  compactedSeq?: number
  onCompact: () => void
}) {
  const storageKey = conversationKey ? `tw-compact-suggest-dismiss:${conversationKey}` : null
  const [dismissed, setDismissed] = useState(false)
  const seenSeqRef = useRef<{ key: string | null; seq: number }>({ key: storageKey, seq: compactedSeq ?? 0 })

  const persistDismiss = () => {
    setDismissed(true)
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, '1')
      } catch {
        /* ignore */
      }
    }
  }

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

  // A finished compaction makes the stale context percentage irrelevant: dismiss until it drops below the clear threshold.
  useEffect(() => {
    const seq = compactedSeq ?? 0
    const seen = seenSeqRef.current
    seenSeqRef.current = { key: storageKey, seq }
    if (seen.key === storageKey && seq > seen.seq) persistDismiss()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compactedSeq, storageKey])



  const decision = shouldSuggestContextCompaction({
    contextPercent,
    dismissedForConversation: dismissed,
    sending,
    compacting,
  })

  if (!decision.suggest) return null

  return (
    <div className="compact-suggest-banner" role="status" aria-busy={compacting || undefined}>
      {compacting ? <Loader2 size={16} className="compact-suggest-spin" aria-hidden /> : <Minimize2 size={16} aria-hidden />}
      <p className="compact-suggest-copy">{decision.message}</p>
      <button
        type="button"
        className="compact-suggest-primary"
        disabled={compacting}
        onClick={() => { if (!compacting) onCompact() }}
      >
        {compacting ? '压缩中…' : '压缩上下文'}
      </button>
      <button
        type="button"
        className="compact-suggest-ghost"
        aria-label="本次对话不再提示"
        disabled={compacting}
        onClick={persistDismiss}
      >
        <X size={14} />
      </button>
    </div>
  )
}
