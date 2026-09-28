import type { TaskNode } from '../../types'

/**
 * DSH subagent 会话树的轻量对应：用 DAG 依赖边展示「子 Agent」层级（非独立 jsonl 子会话）。
 */
export function SubagentSessionTree({ tasks }: { tasks: TaskNode[] }) {
  if (tasks.length === 0) return null

  const roots = tasks.filter((t) => !t.dependsOn?.length)
  const childrenOf = (id: string) => tasks.filter((t) => t.dependsOn?.includes(id))

  const renderNode = (task: TaskNode, depth: number) => {
    const children = childrenOf(task.id)
    return (
      <li key={task.id} className="subagent-tree-node">
        <div className="subagent-tree-row" style={{ paddingLeft: depth * 14 }}>
          <span className={`subagent-tree-status status-${task.status}`} aria-hidden />
          <span className="subagent-tree-title">{task.title}</span>
          <span className="subagent-tree-meta">{task.role}</span>
        </div>
        {children.length > 0 && (
          <ul className="subagent-tree-children">{children.map((child) => renderNode(child, depth + 1))}</ul>
        )}
      </li>
    )
  }

  return (
    <section className="subagent-session-tree" aria-label="子 Agent 依赖树">
      <header className="subagent-tree-heading">子 Agent 树（DAG）</header>
      <p className="subagent-tree-hint">
        TaskWeaver 用编排 DAG 表达多 Agent；与 DSH 独立 subagent jsonl 并存，不替换目标模式。
      </p>
      <ul className="subagent-tree-list">
        {(roots.length ? roots : tasks).map((task) => renderNode(task, 0))}
      </ul>
    </section>
  )
}
