import { useEffect, useId, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  GitBranch,
  History,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Undo2,
  X,
  FilePlus2,
  FileEdit,
  FileMinus2,
  Info,
} from 'lucide-react'
import type {
  GitCheckpoint,
  GitCheckpointDiffResult,
  GitCommitSuggestion,
  GitStatusResult,
  GitRestoreResult,
  ManualGitCommitPreview,
} from '../../shared/app-api'
import { copyTextToClipboard } from '../../shared/clipboard'
import { useModalFocusTrap } from '../../shared/useModalFocusTrap'

function isGitCommitSnapshot(cp: GitCheckpoint) {
  return cp.kind === 'git_commit'
}

export function GitCheckpointPanel({
  workspacePath,
  onClose,
  onToast,
  embedded = false,
}: {
  workspacePath: string | null
  onClose: () => void
  onToast?: (msg: string) => void
  embedded?: boolean
}) {
  const [status, setStatus] = useState<GitStatusResult | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [suggestion, setSuggestion] = useState<GitCommitSuggestion | null>(null)
  const [checkpoints, setCheckpoints] = useState<GitCheckpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [committing, setCommitting] = useState(false)
  const [commitModalData, setCommitModalData] = useState<ManualGitCommitPreview | null>(null)
  const [commitFeedback, setCommitFeedback] = useState<{ kind: 'info' | 'success' | 'error'; message: string } | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [copiedCommit, setCopiedCommit] = useState(false)
  const [expandedDiffId, setExpandedDiffId] = useState<string | null>(null)
  const [diffData, setDiffData] = useState<Record<string, GitCheckpointDiffResult>>({})
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [branchDialogOpen, setBranchDialogOpen] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [branchBusy, setBranchBusy] = useState<'create' | 'switch' | null>(null)

  // 还原确认弹窗状态
  const [confirmModalData, setConfirmModalData] = useState<{
    checkpoint: GitCheckpoint
    impact: GitRestoreResult
  } | null>(null)
  const commitDialogTitleId = useId()
  const commitDialogDescriptionId = useId()
  const branchDialogTitleId = useId()
  const branchDialogDescriptionId = useId()
  const restoreDialogTitleId = useId()
  const restoreDialogDescriptionId = useId()
  const commitDialogRef = useModalFocusTrap<HTMLDivElement>({
    open: Boolean(commitModalData),
    onEscape: !committing ? () => setCommitModalData(null) : undefined,
  })
  const branchDialogRef = useModalFocusTrap<HTMLFormElement>({
    open: branchDialogOpen,
    onEscape: !branchBusy ? () => setBranchDialogOpen(false) : undefined,
  })
  const restoreDialogRef = useModalFocusTrap<HTMLDivElement>({
    open: Boolean(confirmModalData),
    onEscape: () => setConfirmModalData(null),
  })

  // 还原完成状态（可撤销）
  const [lastRestoreResult, setLastRestoreResult] = useState<{
    targetCpId: string
    backupCpId: string | null
  } | null>(null)

  const loadData = async () => {
    if (!workspacePath || !window.taskweaver?.workspace) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [statusRes, branchRes, suggRes, cpRes] = await Promise.all([
      window.taskweaver.workspace.gitStatus(),
      window.taskweaver.workspace.listGitBranches(),
      window.taskweaver.workspace.gitSuggestCommit(),
      window.taskweaver.workspace.listGitCheckpoints(),
    ])

    if (statusRes.ok && statusRes.data) setStatus(statusRes.data)
    if (branchRes.ok && branchRes.data) {
      setBranches(branchRes.data.branches)
      setSelectedBranch(branchRes.data.currentBranch || '')
    }
    if (suggRes.ok && suggRes.data) setSuggestion(suggRes.data)
    if (cpRes.ok && cpRes.data) setCheckpoints(cpRes.data)
    setLoading(false)
  }

  const handleSwitchBranch = async () => {
    if (!selectedBranch || !window.taskweaver?.workspace?.switchGitBranch) return
    if (status?.hasChanges) {
      onToast?.('工作区有未提交改动，请先提交或暂存后再切换分支。')
      return
    }
    setBranchBusy('switch')
    try {
      const result = await window.taskweaver.workspace.switchGitBranch(selectedBranch)
      if (!result.ok) {
        onToast?.(`切换分支失败：${result.error}`)
        return
      }
      onToast?.(result.data.unchanged ? `当前已在 ${result.data.branch} 分支` : `已切换到 ${result.data.branch}`)
      await loadData()
    } catch (error) {
      onToast?.(`切换分支失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBranchBusy(null)
    }
  }

  const handleCreateBranch = async () => {
    if (!window.taskweaver?.workspace?.createGitBranch) return
    const normalizedName = branchName.trim()
    if (!normalizedName) {
      onToast?.('请输入分支名称')
      return
    }
    setBranchBusy('create')
    try {
      const result = await window.taskweaver.workspace.createGitBranch(normalizedName)
      if (!result.ok) {
        onToast?.(`创建分支失败：${result.error}`)
        return
      }
      setBranchDialogOpen(false)
      setBranchName('')
      onToast?.(`已创建并切换到 ${result.data.branch}；未提交改动已保留在新分支。`)
      await loadData()
    } catch (error) {
      onToast?.(`创建分支失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBranchBusy(null)
    }
  }

  useEffect(() => {
    void loadData()
  }, [workspacePath])

  const handleOpenManualCommit = async () => {
    if (!window.taskweaver?.workspace?.previewManualGitCommit) return
    setCommitting(true)
    const res = await window.taskweaver.workspace.previewManualGitCommit()
    setCommitting(false)
    if (!res.ok || !res.data?.ok) {
      const errMsg = !res.ok ? res.error : res.data?.error || '无法预览提交内容'
      onToast?.(errMsg)
      return
    }
    const preview = res.data
    if (preview.clean || !preview.hasCommittableChanges) {
      onToast?.(`当前工作区干净，HEAD 已是最新快照${preview.headShortSha ? ` (${preview.headShortSha})` : ''}`)
      return
    }
    setCommitMessage(preview.defaultMessage || suggestion?.message || 'chore(taskweaver): create workspace snapshot')
    setCommitFeedback(null)
    setCommitModalData(preview)
  }

  const handleConfirmManualCommit = async () => {
    if (!commitModalData) return
    const createManualGitCommit = window.taskweaver?.workspace?.createManualGitCommit
    if (!createManualGitCommit) {
      setCommitFeedback({ kind: 'error', message: '桌面 Git 提交接口不可用，请重启应用后重试。' })
      return
    }
    setCommitting(true)
    setCommitFeedback({ kind: 'info', message: '正在当前分支创建本地提交，请稍候…' })
    try {
      const res = await createManualGitCommit({
        message: commitMessage,
        expectedPreviewFingerprint: commitModalData.stateFingerprint,
      })
      if (!res.ok) {
        setCommitFeedback({ kind: 'error', message: `提交失败：${res.error || '桌面桥接调用失败'}` })
        return
      }

      const data = res.data
      if (data.stalePreview && data.preview) {
        setCommitModalData(data.preview)
        setCommitMessage(data.preview.defaultMessage || commitMessage)
        setCommitFeedback({ kind: 'info', message: '工作区在预览后发生变化。请核对更新后的文件清单，再次确认提交。' })
        return
      }
      if (!data.ok) {
        setCommitFeedback({ kind: 'error', message: `提交失败：${data.error || 'Git 未能创建提交'}` })
        return
      }
      if (data.clean) {
        setCommitFeedback({
          kind: 'success',
          message: data.message || `工作区已干净${data.headShortSha ? `（${data.headShortSha}）` : ''}`,
        })
        await loadData().catch(() => {})
        return
      }
      if (data.checkpoint) {
        const shortSha = data.commitSha?.slice(0, 7) || data.checkpoint.commitSha?.slice(0, 7)
        setCommitFeedback({
          kind: 'success',
          message: `已在 ${data.branch || commitModalData.branch || '当前分支'} 创建本地提交 ${shortSha || ''}，未推送到远程。`,
        })
        await loadData().catch(() => {})
        return
      }
      setCommitFeedback({ kind: 'error', message: `提交失败：${data.error || 'Git 未返回提交结果'}` })
    } catch (error) {
      setCommitFeedback({
        kind: 'error',
        message: `提交失败：${error instanceof Error ? error.message : String(error)}`,
      })
    } finally {
      setCommitting(false)
    }
  }

  const handleDeleteCheckpoint = async (cpId: string) => {
    if (!window.taskweaver?.workspace?.deleteGitCheckpoint) return
    setDeletingId(cpId)
    const res = await window.taskweaver.workspace.deleteGitCheckpoint(cpId)
    setDeletingId(null)
    if (res.ok) {
      const cp = checkpoints.find((item) => item.id === cpId)
      onToast?.(
        cp && isGitCommitSnapshot(cp)
          ? '已从时间线移除该提交记录（分支上的 commit 仍保留在本地历史中）。'
          : '已删除自动保护快照及底层 Git 引用。',
      )
      await loadData()
    } else {
      onToast?.(`删除快照失败: ${res.error || '未知错误'}`)
    }
  }

  const handleToggleDiff = async (cpId: string) => {
    if (expandedDiffId === cpId) {
      setExpandedDiffId(null)
      return
    }
    setExpandedDiffId(cpId)
    if (!diffData[cpId] && window.taskweaver?.workspace) {
      const res = await window.taskweaver.workspace.getGitCheckpointDiff(cpId)
      if (res.ok && res.data) {
        setDiffData((prev) => ({ ...prev, [cpId]: res.data }))
      }
    }
  }

  // 点击还原按钮
  const handleInitiateRestore = async (cp: GitCheckpoint) => {
    if (!window.taskweaver?.workspace) return
    setRestoringId(cp.id)

    // 第一步：预检（force = false），计算变动影响
    const res = await window.taskweaver.workspace.restoreGitCheckpoint({ checkpointId: cp.id, force: false })
    if (!res.ok) {
      onToast?.(`还原失败: ${res.error}`)
      setRestoringId(null)
      return
    }

    if (res.data.requireConfirm) {
      // 弹出应用内确认弹窗
      setConfirmModalData({ checkpoint: cp, impact: res.data })
    } else if (res.data.success) {
      onToast?.(`已成功还原至快照 (${new Date(cp.timestamp).toLocaleTimeString()})。`)
      await loadData()
    }
    setRestoringId(null)
  }

  // 弹窗中确认执行还原
  const handleConfirmRestore = async () => {
    if (!confirmModalData || !window.taskweaver?.workspace) return
    const cp = confirmModalData.checkpoint
    const expectedFingerprint = confirmModalData.impact.stateFingerprint
    setRestoringId(cp.id)

    const forceRes = await window.taskweaver.workspace.restoreGitCheckpoint({
      checkpointId: cp.id,
      force: true,
      expectedStateFingerprint: expectedFingerprint,
    })
    setRestoringId(null)

    // 若检测到工作区在预览期间发生了变动：刷新预览数据，更新指纹，提示用户再次核实
    if (forceRes.ok && forceRes.data.stateMismatch) {
      setConfirmModalData({
        checkpoint: cp,
        impact: forceRes.data,
      })
      onToast?.('工作区在预览后发生改动，已为您刷新预览列表，请确认最新变更。')
      return
    }

    setConfirmModalData(null)

    if (forceRes.ok && forceRes.data.success) {
      const backupId = forceRes.data.backupCheckpointId || null
      setLastRestoreResult({
        targetCpId: cp.id,
        backupCpId: backupId,
      })
      onToast?.(`已成功还原至快照 (${new Date(cp.timestamp).toLocaleTimeString()})。`)
      await loadData()
    } else {
      const errMsg = !forceRes.ok ? forceRes.error : forceRes.data?.message || '还原未成功'
      onToast?.(`还原失败: ${errMsg}`)
    }
  }

  // 一键撤销还原（回滚备份）
  const handleUndoRestore = async () => {
    if (!lastRestoreResult?.backupCpId || !window.taskweaver?.workspace) return
    const backupId = lastRestoreResult.backupCpId
    setRestoringId(backupId)

    const res = await window.taskweaver.workspace.restoreGitCheckpoint({ checkpointId: backupId, force: true })
    setRestoringId(null)

    if (res.ok && res.data.success) {
      setLastRestoreResult(null)
      onToast?.('已成功撤销还原，工作区恢复至操作前状态。')
      await loadData()
    } else {
      const errMsg = !res.ok ? res.error : res.data?.message || '未知错误'
      onToast?.(`撤销还原失败: ${errMsg}`)
    }
  }

  const [showHelp, setShowHelp] = useState(false)

  // 支持键盘 ESC 退出
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (commitModalData) {
          if (!committing) setCommitModalData(null)
        } else if (confirmModalData) {
          setConfirmModalData(null)
        } else if (branchDialogOpen) {
          if (!branchBusy) setBranchDialogOpen(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [commitModalData, confirmModalData, branchDialogOpen, branchBusy, committing, onClose])

  const copyCommitMsg = async () => {
    if (!suggestion?.message) return
    const didCopy = await copyTextToClipboard(suggestion.message)
    setCopiedCommit(didCopy)
    if (didCopy) {
      setTimeout(() => setCopiedCommit(false), 2000)
      onToast?.('Commit 建议已复制到剪贴板。')
    } else {
      onToast?.('复制 Commit 建议失败。')
    }
  }

  const uncommittedCount = (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0)
  const PanelContainer = embedded ? 'section' : 'aside'

  return (
    <PanelContainer className={`${embedded ? 'workbench-tab-panel' : 'side-panel'} dag-panel git-checkpoint-panel`} aria-label="Git 状态与检查点快照面板" role={embedded ? 'region' : undefined} style={embedded ? undefined : { zIndex: 100 }}>
      {/* 顶部标题栏 */}
      <div className="panel-header">
        <div className="panel-heading">
          <GitBranch size={16} style={{ color: 'var(--accent-primary, #10a37f)' }} />
          <h2>Git 快照与版本</h2>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            type="button"
            className="panel-icon"
            onClick={loadData}
            title="刷新 Git 状态"
            aria-label="刷新 Git 状态"
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          </button>
          {!embedded && (
            <button
              type="button"
              className="panel-close-btn"
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              aria-label="关闭面板"
              title="关闭面板 (Esc)"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="dag-scroll" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!workspacePath ? (
          <div className="dag-empty-state">
            <GitBranch size={28} />
            <strong>未选定工作区</strong>
            <span>请在左下角打开或切换项目文件夹，以启用 Git 快照与版本保护。</span>
          </div>
        ) : !status?.isRepo ? (
          <div className="dag-empty-state">
            <AlertTriangle size={28} />
            <strong>非 Git 代码仓库</strong>
            <span>当前工作区尚未初始化 Git。可在终端运行 <code>git init</code> 后刷新。</span>
          </div>
        ) : (
          <>
            {/* 还原成功后的可撤销横幅 */}
            {lastRestoreResult && lastRestoreResult.backupCpId && (
              <div
                style={{
                  background: 'var(--accent-primary-soft, rgba(16, 163, 127, 0.12))',
                  border: '1px solid var(--accent-primary, #10a37f)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text)' }}>
                  已还原至快照，自动创建备份 <code>[{lastRestoreResult.backupCpId.slice(-6)}]</code>
                </div>
                <button
                  type="button"
                  onClick={handleUndoRestore}
                  disabled={Boolean(restoringId)}
                  className="settings-secondary-button"
                  style={{
                    minHeight: 24,
                    padding: '2px 8px',
                    fontSize: 11,
                    borderColor: 'var(--accent-primary, #10a37f)',
                    color: 'var(--accent-primary, #10a37f)',
                  }}
                >
                  <Undo2 size={12} />
                  <span>撤销还原</span>
                </button>
              </div>
            )}

            {/* 工作区当前状态卡片 */}
            <div
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 10,
                border: '1px solid var(--line)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <GitBranch size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  <strong style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {status.branch || 'HEAD'}
                  </strong>
                  {status.hasChanges ? (
                    <span
                      style={{
                        fontSize: 10.5,
                        padding: '2px 7px',
                        borderRadius: 999,
                        background: 'var(--accent-amber-soft, rgba(245, 158, 11, 0.16))',
                        color: 'var(--accent-amber, #f59e0b)',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      未提交: {uncommittedCount} 文件
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 10.5,
                        padding: '2px 7px',
                        borderRadius: 999,
                        background: 'var(--accent-green-soft, rgba(16, 185, 129, 0.16))',
                        color: 'var(--accent-green, #10b981)',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ✓ 工作区干净
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className={status.hasChanges ? 'settings-primary-button' : 'settings-secondary-button'}
                  style={{
                    minHeight: 28,
                    padding: '0 10px',
                    fontSize: 11.5,
                    opacity: status.hasChanges ? 1 : 0.6,
                    cursor: status.hasChanges ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (status.hasChanges) void handleOpenManualCommit()
                  }}
                  disabled={committing || !status.hasChanges}
                  title={
                    status.hasChanges
                      ? '将当前工作区改动作为一个本地 commit 提交到分支（不会 push）'
                      : '当前工作区无修改'
                  }
                >
                  <Plus size={12} />
                  <span>{committing ? '准备中…' : '提交当前更改'}</span>
                </button>
              </div>

              <div role="group" aria-label="分支管理" style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 9, borderTop: '1px solid var(--line)' }}>
                <label htmlFor="git-branch-select" style={{ fontSize: 11, color: 'var(--text-hint)', whiteSpace: 'nowrap' }}>本地分支</label>
                <select
                  id="git-branch-select"
                  className="settings-text-input"
                  value={selectedBranch}
                  onChange={(event) => setSelectedBranch(event.target.value)}
                  disabled={loading || branchBusy !== null}
                  style={{ flex: '1 1 auto', minWidth: 0, height: 30, padding: '4px 8px', fontSize: 11.5 }}
                  aria-label="选择要切换的本地分支"
                >
                  {!selectedBranch && <option value="">HEAD（游离状态）</option>}
                  {status.branch && status.branch !== 'HEAD (detached)' && !branches.includes(status.branch) && (
                    <option value={status.branch}>{status.branch}</option>
                  )}
                  {branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
                </select>
                <button
                  type="button"
                  className="settings-secondary-button"
                  onClick={() => void handleSwitchBranch()}
                  disabled={loading || branchBusy !== null || !selectedBranch || selectedBranch === status.branch || status.hasChanges}
                  title={status.hasChanges ? '先提交或暂存工作区改动，再切换分支' : '切换到所选本地分支'}
                  style={{ minHeight: 30, padding: '0 9px', fontSize: 11.5 }}
                >
                  {branchBusy === 'switch' ? '切换中…' : '切换'}
                </button>
                <button
                  type="button"
                  className="settings-secondary-button"
                  onClick={() => { setBranchName(''); setBranchDialogOpen(true) }}
                  disabled={loading || branchBusy !== null}
                  title="创建新分支并立即切换过去"
                  style={{ minHeight: 30, padding: '0 9px', fontSize: 11.5 }}
                >
                  <Plus size={12} />
                  <span>新建</span>
                </button>
              </div>
              {status.hasChanges && (
                <div style={{ fontSize: 10.5, color: 'var(--text-hint)', marginTop: -5 }}>
                  切换已有分支前需提交或暂存；新建分支会保留当前未提交改动。
                </div>
              )}

              {/* Commit 建议 */}
              {suggestion?.message && status.hasChanges && (
                <div style={{ paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>推导 Commit Message:</span>
                    <button
                      type="button"
                      onClick={copyCommitMsg}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: 0,
                        fontSize: 11,
                        color: copiedCommit ? 'var(--accent-green, #10b981)' : 'var(--text-secondary)',
                      }}
                    >
                      {copiedCommit ? <Check size={11} /> : <Copy size={11} />}
                      <span>{copiedCommit ? '已复制' : '复制建议'}</span>
                    </button>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: 11,
                      color: 'var(--text)',
                      background: 'var(--bg-app)',
                      padding: '5px 8px',
                      borderRadius: 6,
                      border: '1px solid var(--line)',
                      wordBreak: 'break-all',
                    }}
                  >
                    {suggestion.message}
                  </div>
                </div>
              )}
            </div>

            {/* 检查点快照时间线 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <History size={14} style={{ color: 'var(--text-secondary)' }} />
                  <strong style={{ fontSize: 12.5, color: 'var(--text)' }}>
                    快照时间线
                  </strong>
                  <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>
                    ({checkpoints.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHelp((prev) => !prev)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 5px',
                    fontSize: 11,
                    color: showHelp ? 'var(--accent-primary, #10a37f)' : 'var(--text-hint)',
                  }}
                  title="查看快照与提交机制说明"
                >
                  <Info size={12} />
                  <span>{showHelp ? '收起说明' : '说明'}</span>
                </button>
              </div>

              {/* 轻量帮助说明卡片（可折叠） */}
              {showHelp && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: '9px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--line)',
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: 'var(--text-secondary)',
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <strong style={{ color: 'var(--text)' }}>提交快照：</strong> 在当前分支创建真实本地 commit（可见于 <code>git log</code>，不会 push）。
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text)' }}>保护快照：</strong> Agent 改动前自动创建的安全检查点，不移动 HEAD，仅保存在内部引用中随时可一键撤销。
                  </div>
                </div>
              )}

              {checkpoints.length === 0 ? (
                <div className="dag-empty-state" style={{ padding: '24px 16px', margin: 0 }}>
                  <History size={24} />
                  <strong>暂无检查点记录</strong>
                  <span>Agent 执行代码修改前会自动创建快照备份；您也可以在有修改时点击上方「提交当前更改」。</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {checkpoints.map((cp) => {
                    const isExpanded = expandedDiffId === cp.id
                    const diff = diffData[cp.id]
                    const isRestoring = restoringId === cp.id
                    const isDeleting = deletingId === cp.id
                    const isCommit = isGitCommitSnapshot(cp)

                    return (
                      <div
                        key={cp.id}
                        style={{
                          background: 'var(--bg-surface)',
                          borderRadius: 8,
                          border: '1px solid var(--line)',
                          padding: '10px 12px',
                          fontSize: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          transition: 'border-color 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: 12.5, color: 'var(--text)', wordBreak: 'break-word' }}>
                                {isCommit ? cp.commitMessage || cp.summary : cp.summary}
                              </strong>
                              {isCommit ? (
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    background: 'var(--accent-green-soft, rgba(16, 185, 129, 0.16))',
                                    color: 'var(--accent-green, #10b981)',
                                    fontWeight: 600,
                                    fontFamily: 'var(--font-mono, monospace)',
                                  }}
                                >
                                  Commit {cp.commitSha?.slice(0, 7) || ''}
                                </span>
                              ) : (
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    background: 'var(--accent-blue-soft, rgba(59, 130, 246, 0.16))',
                                    color: 'var(--accent-blue, #3b82f6)',
                                    fontWeight: 600,
                                  }}
                                >
                                  保护快照
                                </span>
                              )}
                              {cp.hasDirtyChanges && !isCommit ? (
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    background: 'var(--accent-amber-soft, rgba(245, 158, 11, 0.16))',
                                    color: 'var(--accent-amber, #f59e0b)',
                                  }}
                                >
                                  {cp.changedFilesCount} 文件
                                </span>
                              ) : null}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 3 }}>
                              {new Date(cp.timestamp).toLocaleString()} · {cp.branch}
                              {isCommit && cp.commitSha ? ` · ${cp.commitSha.slice(0, 7)}` : ` · 基准 ${cp.headCommit.slice(0, 7)}`}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
                            <button
                              type="button"
                              className="settings-secondary-button"
                              style={{ minHeight: 24, padding: '0 8px', fontSize: 11 }}
                              onClick={() => void handleInitiateRestore(cp)}
                              disabled={isRestoring || isDeleting}
                              title="安全还原到此版本"
                            >
                              <RotateCcw size={11} className={isRestoring ? 'spinning' : ''} />
                              <span>{isRestoring ? '还原中…' : '还原'}</span>
                            </button>
                            <button
                              type="button"
                              className="panel-icon"
                              style={{ width: 24, height: 24, padding: 0, color: 'var(--text-hint)' }}
                              onClick={() => void handleDeleteCheckpoint(cp.id)}
                              disabled={isRestoring || isDeleting}
                              title="删除此快照"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        {/* 查看 Diff 按钮 */}
                        <button
                          type="button"
                          onClick={() => void handleToggleDiff(cp.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            fontSize: 11,
                            padding: '2px 0',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            alignSelf: 'flex-start',
                          }}
                        >
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          <span>{isExpanded ? '收起差异比对' : '查看与当前工作区差异'}</span>
                        </button>

                        {/* 展开的 Diff 区域 */}
                        {isExpanded && (
                          <div
                            style={{
                              marginTop: 4,
                              background: 'var(--bg-app)',
                              padding: 8,
                              borderRadius: 6,
                              border: '1px solid var(--line)',
                            }}
                          >
                            {!diff ? (
                              <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>正在计算代码差异…</div>
                            ) : !diff.diff ? (
                              <div style={{ fontSize: 11, color: 'var(--accent-green, #10b981)' }}>
                                ✓ 当前工作区与此快照完全一致，无任何改动。
                              </div>
                            ) : (
                              <div>
                                {diff.stat && (
                                  <pre
                                    style={{
                                      margin: '0 0 6px 0',
                                      fontFamily: 'var(--font-mono, monospace)',
                                      fontSize: 10.5,
                                      color: 'var(--text-secondary)',
                                      whiteSpace: 'pre-wrap',
                                      lineHeight: 1.4,
                                    }}
                                  >
                                    {diff.stat}
                                  </pre>
                                )}
                                <pre
                                  style={{
                                    margin: 0,
                                    fontFamily: 'var(--font-mono, monospace)',
                                    fontSize: 10.5,
                                    color: 'var(--text)',
                                    maxHeight: 180,
                                    overflowY: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    background: 'var(--bg-surface)',
                                    padding: 8,
                                    borderRadius: 6,
                                    border: '1px solid var(--line)',
                                    lineHeight: 1.4,
                                  }}
                                >
                                  {diff.diff}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 安全提示脚注 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 2px',
                color: 'var(--text-hint)',
                fontSize: 11,
              }}
            >
              <ShieldCheck size={13} style={{ color: 'var(--accent-green, #10b981)', flexShrink: 0 }} />
              <span>所有保护快照已持久化；还原前自动备份，随时可安全撤销。</span>
            </div>
          </>
        )}
      </div>

      {branchDialogOpen && (
        <div className="custom-confirm-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !branchBusy) setBranchDialogOpen(false) }}>
          <form
            ref={branchDialogRef}
            className="custom-confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={branchDialogTitleId}
            aria-describedby={branchDialogDescriptionId}
            tabIndex={-1}
            style={{ maxWidth: 440 }}
            onSubmit={(event) => { event.preventDefault(); void handleCreateBranch() }}
          >
            <div className="custom-confirm-head">
              <div className="custom-confirm-icon" style={{ background: 'var(--accent-primary-soft, rgba(16, 163, 127, 0.12))', color: 'var(--accent-primary, #10a37f)' }}>
                <GitBranch size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 className="custom-confirm-title" id={branchDialogTitleId}>新建 Git 分支</h3>
                <p className="custom-confirm-desc" id={branchDialogDescriptionId} style={{ fontSize: 12 }}>
                  创建后会立即切换到新分支。当前未提交改动会保留在新分支中。
                </p>
              </div>
            </div>
            <label htmlFor="git-new-branch-name" style={{ display: 'block', fontSize: 11, color: 'var(--text-hint)', marginBottom: -12 }}>分支名称</label>
            <input
              id="git-new-branch-name"
              type="text"
              className="settings-text-input"
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              placeholder="例如 feature/new-ui"
              autoComplete="off"
              autoFocus
            />
            <div className="custom-confirm-actions">
              <button type="button" className="settings-secondary-button" disabled={branchBusy !== null} onClick={() => setBranchDialogOpen(false)}>
                取消
              </button>
              <button type="submit" className="settings-primary-button" disabled={branchBusy !== null || !branchName.trim()}>
                {branchBusy === 'create' ? '创建中…' : '创建并切换'}
              </button>
            </div>
          </form>
        </div>
      )}

      {commitModalData && (
        <div className="custom-confirm-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !committing) setCommitModalData(null) }}>
          <div ref={commitDialogRef} className="custom-confirm-card" role="dialog" aria-modal="true" aria-labelledby={commitDialogTitleId} aria-describedby={commitDialogDescriptionId} aria-busy={committing} tabIndex={-1} style={{ maxWidth: 520 }}>
            <div className="custom-confirm-head">
              <div className="custom-confirm-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                <GitBranch size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 className="custom-confirm-title" id={commitDialogTitleId}>
                  {commitFeedback?.kind === 'success' ? '提交已完成' : '确认提交快照'}
                </h3>
                <p className="custom-confirm-desc" id={commitDialogDescriptionId} style={{ fontSize: 12 }}>
                  {commitFeedback?.kind === 'success'
                    ? <>快照已写入分支 <strong>{commitModalData.branch || '—'}</strong> 的本地历史，不会上传到远程。</>
                    : <>将在分支 <strong>{commitModalData.branch || '—'}</strong> 上创建一个本地 Git commit，推进当前分支历史；不会上传到远程。</>}
                </p>
              </div>
            </div>

            {commitFeedback && (
              <div
                role={commitFeedback.kind === 'error' ? 'alert' : 'status'}
                aria-live={commitFeedback.kind === 'error' ? 'assertive' : 'polite'}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  margin: '12px 0',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${commitFeedback.kind === 'error' ? 'var(--accent-red, #f87171)' : commitFeedback.kind === 'success' ? 'var(--accent-green, #10b981)' : 'var(--line-strong)'}`,
                  background: commitFeedback.kind === 'error' ? 'var(--accent-red-soft, rgba(248, 113, 113, 0.14))' : commitFeedback.kind === 'success' ? 'var(--accent-green-soft, rgba(16, 185, 129, 0.16))' : 'var(--bg-surface)',
                  color: commitFeedback.kind === 'error' ? 'var(--accent-red, #f87171)' : commitFeedback.kind === 'success' ? 'var(--accent-green, #10b981)' : 'var(--text-secondary)',
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                {commitFeedback.kind === 'error'
                  ? <AlertTriangle size={15} aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 1 }} />
                  : commitFeedback.kind === 'success'
                    ? <Check size={15} aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 1 }} />
                    : <RefreshCw size={14} aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 1, animation: committing ? 'spin 1s linear infinite' : undefined }} />}
                <span>{commitFeedback.message}</span>
              </div>
            )}

            <div style={{ margin: '12px 0', fontSize: 11.5, color: 'var(--text-hint)' }}>
              已跟踪修改 {commitModalData.stagedCount ?? 0}（含暂存）/ 未暂存 {commitModalData.unstagedCount ?? 0} / 未跟踪{' '}
              {commitModalData.untrackedCount ?? 0} · 忽略文件不纳入
            </div>

            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-hint)', marginBottom: 4 }}>提交说明</label>
            <input
              type="text"
              className="settings-text-input"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              disabled={committing || commitFeedback?.kind === 'success'}
              style={{ width: '100%', marginBottom: 10, fontSize: 12 }}
            />

            <div
              style={{
                background: 'var(--bg-app)',
                border: '1px solid var(--line)',
                borderRadius: 6,
                padding: '8px 10px',
                maxHeight: 160,
                overflowY: 'auto',
                marginBottom: 12,
                fontSize: 11,
                fontFamily: 'monospace',
              }}
            >
              {(commitModalData.files || []).length === 0 ? (
                <span style={{ color: 'var(--text-hint)' }}>无文件</span>
              ) : (
                (commitModalData.files || []).map((f) => (
                  <div key={f.file}>{f.change} {f.file}</div>
                ))
              )}
            </div>

            <div className="custom-confirm-actions">
              <button type="button" className="settings-secondary-button" disabled={committing} onClick={() => setCommitModalData(null)}>
                {commitFeedback?.kind === 'success' ? '关闭' : '取消'}
              </button>
              <button
                type="button"
                className="settings-primary-button"
                disabled={committing}
                onClick={() => {
                  if (commitFeedback?.kind === 'success') setCommitModalData(null)
                  else void handleConfirmManualCommit()
                }}
              >
                {committing ? '提交中…' : commitFeedback?.kind === 'success' ? '完成' : '确认提交'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 应用内还原确认弹窗 (CheckpointRestoreModal) */}
      {confirmModalData && (
        <div className="custom-confirm-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setConfirmModalData(null) }}>
          <div ref={restoreDialogRef} className="custom-confirm-card" role="dialog" aria-modal="true" aria-labelledby={restoreDialogTitleId} aria-describedby={restoreDialogDescriptionId} tabIndex={-1} style={{ maxWidth: 480 }}>
            <div className="custom-confirm-head">
              <div className="custom-confirm-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                <AlertTriangle size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 className="custom-confirm-title" id={restoreDialogTitleId}>
                  {isGitCommitSnapshot(confirmModalData.checkpoint) ? '确认回溯到此 Git 提交' : '确认还原自动保护快照'}
                </h3>
                <p className="custom-confirm-desc" id={restoreDialogDescriptionId} style={{ fontSize: 12 }}>
                  {isGitCommitSnapshot(confirmModalData.checkpoint) ? (
                    <>
                      将把当前分支重置到提交{' '}
                      <strong>
                        {confirmModalData.checkpoint.commitSha?.slice(0, 7) || confirmModalData.impact.targetCommitSha?.slice(0, 7)}
                      </strong>
                      ：<em>{confirmModalData.checkpoint.commitMessage || confirmModalData.checkpoint.summary}</em>
                    </>
                  ) : (
                    <>
                      即将将工作区文件恢复到 <strong>{confirmModalData.checkpoint.summary}</strong>
                      （{new Date(confirmModalData.checkpoint.timestamp).toLocaleTimeString()}），分支历史不变。
                    </>
                  )}
                </p>
              </div>
            </div>

            <div style={{ margin: '14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-hint)' }}>
                {isGitCommitSnapshot(confirmModalData.checkpoint) && (confirmModalData.impact.commitsDropped ?? 0) > 0 ? (
                  <span>
                    此操作将丢弃该提交之后的 <strong>{confirmModalData.impact.commitsDropped}</strong> 个本地 commit（未 push 前可能仍可通过 reflog 找回）。不会上传远程。
                  </span>
                ) : null}
                {isGitCommitSnapshot(confirmModalData.checkpoint) && !(confirmModalData.impact.commitsDropped ?? 0) ? (
                  <span>将丢弃当前未提交的改动，使工作区与该提交完全一致。</span>
                ) : null}
                {!isGitCommitSnapshot(confirmModalData.checkpoint) ? (
                  <span>系统将在还原前<strong>自动创建前置保护备份</strong>，还原后可随时一键撤销。</span>
                ) : (
                  <span style={{ display: 'block', marginTop: 6 }}>操作前会自动创建一条<strong>自动保护备份</strong>，便于误操作后恢复文件。</span>
                )}
              </div>

              {/* 影响清单 */}
              <div style={{ background: 'var(--bg-app)', border: '1px solid var(--line)', borderRadius: 6, padding: '10px 12px', maxHeight: 200, overflowY: 'auto' }}>
                {Boolean(confirmModalData.impact.willAdd?.length) && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FilePlus2 size={12} />
                      <span>将新增 / 恢复的文件 ({confirmModalData.impact.willAdd?.length} 个):</span>
                    </div>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 11, color: 'var(--text)' }}>
                      {confirmModalData.impact.willAdd?.slice(0, 5).map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                      {(confirmModalData.impact.willAdd?.length || 0) > 5 && (
                        <li style={{ color: 'var(--text-hint)' }}>…等共 {confirmModalData.impact.willAdd?.length} 个文件</li>
                      )}
                    </ul>
                  </div>
                )}

                {Boolean(confirmModalData.impact.willOverwrite?.length) && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FileEdit size={12} />
                      <span>将被快照内容覆盖的文件 ({confirmModalData.impact.willOverwrite?.length} 个):</span>
                    </div>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 11, color: 'var(--text)' }}>
                      {confirmModalData.impact.willOverwrite?.slice(0, 5).map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                      {(confirmModalData.impact.willOverwrite?.length || 0) > 5 && (
                        <li style={{ color: 'var(--text-hint)' }}>…等共 {confirmModalData.impact.willOverwrite?.length} 个文件</li>
                      )}
                    </ul>
                  </div>
                )}

                {Boolean(confirmModalData.impact.willDelete?.length) && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FileMinus2 size={12} />
                      <span>快照中不存在将被移除的文件 ({confirmModalData.impact.willDelete?.length} 个):</span>
                    </div>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 11, color: '#ef4444' }}>
                      {confirmModalData.impact.willDelete?.slice(0, 5).map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                      {(confirmModalData.impact.willDelete?.length || 0) > 5 && (
                        <li style={{ color: 'var(--text-hint)' }}>…等共 {confirmModalData.impact.willDelete?.length} 个文件</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="custom-confirm-foot">
              <button
                type="button"
                className="custom-confirm-btn cancel"
                onClick={() => setConfirmModalData(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="custom-confirm-btn"
                style={{ background: 'var(--accent-primary, #38bdf8)', color: '#000', border: 'none' }}
                onClick={handleConfirmRestore}
              >
                确认执行安全还原
              </button>
            </div>
          </div>
        </div>
      )}
    </PanelContainer>
  )
}
