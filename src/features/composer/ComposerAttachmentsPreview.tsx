import { FileText, X } from 'lucide-react'
import type { ComposerDocumentAttachment } from '../../shared/app-api'
import type { ComposerImage } from './image-attachment-validation'
import { AttachmentImagePreview } from '../chat/AttachmentImagePreview'

function attachmentSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export type ComposerAttachmentsPreviewProps = {
  attachments: ComposerImage[]
  documents: ComposerDocumentAttachment[]
  imageProblems: Map<string, string>
  onRemoveImage: (id: string) => void
  onRemoveDocument: (id: string) => void
}

export function ComposerAttachmentsPreview({
  attachments,
  documents,
  imageProblems,
  onRemoveImage,
  onRemoveDocument,
}: ComposerAttachmentsPreviewProps) {
  if (attachments.length === 0 && documents.length === 0) {
    return null
  }

  return (
    <div className="composer-attachments">
      {attachments.map((att) => (
        <div key={att.id} className={`composer-attachment-item${imageProblems.has(att.id) ? ' has-error' : ''}`}>
          {(att.previewUrl || att.data) && (
            <AttachmentImagePreview
              src={att.previewUrl || `data:${att.mediaType};base64,${att.data}`}
              alt={att.name}
            />
          )}
          {imageProblems.has(att.id) && (
            <span className="composer-attachment-error" role="status">
              {imageProblems.get(att.id)}
            </span>
          )}
          <button type="button" onClick={() => onRemoveImage(att.id)} aria-label="移除图片">
            <X size={12} />
          </button>
        </div>
      ))}
      {documents.map((document) => (
        <div
          key={document.id}
          className="composer-document-chip"
          title={
            document.kind === 'doc' || document.kind === 'ppt' || document.kind === 'xls'
              ? '旧版 Office 文档；按需读取，不会一次全部发送。读取时可能需要审批 LibreOffice 转换。'
              : '按需读取，不会一次全部发送'
          }
          data-testid="document-attachment"
        >
          <FileText size={17} aria-hidden="true" />
          <span className="composer-document-details">
            <span className="composer-document-name">{document.name}</span>
            <span className="composer-document-meta">
              {document.kind.toUpperCase()} · {attachmentSizeLabel(document.bytes)}
              {document.kind === 'doc' || document.kind === 'ppt' || document.kind === 'xls' ? ' · 旧格式' : ''}
            </span>
          </span>
          <button type="button" onClick={() => onRemoveDocument(document.id)} aria-label={`移除文档 ${document.name}`}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
