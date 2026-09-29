/** 侧栏线程后台状态：运行时旋转，完成后保留绿点直到用户打开会话。 */
export function ThreadRunningIndicator({ status }: { status: 'running' | 'done' | null }) {
  if (!status) return null
  if (status === 'done') {
    return <span className="thread-completed-dot" title="后台任务已完成" aria-label="后台任务已完成" />
  }
  return (
    <span className="thread-running-spinner" title="后台运行中" aria-label="后台运行中">
      <span />
    </span>
  )
}
