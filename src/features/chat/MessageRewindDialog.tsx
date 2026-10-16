import { AlertTriangle, MessageSquare, Undo2, X } from 'lucide-react'
import { useId } from 'react'
import type { RewindThreadResult } from '../../shared/app-api'
import { useModalFocusTrap } from '../../shared/useModalFocusTrap'
import './MessageRewindDialog.css'

export function MessageRewindDialog({
  mode,
  conflicts = [],
  confirmationToken,
  canRewindCode,
  busy = false,
  error,
  onChoose,
  onConfirmConflicts,
  onCancel,
}: {
  mode?: RewindThreadResult['mode']
  conflicts?: string[]
  confirmationToken?: string | null
  canRewindCode: boolean
  busy?: boolean
  error?: string | null
  onChoose: (mode: RewindThreadResult['mode']) => void
  onConfirmConflicts: () => void
  onCancel: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useModalFocusTrap<HTMLDivElement>({ open: true, onEscape: busy ? undefined : onCancel })
  const needsConflictConfirmation = Boolean(mode && conflicts.length && confirmationToken)

  return (
    <div className="custom-confirm-backdrop" role="presentation" onClick={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel()
    }}>
      <div
        ref={dialogRef}
        className="custom-confirm-card message-rewind-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="custom-confirm-head">
          <div className={`custom-confirm-icon${needsConflictConfirmation ? ' danger' : ''}`}>
            {needsConflictConfirmation ? <AlertTriangle size={20} /> : <Undo2 size={20} />}
          </div>
          <div className="message-rewind-heading">
            <h3 className="custom-confirm-title" id={titleId}>
              {needsConflictConfirmation ? '文件在回退点之后又有改动' : '回到这里'}
            </h3>
            <p className="custom-confirm-desc" id={descriptionId}>
              {needsConflictConfirmation
                ? '继续后会用回退点的内容覆盖这些文件当前的内容。'
                : '选择要恢复的范围。代码回退只还原 Agent 通过编辑和写入工具修改的文件。'}
            </p>
          </div>
          <button type="button" className="message-rewind-close" onClick={onCancel} disabled={busy} aria-label="关闭回退窗口">
            <X size={16} />
          </button>
        </div>

        {needsConflictConfirmation ? (
          <ul className="message-rewind-conflicts" aria-label="发生冲突的文件">
            {conflicts.map((file) => <li key={file}><code>{file}</code></li>)}
          </ul>
        ) : (
          <div className="message-rewind-options">
            <button type="button" className="message-rewind-option is-recommended" onClick={() => onChoose('both')} disabled={busy || !canRewindCode}>
              <Undo2 size={16} />
              <span><strong>代码和对话都回退</strong><small>恢复文件，并从这轮创建一个新分支</small></span>
              <em>推荐</em>
            </button>
            <button type="button" className="message-rewind-option" onClick={() => onChoose('code')} disabled={busy || !canRewindCode}>
              <Undo2 size={16} />
              <span><strong>只回退代码</strong><small>保留当前聊天记录</small></span>
            </button>
            <button type="button" className="message-rewind-option" onClick={() => onChoose('chat')} disabled={busy}>
              <MessageSquare size={16} />
              <span><strong>只回退对话</strong><small>从这轮创建一个新分支，工作区文件不变</small></span>
            </button>
            {!canRewindCode && <p className="message-rewind-note">此会话没有工作区，当前只能回退对话。</p>}
          </div>
        )}

        {error && <p className="message-rewind-error" role="alert">{error}</p>}

        <div className="custom-confirm-actions">
          <button type="button" className="custom-confirm-btn cancel" onClick={onCancel} disabled={busy}>
            取消
          </button>
          {needsConflictConfirmation && (
            <button type="button" className="custom-confirm-btn danger" onClick={onConfirmConflicts} disabled={busy}>
              {busy ? '正在回退…' : '仍然覆盖并回退'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
