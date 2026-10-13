import { Check, ChevronRight, Copy, FileCode, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FileDiffData } from '../../shared/app-api'

export function DiffReviewCard({ fileDiff, onReverted, defaultExpanded = false }: { fileDiff: FileDiffData; onReverted?: () => void; defaultExpanded?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [revertingHunk, setRevertingHunk] = useState<number | null>(null)
  const [reverted, setReverted] = useState(false)
  const [revertedHunks, setRevertedHunks] = useState<Set<number>>(() => new Set())
  const [expanded, setExpanded] = useState(defaultExpanded)

  useEffect(() => {
    setExpanded(defaultExpanded)
  }, [defaultExpanded])

  useEffect(() => {
    setReverted(false)
    setRevertedHunks(new Set())
  }, [fileDiff.path, fileDiff.diff])

  const lines = useMemo(() => {
    return (fileDiff.diff || '').split('\n')
  }, [fileDiff.diff])

  const hunkHeaderCount = useMemo(() => lines.filter((line) => line.startsWith('@@')).length, [lines])
  const canRevertHunks = Boolean(
    !fileDiff.isNewFile
    && hunkHeaderCount > 0
    && fileDiff.reverseEdits?.length === hunkHeaderCount,
  )
  const canRevertCreatedFile = Boolean(fileDiff.isNewFile && fileDiff.createdContentSha256)
  const canRevert = canRevertHunks || canRevertCreatedFile

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
    if (reverting || revertingHunk !== null || reverted || !canRevert || !window.taskweaver) return
    const remainingEdits = canRevertHunks
      ? fileDiff.reverseEdits?.filter((_, index) => !revertedHunks.has(index))
      : undefined
    if (remainingEdits && remainingEdits.length === 0) {
      setReverted(true)
      return
    }
    setReverting(true)
    try {
      const res = await window.taskweaver.workspace.revertDiff(canRevertHunks
        ? { path: fileDiff.path, reverseEdits: remainingEdits }
        : { path: fileDiff.path, createdContentSha256: fileDiff.createdContentSha256 })
      if (res.ok) {
        setReverted(true)
        setRevertedHunks(new Set(fileDiff.reverseEdits?.map((_, index) => index) ?? []))
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

  const revertHunk = async (index: number) => {
    const edit = fileDiff.reverseEdits?.[index]
    if (reverting || revertingHunk !== null || reverted || revertedHunks.has(index) || !edit || !window.taskweaver) return
    setRevertingHunk(index)
    try {
      const res = await window.taskweaver.workspace.revertDiff({ path: fileDiff.path, reverseEdits: [edit] })
      if (res.ok) {
        setRevertedHunks((previous) => new Set(previous).add(index))
        onReverted?.()
      } else {
        alert(res.error || '撤销此段失败')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setRevertingHunk(null)
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

          {canRevert && (
            <button
              type="button"
              className={`diff-btn revert ${reverted ? 'is-reverted' : ''}`}
              disabled={reverting || revertingHunk !== null || reverted}
              onClick={revert}
              title={reverted ? '文件已还原' : canRevertHunks ? '撤销此修改' : '删除这个新建文件（还原前会自动创建检查点）'}
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
            {(() => {
              let hunkIndex = -1
              return lines.map((line, idx) => {
                let type = 'context'
                if (line.startsWith('+') && !line.startsWith('+++')) type = 'add'
                else if (line.startsWith('-') && !line.startsWith('---')) type = 'del'
                else if (line.startsWith('@@')) {
                  type = 'hunk'
                  hunkIndex += 1
                }
                const currentHunk = hunkIndex
                const hunkReverted = revertedHunks.has(currentHunk)

                return (
                  <div key={idx} className={`diff-code-line ${type}`}>
                    <span className="diff-line-number">{idx + 1}</span>
                    <span className="diff-line-content">{line || ' '}</span>
                    {type === 'hunk' && canRevertHunks && (
                      <button
                        type="button"
                        className={`diff-hunk-revert ${hunkReverted ? 'is-reverted' : ''}`}
                        disabled={reverting || revertingHunk !== null || hunkReverted || reverted}
                        onClick={() => { void revertHunk(currentHunk) }}
                        title={hunkReverted ? '此变更块已撤销' : '只撤销这一处变更'}
                      >
                        {revertingHunk === currentHunk ? '撤销中…' : hunkReverted ? '已撤销' : '撤销此段'}
                      </button>
                    )}
                  </div>
                )
              })
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
