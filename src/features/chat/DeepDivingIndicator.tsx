import { useEffect, useState } from 'react'
import { formatDshRunDuration } from './session-usage'
import { visibleStreamStatusLabel } from './streamActivityLabel'

/** Mirrors DSH ChatView `TurnStatus`: shimmer label + optional tool chip + clock after 15s. */
export function DeepDivingIndicator({
  startTime,
  activity,
  completedToolCount = 0,
  isThinking = false,
  hasVisibleText = false,
}: {
  startTime?: number
  activity?: string | null
  completedToolCount?: number
  isThinking?: boolean
  hasVisibleText?: boolean
}) {
  const anchor = startTime ?? Date.now()
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - anchor))

  useEffect(() => {
    const tick = () => setElapsedMs(Math.max(0, Date.now() - anchor))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [anchor])

  const showClock = elapsedMs >= 1000
  const clockLabel = formatDshRunDuration(elapsedMs)
  const statusLabel = visibleStreamStatusLabel({ activity, isThinking, hasVisibleText, completedToolCount })
  const progressLabel = completedToolCount > 0 ? `已完成 ${completedToolCount} 次工具调用` : null

  return (
    <div className="dsh-deep-diving-row" role="status" aria-live="polite">
      <span className="dsh-diving-badge">本轮运行中</span>
      <span className="dsh-diving-sub" aria-live="polite">{statusLabel}</span>
      {progressLabel && <span className="dsh-diving-progress">{progressLabel}</span>}
      {showClock && <span className="dsh-diving-timer" aria-live="off">{clockLabel}</span>}
    </div>
  )
}
