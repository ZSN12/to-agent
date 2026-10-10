import { Bot, Check, Clock3, Download, Pause, Play, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { TaskNode, TaskStatus } from '../../types'
import type { DagPlanApprovalChanges, DagRunHistoryEntry } from '../../shared/app-api'
import type { ModelOption } from '../../types'
import { statusMeta } from '../../shared/ui-utils'
import { SubagentSessionTree } from './SubagentSessionTree'
import { PanelHeader } from './PanelHeader'
import { buildOrchestrationTraceCsv } from './orchestration-trace-csv.mjs'

export function StatusChip({ status }: { status: TaskStatus }) {
  const meta = statusMeta[status]
  return <span className={`status-chip ${meta.className}`}><i />{meta.label}</span>
}

type PlanDraft = { description: string; acceptanceText: string; modelKey: string; dependenciesText: string }

function DagRunControls({ tasks, conversationId }: { tasks: TaskNode[]; conversationId: string | null }) {
  const runId = tasks.find((task) => ['running', 'paused'].includes(task.runStatus ?? ''))?.runId
  const paused = tasks.some((task) => task.runStatus === 'paused')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!runId) return null

  const togglePause = async () => {
    setBusy(true)
    setError('')
    try {
      const result = paused
        ? await window.taskweaver?.tasks?.resumeRun?.(runId, conversationId)
        : await window.taskweaver?.tasks?.pauseRun?.(runId, conversationId)
      if (!result?.ok) setError(result?.error ?? (paused ? '继续 DAG 失败' : '暂停 DAG 失败'))
      else if (paused) {
        if (!('resumed' in result.data) || !result.data.resumed) setError('该 DAG 当前状态已变化，请刷新后重试')
      } else if (!('paused' in result.data) || !result.data.paused) {
        setError('该 DAG 当前状态已变化，请刷新后重试')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新 DAG 状态失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dag-run-controls">
      <button type="button" disabled={busy} onClick={() => { void togglePause() }}>
        {paused ? <><Play size={14} />继续执行</> : <><Pause size={14} />暂停新节点</>}
      </button>
      {error && <span role="alert">{error}</span>}
      {paused && <span>当前节点继续收尾，调度器不会启动新节点。</span>}
    </div>
  )
}

function PlanApprovalCard({
  tasks,
  conversationId,
  modelOptions,
}: {
  tasks: TaskNode[]
  conversationId: string | null
  modelOptions: ModelOption[]
}) {
  const runId = tasks.find((task) => task.statusLabel === '待审批')?.runId
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>({})
  const [deletedTaskIds, setDeletedTaskIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!runId) return
    setDrafts(Object.fromEntries(tasks.map((task) => [task.id, {
      description: task.description,
      acceptanceText: (task.acceptance ?? []).join('\n'),
      modelKey: task.modelKey ?? '',
      dependenciesText: (task.dependsOn ?? []).join('\n'),
    }])))
    setDeletedTaskIds([])
    setError('')
  }, [runId, tasks])

  if (!runId) return null

  const updateDraft = (taskId: string, patch: Partial<PlanDraft>) => {
    setDrafts((current) => ({ ...current, [taskId]: { ...current[taskId], ...patch } }))
  }
  const approve = async () => {
    setBusy(true)
    setError('')
    const changes: DagPlanApprovalChanges = {
      deletedTaskIds,
      edits: tasks.filter((task) => !deletedTaskIds.includes(task.id)).map((task) => {
        const draft = drafts[task.id] ?? { description: task.description, acceptanceText: '', modelKey: task.modelKey ?? '', dependenciesText: (task.dependsOn ?? []).join('\n') }
        return {
          id: task.id,
          description: draft.description,
          acceptance: draft.acceptanceText.split('\n').map((item) => item.trim()).filter(Boolean),
          modelKey: draft.modelKey,
          dependsOn: draft.dependenciesText.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean),
        }
      }),
    }
    try {
      const result = await window.taskweaver?.tasks?.approvePlan?.(runId, changes, conversationId)
      if (!result?.ok) setError(result?.error ?? '提交计划审批失败')
      else if (!result.data.approved) setError(result.data.error ?? '计划校验失败，请修改后重试')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '提交计划审批失败')
    } finally {
      setBusy(false)
    }
  }
  const reject = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await window.taskweaver?.tasks?.rejectPlan?.(runId, conversationId)
      if (!result?.ok) setError(result?.error ?? '拒绝计划失败')
      else if (!result.data.rejected) setError('该计划已不在等待审批状态')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '拒绝计划失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dag-approval-card" aria-label="DAG 计划审批">
      <header>
        <div><strong>计划待审批</strong><span>批准后才会启动节点。可修改描述、验收点、模型和前置依赖，也可以删除节点。</span></div>
        <span>{tasks.length - deletedTaskIds.length} 个节点</span>
      </header>
      <div className="dag-approval-tasks">
        {tasks.map((task) => {
          const draft = drafts[task.id] ?? { description: task.description, acceptanceText: (task.acceptance ?? []).join('\n'), modelKey: task.modelKey ?? '', dependenciesText: (task.dependsOn ?? []).join('\n') }
          const removed = deletedTaskIds.includes(task.id)
          return (
            <article className={`dag-approval-task${removed ? ' is-deleted' : ''}`} key={task.id}>
              <div className="dag-approval-task-head">
                <strong>{task.id} · {task.title}</strong>
                <button type="button" className="dag-approval-delete" disabled={busy} onClick={() => {
                  setDeletedTaskIds((current) => removed ? current.filter((id) => id !== task.id) : [...current, task.id])
                }}>
                  {removed ? <><X size={13} />恢复节点</> : <><Trash2 size={13} />删除节点</>}
                </button>
              </div>
              {!removed && <>
                <label>任务描述<textarea value={draft.description} disabled={busy} rows={3} onChange={(event) => updateDraft(task.id, { description: event.target.value })} /></label>
                <label>验收点（每行一条）<textarea value={draft.acceptanceText} disabled={busy} rows={2} onChange={(event) => updateDraft(task.id, { acceptanceText: event.target.value })} placeholder="可选；每行填写一个可检查的结果" /></label>
                <label>前置依赖（节点 ID，每行一项）<textarea value={draft.dependenciesText} disabled={busy} rows={2} onChange={(event) => updateDraft(task.id, { dependenciesText: event.target.value })} placeholder="无依赖时留空" /></label>
                <label>执行模型<select value={draft.modelKey} disabled={busy} onChange={(event) => updateDraft(task.id, { modelKey: event.target.value })}>
                  {!modelOptions.some((model) => model.id === draft.modelKey) && <option value={draft.modelKey}>{task.model}</option>}
                  {modelOptions.map((model) => <option key={model.id} value={model.id}>{model.displayName || model.name}</option>)}
                </select></label>
              </>}
            </article>
          )
        })}
      </div>
      {error && <div className="dag-approval-error" role="alert">{error}</div>}
      <footer>
        <button type="button" className="dag-approval-reject" disabled={busy} onClick={() => { void reject() }}><X size={14} />拒绝计划</button>
        <button type="button" className="dag-approval-approve" disabled={busy || tasks.length === deletedTaskIds.length} onClick={() => { void approve() }}><Check size={14} />{busy ? '处理中…' : '批准并运行'}</button>
      </footer>
    </section>
  )
}

function DagReplayControls({ run, tasks, conversationId }: {
  run: DagRunHistoryEntry
  tasks: TaskNode[]
  conversationId: string | null
}) {
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setTaskId(tasks[0]?.id ?? ''), [run.runId, tasks])

  const resume = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await window.taskweaver?.tasks?.resumeCheckpoint?.(run.runId, conversationId)
      if (!result?.ok) setError(result?.error ?? '从断点继续失败')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '从断点继续失败')
    } finally {
      setBusy(false)
    }
  }
  const rerun = async () => {
    if (!taskId) return
    setBusy(true)
    setError('')
    try {
      const result = await window.taskweaver?.tasks?.rerunDownstream?.(run.runId, taskId, conversationId)
      if (!result?.ok) setError(result?.error ?? '重跑节点及下游失败')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重跑节点及下游失败')
    } finally {
      setBusy(false)
    }
  }
  const hasUnfinished = tasks.some((task) => task.status !== 'done' && task.statusLabel !== '已完成')
  const resumable = ['interrupted', 'failed', 'cancelled'].includes(run.status) && hasUnfinished

  return <section className="dag-run-controls" aria-label="恢复或重跑 DAG">
    {resumable && <button type="button" disabled={busy} onClick={() => { void resume() }}><Play size={14} />从断点继续</button>}
    <label>选择节点及其下游
      <select value={taskId} disabled={busy || tasks.length === 0} onChange={(event) => setTaskId(event.target.value)}>
        {tasks.map((task) => <option key={task.id} value={task.id}>{task.id} · {task.title}</option>)}
      </select>
    </label>
    <button type="button" disabled={busy || !taskId} onClick={() => { void rerun() }}><Play size={14} />重跑节点及下游</button>
    {error && <span role="alert">{error}</span>}
  </section>
}

function TaskCard({ task, onClick, readOnly = false }: { task: TaskNode; onClick: () => void; readOnly?: boolean }) {
  return (
    <button className={`task-card ${task.status}`} onClick={onClick} disabled={readOnly} style={{ left: `${task.x}%`, top: `${task.y}%` }} aria-label={readOnly ? `${task.id} ${task.title} 历史任务` : `打开 ${task.id} ${task.title} 的对话`}>
      <div className="task-card-head"><span className="task-id">{task.id}</span><strong>{task.title}</strong></div>
      <div className="task-card-status"><StatusChip status={task.status} /></div>
      <div className="task-card-meta"><Bot size={14} /><span>{task.role}</span><span className={`tier ${task.tier}`}>{task.tier === 'low' ? '轻量' : task.tier === 'high' ? '高能力' : task.tier === 'balanced' ? '均衡' : '程序执行'}</span></div>
      <p>{task.description}</p>
      <div className="task-card-foot">
        <span>{task.dependsOn?.length ? `依赖 ${task.dependsOn.join('、')}` : '无前置依赖'}</span>
        {task.toolProfile && <span className="task-tool-profile">{task.toolProfile}</span>}
        {task.worktreeIsolated && <span className="task-tool-profile">worktree</span>}
        {task.duration && <span className="task-duration" title={task.startedAt && task.endedAt ? `${task.startedAt} → ${task.endedAt}` : undefined}><Clock3 size={11} />{task.duration}</span>}
        <span>{task.model}</span>
      </div>
    </button>
  )
}

export function DagPanel({ tasks, onTask, onClose, conversationId, modelOptions = [] }: { tasks: TaskNode[]; onTask: (task: TaskNode) => void; onClose: () => void; conversationId: string | null; modelOptions?: ModelOption[] }) {
  const liveRunId = tasks.find((task) => task.runId)?.runId ?? null
  const [historyRuns, setHistoryRuns] = useState<DagRunHistoryEntry[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  useEffect(() => setSelectedRunId(null), [conversationId, liveRunId])
  useEffect(() => {
    let active = true
    const loadHistory = async () => {
      const result = await window.taskweaver?.tasks?.listRuns?.(conversationId)
      if (active && result?.ok) setHistoryRuns(result.data)
    }
    if (conversationId) void loadHistory()
    else setHistoryRuns([])
    return () => { active = false }
  }, [conversationId, liveRunId, tasks[0]?.runStatus])
  const selectedRun = historyRuns.find((run) => run.runId === selectedRunId)
  const viewingHistory = Boolean(selectedRun)
  const displayTasks = selectedRun?.tasks ?? tasks
  const canvasHeight = Math.max(640, ((Math.max(0, ...displayTasks.map((task) => task.y)) + 30) / 100) * 640)
  const exportTrace = () => {
    const csv = buildOrchestrationTraceCsv(displayTasks)
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    const runId = displayTasks.find((task) => task.runId)?.runId ?? 'dag'
    anchor.href = url
    anchor.download = `taskweaver-${runId}-trace.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <aside className="side-panel dag-panel" aria-label="任务 DAG">
      <PanelHeader
        title="任务 DAG"
        subtitle={tasks.length > 0 ? `${tasks.length} 个子任务` : '多智能体编排启用后显示'}
        onClose={onClose}
      />
      {tasks.length === 0 && historyRuns.length === 0 ? (
        <div className="dag-empty-state">
          <Bot size={22} aria-hidden="true" />
          <strong>暂无编排任务</strong>
          <span>普通请求继续由单 Agent 处理；明确要求多 Agent 或复杂任务适合拆解时，这里会展示实际执行的任务图。</span>
        </div>
      ) : (
        <div className="dag-scroll">
          {historyRuns.length > 0 && <label className="dag-history-picker">运行记录
            <select value={selectedRunId ?? ''} onChange={(event) => setSelectedRunId(event.target.value || null)}>
              <option value="">当前运行</option>
              {historyRuns.filter((run) => run.runId !== liveRunId).map((run) => <option key={run.runId} value={run.runId}>
                {run.createdAt ? run.createdAt.slice(0, 19).replace('T', ' ') : '未知时间'} · {run.status} · {run.tasks.length} 个节点
              </option>)}
            </select>
          </label>}
          {!viewingHistory && <DagRunControls tasks={tasks} conversationId={conversationId} />}
          {!viewingHistory && <PlanApprovalCard tasks={tasks} conversationId={conversationId} modelOptions={modelOptions} />}
          {viewingHistory && selectedRun && <DagReplayControls run={selectedRun} tasks={displayTasks} conversationId={conversationId} />}
          <button className="dag-export-button" onClick={exportTrace}>
            <Download size={14} aria-hidden="true" />
            导出{viewingHistory ? '此历史运行' : '时间线与用量'} CSV
          </button>
          {displayTasks.length === 0 ? <div className="dag-empty-state"><strong>此运行没有保存节点</strong></div> : <SubagentSessionTree tasks={displayTasks} />}
          <div className="dag-canvas" style={{ height: `${canvasHeight}px` }}>
            <svg className="dag-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {displayTasks.flatMap((task) => (task.dependsOn ?? []).flatMap((dependencyId) => {
                const dependency = displayTasks.find((candidate) => candidate.id === dependencyId)
                if (!dependency) return []
                const startX = dependency.x + 14.5
                const startY = dependency.y + 23
                const endX = task.x + 14.5
                const endY = task.y
                return <path key={`${dependency.id}-${task.id}`} d={`M ${startX} ${startY} C ${startX} ${(startY + endY) / 2}, ${endX} ${(startY + endY) / 2}, ${endX} ${endY}`} />
              }))}
            </svg>
            {displayTasks.map((task) => <TaskCard key={task.id} task={task} readOnly={viewingHistory} onClick={() => { if (!viewingHistory) onTask(task) }} />)}
          </div>
        </div>
      )}
    </aside>
  )
}
