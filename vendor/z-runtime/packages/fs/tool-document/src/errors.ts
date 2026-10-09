export class DocumentReadError extends Error {
  readonly code: string

  constructor(message: string, code = 'DOCUMENT_READ_ERROR', options?: ErrorOptions) {
    super(message, options)
    this.name = 'DocumentReadError'
    this.code = code
  }
}
