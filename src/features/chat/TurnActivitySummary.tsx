import { useMemo } from 'react'
import type { ToolTraceItem } from '../../shared/app-api'
import type { ModifiedFileSummary, TurnActivitySummary } from '../../types'
import { ToolTraceCard } from './ToolTraceCard'
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
  conversationId,
  onShowToolDetails,
  onOpenWorkspacePath,
}: {
  persisted?: TurnActivitySummary
  traces?: readonly ToolTraceItem[]
  fileChanges?: readonly ModifiedFileSummary[]
  isStreaming?: boolean
  conversationId?: string | null
  onShowToolDetails?: (item: ToolTraceItem) => void
  onOpenWorkspacePath?: (relativePath: string) => void
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
  const details = activity.details ?? []

  return (
    <details className="turn-activity-summary" aria-label={label}>
      <summary className="turn-activity-summary-trigger">
        <span className="turn-activity-summary-text">{label}</span>
        {showDiff && (
          <span className="turn-activity-diff" aria-label={`增加 ${activity.addedLines} 行，删除 ${activity.deletedLines} 行`}>
            <span className="turn-activity-added">+{activity.addedLines}</span>
            <span className="turn-activity-deleted">−{activity.deletedLines}</span>
          </span>
        )}
      </summary>
      <div className="turn-activity-details">
        {details.length ? (
          <>
            <div className="turn-activity-details-heading">本轮工具调用 · {details.length} 项</div>
            {activity.detailsTruncated && <p className="turn-activity-details-note">调用较多，仅保留最近 100 项。</p>}
            <div className="turn-activity-details-list">
              {details.map((detail) => (
                <ToolTraceCard
                  key={detail.id}
                  item={{ ...detail, status: 'done' }}
                  conversationId={conversationId}
                  onShowDetails={onShowToolDetails}
                  onOpenPath={onOpenWorkspacePath}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="turn-activity-details-note">这条旧会话只保存了调用次数，没有保存逐条工具记录。</p>
        )}
      </div>
    </details>
  )
}
