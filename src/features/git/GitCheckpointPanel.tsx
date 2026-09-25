import { useEffect, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Copy, GitBranch, GitCommit, History, Plus, RefreshCw, RotateCcw, ShieldCheck, X } from 'lucide-react'
import type { GitCheckpoint, GitCheckpointDiffResult, GitCommitSuggestion, GitStatusResult } from '../../shared/app-api'

export function GitCheckpointPanel({
  workspacePath,
  onClose,
  onToast,
}: {
  workspacePath: string | null
  onClose: () => void
  onToast?: (msg: string) => void
}) {
  const [status, setStatus] = useState<GitStatusResult | null>(null)
  const [suggestion, setSuggestion] = useState<GitCommitSuggestion | null>(null)
  const [checkpoints, setCheckpoints] = useState<GitCheckpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copiedCommit, setCopiedCommit] = useState(false)
  const [expandedDiffId, setExpandedDiffId] = useState<string | null>(null)
  const [diffData, setDiffData] = useState<Record<string, GitCheckpointDiffResult>>({})
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const loadData = async () => {
    if (!workspacePath || !window.taskweaver?.workspace) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [statusRes, suggRes, cpRes] = await Promise.all([
      window.taskweaver.workspace.gitStatus(),
      window.taskweaver.workspace.gitSuggestCommit(),
      window.taskweaver.workspace.listGitCheckpoints(),
    ])

    if (statusRes.ok && statusRes.data) setStatus(statusRes.data)
    if (suggRes.ok && suggRes.data) setSuggestion(suggRes.data)
    if (cpRes.ok && cpRes.data) setCheckpoints(cpRes.data)
    setLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [workspacePath])

  const handleCreateSnapshot = async () => {
    if (!window.taskweaver?.workspace) return
    setCreating(true)
    const res = await window.taskweaver.workspace.createGitCheckpoint({
      summary: '用户手动创建的快照',
    })
    setCreating(false)
    if (res.ok && res.data.checkpoint) {
      onToast?.('已创建当前工作区快照。')
      await loadData()
    } else {
      const errMsg = !res.ok ? res.error : (res.data as { error?: string })?.error || '未知错误'
      onToast?.(`创建快照失败: ${errMsg}`)
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

  const handleRestore = async (cp: GitCheckpoint) => {
    if (!window.taskweaver?.workspace) return
    setRestoringId(cp.id)

    // 第一次尝试还原（检查是否需要二次确认）
    const res = await window.taskweaver.workspace.restoreGitCheckpoint({ checkpointId: cp.id, force: false })
    if (!res.ok) {
      onToast?.(`还原失败: ${res.error}`)
      setRestoringId(null)
      return
    }

    if (res.data.requireConfirm) {
      const addList = (res.data.willAdd || []).slice(0, 4).join('\n  + ')
      const addMore = (res.data.willAdd?.length || 0) > 4 ? `\n  ...等共 ${res.data.willAdd?.length} 个` : ''
      const overwriteList = (res.data.willOverwrite || []).slice(0, 4).join('\n  * ')
      const overwriteMore = (res.data.willOverwrite?.length || 0) > 4 ? `\n  ...等共 ${res.data.willOverwrite?.length} 个` : ''
      const deleteList = (res.data.willDelete || []).slice(0, 4).join('\n  - ')
      const deleteMore = (res.data.willDelete?.length || 0) > 4 ? `\n  ...等共 ${res.data.willDelete?.length} 个` : ''

      let detailMsg = `【还原工作区变更预告】\n还原前系统将自动为您创建一份完整的安全备份快照。\n\n`
      if (res.data.willAdd?.length) detailMsg += `将新增/恢复的文件 (${res.data.willAdd.length} 个):\n  + ${addList}${addMore}\n\n`
      if (res.data.willOverwrite?.length) detailMsg += `将被覆盖的文件 (${res.data.willOverwrite.length} 个):\n  * ${overwriteList}${overwriteMore}\n\n`
      if (res.data.willDelete?.length) detailMsg += `将被移除的文件 (${res.data.willDelete.length} 个):\n  - ${deleteList}${deleteMore}\n\n`
      detailMsg += `是否确认执行安全还原？`

      const confirmed = window.confirm(detailMsg)
      if (!confirmed) {
        setRestoringId(null)
        return
      }

      // 用户确认，强制安全还原
      const forceRes = await window.taskweaver.workspace.restoreGitCheckpoint({ checkpointId: cp.id, force: true })
      if (forceRes.ok && forceRes.data.success) {
        const backupNote = forceRes.data.backupCheckpointId ? `（已自动备份还原前状态 [${forceRes.data.backupCheckpointId}]）` : ''
        onToast?.(`已成功还原至快照 (${new Date(cp.timestamp).toLocaleTimeString()}) ${backupNote}`)
        await loadData()
      } else {
        const errMsg = !forceRes.ok ? forceRes.error : forceRes.data?.message || '还原未成功'
        onToast?.(`还原失败: ${errMsg}`)
      }
    } else if (res.data.success) {
      onToast?.(`已成功还原至快照 (${new Date(cp.timestamp).toLocaleTimeString()})。`)
      await loadData()
    }
    setRestoringId(null)
  }

  const copyCommitMsg = () => {
    if (suggestion?.message) {
      void navigator.clipboard.writeText(suggestion.message)
      setCopiedCommit(true)
      setTimeout(() => setCopiedCommit(false), 2000)
      onToast?.('Commit 建议已复制到剪贴板。')
    }
  }

  return (
    <aside className="side-panel dag-panel" aria-label="Git 状态与检查点快照面板" style={{ width: 440 }}>
      <div className="panel-header">
        <div className="panel-header-title">
          <GitBranch size={17} style={{ marginRight: 6 }} />
          <strong>Git 快照与版本</strong>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            className="settings-secondary-button"
            onClick={loadData}
            title="刷新 Git 状态"
            style={{ padding: '3px 8px', fontSize: 11 }}
          >
            <RefreshCw size={12} className={loading ? 'spinning' : ''} />
          </button>
          <button className="panel-close-btn" onClick={onClose} aria-label="关闭面板">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="dag-scroll" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!workspacePath ? (
          <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-tertiary)' }}>
            请先在左下角选择一个工作区文件夹
          </div>
        ) : !status?.isRepo ? (
          <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-tertiary)' }}>
            当前工作区不是 Git 代码仓库，无法使用版本检查点功能。
          </div>
        ) : (
          <>
            {/* 工作区当前状态卡片 */}
            <div
              style={{
                background: 'var(--bg-secondary)',
                borderRadius: 8,
                border: '1px solid var(--border-color, #e5e7eb)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <GitBranch size={15} color="#3b82f6" />
                  <strong style={{ fontSize: 13 }}>{status.branch || 'HEAD'}</strong>
                  {status.hasChanges ? (
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontWeight: 600 }}>
                      有未提交改动
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', fontWeight: 600 }}>
                      工作区干净
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="settings-primary-button"
                  style={{ padding: '4px 10px', fontSize: 11 }}
                  onClick={handleCreateSnapshot}
                  disabled={creating}
                >
                  <Plus size={12} />
                  {creating ? '创建中…' : '打快照'}
                </button>
              </div>

              {status.stat && (
                <pre
                  style={{
                    margin: '4px 0 0 0',
                    fontFamily: 'monospace',
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap',
                    background: 'rgba(0,0,0,0.03)',
                    padding: '6px 8px',
                    borderRadius: 4,
                  }}
                >
                  {status.stat}
                </pre>
              )}

              {/* Commit 建议 */}
              {suggestion?.message && status.hasChanges && (
                <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px dashed var(--border-color, #e5e7eb)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>推导 Commit Message:</span>
                    <button
                      type="button"
                      onClick={copyCommitMsg}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        fontSize: 10,
                        color: copiedCommit ? '#22c55e' : 'var(--accent-primary, #3b82f6)',
                      }}
                    >
                      {copiedCommit ? <Check size={11} /> : <Copy size={11} />}
                      {copiedCommit ? '已复制' : '复制建议'}
                    </button>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                    {suggestion.message}
                  </div>
                </div>
              )}
            </div>

            {/* 检查点快照历史列表 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <History size={15} />
                  检查点快照历史
                </strong>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  共 {checkpoints.length} 个快照
                </span>
              </div>

              {checkpoints.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--text-tertiary)', fontSize: 12 }}>
                  暂无检查点记录。Agent 执行修改前会自动创建快照，您也可以点击上方“打快照”。
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {checkpoints.map((cp) => {
                    const isExpanded = expandedDiffId === cp.id
                    const diff = diffData[cp.id]
                    const isRestoring = restoringId === cp.id

                    return (
                      <div
                        key={cp.id}
                        style={{
                          background: 'var(--bg-secondary)',
                          borderRadius: 8,
                          border: '1px solid var(--border-color, #e5e7eb)',
                          padding: '10px 12px',
                          fontSize: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <strong style={{ fontSize: 12 }}>{cp.summary}</strong>
                              {cp.hasDirtyChanges && (
                                <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                                  包含未提交改动
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, display: 'block' }}>
                              {new Date(cp.timestamp).toLocaleString()} · {cp.branch} ({cp.headCommit.slice(0, 7)})
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <button
                              type="button"
                              className="settings-secondary-button"
                              style={{ padding: '3px 8px', fontSize: 11 }}
                              onClick={() => void handleRestore(cp)}
                              disabled={isRestoring}
                              title="安全还原到此快照"
                            >
                              <RotateCcw size={11} />
                              {isRestoring ? '还原中…' : '还原'}
                            </button>
                          </div>
                        </div>

                        {/* 查看 Diff 按钮与面板 */}
                        <button
                          type="button"
                          onClick={() => void handleToggleDiff(cp.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            fontSize: 11,
                            padding: 0,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            alignSelf: 'flex-start',
                          }}
                        >
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          <span>{isExpanded ? '收起改动对比' : '查看与当前工作区差异'}</span>
                        </button>

                        {isExpanded && (
                          <div style={{ marginTop: 6, background: 'rgba(0,0,0,0.03)', padding: 8, borderRadius: 6 }}>
                            {!diff ? (
                              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>正在计算代码差异…</div>
                            ) : !diff.diff ? (
                              <div style={{ fontSize: 11, color: '#22c55e' }}>当前工作区与此快照完全一致，无任何改动。</div>
                            ) : (
                              <div>
                                {diff.stat && (
                                  <pre style={{ margin: '0 0 6px 0', fontFamily: 'monospace', fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                                    {diff.stat}
                                  </pre>
                                )}
                                <pre
                                  style={{
                                    margin: 0,
                                    fontFamily: 'monospace',
                                    fontSize: 10,
                                    color: 'var(--text-primary)',
                                    maxHeight: 180,
                                    overflowY: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    background: 'var(--bg-primary, #fff)',
                                    padding: 6,
                                    borderRadius: 4,
                                    border: '1px solid var(--border-color, #e5e7eb)',
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

            <div className="settings-footnote" style={{ marginTop: 10 }}>
              <ShieldCheck size={14} />
              <span>
                TaskWeaver 依托 Git 底层索引构建检查点，完整捕获未跟踪文件与已暂存改动。Agent 执行修改前自动创建快照，还原前无条件前置备份，杜绝静默覆盖或误删工作区数据。
              </span>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
