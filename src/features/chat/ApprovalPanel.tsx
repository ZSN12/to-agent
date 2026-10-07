import { ShieldAlert } from 'lucide-react'
import type { PermissionPromptPayload } from '../../shared/app-api'

export function ApprovalPanel({
  prompt,
  onRespond,
}: {
  prompt: PermissionPromptPayload
  onRespond: (
    action: 'allow-once' | 'allow-always' | 'allow-always-session' | 'deny' | 'escalate-once',
    sandboxMode?: 'workspace-write' | 'danger-full-access',
  ) => void
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
        {prompt.allowAlwaysSession && (
          <button type="button" className="approval-btn always" onClick={() => onRespond('allow-always-session')}>
            本会话总是允许
          </button>
        )}
        {prompt.allowAlways && (
          <button type="button" className="approval-btn always" onClick={() => onRespond('allow-always')}>
            保存为规则（工作区）
          </button>
        )}
        {prompt.sandboxEscalation?.targets?.includes('workspace-write') && (
          <button
            type="button"
            className="approval-btn allow"
            onClick={() => onRespond('escalate-once', 'workspace-write')}
          >
            放宽沙箱（工作区可写）并执行一次
          </button>
        )}
        {prompt.sandboxEscalation?.targets?.includes('danger-full-access') && (
          <button
            type="button"
            className="approval-btn always"
            onClick={() => onRespond('escalate-once', 'danger-full-access')}
          >
            临时完全访问（一次）
          </button>
        )}
      </div>
    </div>
  )
}
