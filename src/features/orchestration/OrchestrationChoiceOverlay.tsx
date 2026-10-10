import { X } from 'lucide-react'
import { useModalFocusTrap } from '../../shared/useModalFocusTrap'

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
  const dialogRef = useModalFocusTrap<HTMLDivElement>({ open: true, onEscape: onDismiss })
  return (
    <div ref={dialogRef} className="orchestration-choice-overlay" role="dialog" aria-modal="true" aria-labelledby="orchestration-choice-title" aria-describedby="orchestration-choice-reason" tabIndex={-1}>
      <div className="orchestration-choice-card">
        <h2 id="orchestration-choice-title">是否启用多 Agent？</h2>
        <p id="orchestration-choice-reason">{reason}</p>
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
