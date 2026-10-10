import type { ImageAttachmentRef } from '@taskweaver/dsh-attachment'

export type DocumentKind = 'pdf' | 'pptx' | 'docx' | 'xlsx'

export interface DocumentOptions {
  pages?: string
  sheet?: string
  range?: string
  section?: string
  images: boolean
  maxOutputBytes: number
  maxPdfBytes: number
  maxOfficeBytes: number
}

export interface DocumentReadResult {
  outline?: string[]
  content: Array<DocumentContentBlock>
  next?: string
  truncated: boolean
  tokensEstimate: number
}

export type DocumentContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      attachment: ImageAttachmentRef
    }

/** Raw candidate carried only between the parser worker and the Host attachment store. */
export interface DocumentImageCandidate {
  data: Uint8Array
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  name: string
}

/** Internal parser result; image candidates are stripped before the tool result is exposed. */
export interface ParsedDocumentResult extends Omit<DocumentReadResult, 'content'> {
  content: Array<{ type: 'text'; text: string }>
  imageCandidates?: DocumentImageCandidate[]
}

export interface WorkerRequest {
  id: number
  bytes: Uint8Array
  options: DocumentOptions
}

export interface WorkerResponse {
  id: number
  result?: ParsedDocumentResult
  error?: { message: string; code?: string }
}
