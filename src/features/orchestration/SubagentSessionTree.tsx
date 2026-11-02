import { useId, type ReactNode } from 'react'
import type { TaskNode } from '../../types'

interface SubagentTreeNode {
  task: TaskNode
  reference?: 'shared' | 'cycle'
  missingDependencies: string[]
  children: SubagentTreeNode[]
}

/** Each task is expanded once; remaining DAG edges reference that expansion. */
export function buildSubagentSessionTree(tasks: readonly TaskNode[]): SubagentTreeNode[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const children = new Map<string, TaskNode[]>()
  const missing = new Map<string, string[]>()
  const roots: TaskNode[] = []
  for (const task of byId.values()) {
    let knownDependencies = 0
    const missingDependencies: string[] = []
    for (const dependency of new Set(task.dependsOn ?? [])) {
      if (!byId.has(dependency)) {
        missingDependencies.push(dependency)
        continue
      }
      knownDependencies++
      const siblings = children.get(dependency)
      if (siblings) siblings.push(task)
      else children.set(dependency, [task])
    }
    missing.set(task.id, missingDependencies)
    if (knownDependencies === 0) roots.push(task)
  }

  const expanded = new Set<string>()
  const visiting = new Set<string>()
  const visit = (task: TaskNode): SubagentTreeNode => {
    const node: SubagentTreeNode = { task, missingDependencies: missing.get(task.id) ?? [], children: [] }
    if (expanded.has(task.id)) {
      node.reference = visiting.has(task.id) ? 'cycle' : 'shared'
      return node
    }
    expanded.add(task.id)
    visiting.add(task.id)
    node.children = (children.get(task.id) ?? []).map(visit)
    visiting.delete(task.id)
    return node
  }
  const forest = roots.map(visit)
  // Disconnected cycles have no root. Surface them without hiding any tasks.
  for (const task of byId.values()) {
    if (!expanded.has(task.id)) forest.push(visit(task))
  }
  return forest
}

/**
 * DSH subagent 会话树的轻量对应：用 DAG 依赖边展示「子 Agent」层级（非独立 jsonl 子会话）。
 */
export function SubagentSessionTree({ tasks }: { tasks: TaskNode[] }) {
  const treeId = useId()
  if (tasks.length === 0) return null
  const forest = buildSubagentSessionTree(tasks)
  const nodeIds = new Map(tasks.map((task, index) => [task.id, `${treeId}-task-${index}`]))

  const renderNode = (node: SubagentTreeNode, depth: number): ReactNode => {
    const { task, reference, children, missingDependencies } = node
    if (reference) {
      return (
        <li key={task.id} className="subagent-tree-reference">
          <div className="subagent-tree-row" style={{ paddingLeft: depth * 14 }}>
            <span aria-hidden>↪</span>
            <a className="subagent-tree-title" href={`#${nodeIds.get(task.id)}`}>{task.title}</a>
            <span className="subagent-tree-meta">{reference === 'cycle' ? '循环依赖' : '共享节点'} · {task.role}</span>
          </div>
        </li>
      )
    }
    return (
      <li key={task.id} id={nodeIds.get(task.id)} className="subagent-tree-node">
        <div className="subagent-tree-row" style={{ paddingLeft: depth * 14 }}>
          <span className={`subagent-tree-status status-${task.status}`} aria-hidden />
          <span className="subagent-tree-title">{task.title}</span>
          <span className="subagent-tree-meta">{task.role}</span>
          {missingDependencies.length > 0 && (
            <span className="subagent-tree-meta">缺失依赖：{missingDependencies.join('、')}</span>
          )}
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
      <ul className="subagent-tree-list">{forest.map((node) => renderNode(node, 0))}</ul>
    </section>
  )
}
