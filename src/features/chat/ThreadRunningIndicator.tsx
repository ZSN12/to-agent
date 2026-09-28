/** 侧栏线程后台运行指示（DSH 多会话并行时的 running 状态）。 */
export function ThreadRunningIndicator({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <span className="thread-running-dot" title="后台运行中" aria-label="后台运行中">
      <span className="thread-running-pulse" />
    </span>
  )
}
