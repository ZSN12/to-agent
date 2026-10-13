import { randomUUID } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

const PDF_MAX_BYTES = 100 * 1024 * 1024
const OFFICE_MAX_BYTES = 50 * 1024 * 1024
const MAX_DOCUMENTS_PER_MESSAGE = 8
const MAX_STAGED_BYTES = 256 * 1024 * 1024
const MAX_STAGED_AGE_MS = 15 * 60 * 1000
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.pptx', '.docx', '.xlsx', '.ppt', '.doc', '.xls'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

function codedError(reason, message) {
  const error = new Error(message)
  error.code = 'attachment-error'
  error.details = { reason }
  return error
}

function safeName(value) {
  const name = path.basename(String(value ?? '')).replace(/[\u0000-\u001f\u007f/\\]/gu, '').trim().slice(0, 180)
  return name || 'document'
}

function extension(value) {
  return path.extname(String(value ?? '')).toLowerCase()
}

function documentKind(bytes, name) {
  const ext = extension(name)
  if (!DOCUMENT_EXTENSIONS.has(ext)) throw codedError('UNSUPPORTED_DOCUMENT_TYPE', '仅支持 PDF、PPTX、DOCX、XLSX 及旧版 PPT、DOC、XLS 文档')
  const pdf = bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-'
  const zip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
    && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  const ole = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
  if (pdf && ext === '.pdf') return 'pdf'
  if (zip) {
    const archiveNames = bytes.toString('latin1').toLowerCase()
    const zipKind = archiveNames.includes('word/document.xml') ? 'docx'
      : archiveNames.includes('ppt/presentation.xml') ? 'pptx'
        : archiveNames.includes('xl/workbook.xml') ? 'xlsx' : null
    if (zipKind && ext === `.${zipKind}`) return zipKind
    throw codedError('DOCUMENT_TYPE_MISMATCH', '文件扩展名与内容不匹配，或不是受支持的 Office 文档')
  }
  if (ole && ['.doc', '.ppt', '.xls'].includes(ext)) return ext.slice(1)
  throw codedError('DOCUMENT_TYPE_MISMATCH', '文件扩展名与内容不匹配，或文件不是有效的受支持文档')
}

async function readBoundedFile(filePath, maxBytes) {
  if (typeof filePath !== 'string' || filePath.length === 0) throw new Error('文档文件路径无效')
  let realPath
  try {
    realPath = await fs.realpath(filePath)
  } catch {
    throw new Error('无法读取所选文档，请检查文件是否存在且可访问。')
  }
  let handle
  try {
    handle = await fs.open(realPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    const info = await handle.stat()
    if (!info.isFile()) throw new Error('所选项目不是文档文件')
    if (!Number.isSafeInteger(info.size) || info.size <= 0) throw codedError('INVALID_DOCUMENT', '文档为空或大小无效')
    if (info.size > maxBytes) throw codedError('DOCUMENT_TOO_LARGE', `文档不能超过 ${Math.floor(maxBytes / (1024 * 1024))} MB`)

    const chunks = []
    let total = 0
    let position = 0
    while (true) {
      const chunk = Buffer.allocUnsafe(Math.min(1024 * 1024, maxBytes - total + 1))
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, position)
      if (bytesRead === 0) break
      total += bytesRead
      if (total > maxBytes) throw codedError('DOCUMENT_TOO_LARGE', `文档不能超过 ${Math.floor(maxBytes / (1024 * 1024))} MB`)
      chunks.push(chunk.subarray(0, bytesRead))
      position += bytesRead
    }
    return { realPath, bytes: Buffer.concat(chunks, total) }
  } finally {
    await handle?.close()
  }
}

/**
 * Main-process document intake. The renderer only keeps opaque ids and small
 * metadata; source bytes stay in a bounded, conversation-scoped process cache
 * until the owning chat:send request consumes them.
 */
export function createChatDocumentAttachmentService({ dialog, resolveIpcConversationId }) {
  const staged = new Map()
  let stagedBytes = 0

  const resolveConversation = async (requestedId) => {
    if (requestedId != null && typeof requestedId !== 'string') throw new Error('当前对话标识无效')
    const id = await resolveIpcConversationId(requestedId ?? null)
    if (typeof id !== 'string' || !id) throw new Error('当前对话标识无效')
    return id
  }

  function removeExpired() {
    const now = Date.now()
    for (const [id, item] of staged) {
      if (now - item.createdAt <= MAX_STAGED_AGE_MS) continue
      staged.delete(id)
      stagedBytes -= item.bytes.byteLength
    }
  }

  async function stageFile(filePath, conversationId) {
    if (typeof filePath !== 'string' || filePath.length === 0) throw new Error('文档文件路径无效')
    const name = safeName(path.basename(filePath))
    const ext = extension(name)
    if (!DOCUMENT_EXTENSIONS.has(ext)) throw codedError('UNSUPPORTED_DOCUMENT_TYPE', '仅支持 PDF、PPTX、DOCX、XLSX 及旧版 PPT、DOC、XLS 文档')
    const maxBytes = ext === '.pdf' ? PDF_MAX_BYTES : OFFICE_MAX_BYTES
    const { bytes } = await readBoundedFile(filePath, maxBytes)
    const kind = documentKind(bytes, name)
    if (bytes.byteLength > (kind === 'pdf' ? PDF_MAX_BYTES : OFFICE_MAX_BYTES)) {
      throw codedError('DOCUMENT_TOO_LARGE', `文档不能超过 ${Math.floor((kind === 'pdf' ? PDF_MAX_BYTES : OFFICE_MAX_BYTES) / (1024 * 1024))} MB`)
    }
    removeExpired()
    const conversationDocumentCount = [...staged.values()].reduce((count, item) => count + Number(item.conversationId === conversationId), 0)
    if (conversationDocumentCount >= MAX_DOCUMENTS_PER_MESSAGE) {
      throw codedError('TOO_MANY_DOCUMENTS', `每条消息最多添加 ${MAX_DOCUMENTS_PER_MESSAGE} 个文档`)
    }
    if (stagedBytes + bytes.byteLength > MAX_STAGED_BYTES) {
      throw codedError('DOCUMENT_STAGING_FULL', '待发送文档占用空间已满，请先发送或移除其他文档')
    }
    const id = randomUUID()
    staged.set(id, { conversationId, name, kind, bytes, createdAt: Date.now() })
    stagedBytes += bytes.byteLength
    return { id, name, kind, bytes: bytes.byteLength }
  }

  return {
    async stageDroppedFile({ filePath, conversationId: requestedConversationId } = {}) {
      const conversationId = await resolveConversation(requestedConversationId)
      return stageFile(filePath, conversationId)
    },

    async pickAttachments({ conversationId: requestedConversationId, imageService, workspaceReferenceForPath } = {}) {
      const conversationId = await resolveConversation(requestedConversationId)
      const result = await dialog.showOpenDialog({
        title: '添加附件',
        properties: ['openFile', 'multiSelections'],
        filters: [{
          name: '图片和文档',
          extensions: [...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS].map(value => value.slice(1)),
        }],
      })
      if (result.canceled || result.filePaths.length === 0) return { cancelled: true, images: [], documents: [], references: [] }

      const imagePaths = result.filePaths.filter(filePath => IMAGE_EXTENSIONS.has(extension(filePath)))
      const documentPaths = result.filePaths.filter(filePath => DOCUMENT_EXTENSIONS.has(extension(filePath)))
      if (imagePaths.length + documentPaths.length !== result.filePaths.length) {
        throw codedError('UNSUPPORTED_ATTACHMENT_TYPE', '选择中包含不支持的附件格式')
      }
      if (documentPaths.length > MAX_DOCUMENTS_PER_MESSAGE) {
        throw codedError('TOO_MANY_DOCUMENTS', `每条消息最多添加 ${MAX_DOCUMENTS_PER_MESSAGE} 个文档`)
      }
      const images = imagePaths.length
        ? await imageService.readSelectedFiles({ filePaths: imagePaths, conversationId })
        : []
      const documents = []
      const references = []
      try {
        for (const filePath of documentPaths) {
          const reference = await workspaceReferenceForPath?.(filePath, conversationId)
          if (reference) references.push(reference)
          else documents.push(await stageFile(filePath, conversationId))
        }
      } catch (error) {
        for (const document of documents) {
          const item = staged.get(document.id)
          if (!item) continue
          staged.delete(document.id)
          stagedBytes -= item.bytes.byteLength
        }
        throw error
      }
      return { cancelled: false, images, documents, references }
    },

    async takeDocuments({ ids, conversationId: requestedConversationId } = {}) {
      const conversationId = await resolveConversation(requestedConversationId)
      if (!Array.isArray(ids) || ids.length > MAX_DOCUMENTS_PER_MESSAGE
        || ids.some(id => typeof id !== 'string' || id.length > 80)
        || new Set(ids).size !== ids.length) {
        throw codedError('INVALID_DOCUMENT_BATCH', '文档附件列表无效')
      }
      removeExpired()
      const documents = ids.map(id => {
        const item = staged.get(id)
        if (!item || item.conversationId !== conversationId) {
          throw codedError('DOCUMENT_NOT_AVAILABLE', '文档附件已过期或不属于当前会话，请重新添加')
        }
        return { id, ...item }
      })
      for (const { id } of documents) {
        const item = staged.get(id)
        staged.delete(id)
        stagedBytes -= item?.bytes.byteLength ?? 0
      }
      return documents.map(({ id, conversationId: _conversationId, createdAt: _createdAt, bytes, ...document }) => ({
        ...document,
        data: bytes.toString('base64'),
      }))
    },

    async releaseDocuments({ ids, conversationId: requestedConversationId } = {}) {
      const conversationId = await resolveConversation(requestedConversationId)
      if (!Array.isArray(ids)) return { released: 0 }
      let released = 0
      for (const id of ids) {
        const item = staged.get(id)
        if (!item || item.conversationId !== conversationId) continue
        staged.delete(id)
        stagedBytes -= item.bytes.byteLength
        released += 1
      }
      return { released }
    },

  }
}
