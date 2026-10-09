import { Bot } from 'lucide-react'
import type { TaskNode, TaskStatus } from '../../types'
import { statusMeta } from '../../shared/ui-utils'
import { SubagentSessionTree } from './SubagentSessionTree'
import { PanelHeader } from './PanelHeader'

export function StatusChip({ status }: { status: TaskStatus }) {
  const meta = statusMeta[status]
  return <span className={`status-chip ${meta.className}`}><i />{meta.label}</span>
}

function TaskCard({ task, onClick }: { task: TaskNode; onClick: () => void }) {
  return (
    <button className={`task-card ${task.status}`} onClick={onClick} style={{ left: `${task.x}%`, top: `${task.y}%` }} aria-label={`打开 ${task.id} ${task.title} 的对话`}>
      <div className="task-card-head"><span className="task-id">{task.id}</span><strong>{task.title}</strong></div>
      <div className="task-card-status"><StatusChip status={task.status} /></div>
      <div className="task-card-meta"><Bot size={14} /><span>{task.role}</span><span className={`tier ${task.tier}`}>{task.tier === 'low' ? '轻量' : task.tier === 'high' ? '高能力' : task.tier === 'balanced' ? '均衡' : '程序执行'}</span></div>
      <p>{task.description}</p>
      <div className="task-card-foot">
        <span>{task.dependsOn?.length ? `依赖 ${task.dependsOn.join('、')}` : '无前置依赖'}</span>
        {task.toolProfile && <span className="task-tool-profile">{task.toolProfile}</span>}
        {task.worktreeIsolated && <span className="task-tool-profile">worktree</span>}
        <span>{task.model}</span>
      </div>
    </button>
  )
}

export function DagPanel({ tasks, onTask, onClose }: { tasks: TaskNode[]; onTask: (task: TaskNode) => void; onClose: () => void }) {
  return (
    <aside className="side-panel dag-panel" aria-label="任务 DAG">
      <PanelHeader
        title="任务 DAG"
        subtitle={tasks.length > 0 ? `${tasks.length} 个子任务` : '多智能体编排启用后显示'}
        onClose={onClose}
      />
      {tasks.length === 0 ? (
        <div className="dag-empty-state">
          <Bot size={22} aria-hidden="true" />
          <strong>暂无编排任务</strong>
          <span>普通请求继续由单 Agent 处理；明确要求多 Agent 或复杂任务适合拆解时，这里会展示实际执行的任务图。</span>
        </div>
      ) : (
        <div className="dag-scroll">
          <SubagentSessionTree tasks={tasks} />
          <div className="dag-canvas">
            <svg className="dag-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {tasks.flatMap((task) => (task.dependsOn ?? []).flatMap((dependencyId) => {
                const dependency = tasks.find((candidate) => candidate.id === dependencyId)
                if (!dependency) return []
                const startX = dependency.x + 14.5
                const startY = dependency.y + 23
                const endX = task.x + 14.5
                const endY = task.y
                return <path key={`${dependency.id}-${task.id}`} d={`M ${startX} ${startY} C ${startX} ${(startY + endY) / 2}, ${endX} ${(startY + endY) / 2}, ${endX} ${endY}`} />
              }))}
            </svg>
            {tasks.map((task) => <TaskCard key={task.id} task={task} onClick={() => onTask(task)} />)}
          </div>
        </div>
      )}
    </aside>
  )
}
