import { ArrowLeft, X } from 'lucide-react'

export function PanelHeader({
  title,
  subtitle,
  onClose,
  back,
  hideClose = false,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  back?: () => void
  hideClose?: boolean
}) {
  return (
    <div className="panel-header">
      <div className="panel-heading">
        {back && (
          <button className="panel-icon" onClick={back} aria-label="返回任务 DAG">
            <ArrowLeft size={19} />
          </button>
        )}
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {!hideClose && (
        <button className="panel-icon" onClick={onClose} aria-label="关闭侧栏">
          <X size={20} />
        </button>
      )}
    </div>
  )
}
