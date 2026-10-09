import type { Context } from '@z/cordis'
import { FsError } from '@z/dsh-fs'
import type { GenericCallView } from '@z/dsh-tools'
import { defineTool } from '@z/dsh-tools'
import z from '@z/schemastery'
import { resolveRegularReadTarget } from '@z/dsh-tool-fs/src/read-target.ts'
import type { DocumentOptions, DocumentReadResult } from './protocol.ts'
import { documentWorkerPool } from './worker-pool.ts'

export const name = 'tool-document'
export const inject = ['tools', 'fs', 'systemPrompt']

export interface Config {
  /** Output ceiling aligned with the fs readMaxBytes default. */
  readMaxBytes?: number
  /** Small enough to stay well below the PDF worker's transfer overhead. */
  maxFileReadBytes?: number
}

export const Config: z<Config> = z.object({
  readMaxBytes: z.number().default(50 * 1024),
  maxFileReadBytes: z.number().default(100 * 1024 * 1024),
})

function positiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 512) throw new Error('tool-document: ' + name + ' must be an integer of at least 512')
}

function parseArgs(args: {
  path?: string
  pages?: string
  sheet?: string
  range?: string
  section?: string
  images?: boolean
}): { path: string; options: Omit<DocumentOptions, 'maxOutputBytes'> } {
  if (typeof args.path !== 'string' || args.path.trim().length === 0) throw new Error('path must be a non-empty document path')
  for (const [name, value] of [['pages', args.pages], ['sheet', args.sheet], ['range', args.range], ['section', args.section]] as const) {
    if (value !== undefined && (typeof value !== 'string' || value.trim().length === 0)) throw new Error(name + ' must be a non-empty string when provided')
  }
  return {
    path: args.path,
    options: {
      ...(args.pages !== undefined ? { pages: args.pages } : {}),
      ...(args.sheet !== undefined ? { sheet: args.sheet } : {}),
      ...(args.range !== undefined ? { range: args.range } : {}),
      ...(args.section !== undefined ? { section: args.section } : {}),
      images: args.images ?? false,
    },
  }
}

const outputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    outline: { type: 'array', items: { type: 'string' } },
    content: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['text'], required: true },
          text: { type: 'string', required: true },
        },
      },
    },
    next: { type: 'string' },
    truncated: { type: 'boolean', required: true },
    tokensEstimate: { type: 'integer', required: true },
  },
} as const

export function apply(ctx: Context, config: Config): void {
  const maxBytes = config.readMaxBytes ?? 50 * 1024
  const maxFileBytes = config.maxFileReadBytes ?? 100 * 1024 * 1024
  positiveInteger('readMaxBytes', maxBytes)
  positiveInteger('maxFileReadBytes', maxFileBytes)
  if (maxFileBytes > 100 * 1024 * 1024) throw new Error('tool-document: maxFileReadBytes cannot exceed the 100 MB PDF parser limit')
  ctx.systemPrompt.section({
    name: 'tool:read_document',
    order: 110,
    text: 'Use read_document for PDF, PPTX, DOCX, and XLSX files. It reads through the filesystem sandbox. Large documents first return an outline; continue with pages, section, sheet, or range from next. A call returns at most 20 PDF pages or slides, one worksheet range, or selected document sections.',
  })
  ctx.tools.register(defineTool({
    name: 'read_document',
    description: 'Read bounded text from PDF, PPTX, DOCX, or XLSX. Reads files through the filesystem sandbox and returns an outline first when a document exceeds a per-call limit.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path to the document, resolved by the filesystem backend.' },
      pages: { type: 'string', description: 'PDF page or PPTX slide range, for example 1-5. Maximum 20 each call.' },
      sheet: { type: 'string', description: 'XLSX worksheet name or 1-based index. One worksheet per call.' },
      range: { type: 'string', description: 'XLSX cell range in A1 notation, for example A1:Z200. Maximum 200 rows by 50 columns.' },
      section: { type: 'string', description: 'DOCX heading section number or range, for example 2 or 2-3.' },
      images: { type: 'boolean', description: 'Request embedded/scanned page images when supported by the active image pipeline.' },
    },
    output: {
      schema: outputSchema,
      render: (_args, value: DocumentReadResult) => value.content,
    },
    isConcurrencySafe: () => true,
    async execute(args, exec): Promise<DocumentReadResult> {
      const input = parseArgs(args)
      const { target, info } = await resolveRegularReadTarget(ctx, exec, input.path)
      if (info.size !== undefined && info.size > maxFileBytes) {
        throw new FsError('cannot read document "' + target.displayPath + '": file exceeds the ' + maxFileBytes + '-byte document limit', 'FS_TOO_LARGE')
      }
      let bytes: Uint8Array
      try {
        bytes = await ctx.fs.readBytes(target, exec.signal, maxFileBytes)
      } catch (error: unknown) {
        if (error instanceof FsError && error.code === 'FS_TOO_LARGE') {
          throw new FsError('cannot read document "' + target.displayPath + '": file exceeds the configured document size limit', 'FS_TOO_LARGE', { cause: error })
        }
        throw error
      }
      ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
      const options: DocumentOptions = { ...input.options, maxOutputBytes: maxBytes }
      return await documentWorkerPool.run(bytes, options, exec.signal)
    },
    presentCall(args): GenericCallView {
      return { card: 'generic', title: 'Read document ' + (args.path ?? ''), kind: 'read', locations: [{ path: args.path ?? '' }] }
    },
  }))
}
