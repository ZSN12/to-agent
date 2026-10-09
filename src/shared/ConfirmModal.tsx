import { HelpCircle, Trash2 } from 'lucide-react'
import { useEffect } from 'react'

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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div className="custom-confirm-backdrop" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="custom-confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="custom-confirm-head">
          <div className={`custom-confirm-icon ${confirmDanger ? 'danger' : ''}`}>
            {confirmDanger ? <Trash2 size={20} /> : <HelpCircle size={20} />}
          </div>
          <div>
            <h3 className="custom-confirm-title">{title}</h3>
            <p className="custom-confirm-desc">{description}</p>
          </div>
        </div>
        <div className="custom-confirm-actions">
          <button type="button" className="custom-confirm-btn cancel" onClick={onCancel}>
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
      </div>
    </div>
  )
}
