import { AlertCircle, Check, ChevronRight, Copy, FileCode, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FileDiffData } from '../../shared/app-api'
import { copyTextToClipboard } from '../../shared/clipboard'

function renderDiffPath(fullPath: string) {
  const parts = fullPath.split('/')
  if (parts.length <= 1) {
    return <span className="diff-review-filename">{fullPath}</span>
  }
  const fileName = parts.pop()!
  const parentDir = parts.length > 0 ? parts[parts.length - 1] : ''
  const displayDir = parentDir ? `…/${parentDir}/` : ''
  return (
    <span className="diff-review-path-wrap" title={fullPath}>
      {displayDir && <span className="diff-review-dir">{displayDir}</span>}
      <span className="diff-review-filename">{fileName}</span>
    </span>
  )
}

/**
 * 将多文件 git/unified diff 字符串切分为多个独立的 FileDiffData 结构
 */
export function splitMultiFileDiff(source: FileDiffData): FileDiffData[] {
  const diffText = source.diff || ''
  if (!diffText.trim()) return [source]

  // 分支 1：标准 git diff 格式，以 "diff --git a/..." 开头
  if (/^diff --git /m.test(diffText)) {
    const rawChunks = diffText.split(/(?=^diff --git )/m).filter((c) => c.trim().length > 0)
    if (rawChunks.length > 1) {
      return rawChunks.map((chunk) => {
        const headerMatch = chunk.match(/^diff --git a\/(.+?) b\/(.+?)(?:\r?\n|$)/m)
        const path = headerMatch ? headerMatch[2] : source.path
        const isNewFile = /new file mode/m.test(chunk) || /--- \/dev\/null/m.test(chunk)
        return {
          path,
          diff: chunk,
          type: source.type,
          isNewFile,
        }
      })
    }
  }

  // 分支 2：标准 unified diff 头，以 "--- a/... \n +++ b/..." 区分文件
  const fileHeaderRegex = /(?:^|\n)(?=--- (?:a\/|\/dev\/null))/g
  const matches = [...diffText.matchAll(fileHeaderRegex)]
  if (matches.length > 1) {
    const chunks: FileDiffData[] = []
    let lastIndex = 0
    for (let i = 0; i < matches.length; i++) {
      const matchIndex = matches[i].index!
      if (i > 0) {
        const chunk = diffText.slice(lastIndex, matchIndex).trim()
        if (chunk) {
          const pathMatch = chunk.match(/\+\+\+ (?:b\/)?(.+?)(?:\r?\n|$)/)
          const path = pathMatch ? pathMatch[1] : source.path
          const isNewFile = /--- \/dev\/null/.test(chunk)
          chunks.push({
            path,
            diff: chunk,
            type: source.type,
            isNewFile,
          })
        }
      }
      lastIndex = matchIndex
    }
    const finalChunk = diffText.slice(lastIndex).trim()
    if (finalChunk) {
      const pathMatch = finalChunk.match(/\+\+\+ (?:b\/)?(.+?)(?:\r?\n|$)/)
      const path = pathMatch ? pathMatch[1] : source.path
      const isNewFile = /--- \/dev\/null/.test(finalChunk)
      chunks.push({
        path,
        diff: finalChunk,
        type: source.type,
        isNewFile,
      })
    }
    if (chunks.length > 1) {
      return chunks
    }
  }

  return [source]
}

export interface SingleDiffReviewCardProps {
  fileDiff: FileDiffData
  onReverted?: () => void
  defaultExpanded?: boolean
  expanded?: boolean
  onToggleExpanded?: () => void
}

export function SingleDiffReviewCard({
  fileDiff,
  onReverted,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onToggleExpanded,
}: SingleDiffReviewCardProps) {
  const isControlled = typeof controlledExpanded === 'boolean'
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const expanded = isControlled ? controlledExpanded : internalExpanded

  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [revertingHunk, setRevertingHunk] = useState<number | null>(null)
  const [reverted, setReverted] = useState(false)
  const [revertedHunks, setRevertedHunks] = useState<Set<number>>(() => new Set())
  const [lineLimit, setLineLimit] = useState(500)

  useEffect(() => {
    if (!isControlled) {
      setInternalExpanded(defaultExpanded)
    }
  }, [defaultExpanded, isControlled])

  useEffect(() => {
    setReverted(false)
    setRevertedHunks(new Set())
    setLineLimit(500)
  }, [fileDiff.path, fileDiff.diff])

  // 按需懒加载行数据：仅在展开时切分行，折叠时为 []，不占用大内存与解析开销
  const lines = useMemo(() => {
    if (!expanded) return []
    return (fileDiff.diff || '').split('\n')
  }, [expanded, fileDiff.diff])

  const hunkHeaderCount = useMemo(() => {
    if (!expanded) return 0
    return lines.filter((line) => line.startsWith('@@')).length
  }, [expanded, lines])

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
    for (const l of (fileDiff.diff || '').split('\n')) {
      if (l.startsWith('+') && !l.startsWith('+++')) add++
      else if (l.startsWith('-') && !l.startsWith('---')) del++
    }
    return { add, del }
  }, [fileDiff.diff, fileDiff.addedLines, fileDiff.deletedLines])

  const copyDiff = async () => {
    const didCopy = await copyTextToClipboard(fileDiff.diff)
    setCopied(didCopy)
    setCopyError(!didCopy)
    window.setTimeout(() => {
      setCopied(false)
      setCopyError(false)
    }, 1500)
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

  const handleHeaderClick = () => {
    if (onToggleExpanded) {
      onToggleExpanded()
    } else {
      setInternalExpanded((v) => !v)
    }
  }

  const displayedLines = lines.slice(0, lineLimit)

  return (
    <div className="diff-review-card">
      <div className="diff-review-header" onClick={handleHeaderClick}>
        <div className="diff-review-meta">
          <FileCode size={13} className="diff-review-icon" />
          {renderDiffPath(fileDiff.path)}
          <div className="diff-review-badges">
            {fileDiff.isNewFile && <span className="diff-badge-new">新建</span>}
            {stats.add > 0 && <span className="diff-badge-add">+{stats.add}</span>}
            {stats.del > 0 && <span className="diff-badge-del">-{stats.del}</span>}
          </div>
        </div>

        <div className="diff-review-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`diff-btn${copyError ? ' is-error' : ''}`}
            onClick={copyDiff}
            title={copied ? '已复制 Diff' : copyError ? '复制 Diff 失败' : '复制 Diff'}
          >
            {copied ? <Check size={12} /> : copyError ? <AlertCircle size={12} /> : <Copy size={12} />}
            <span>{copied ? '已复制' : copyError ? '复制失败' : '复制'}</span>
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
              return displayedLines.map((line, idx) => {
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
          {lines.length > lineLimit && (
            <div className="diff-line-load-more">
              <span>已显示前 {lineLimit} 行（共 {lines.length} 行）</span>
              <button
                type="button"
                className="diff-btn"
                onClick={() => setLineLimit(lines.length)}
              >
                展开全部 diff 行
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export interface DiffReviewGroupProps {
  fileDiffs: readonly FileDiffData[]
  onReverted?: () => void
  defaultExpanded?: boolean
}

export function DiffReviewGroup({
  fileDiffs,
  onReverted,
  defaultExpanded,
}: DiffReviewGroupProps) {
  const isLargeSet = fileDiffs.length > 5

  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(() => {
    if (defaultExpanded === false) {
      return new Set()
    }
    if (isLargeSet) {
      // 当变动文件数 > 5 个时，默认只展开前 3 个文件并高亮 diff，其余文件卡片保持折叠
      return new Set([0, 1, 2])
    }
    return new Set(fileDiffs.map((_, i) => i))
  })

  useEffect(() => {
    if (defaultExpanded === false) {
      setExpandedIndices(new Set())
    } else if (fileDiffs.length > 5) {
      setExpandedIndices(new Set([0, 1, 2]))
    } else {
      setExpandedIndices(new Set(fileDiffs.map((_, i) => i)))
    }
  }, [fileDiffs, defaultExpanded])

  const toggleExpanded = (index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedIndices(new Set(fileDiffs.map((_, i) => i)))
  }

  const collapseAll = () => {
    setExpandedIndices(new Set())
  }

  return (
    <div className="diff-reviews-container">
      <div className="diff-reviews-toolbar">
        <div className="diff-reviews-summary">
          <FileCode size={14} className="diff-review-icon" />
          <span>共 {fileDiffs.length} 个变动文件</span>
          {isLargeSet && expandedIndices.size === 3 && (
            <span className="diff-reviews-hint">（已自动折叠部分文件以优化渲染性能）</span>
          )}
        </div>
        <div className="diff-reviews-actions-group">
          <button
            type="button"
            className="diff-btn"
            onClick={expandAll}
            disabled={expandedIndices.size === fileDiffs.length}
          >
            展开所有文件
          </button>
          <button
            type="button"
            className="diff-btn"
            onClick={collapseAll}
            disabled={expandedIndices.size === 0}
          >
            折叠所有文件
          </button>
        </div>
      </div>

      {fileDiffs.map((fileDiff, index) => (
        <SingleDiffReviewCard
          key={`${fileDiff.path}-${index}`}
          fileDiff={fileDiff}
          expanded={expandedIndices.has(index)}
          onToggleExpanded={() => toggleExpanded(index)}
          onReverted={onReverted}
        />
      ))}
    </div>
  )
}

export function DiffReviewCard(props: {
  fileDiff?: FileDiffData | readonly FileDiffData[]
  fileDiffs?: readonly FileDiffData[]
  diffs?: readonly FileDiffData[]
  onReverted?: () => void
  defaultExpanded?: boolean
}) {
  const allFiles = useMemo(() => {
    if (props.fileDiffs && props.fileDiffs.length > 0) {
      return props.fileDiffs
    }
    if (props.diffs && props.diffs.length > 0) {
      return props.diffs
    }
    const fileDiff = props.fileDiff
    if (fileDiff) {
      if (Array.isArray(fileDiff)) {
        return fileDiff
      }
      const single = fileDiff as FileDiffData
      const split = splitMultiFileDiff(single)
      if (split.length > 1) {
        return split
      }
      return [single]
    }
    return []
  }, [props.fileDiff, props.fileDiffs, props.diffs])

  if (!allFiles.length) return null

  if (allFiles.length === 1) {
    return (
      <SingleDiffReviewCard
        fileDiff={allFiles[0]}
        defaultExpanded={props.defaultExpanded}
        onReverted={props.onReverted}
      />
    )
  }

  return (
    <DiffReviewGroup
      fileDiffs={allFiles}
      defaultExpanded={props.defaultExpanded}
      onReverted={props.onReverted}
    />
  )
}
