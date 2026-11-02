/** 显示已排队的实时插话内容，并与本轮结束后才发送的排队消息区分开。 */
export function PendingSteeringBubble({ text }: { text: string }) {
  return (
    <div className="message user pending-steering-bubble" role="status">
      <div className="message-header">
        <span className="message-author">你</span>
        <span className="pending-steering-label">插话 · 等待 Agent 接收</span>
      </div>
      <div className="message-text">{text}</div>
    </div>
  )
}
