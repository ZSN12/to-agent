import { createHash } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Context } from '@taskweaver/cordis'
import { FsError } from '@taskweaver/dsh-fs'
import { runtimeHomePath } from '@taskweaver/dsh-home-paths'
import type { GenericCallView, ToolExecution } from '@taskweaver/dsh-tools'
import { defineTool } from '@taskweaver/dsh-tools'
import z from '@taskweaver/schemastery'
import { resolveRegularReadTarget } from '@taskweaver/dsh-tool-fs'
import type { ImageAttachmentRef } from '@taskweaver/dsh-attachment'
import type {} from '@taskweaver/dsh-attachment'
import type {} from '@taskweaver/dsh-llm'
import type { SaveTextSpill, SpillRef } from '@taskweaver/dsh-spill'
import type {} from '@taskweaver/dsh-spill'
import type {} from '@taskweaver/dsh-user-approval'
import { DEFAULT_DOCUMENT_CACHE_BYTES, DocumentResultCache, documentCacheKey } from './cache.ts'
import { DocumentReadError } from './errors.ts'
import { convertLegacyOffice, findLibreOffice, isOleCompoundFile, legacyOfficeExtension, officeEncryptionMarkersPresent } from './legacy-office.ts'
import type { DocumentOptions, DocumentReadResult, ParsedDocumentResult } from './protocol.ts'
import { documentWorkerPool } from './worker-pool.ts'

export { storeDocumentSnapshot } from './documents.ts'
export type { StoreDocumentSnapshotOptions, StoredDocumentSnapshot } from './documents.ts'

export const name = 'tool-document'
export const inject = ['tools', 'fs', 'systemPrompt']

export interface Config {
  /** Output ceiling aligned with the fs readMaxBytes default. */
  readMaxBytes?: number
  /** PDF size limit; capped at the planned 100 MB ceiling. */
  maxPdfBytes?: number
  /** Office Open XML size limit; capped at 50 MB. */
  maxOfficeBytes?: number
  /** Maximum source bytes read before format-specific limits are applied. */
  maxFileReadBytes?: number
  /** Private DSH-home directory for bounded, content-addressed parser results. */
  cacheDirectory?: string
  /** Read-only location used for content-addressed documents attached outside a workspace. */
  documentsDirectory?: string
  /** Maximum total size of the on-disk parser LRU. Set to zero to disable it. */
  cacheMaxBytes?: number
  /** Optional explicit LibreOffice executable path; otherwise PATH and macOS defaults are checked. */
  sofficePath?: string
  /** Maximum extracted segment held for spill/readback before requesting a narrower range. */
  maxSegmentBytes?: number
}

export const Config: z<Config> = z.object({
  readMaxBytes: z.number().default(50 * 1024),
  maxPdfBytes: z.number().default(100 * 1024 * 1024),
  maxOfficeBytes: z.number().default(50 * 1024 * 1024),
  maxFileReadBytes: z.number().default(100 * 1024 * 1024),
  cacheDirectory: z.string().default(''),
  documentsDirectory: z.string().default(''),
  cacheMaxBytes: z.number().default(DEFAULT_DOCUMENT_CACHE_BYTES),
  sofficePath: z.string(),
  maxSegmentBytes: z.number().default(16 * 1024 * 1024),
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
      maxPdfBytes: 100 * 1024 * 1024,
      maxOfficeBytes: 50 * 1024 * 1024,
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
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ['text'], required: true },
              text: { type: 'string', required: true },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ['image'], required: true },
              attachment: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  attachmentId: { type: 'string', required: true },
                  mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], required: true },
                  bytes: { type: 'integer', required: true },
                  width: { type: 'integer', required: true },
                  height: { type: 'integer', required: true },
                  name: { type: 'string' },
                  originalDimensions: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      width: { type: 'integer', required: true },
                      height: { type: 'integer', required: true },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    },
    next: { type: 'string' },
    truncated: { type: 'boolean', required: true },
    tokensEstimate: { type: 'integer', required: true },
  },
} as const

function activeRouteSupportsImages(ctx: Context, exec: ToolExecution): Promise<boolean> {
  const routed = exec.agent?.session.requestHeader()?.config
  const provider = routed?.provider ?? exec.agent?.options.provider
  const model = routed?.model ?? exec.agent?.options.model
  const llm = ctx.get('llm')
  if (!provider || !model || !llm) return Promise.resolve(false)
  return llm.resolveModelInfo(provider, model, exec.signal)
    .then(info => info.inputModalities?.includes('image') === true)
    .catch(() => false)
}

function imageTokensEstimate(ref: ImageAttachmentRef): number {
  return Math.ceil(ref.width / 28) * Math.ceil(ref.height / 28)
}

function estimateTokens(text: string): number {
  let cjk = 0
  for (const character of text) {
    const code = character.codePointAt(0)!
    if ((code >= 0x2e80 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) cjk += 1
  }
  return Math.ceil(cjk * 1.3 + ([...text].length - cjk) / 4)
}

function utf8Prefix(value: string, maxBytes: number): string {
  let output = ''
  let used = 0
  for (const character of value) {
    const bytes = Buffer.byteLength(character, 'utf8')
    if (used + bytes > maxBytes) break
    output += character
    used += bytes
  }
  return output
}

async function saveDocumentSpill(ctx: Context, exec: ToolExecution, content: string): Promise<SpillRef | undefined> {
  const sessionId = exec.agent?.session.header.id
  if (sessionId === undefined) return undefined
  const spillStore = ctx.get('spillStore')
  if (spillStore === undefined) return undefined
  const save: SaveTextSpill = {
    owner: { sessionId },
    source: { toolName: exec.name, callId: exec.callId, label: 'document segment' },
    suggestedName: 'document-segment.txt',
    content,
  }
  try {
    return await spillStore.saveText(save)
  } catch (error: unknown) {
    ctx.logger.warn('tool-document: spill save failed: ' + (error instanceof Error ? error.message : String(error)))
    return undefined
  }
}

async function boundToolOutput(
  ctx: Context,
  exec: ToolExecution,
  result: DocumentReadResult,
  maxBytes: number,
): Promise<DocumentReadResult> {
  const fullText = result.content.filter(block => block.type === 'text').map(block => block.text).join('\n\n')
  if (Buffer.byteLength(fullText, 'utf8') <= maxBytes) return result

  const spill = await saveDocumentSpill(ctx, exec, fullText)
  const parserCapped = fullText.includes('configured byte limit')
  const recovery = spill
    ? '[Document segment text saved at ' + spill.locator + ' (' + spill.bytes + ' bytes). ' + spill.retrievalHint + ']'
    : '[Inline output is limited to ' + maxBytes + ' bytes; narrow pages, section, sheet, or range to read the rest.]'
  const capHint = parserCapped
    ? '\n[The extracted segment also reached its configured parser limit; narrow the requested segment to read the remaining source content.]'
    : ''
  const nextHint = result.next ? '\nNext: ' + result.next : ''
  const suffix = utf8Prefix('\n\n' + recovery + capHint + nextHint, maxBytes)
  const text = utf8Prefix(fullText, Math.max(0, maxBytes - Buffer.byteLength(suffix, 'utf8'))) + suffix
  const nonText = result.content.filter((block): block is Extract<DocumentReadResult['content'][number], { type: 'image' }> => block.type === 'image')
  return {
    ...result,
    content: [{ type: 'text', text }, ...nonText],
    truncated: true,
    tokensEstimate: estimateTokens(text) + nonText.reduce((sum, block) => sum + imageTokensEstimate(block.attachment), 0),
  }
}

function withTextNotice(result: ParsedDocumentResult, notice: string, maxBytes: number): ParsedDocumentResult {
  const content = [...result.content]
  const first = content[0]
  const original = first?.text ?? ''
  const suffix = '\n\n' + notice
  const available = Math.max(0, maxBytes - Buffer.byteLength(suffix, 'utf8'))
  let text = ''
  let used = 0
  for (const character of original) {
    const bytes = Buffer.byteLength(character, 'utf8')
    if (used + bytes > available) break
    text += character
    used += bytes
  }
  text += suffix
  if (first) content[0] = { type: 'text', text }
  else content.push({ type: 'text', text })
  let oldCjk = 0
  let newCjk = 0
  for (const character of original) {
    const code = character.codePointAt(0)!
    if ((code >= 0x2e80 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) oldCjk += 1
  }
  for (const character of text) {
    const code = character.codePointAt(0)!
    if ((code >= 0x2e80 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) newCjk += 1
  }
  const oldTokens = Math.ceil(oldCjk * 1.3 + ([...original].length - oldCjk) / 4)
  const newTokens = Math.ceil(newCjk * 1.3 + ([...text].length - newCjk) / 4)
  return {
    ...result,
    content,
    truncated: result.truncated || text.length < original.length + suffix.length,
    tokensEstimate: Math.max(0, result.tokensEstimate - oldTokens + newTokens),
  }
}

const DOCUMENT_REFERENCE = /^@doc:([a-f0-9]{64})$/u
const DOCUMENT_EXTENSIONS = ['.pdf', '.pptx', '.docx', '.xlsx', '.ppt', '.doc', '.xls'] as const

async function readDocumentReference(
  digest: string,
  directory: string,
  sessionId: string | undefined,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; displayPath: string; extension: typeof DOCUMENT_EXTENSIONS[number] }> {
  if (!sessionId) throw new FsError('document attachment is not available in this session', 'FS_PERMISSION_DENIED')
  let directoryInfo
  try {
    directoryInfo = await lstat(directory)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new FsError('document attachment ' + digest + ' was not found', 'FS_NOT_FOUND', { cause })
    }
    throw new FsError('cannot inspect the document attachment directory', 'FS_IO_ERROR', { cause })
  }
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || (directoryInfo.mode & 0o077) !== 0) {
    throw new FsError('document attachments are unavailable because their private directory is unsafe', 'FS_PERMISSION_DENIED')
  }
  const canonicalRoot = await realpath(directory)
  const sessionsDirectory = join(canonicalRoot, '.sessions')
  let sessionsInfo
  try {
    sessionsInfo = await lstat(sessionsDirectory)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new FsError('document attachment is not available in this session', 'FS_PERMISSION_DENIED', { cause })
    }
    throw new FsError('cannot inspect the session document attachment directory', 'FS_IO_ERROR', { cause })
  }
  if (!sessionsInfo.isDirectory() || sessionsInfo.isSymbolicLink() || (sessionsInfo.mode & 0o077) !== 0) {
    throw new FsError('session document attachments are unavailable because their private directory is unsafe', 'FS_PERMISSION_DENIED')
  }
  const canonicalSessions = await realpath(sessionsDirectory)
  if (canonicalSessions !== sessionsDirectory || dirname(canonicalSessions) !== canonicalRoot) {
    throw new FsError('session document attachments escaped their private directory', 'FS_PERMISSION_DENIED')
  }
  const sessionDirectory = join(canonicalSessions, createHash('sha256').update('taskweaver-document-session\0').update(sessionId).digest('hex'))
  let sessionInfo
  try {
    sessionInfo = await lstat(sessionDirectory)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new FsError('document attachment is not available in this session', 'FS_PERMISSION_DENIED', { cause })
    }
    throw new FsError('cannot inspect this session document attachment directory', 'FS_IO_ERROR', { cause })
  }
  if (!sessionInfo.isDirectory() || sessionInfo.isSymbolicLink() || (sessionInfo.mode & 0o077) !== 0) {
    throw new FsError('session document attachments are unavailable because their private directory is unsafe', 'FS_PERMISSION_DENIED')
  }
  const canonicalDirectory = await realpath(sessionDirectory)
  if (canonicalDirectory !== sessionDirectory || dirname(canonicalDirectory) !== canonicalSessions) {
    throw new FsError('session document attachments escaped their private directory', 'FS_PERMISSION_DENIED')
  }
  const matches: Array<{ path: string; extension: typeof DOCUMENT_EXTENSIONS[number] }> = []
  for (const extension of DOCUMENT_EXTENSIONS) {
    const path = join(canonicalDirectory, digest + extension)
    try {
      const info = await lstat(path)
      if (info.isSymbolicLink() || !info.isFile()) {
        throw new FsError('document attachment is not a regular file', 'FS_PERMISSION_DENIED')
      }
      matches.push({ path, extension })
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException)?.code !== 'ENOENT') throw cause
    }
  }
  if (matches.length === 0) throw new FsError('document attachment ' + digest + ' was not found', 'FS_NOT_FOUND')
  if (matches.length > 1) throw new FsError('document attachment reference is ambiguous', 'FS_IO_ERROR')

  const { path, extension } = matches[0]!
  let handle
  try {
    const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)
    handle = await open(path, flags)
    const canonicalPath = await realpath(path)
    if (dirname(canonicalPath) !== canonicalDirectory) {
      throw new FsError('document attachment escaped its private directory', 'FS_PERMISSION_DENIED')
    }
    const info = await handle.stat()
    if (!info.isFile()) throw new FsError('document attachment is not a regular file', 'FS_PERMISSION_DENIED')
    if (!Number.isSafeInteger(info.size) || info.size > maxBytes) {
      throw new FsError('document attachment exceeds the ' + maxBytes + '-byte document limit', 'FS_TOO_LARGE')
    }
    const bytes = Buffer.allocUnsafe(info.size)
    let offset = 0
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (read.bytesRead === 0) break
      offset += read.bytesRead
    }
    const extra = Buffer.allocUnsafe(1)
    const grown = await handle.read(extra, 0, 1, offset)
    if (grown.bytesRead > 0) throw new FsError('document attachment changed while it was being read', 'FS_TOO_LARGE')
    const contents = bytes.subarray(0, offset)
    const actualDigest = createHash('sha256').update(contents).digest('hex')
    if (actualDigest !== digest) throw new FsError('document attachment failed its content-address check', 'FS_PERMISSION_DENIED')
    return { bytes: contents, displayPath: '@doc:' + digest, extension }
  } catch (cause) {
    if (cause instanceof FsError) throw cause
    if ((cause as NodeJS.ErrnoException)?.code === 'ELOOP') {
      throw new FsError('document attachment cannot be a symbolic link', 'FS_PERMISSION_DENIED', { cause })
    }
    throw new FsError('cannot read document attachment ' + digest, 'FS_IO_ERROR', { cause })
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

export function apply(ctx: Context, config: Config): void {
  const maxBytes = config.readMaxBytes ?? 50 * 1024
  const maxPdfBytes = config.maxPdfBytes ?? 100 * 1024 * 1024
  const maxOfficeBytes = config.maxOfficeBytes ?? 50 * 1024 * 1024
  const maxFileBytes = config.maxFileReadBytes ?? 100 * 1024 * 1024
  const maxSegmentBytes = config.maxSegmentBytes ?? 16 * 1024 * 1024
  const documentsDirectory = resolve(config.documentsDirectory || runtimeHomePath('documents'))
  positiveInteger('readMaxBytes', maxBytes)
  positiveInteger('maxPdfBytes', maxPdfBytes)
  positiveInteger('maxOfficeBytes', maxOfficeBytes)
  positiveInteger('maxFileReadBytes', maxFileBytes)
  positiveInteger('maxSegmentBytes', maxSegmentBytes)
  if (maxPdfBytes > 100 * 1024 * 1024) throw new Error('tool-document: maxPdfBytes cannot exceed 100 MB')
  if (maxOfficeBytes > 50 * 1024 * 1024) throw new Error('tool-document: maxOfficeBytes cannot exceed 50 MB')
  if (maxFileBytes > 100 * 1024 * 1024) throw new Error('tool-document: maxFileReadBytes cannot exceed the 100 MB PDF parser limit')
  if (maxSegmentBytes > 32 * 1024 * 1024) throw new Error('tool-document: maxSegmentBytes cannot exceed 32 MB')
  const cache = new DocumentResultCache(config.cacheDirectory || runtimeHomePath('document-cache'), config.cacheMaxBytes ?? DEFAULT_DOCUMENT_CACHE_BYTES)
  ctx.systemPrompt.section({
    name: 'tool:read_document',
    order: 110,
    text: 'Use read_document for user-supplied @doc references or sandboxed document paths; it enforces the filesystem sandbox and reads bounded segments.',
  })
  ctx.tools.register(defineTool({
    name: 'read_document',
    description: 'Read bounded text from PDF, PPTX, DOCX, or XLSX. Legacy .doc, .ppt, and .xls files can be converted with LibreOffice after user approval. Reads through the filesystem sandbox and returns an outline first when a document exceeds a per-call limit. With an image-capable route, images=true also attaches supported embedded or scanned-page images.',
    parameters: {
      path: { type: 'string', required: true, description: 'Sandboxed file path or a private document reference in the form @doc:<sha256>.' },
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
      const attachments = ctx.get('attachments')
      const canAttachImages = input.options.images
        && attachments !== undefined
        && await activeRouteSupportsImages(ctx, exec)
      let bytes: Uint8Array
      const documentReference = DOCUMENT_REFERENCE.exec(input.path)
      let target: Awaited<ReturnType<typeof resolveRegularReadTarget>>['target'] | undefined
      let displayPath: string
      let extension: string
      if (documentReference) {
        const attached = await readDocumentReference(documentReference[1]!, documentsDirectory, exec.agent?.session.header.id, maxFileBytes)
        bytes = attached.bytes
        displayPath = attached.displayPath
        extension = attached.extension
      } else {
        const resolved = await resolveRegularReadTarget(ctx, exec, input.path)
        target = resolved.target
        displayPath = target.displayPath
        extension = displayPath
        if (resolved.info.size !== undefined && resolved.info.size > maxFileBytes) {
          throw new FsError('cannot read document "' + displayPath + '": file exceeds the ' + maxFileBytes + '-byte document limit', 'FS_TOO_LARGE')
        }
        try {
          bytes = await ctx.fs.readBytes(target, exec.signal, maxFileBytes)
        } catch (error: unknown) {
          if (error instanceof FsError && error.code === 'FS_TOO_LARGE') {
            throw new FsError('cannot read document "' + displayPath + '": file exceeds the configured document size limit', 'FS_TOO_LARGE', { cause: error })
          }
          throw error
        }
        ctx.emit('fs/observed', target, { kind: 'present', version: resolved.info.version }, exec)
      }
      const options: DocumentOptions = { ...input.options, images: canAttachImages, maxOutputBytes: maxSegmentBytes, maxPdfBytes, maxOfficeBytes }
      const key = documentCacheKey(bytes, options)
      let parsed = await cache.read(key)
      if (!parsed) {
        let parseBytes = bytes
        if (isOleCompoundFile(bytes)) {
          const legacyExtension = legacyOfficeExtension(extension)
          if (!legacyExtension) {
            throw new DocumentReadError('This legacy Office file has no .doc, .ppt, or .xls extension to select a safe conversion format.', 'DOCUMENT_LEGACY_FORMAT_UNKNOWN')
          }
          if (bytes.byteLength > maxOfficeBytes) {
            throw new DocumentReadError('Legacy Office document exceeds the ' + Math.floor(maxOfficeBytes / (1024 * 1024)) + ' MB Office file limit.', 'DOCUMENT_TOO_LARGE')
          }
          if (officeEncryptionMarkersPresent(bytes)) {
            throw new DocumentReadError('This Office document is encrypted. Remove its password and retry.', 'DOCUMENT_ENCRYPTED')
          }
          const libreOfficePath = await findLibreOffice(config.sofficePath)
          if (!libreOfficePath) {
            throw new DocumentReadError('This is a legacy Office format. Save it as .docx, .pptx, or .xlsx, or install LibreOffice and retry.', 'DOCUMENT_LIBREOFFICE_UNAVAILABLE')
          }
          const approval = ctx.get('approval')
          if (!approval) {
            throw new DocumentReadError('Legacy Office conversion requires a user approval channel. Save the file as a modern Office document and retry.', 'DOCUMENT_CONVERSION_APPROVAL_UNAVAILABLE')
          }
          if (!exec.agent) {
            throw new DocumentReadError('Legacy Office conversion requires an agent session so the user can approve it.', 'DOCUMENT_CONVERSION_APPROVAL_UNAVAILABLE')
          }
          const displayName = displayPath.split(/[\\/]/u).at(-1)?.replace(/[\u0000-\u001f\u007f]/gu, '').slice(0, 160) || 'the selected file'
          const outcome = await approval.request({
            agent: exec.agent,
            toolName: 'read_document',
            callId: exec.callId,
            reason: 'Convert legacy Office document "' + displayName + '" with LibreOffice. It will process a private temporary copy, use a separate profile, and never overwrite the original file.',
            signal: exec.signal,
          })
          if (outcome !== 'allowed-once') {
            const message = outcome === 'rejected'
              ? 'The user rejected LibreOffice conversion. Save the file as a modern Office document and retry.'
              : outcome === 'cancelled'
                ? 'LibreOffice conversion approval was cancelled.'
                : 'LibreOffice conversion could not be approved because no approval channel is available.'
            throw new DocumentReadError(message, outcome === 'cancelled' ? 'DOCUMENT_CONVERSION_CANCELLED' : 'DOCUMENT_CONVERSION_NOT_APPROVED')
          }
          parseBytes = await convertLegacyOffice(bytes, legacyExtension, {
            sofficePath: libreOfficePath,
            signal: exec.signal,
          })
        }
        parsed = await documentWorkerPool.run(parseBytes, options, exec.signal)
        await cache.write(key, parsed)
      }
      if (input.options.images && !canAttachImages) {
        parsed = withTextNotice(parsed, attachments === undefined
          ? 'Images were not attached because durable attachment storage is unavailable.'
          : 'Images were not attached because the current model route does not declare image input.', maxSegmentBytes)
      }

      const candidates = parsed.imageCandidates ?? []
      if (!canAttachImages || candidates.length === 0 || attachments === undefined) {
        const { imageCandidates: _ignored, ...result } = parsed
        return boundToolOutput(ctx, exec, result, maxBytes)
      }
      const limits = attachments.imageLimits
      const accepted: typeof candidates = []
      let aggregateBytes = 0
      let omitted = 0
      for (const candidate of candidates) {
        if (accepted.length >= Math.min(8, limits.maxImagesPerMessage)
          || !limits.mediaTypes.includes(candidate.mediaType)
          || candidate.data.byteLength > limits.maxImageBytes
          || aggregateBytes + candidate.data.byteLength > limits.maxMessageImageBytes) {
          omitted += 1
          continue
        }
        accepted.push(candidate)
        aggregateBytes += candidate.data.byteLength
      }
      let refs: readonly ImageAttachmentRef[] = []
      let attachmentFailure = false
      try {
        refs = await attachments.saveImages(accepted.map(candidate => ({
          data: candidate.data,
          mediaType: candidate.mediaType,
          name: candidate.name.slice(candidate.name.lastIndexOf('/') + 1),
        })))
      } catch {
        attachmentFailure = true
      }
      const { imageCandidates: _ignored, ...base } = parsed
      const content: DocumentReadResult['content'] = [...base.content]
      if (omitted > 0) content.push({ type: 'text', text: '[' + omitted + ' embedded image(s) omitted because they exceed the attachment limits.]' })
      if (attachmentFailure) content.push({ type: 'text', text: '[Embedded images could not be saved to durable attachment storage.]' })
      content.push(...refs.map(attachment => ({ type: 'image' as const, attachment })))
      return boundToolOutput(ctx, exec, {
        ...base,
        content,
        tokensEstimate: base.tokensEstimate + refs.reduce((sum, ref) => sum + imageTokensEstimate(ref), 0),
      }, maxBytes)
    },
    presentCall(args): GenericCallView {
      return { card: 'generic', title: 'Read document ' + (args.path ?? ''), kind: 'read', locations: [{ path: args.path ?? '' }] }
    },
  }))
}
