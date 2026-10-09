import { useMemo } from 'react'
import type { ToolTraceItem } from '../../shared/app-api'
import type { ModifiedFileSummary, TurnActivitySummary } from '../../types'
import {
  computeTurnActivityFromTraces,
  formatTurnActivityLabel,
  mergeTurnActivity,
} from './turn-activity-stats'

export function TurnActivitySummaryRow({
  persisted,
  traces,
  fileChanges,
  isStreaming = false,
}: {
  persisted?: TurnActivitySummary
  traces?: readonly ToolTraceItem[]
  fileChanges?: readonly ModifiedFileSummary[]
  isStreaming?: boolean
}) {
  const activity = useMemo(() => {
    const live = traces?.length || isStreaming
      ? computeTurnActivityFromTraces(traces, fileChanges)
      : null
    return mergeTurnActivity(persisted, live)
  }, [persisted, traces, fileChanges, isStreaming])

  if (!activity) return null

  const label = formatTurnActivityLabel(activity)
  const showDiff = activity.editedFileCount > 0 && activity.linesComplete
    && typeof activity.addedLines === 'number'
    && typeof activity.deletedLines === 'number'

  return (
    <div className="turn-activity-summary" aria-label={label}>
      <span className="turn-activity-summary-text">{label}</span>
      {showDiff && (
        <span className="turn-activity-diff" aria-label={`增加 ${activity.addedLines} 行，删除 ${activity.deletedLines} 行`}>
          <span className="turn-activity-added">+{activity.addedLines}</span>
          <span className="turn-activity-deleted">−{activity.deletedLines}</span>
        </span>
      )}
    </div>
  )
}
