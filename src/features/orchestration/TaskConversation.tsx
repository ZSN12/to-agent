import { ArrowUp } from 'lucide-react'
import { FormEvent, useState } from 'react'
import type { TaskNode } from '../../types'
import { Message } from '../chat/Message'
import { WorktreeMergeActions } from '../worktree/WorktreeMergeActions'
import { useAutosizeTextarea } from '../../shared/ui-utils'
import { PanelHeader } from './PanelHeader'
import { StatusChip } from './DagPanel'

export function TaskConversation({ task, onBack, onClose, onSend, onCancel }: { task: TaskNode; onBack: () => void; onClose: () => void; onSend: (message: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('')
  const [activeTab, setActiveTab] = useState<'execution' | 'route'>('execution')
  const textareaRef = useAutosizeTextarea(value, 34, 96)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const message = value.trim()
    if (!message) return
    onSend(message)
    setValue('')
  }

  return (
    <aside className="side-panel task-panel" aria-label={`${task.title} 子任务对话`}>
      <PanelHeader title={`${task.id} · ${task.title}`} subtitle={`${task.role} · ${task.model}`} onClose={onClose} back={onBack} />
      <div className="task-summary">
        <StatusChip status={task.status} />
        {(task.status === 'running' || task.status === 'queued') && (
          <button className="task-cancel-button" type="button" onClick={onCancel}>停止此子任务</button>
        )}
        <div className="task-summary-row"><span>任务目标</span><p>{task.description}</p></div>
        {task.executionEvidenceSummary && (
          <div className="task-execution-evidence" role="note">
            <strong>Host 实际工具记录</strong>
            <p>{task.executionEvidenceSummary.label}</p>
            <small>只说明观测到的调用，不代表回答内容已被证明正确。</small>
          </div>
        )}
        <div className="task-summary-tags">{task.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div>
        {task.worktreeIsolated && (task.status === 'done' || task.status === 'review') && (
          <div className="task-worktree-panel">
            <p className="model-editor-note" style={{ margin: '8px 0 4px', fontSize: 12 }}>
              本子任务在独立 worktree 中执行，改动未自动合并到主工作区。
            </p>
            <WorktreeMergeActions taskId={task.id} />
          </div>
        )}
      </div>
      <div className="task-tabs">
        <button className={activeTab === 'execution' ? 'active' : ''} onClick={() => setActiveTab('execution')}>执行对话</button>
        <button className={activeTab === 'route' ? 'active' : ''} onClick={() => setActiveTab('route')}>路由详情</button>
      </div>
      {activeTab === 'execution' ? <>
        <div className="task-thread">
          {task.messages.map((message) => <Message key={message.id} message={message} />)}
        </div>
        <form className="task-composer" onSubmit={submit}>
          <textarea ref={textareaRef} rows={1} value={value} onChange={(event) => setValue(event.target.value)} placeholder="给当前 Agent 补充指令…" aria-label="给当前 Agent 补充指令" />
          <div><span>仅发送给当前子任务</span><button aria-label="发送给当前 Agent" disabled={!value.trim()}><ArrowUp size={18} /></button></div>
        </form>
      </> : <div className="task-route-details">
        <div><span>任务类型</span><strong>{{ research: '调研', implementation: '实现', test: '测试', review: '审查' }[task.taskType ?? 'implementation']}</strong></div>
        <div><span>分配模型</span><strong>{task.model}</strong></div>
        <div><span>底层标识</span><code style={{ fontSize: 11, color: 'var(--text-hint)' }}>{task.modelKey || '—'}</code></div>
        <div><span>路由依据</span><strong>{task.routeReason || '按任务能力和模型可用性分配'}</strong></div>
        <div><span>前置任务</span><strong>{task.dependsOn?.length ? task.dependsOn.join('、') : '无'}</strong></div>
      </div>}
    </aside>
  )
}
