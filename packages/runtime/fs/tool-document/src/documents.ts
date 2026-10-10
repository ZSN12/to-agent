import { createHash, randomUUID } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { link, lstat, mkdir, open, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { runtimeHomePath } from '@taskweaver/dsh-home-paths'
import { DocumentReadError } from './errors.ts'
import { isOleCompoundFile, legacyOfficeExtension, officeEncryptionMarkersPresent } from './legacy-office.ts'
import { classifyDocument } from './parse.ts'

const MAX_PDF_BYTES = 100 * 1024 * 1024
const MAX_OFFICE_BYTES = 50 * 1024 * 1024
const EXTENSION_BY_KIND = { pdf: '.pdf', pptx: '.pptx', docx: '.docx', xlsx: '.xlsx', ppt: '.ppt', doc: '.doc', xls: '.xls' } as const

export interface StoreDocumentSnapshotOptions {
  /** Overrides the default TaskWeaver runtime `documents/` directory. */
  directory?: string
  /** Optional display name. It never influences the storage path. */
  name?: string
  /** Session that may read the returned @doc reference. */
  sessionId: string
}

export interface StoredDocumentSnapshot {
  reference: string
  sha256: string
  name: string
  kind: keyof typeof EXTENSION_BY_KIND
  bytes: number
}

function safeDisplayName(value: string | undefined, extension: string): string {
  const base = (value ?? 'document').split(/[\\/]/u).at(-1)?.replace(/[\u0000-\u001f\u007f]/gu, '').trim()
  if (!base) return 'document' + extension
  const withoutExtension = base.replace(/\.[^.]*$/u, '')
  return (withoutExtension || 'document').slice(0, 180) + extension
}

async function ensurePrivateDirectory(directory: string): Promise<string> {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
    throw new DocumentReadError('Document attachment directory must be a private, non-symlink directory.', 'DOCUMENT_STORAGE_UNSAFE')
  }
  return realpath(directory)
}

function sessionDirectoryName(sessionId: string): string {
  if (typeof sessionId !== 'string' || sessionId.trim().length === 0 || Buffer.byteLength(sessionId, 'utf8') > 512) {
    throw new DocumentReadError('A valid session id is required to store an external document.', 'DOCUMENT_SESSION_REQUIRED')
  }
  return createHash('sha256').update('taskweaver-document-session\0').update(sessionId).digest('hex')
}

async function verifyExisting(path: string, expectedDigest: string): Promise<void> {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new DocumentReadError('Existing document attachment is not a regular file.', 'DOCUMENT_STORAGE_UNSAFE')
  }
  const bytes = await readFile(path)
  if (createHash('sha256').update(bytes).digest('hex') !== expectedDigest) {
    throw new DocumentReadError('Existing document attachment failed its content-address check.', 'DOCUMENT_STORAGE_CORRUPT')
  }
}

/**
 * Save a bounded external document snapshot outside the workspace. Host upload
 * adapters can pass received bytes here and send only the returned `@doc:` ref
 * to the agent; the path is derived from verified content, never caller input.
 */
export async function storeDocumentSnapshot(
  bytes: Uint8Array,
  options: StoreDocumentSnapshotOptions,
): Promise<StoredDocumentSnapshot> {
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new DocumentReadError('Document exceeds the 100 MB file limit.', 'DOCUMENT_TOO_LARGE')
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
    && bytes.byteLength > MAX_OFFICE_BYTES) {
    throw new DocumentReadError('Office document exceeds the 50 MB file limit.', 'DOCUMENT_TOO_LARGE')
  }
  let kind: keyof typeof EXTENSION_BY_KIND
  if (isOleCompoundFile(bytes)) {
    if (officeEncryptionMarkersPresent(bytes)) {
      throw new DocumentReadError('This Office document is encrypted. Remove its password and retry.', 'DOCUMENT_ENCRYPTED')
    }
    const extension = legacyOfficeExtension(options.name ?? '')
    if (!extension) throw new DocumentReadError('Legacy Office attachments must include a .doc, .ppt, or .xls file name.', 'DOCUMENT_LEGACY_FORMAT_UNKNOWN')
    kind = extension.slice(1) as 'doc' | 'ppt' | 'xls'
  } else {
    kind = classifyDocument(bytes)
  }
  const extension = EXTENSION_BY_KIND[kind]
  const maxBytes = kind === 'pdf' ? MAX_PDF_BYTES : MAX_OFFICE_BYTES
  if (bytes.byteLength > maxBytes) {
    throw new DocumentReadError('Document exceeds the ' + Math.floor(maxBytes / (1024 * 1024)) + ' MB file limit.', 'DOCUMENT_TOO_LARGE')
  }
  const digest = createHash('sha256').update(bytes).digest('hex')
  const directory = resolve(options.directory || runtimeHomePath('documents'))
  const canonicalDirectory = await ensurePrivateDirectory(directory)
  const path = join(canonicalDirectory, digest + extension)
  try {
    await verifyExisting(path, digest)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
    const temporary = join(canonicalDirectory, '.' + digest + '.' + randomUUID() + '.tmp')
    try {
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 })
      const handle = await open(temporary, fsConstants.O_RDWR | (fsConstants.O_NOFOLLOW ?? 0))
      try {
        await handle.sync()
      } finally {
        await handle.close()
      }
      try {
        await link(temporary, path)
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException)?.code !== 'EEXIST') throw cause
        await verifyExisting(path, digest)
      }
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined)
    }
  }
  const sessionsDirectory = await ensurePrivateDirectory(join(canonicalDirectory, '.sessions'))
  const sessionDirectory = await ensurePrivateDirectory(join(sessionsDirectory, sessionDirectoryName(options.sessionId)))
  const sessionPath = join(sessionDirectory, digest + extension)
  try {
    await link(path, sessionPath)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException)?.code !== 'EEXIST') throw cause
    await verifyExisting(sessionPath, digest)
  }
  return {
    reference: '@doc:' + digest,
    sha256: digest,
    name: safeDisplayName(options.name, extension),
    kind,
    bytes: bytes.byteLength,
  }
}
