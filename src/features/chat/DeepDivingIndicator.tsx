import { memo, useEffect, useState } from 'react'
import { formatDshRunDuration } from './session-usage'
import { visibleStreamStatusLabel } from './streamActivityLabel'

const ElapsedRunTime = memo(function ElapsedRunTime({ startTime }: { startTime?: number }) {
  const [fallbackStart] = useState(() => Date.now())
  const anchor = startTime ?? fallbackStart
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - anchor))

  useEffect(() => {
    const tick = () => setElapsedMs(Math.max(0, Date.now() - anchor))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [anchor])

  if (elapsedMs < 1000) return null
  return (
    <span className="dsh-diving-timer" aria-live="off">
      {formatDshRunDuration(elapsedMs)}
    </span>
  )
})

/** Shows stable run state; only the isolated elapsed-time child ticks each second. */
export const DeepDivingIndicator = memo(function DeepDivingIndicator({
  startTime,
  isCallingTool = false,
}: {
  startTime?: number
  isCallingTool?: boolean
}) {
  const statusLabel = visibleStreamStatusLabel({ isCallingTool })

  return (
    <div className="dsh-deep-diving-row" role="status" aria-live="polite">
      <span className="dsh-diving-badge">本轮运行中</span>
      <span className="dsh-diving-sub" aria-live="polite">{statusLabel}</span>
      <ElapsedRunTime startTime={startTime} />
    </div>
  )
})
