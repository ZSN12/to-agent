import { FileCode2, Layers, X } from 'lucide-react'
import type { ChangedFileItem } from './changed-files'
import { DiffReviewCard, SingleDiffReviewCard } from './DiffReviewCard'

export function ChangedFileReviewPanel({
  file,
  onClose,
}: {
  file: ChangedFileItem
  onClose: () => void
}) {
  return (
    <aside className="side-panel changed-file-review-panel" aria-label="代码审查">
      <div className="panel-header">
        <div className="panel-header-title changed-file-review-title">
          <FileCode2 size={16} aria-hidden="true" />
          <strong>代码审查</strong>
          <span className="changed-file-review-path" title={file.path}>{file.path}</span>
        </div>
        <button type="button" className="panel-close-btn" onClick={onClose} aria-label="关闭代码审查">
          <X size={15} />
        </button>
      </div>
      <div className="details-panel-body dag-scroll changed-file-review-body">
        <div className="changed-file-review-summary">
          <span>{file.isNewFile ? '新建文件' : '本轮修改'}</span>
          {file.statsComplete && (
            <span className="changed-files-dock-counts">
              <span>+{file.addedLines}</span> <span>−{file.deletedLines}</span>
            </span>
          )}
        </div>
        {file.diffs.length > 0 ? (
          file.diffs.length === 1 ? (
            <DiffReviewCard fileDiff={file.diffs[0]} defaultExpanded />
          ) : (
            <div className="changed-file-review-edits">
              <div className="changed-file-review-edit-count">
                <Layers size={13} aria-hidden />
                <span>此文件共包含 {file.diffs.length} 处工具修改差异</span>
              </div>
              {file.diffs.map((diff, index) => (
                <section className="changed-file-review-edit" key={`${diff.path}-${index}`}>
                  <div className="changed-file-edit-header">
                    <span className="changed-file-edit-pill">变更片段 #{index + 1}</span>
                  </div>
                  <SingleDiffReviewCard fileDiff={diff} defaultExpanded />
                </section>
              ))}
            </div>
          )
        ) : (
          <div className="changed-file-review-empty" role="status">
            <FileCode2 size={20} aria-hidden="true" />
            <strong>当前没有可展示的原始 diff</strong>
            <p>会话保存了文件路径和增删行数，但没有保存工具返回的差异正文。重新执行修改后即可在这里审查具体代码。</p>
          </div>
        )}
      </div>
    </aside>
  )
}
