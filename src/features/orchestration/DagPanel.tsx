import { Bot, Check, Clock3, Pause, Play, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { TaskNode, TaskStatus } from '../../types'
import type { DagPlanApprovalChanges, DagReplayResult, DagRunHistoryEntry } from '../../shared/app-api'
import type { ModelOption } from '../../types'
import { statusMeta } from '../../shared/ui-utils'
import { InlineSelect } from '../../shared/InlineSelect'
import { SubagentSessionTree } from './SubagentSessionTree'
import { PanelHeader } from './PanelHeader'
import { CostSavingsCard } from './CostSavingsCard'

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

function DagResumeControl({ conversationId, activeRunId }: { conversationId: string | null; activeRunId?: string }) {
  const [candidate, setCandidate] = useState<{ runId: string; completed: number; pending: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let disposed = false
    setCandidate(null)
    setError('')
    if (!conversationId || activeRunId) return () => { disposed = true }
    void (async () => {
      try {
        const response = await window.taskweaver?.tasks?.listRuns?.(conversationId)
        if (!response?.ok || !Array.isArray(response.data) || disposed) return
        const latest = response.data[0] as DagRunHistoryEntry | undefined
        if (!latest || !['cancelled', 'interrupted', 'failed'].includes(latest.status)) return
        const completed = latest.tasks.filter((task) => task.status === 'done').length
        const pending = latest.tasks.length - completed
        if (pending > 0) setCandidate({ runId: latest.runId, completed, pending })
      } catch {
        if (!disposed) setError('读取上次 DAG 进度失败')
      }
    })()
    return () => { disposed = true }
  }, [conversationId, activeRunId])

  if (!candidate && !error) return null

  const resume = async () => {
    if (!candidate || !conversationId) return
    setBusy(true)
    setError('')
    try {
      const response = await window.taskweaver?.tasks?.resumeCheckpoint?.(candidate.runId, conversationId)
      if (!response?.ok) setError(response?.error ?? '继续上次 DAG 失败')
      else {
        const result = response.data as DagReplayResult
        if (!Array.isArray(result?.tasks) || result.tasks.length === 0) setError('没有可继续的子任务')
        else setCandidate(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '继续上次 DAG 失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dag-resume-card">
      {candidate && <div>
        <strong>检测到未完成的 DAG</strong>
        <span>已完成 {candidate.completed} 个节点，待继续 {candidate.pending} 个。恢复时会沿用原子 Agent 会话和已保存的工作区进度。</span>
      </div>}
      {candidate && <button type="button" disabled={busy} onClick={() => { void resume() }}>
        <Play size={14} />{busy ? '正在恢复…' : '继续上次任务'}
      </button>}
      {error && <span role="alert">{error}</span>}
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
          const modelChoices = modelOptions.map((model) => ({ value: model.id, label: model.displayName || model.name }))
          if (!modelOptions.some((model) => model.id === draft.modelKey)) {
            modelChoices.unshift({ value: draft.modelKey, label: task.model })
          }
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
                <div className="dag-approval-field">
                  <span>执行模型</span>
                  <InlineSelect
                  className="dag-model-inline-select"
                  value={draft.modelKey}
                  options={modelChoices}
                  onChange={(modelKey) => updateDraft(task.id, { modelKey })}
                  ariaLabel={`任务 ${task.title} 的执行模型`}
                  searchable={modelChoices.length > 8}
                  searchPlaceholder="搜索模型名称…"
                  disabled={busy}
                  />
                </div>
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

function TaskCard({
  task,
  onClick,
  canRerun,
  onRerun,
}: {
  task: TaskNode
  onClick: () => void
  canRerun?: boolean
  onRerun?: (task: TaskNode) => void
}) {
  const routeReason = task.routeReason?.trim()
  const isFailedOrInterrupted = task.status === 'interrupted' || task.status === 'cancelled' || (task.status as string) === 'failed' || (task.status as string) === 'blocked'
  return (
    <div
      className={`task-card ${task.status}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      style={{ left: `${task.x}%`, top: `${task.y}%` }}
      aria-label={`打开 ${task.id} ${task.title} 的对话；执行模型：${task.model}；路由依据：${routeReason || '未提供'}`}
    >
      <div className="task-card-head">
        <span className="task-id">{task.id}</span>
        <strong title={task.title}>{task.title}</strong>
        <div className="task-card-head-actions">
          {canRerun && isFailedOrInterrupted && (
            <button
              type="button"
              className="task-card-retry-btn"
              title="单独重试此失败节点及下游"
              onClick={(e) => {
                e.stopPropagation()
                onRerun?.(task)
              }}
            >
              <RotateCcw size={10} /> 重试
            </button>
          )}
          <span className="task-card-status"><StatusChip status={task.status} /></span>
        </div>
      </div>
      <div className="task-card-meta"><Bot size={14} /><span>{task.role}</span><span className={`tier ${task.tier}`}>{task.tier === 'low' ? '轻量' : task.tier === 'high' ? '高能力' : task.tier === 'balanced' ? '均衡' : '程序执行'}</span></div>
      <p>{task.description}</p>
      {routeReason && (
        <div className="task-card-route" title={routeReason}>
          <span className="task-card-route-label">路由依据</span>
          <span>{routeReason}</span>
        </div>
      )}
      <div className="task-card-foot">
        <span>{task.dependsOn?.length ? `依赖 ${task.dependsOn.join('、')}` : '无前置依赖'}</span>
        {task.toolProfile && <span className="task-tool-profile">{task.toolProfile}</span>}
        {task.worktreeIsolated && <span className="task-tool-profile">worktree</span>}
        {task.duration && <span className="task-duration" title={task.startedAt && task.endedAt ? `${task.startedAt} → ${task.endedAt}` : undefined}><Clock3 size={11} />{task.duration}</span>}
        <span>{task.model}</span>
      </div>
    </div>
  )
}

export function DagPanel({ tasks, onTask, onClose, conversationId, modelOptions = [], embedded = false }: { tasks: TaskNode[]; onTask: (task: TaskNode) => void; onClose: () => void; conversationId: string | null; modelOptions?: ModelOption[]; embedded?: boolean }) {
  const canvasHeight = Math.max(640, ((Math.max(0, ...tasks.map((task) => task.y)) + 30) / 100) * 640)
  const activeRunId = tasks.find((task) => ['running', 'paused', 'awaiting_approval', 'finalizing'].includes(task.runStatus ?? ''))?.runId
  const latestRunId = tasks.find((task) => task.runId)?.runId ?? null
  const canRerun = !activeRunId && Boolean(latestRunId)
  const Container = embedded ? 'section' : 'aside'

  const handleRerun = async (targetTask: TaskNode) => {
    const runId = targetTask.runId || latestRunId
    if (!runId || !conversationId) return
    try {
      await window.taskweaver?.tasks?.rerunDownstream?.(runId, targetTask.id, conversationId)
    } catch {
      // 错误由对话流处理
    }
  }

  return (
    <Container className={`${embedded ? 'workbench-tab-panel' : 'side-panel'} dag-panel`} aria-label="任务 DAG" role={embedded ? 'region' : undefined}>
      <PanelHeader
        title="任务 DAG"
        subtitle={tasks.length > 0 ? `${tasks.length} 个子任务` : '多智能体编排启用后显示'}
        onClose={onClose}
        hideClose={embedded}
      />
      {tasks.length === 0 ? (
        <>
          <DagResumeControl conversationId={conversationId} activeRunId={activeRunId} />
          <div className="dag-empty-state">
            <Bot size={22} aria-hidden="true" />
            <strong>暂无编排任务</strong>
            <span>普通请求继续由单 Agent 处理；明确要求多 Agent 或复杂任务适合拆解时，这里会展示实际执行的任务图。</span>
          </div>
        </>
      ) : (
        <div className="dag-scroll">
          <DagResumeControl conversationId={conversationId} activeRunId={activeRunId} />
          <DagRunControls tasks={tasks} conversationId={conversationId} />
          <CostSavingsCard conversationId={conversationId} runId={latestRunId} active={Boolean(activeRunId)} />
          <PlanApprovalCard tasks={tasks} conversationId={conversationId} modelOptions={modelOptions} />
          <SubagentSessionTree tasks={tasks} />
          <div className="dag-canvas" style={{ height: `${canvasHeight}px` }}>
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
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={() => onTask(task)}
                canRerun={canRerun}
                onRerun={handleRerun}
              />
            ))}
          </div>
        </div>
      )}
    </Container>
  )
}
