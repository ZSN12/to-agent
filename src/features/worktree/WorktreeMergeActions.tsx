import { useState } from 'react'

export function WorktreeMergeActions({
  taskId,
  conversationId = null,
  compact = false,
  onDone,
}: {
  taskId: string
  conversationId?: string | null
  compact?: boolean
  onDone?: () => void
}) {
  const [busy, setBusy] = useState(false)

  const preview = async () => {
    setBusy(true)
    const res = await window.taskweaver?.worktree?.previewMerge(taskId, conversationId)
    setBusy(false)
    if (!res?.ok) {
      window.alert(res?.error ?? '检测合并失败')
      return
    }
    if (!res.data.canApply) {
      window.alert(
        res.data.conflict
          ? `无法合并：\n${res.data.reason ?? ''}\n\n${res.data.stat}`
          : `${res.data.reason ?? '无可合并改动'}\n\n${res.data.stat}`,
      )
      return
    }
    window.alert(`可以合并到主工作区：\n\n${res.data.stat}`)
  }

  const diff = async () => {
    setBusy(true)
    const res = await window.taskweaver?.worktree?.diff(taskId, conversationId)
    setBusy(false)
    if (!res?.ok) {
      window.alert(res?.error ?? '无法读取差异')
      return
    }
    window.alert(`任务 ${taskId} worktree 差异：\n\n${`${res.data.stat}\n\n${res.data.patch}`.slice(0, 12000)}`)
  }

  const merge = async () => {
    setBusy(true)
    const previewRes = await window.taskweaver?.worktree?.previewMerge(taskId, conversationId)
    setBusy(false)
    if (!previewRes?.ok) {
      window.alert(previewRes?.error ?? '预览失败')
      return
    }
    if (!previewRes.data.canApply) {
      window.alert(previewRes.data.reason ?? '当前无法合并')
      return
    }
    if (
      !window.confirm(
        `将子任务 ${taskId} 的改动合并到主工作区？\n\n${previewRes.data.stat}\n\n不会自动 git 提交。`,
      )
    ) {
      return
    }
    const removeAfter = window.confirm('合并成功后删除该 worktree？选「取消」则保留。')
    setBusy(true)
    const res = await window.taskweaver?.worktree?.applyMerge(taskId, { removeAfter }, conversationId)
    setBusy(false)
    if (!res?.ok) {
      window.alert(res?.error ?? '合并失败')
      return
    }
    if (res.data.cleanupError) {
      window.alert(`已成功合并到主工作区，但清理 worktree 分支失败（${res.data.cleanupError}）。请稍后手动移除。`)
    } else {
      window.alert(res.data.worktreeRemoved ? '已合并并删除 worktree' : '已合并到主工作区')
    }
    onDone?.()
  }

  const btnClass = compact ? 'settings-secondary-button' : 'settings-secondary-button'
  return (
    <div className="task-worktree-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: compact ? 0 : 8 }}>
      <button type="button" className={btnClass} disabled={busy} onClick={() => { void diff() }}>
        查看差异
      </button>
      <button type="button" className={btnClass} disabled={busy} onClick={() => { void preview() }}>
        检测合并
      </button>
      <button type="button" className="settings-primary-button" disabled={busy} onClick={() => { void merge() }}>
        合并到主工作区
      </button>
    </div>
  )
}
