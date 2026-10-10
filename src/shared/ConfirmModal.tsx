import { HelpCircle, Trash2 } from 'lucide-react'
import { useId, useRef } from 'react'
import { useModalFocusTrap } from './useModalFocusTrap'

export function ConfirmModal({
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  confirmDanger = false,
  onConfirm,
  onCancel,
}: {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  confirmDanger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalFocusTrap<HTMLElement>({
    open: true,
    onEscape: onCancel,
    getInitialFocus: () => cancelButtonRef.current,
  })

  return (
    <div
      className="custom-confirm-backdrop"
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onCancel() }}
    >
      <section
        ref={dialogRef}
        className="custom-confirm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="custom-confirm-head">
          <div className={`custom-confirm-icon ${confirmDanger ? 'danger' : ''}`}>
            {confirmDanger ? <Trash2 size={20} /> : <HelpCircle size={20} />}
          </div>
          <div>
            <h3 className="custom-confirm-title" id={titleId}>{title}</h3>
            <p className="custom-confirm-desc" id={descriptionId}>{description}</p>
          </div>
        </div>
        <div className="custom-confirm-actions">
          <button ref={cancelButtonRef} type="button" className="custom-confirm-btn cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`custom-confirm-btn ${confirmDanger ? 'danger' : 'confirm'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
