import { Zap } from 'lucide-react'

/** DSH 风格：纠偏入队后在会话流末尾以用户气泡样式展示（QueueDock 仅保留 follow-up）。 */
export function PendingSteeringBubble({ text }: { text: string }) {
  return (
    <div className="message user pending-steering-bubble" role="status">
      <div className="message-header">
        <span className="message-author">你</span>
        <span className="pending-steering-badge" title="已加入纠偏队列">
          <Zap size={12} aria-hidden />
          纠偏
        </span>
      </div>
      <div className="message-text">{text}</div>
    </div>
  )
}
