import { Check, ChevronRight, Copy, FileCode, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FileDiffData } from '../../shared/app-api'

export function DiffReviewCard({ fileDiff, onReverted, defaultExpanded = false }: { fileDiff: FileDiffData; onReverted?: () => void; defaultExpanded?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [reverted, setReverted] = useState(false)
  const [expanded, setExpanded] = useState(defaultExpanded)

  useEffect(() => {
    setExpanded(defaultExpanded)
  }, [defaultExpanded])

  const lines = useMemo(() => {
    return (fileDiff.diff || '').split('\n')
  }, [fileDiff.diff])

  const stats = useMemo(() => {
    if (typeof fileDiff.addedLines === 'number' && typeof fileDiff.deletedLines === 'number') {
      return { add: fileDiff.addedLines, del: fileDiff.deletedLines }
    }
    let add = 0
    let del = 0
    for (const l of lines) {
      if (l.startsWith('+') && !l.startsWith('+++')) add++
      else if (l.startsWith('-') && !l.startsWith('---')) del++
    }
    return { add, del }
  }, [lines, fileDiff.addedLines, fileDiff.deletedLines])

  const copyDiff = async () => {
    try {
      await navigator.clipboard.writeText(fileDiff.diff)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  const revert = async () => {
    if (reverting || reverted || !window.taskweaver) return
    setReverting(true)
    try {
      const res = await window.taskweaver.workspace.revertDiff({
        path: fileDiff.path,
        reverseEdits: fileDiff.reverseEdits,
      })
      if (res.ok) {
        setReverted(true)
        onReverted?.()
      } else {
        alert(res.error || '还原失败')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setReverting(false)
    }
  }

  return (
    <div className="diff-review-card">
      <div className="diff-review-header" onClick={() => setExpanded((v) => !v)}>
        <div className="diff-review-meta">
          <FileCode size={13} className="diff-review-icon" />
          <span className="diff-review-path" title={fileDiff.path}>{fileDiff.path}</span>
          <div className="diff-review-badges">
            {fileDiff.isNewFile && <span className="diff-badge-new">新建</span>}
            {stats.add > 0 && <span className="diff-badge-add">+{stats.add}</span>}
            {stats.del > 0 && <span className="diff-badge-del">-{stats.del}</span>}
          </div>
        </div>

        <div className="diff-review-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="diff-btn"
            onClick={copyDiff}
            title={copied ? '已复制 Diff' : '复制 Diff'}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>

          {fileDiff.reverseEdits && fileDiff.reverseEdits.length > 0 && (
            <button
              type="button"
              className={`diff-btn revert ${reverted ? 'is-reverted' : ''}`}
              disabled={reverting || reverted}
              onClick={revert}
              title={reverted ? '文件已还原' : '撤销此修改'}
            >
              <RotateCcw size={12} className={reverting ? 'anim-spin' : ''} />
              <span>{reverting ? '还原中…' : reverted ? '已还原' : '一键还原'}</span>
            </button>
          )}

          <ChevronRight size={13} className={`diff-review-arrow ${expanded ? 'rotated' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="diff-review-body">
          <div className="diff-review-code">
            {lines.map((line, idx) => {
              let type = 'context'
              if (line.startsWith('+') && !line.startsWith('+++')) type = 'add'
              else if (line.startsWith('-') && !line.startsWith('---')) type = 'del'
              else if (line.startsWith('@@')) type = 'hunk'

              return (
                <div key={idx} className={`diff-code-line ${type}`}>
                  <span className="diff-line-number">{idx + 1}</span>
                  <span className="diff-line-content">{line || ' '}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
