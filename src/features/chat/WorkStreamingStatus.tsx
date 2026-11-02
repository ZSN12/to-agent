import { memo, useEffect, useState } from 'react'
import type { ToolTraceItem } from '../../shared/app-api'
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
    <span className="work-streaming-status-time" aria-live="off">
      {formatDshRunDuration(elapsedMs)}
    </span>
  )
})

/** Work-mode live status; Bot conversations never construct this component. */
export const WorkStreamingStatus = memo(function WorkStreamingStatus({
  startTime,
  toolTraceItems,
  activity,
}: {
  startTime?: number
  toolTraceItems?: readonly ToolTraceItem[]
  activity?: string | null
}) {
  const isCallingTool = toolTraceItems?.some((item) => item.status === 'running')
    || /^正在执行(?:\s|工具)/.test(activity?.trim() ?? '')
  const statusLabel = visibleStreamStatusLabel({ isCallingTool })

  return (
    <div className="work-streaming-status" role="status" aria-live="polite">
      <span className="work-streaming-status-label">本轮运行中</span>
      <span className="work-streaming-status-detail" aria-live="polite">{statusLabel}</span>
      <ElapsedRunTime startTime={startTime} />
    </div>
  )
})
