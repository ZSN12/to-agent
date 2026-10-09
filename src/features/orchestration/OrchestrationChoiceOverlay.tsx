import { X } from 'lucide-react'

type Props = {
  reason: string
  onConfirmSingle: () => void
  onConfirmMulti: () => void
  onDismiss: () => void
}

export function OrchestrationChoiceOverlay({
  reason,
  onConfirmSingle,
  onConfirmMulti,
  onDismiss,
}: Props) {
  return (
    <div className="orchestration-choice-overlay" role="dialog" aria-modal="true" aria-labelledby="orchestration-choice-title">
      <div className="orchestration-choice-card">
        <h2 id="orchestration-choice-title">是否启用多 Agent？</h2>
        <p>{reason}</p>
        <div className="orchestration-choice-actions">
          <button type="button" className="ghost" onClick={onConfirmSingle}>
            单 Agent 继续
          </button>
          <button type="button" className="primary" onClick={onConfirmMulti}>
            启用多 Agent 编排
          </button>
          <button type="button" className="ghost subtle" onClick={onDismiss} aria-label="取消">
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
