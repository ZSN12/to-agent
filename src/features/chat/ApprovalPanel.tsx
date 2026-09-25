import { ShieldAlert } from 'lucide-react'
import type { PermissionPromptPayload } from '../../shared/app-api'

export function ApprovalPanel({
  prompt,
  onRespond,
}: {
  prompt: PermissionPromptPayload
  onRespond: (action: 'allow-once' | 'allow-always' | 'deny') => void
}) {
  return (
    <div className="approval-panel" role="dialog" aria-labelledby="approval-panel-title">
      <div className="approval-panel-head">
        <ShieldAlert size={16} />
        <strong id="approval-panel-title">需要你的批准</strong>
      </div>
      <p className="approval-panel-reason">TaskWeaver 想要{prompt.reason}。</p>
      <pre className="approval-panel-detail">{prompt.detail}</pre>
      <div className="approval-panel-actions">
        <button type="button" className="approval-btn deny" onClick={() => onRespond('deny')}>拒绝</button>
        <button type="button" className="approval-btn allow" onClick={() => onRespond('allow-once')}>批准一次</button>
        {prompt.allowAlways && (
          <button type="button" className="approval-btn always" onClick={() => onRespond('allow-always')}>
            总是允许该命令
          </button>
        )}
      </div>
    </div>
  )
}
