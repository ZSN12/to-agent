import { useCallback, useEffect, useState } from 'react'
import { Clock, Play, Plus, Trash2, Laptop, BookOpen } from 'lucide-react'
import type { ScheduledJob } from '../../shared/app-api'

const INTERVAL_OPTIONS = [
  { label: '每 30 分钟', minutes: 30 },
  { label: '每小时', minutes: 60 },
  { label: '每 6 小时', minutes: 360 },
  { label: '每天', minutes: 24 * 60 },
]

export function SchedulesPanel({
  workspacePath,
  onBack,
  onOpenConversation,
}: {
  workspacePath: string | null
  onBack: () => void
  onOpenConversation: (conversationId: string) => Promise<boolean>
}) {
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('每日巡检')
  const [prompt, setPrompt] = useState('只读扫描工作区：列出昨日以来变更的文件并概括风险点，不要修改文件。')
  const [intervalMinutes, setIntervalMinutes] = useState(24 * 60)
  const [multiAgent, setMultiAgent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [launchAgents, setLaunchAgents] = useState<Record<string, boolean>>({})

  const refreshLaunchAgents = useCallback(async (jobList: ScheduledJob[]) => {
    const bridge = window.taskweaver?.jobs
    if (!bridge?.launchAgentInstalled) return
    const next: Record<string, boolean> = {}
    for (const job of jobList) {
      const res = await bridge.launchAgentInstalled(job.id)
      next[job.id] = Boolean(res?.ok && res.data?.installed)
    }
    setLaunchAgents(next)
  }, [])

  const refresh = useCallback(async () => {
    const bridge = window.taskweaver?.jobs
    if (!bridge?.list) {
      setLoading(false)
      return
    }
    const res = await bridge.list()
    if (res?.ok && res.data) {
      setJobs(res.data)
      await refreshLaunchAgents(res.data)
    }
    setLoading(false)
  }, [refreshLaunchAgents])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleCreate = async () => {
    setError(null)
    const bridge = window.taskweaver?.jobs
    if (!bridge?.upsert) {
      setError('定时任务后端不可用')
      return
    }
    if (!prompt.trim()) {
      setError('请填写任务提示词')
      return
    }
    if (!workspacePath) {
      setError('请先选择工作区，再创建定时任务')
      return
    }
    const res = await bridge.upsert({
      title: title.trim() || '定时任务',
      prompt: prompt.trim(),
      workspacePath,
      intervalMinutes,
      enabled: true,
      multiAgent,
    })
    if (!res?.ok) {
      setError(res?.error ?? '保存失败')
      return
    }
    await refresh()
  }

  const handleRun = async (id: string) => {
    const res = await window.taskweaver?.jobs?.runNow?.(id)
    if (!res?.ok) setError(res?.error ?? '执行失败')
    else await refresh()
  }

  const handleOpenResult = async (job: ScheduledJob) => {
    setError(null)
    if (!job.conversationId || !job.lastRunAt) {
      setError('该任务还没有执行记录')
      return
    }
    if (!(await onOpenConversation(job.conversationId))) setError('找不到这条任务的执行记录')
  }

  const handleRemove = async (id: string) => {
    await window.taskweaver?.jobs?.removeLaunchAgent?.(id)
    await window.taskweaver?.jobs?.remove?.(id)
    await refresh()
  }

  const handleInstallLaunchAgent = async (id: string) => {
    setError(null)
    const res = await window.taskweaver?.jobs?.installLaunchAgent?.(id)
    if (!res?.ok) {
      setError(res?.error ?? '安装 LaunchAgent 失败')
      return
    }
    if (res.data && res.data.ok === false && res.data.reason) {
      setError(res.data.reason)
      return
    }
    await refresh()
  }

  const handleRemoveLaunchAgent = async (id: string) => {
    await window.taskweaver?.jobs?.removeLaunchAgent?.(id)
    await refresh()
  }

  return (
    <div className="codex-marketplace-page schedules-panel">
      <div className="schedules-panel-inner">
        <header className="schedules-header">
          <button type="button" className="ghost-button" onClick={onBack}>返回对话</button>
          <h1><Clock size={22} aria-hidden /> 定时任务</h1>
          <p>应用打开时由进程内调度并支持 DAG；macOS LaunchAgent 可在关闭应用后运行单 Agent headless 任务（需本机已配置模型与 Z Host）。</p>
        </header>

        <section className="schedules-form">
          <h2>新建任务</h2>
          <label>
            标题
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            提示词
            <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </label>
          <label>
            间隔
            <select
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.minutes} value={opt.minutes}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label className="schedules-checkbox">
            <input type="checkbox" checked={multiAgent} onChange={(e) => setMultiAgent(e.target.checked)} />
            使用多 Agent DAG
          </label>
          {!workspacePath && <p className="schedules-error">请先在主界面选择工作区，定时任务需要绑定明确的项目目录。</p>}
          <button type="button" className="codex-btn-primary" disabled={!workspacePath} onClick={() => { void handleCreate() }}>
            <Plus size={16} /> 保存任务
          </button>
          {error && <p className="schedules-error">{error}</p>}
        </section>

        <section className="schedules-list">
          <h2>已保存 {loading ? '…' : `(${jobs.length})`}</h2>
          {jobs.length === 0 && !loading && <p className="schedules-empty">暂无任务</p>}
          {jobs.map((job) => (
            <article key={job.id} className="schedules-row">
              <div>
                <strong>{job.title}</strong>
                <span className="schedules-meta">
                  每 {job.intervalMinutes} 分钟 · {job.multiAgent ? '多 Agent' : '单 Agent'}
                  {job.workspacePath ? ` · ${job.workspacePath}` : ''}
                </span>
                {job.lastRunAt && (
                  <span className="schedules-meta">
                    上次 {new Date(job.lastRunAt).toLocaleString('zh-CN')}
                    {job.lastError ? ` · 失败：${job.lastError}` : ''}
                  </span>
                )}
              </div>
              <div className="schedules-actions">
                <button
                  type="button"
                  className="settings-secondary-button"
                  disabled={!job.lastRunAt}
                  onClick={() => { void handleOpenResult(job) }}
                  title={job.lastRunAt ? '打开该定时任务的执行记录' : '任务尚未运行'}
                >
                  <BookOpen size={14} /> 查看记录
                </button>
                <button type="button" className="settings-secondary-button" onClick={() => { void handleRun(job.id) }}>
                  <Play size={14} /> 立即运行
                </button>
                {launchAgents[job.id] ? (
                  <button type="button" className="settings-secondary-button" title="移除系统 LaunchAgent" onClick={() => { void handleRemoveLaunchAgent(job.id) }}>
                    <Laptop size={14} /> 已装系统任务
                  </button>
                ) : job.multiAgent ? (
                  <button type="button" className="settings-secondary-button" disabled title="关闭应用后的 LaunchAgent 目前只运行单 Agent">
                    <Laptop size={14} /> DAG 需保持 App 运行
                  </button>
                ) : (
                  <button type="button" className="settings-secondary-button" title="安装到 ~/Library/LaunchAgents" onClick={() => { void handleInstallLaunchAgent(job.id) }}>
                    <Laptop size={14} /> 关 App 仍运行
                  </button>
                )}
                <button type="button" className="settings-secondary-button" aria-label="删除" onClick={() => { void handleRemove(job.id) }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  )
}
