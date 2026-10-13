import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { rpcValue } from './dsh-chat/prelude.mjs'

const IMAGE_MEDIA_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const ATTACHMENT_ID = /^sha256:[a-f0-9]{64}$/
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const PREVIEW_CACHE_MAX_BYTES = 32 * 1024 * 1024
const PREVIEW_CACHE_MAX_ENTRIES = 48

export const DEFAULT_IMAGE_LIMITS = Object.freeze({
  maxImageBytes: 20 * 1024 * 1024,
  maxImagesPerMessage: 20,
  maxMessageImageBytes: 200 * 1024 * 1024,
  maxImagePixels: 64_000_000,
  maxImageDimension: 8192,
  mediaTypes: IMAGE_MEDIA_TYPES,
})

function codedError(code, message) {
  const error = new Error(message)
  error.code = 'attachment-error'
  error.details = { reason: code }
  return error
}

function safeName(value) {
  const name = path.basename(String(value ?? '')).replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 120)
  return name || 'image'
}

export function normalizeImageLimits(value) {
  const raw = value && typeof value === 'object' ? value : {}
  const positiveInteger = (key, fallback) => Number.isSafeInteger(raw[key]) && raw[key] > 0 ? raw[key] : fallback
  const mediaTypes = Array.isArray(raw.mediaTypes)
    ? IMAGE_MEDIA_TYPES.filter((type) => raw.mediaTypes.includes(type))
    : [...IMAGE_MEDIA_TYPES]
  return {
    maxImageBytes: positiveInteger('maxImageBytes', DEFAULT_IMAGE_LIMITS.maxImageBytes),
    maxImagesPerMessage: positiveInteger('maxImagesPerMessage', DEFAULT_IMAGE_LIMITS.maxImagesPerMessage),
    maxMessageImageBytes: positiveInteger('maxMessageImageBytes', DEFAULT_IMAGE_LIMITS.maxMessageImageBytes),
    maxImagePixels: positiveInteger('maxImagePixels', DEFAULT_IMAGE_LIMITS.maxImagePixels),
    maxImageDimension: positiveInteger('maxImageDimension', DEFAULT_IMAGE_LIMITS.maxImageDimension),
    mediaTypes: mediaTypes.length ? mediaTypes : [...IMAGE_MEDIA_TYPES],
  }
}

export function detectImageMediaType(bytes) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) return null
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buffer.length >= 6) {
    const signature = buffer.toString('ascii', 0, 6)
    if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif'
  }
  return null
}

function attachmentId(value) {
  if (typeof value !== 'string' || !ATTACHMENT_ID.test(value)) throw new Error('图片附件标识无效')
  return value
}

function checkStoredImage(response, expectedId) {
  const attachment = response?.attachment
  const data = response?.data
  if (!attachment || attachmentId(attachment.attachmentId) !== expectedId) throw new Error('Host 返回的图片附件与当前会话不匹配')
  if (!IMAGE_MEDIA_TYPES.includes(attachment.mediaType)) throw new Error('Host 返回了不支持的图片类型')
  if (!Number.isSafeInteger(attachment.bytes) || attachment.bytes <= 0 || attachment.bytes > DEFAULT_IMAGE_LIMITS.maxImageBytes) {
    throw new Error('Host 返回的图片超过预览大小限制')
  }
  if (!Number.isSafeInteger(attachment.width) || attachment.width < 1 || attachment.width > 8192
    || !Number.isSafeInteger(attachment.height) || attachment.height < 1 || attachment.height > 8192) {
    throw new Error('Host 返回的图片尺寸无效')
  }
  const expectedBase64Length = 4 * Math.ceil(attachment.bytes / 3)
  if (typeof data !== 'string' || data.length !== expectedBase64Length || !BASE64.test(data)) {
    throw new Error('Host 返回的图片编码无效')
  }
  const decoded = Buffer.from(data, 'base64')
  if (decoded.byteLength !== attachment.bytes || decoded.toString('base64') !== data) {
    throw new Error('Host 返回的图片长度与附件元数据不一致')
  }
  if (detectImageMediaType(decoded) !== attachment.mediaType) throw new Error('Host 返回的图片类型与内容不一致')
  if (`sha256:${createHash('sha256').update(decoded).digest('hex')}` !== expectedId) {
    throw new Error('Host 返回的图片内容摘要与附件标识不一致')
  }
  return {
    attachment: {
      attachmentId: expectedId,
      mediaType: attachment.mediaType,
      bytes: attachment.bytes,
      width: attachment.width,
      height: attachment.height,
      ...(typeof attachment.name === 'string' ? { name: safeName(attachment.name) } : {}),
      ...(attachment.originalDimensions && Number.isSafeInteger(attachment.originalDimensions.width)
        && attachment.originalDimensions.width > 0
        && Number.isSafeInteger(attachment.originalDimensions.height)
        && attachment.originalDimensions.height > 0
        ? { originalDimensions: attachment.originalDimensions }
        : {}),
    },
    data,
  }
}

/** Main-process image intake. Bytes are read only after a user selected or dropped a file. */
export function createChatImageAttachmentService({
  dialog,
  chat,
  conversationHub,
  hostManager,
  resolveIpcConversationId,
}) {
  const previewCache = new Map()
  let previewCacheBytes = 0

  const resolveConversation = async (requestedId) => {
    if (requestedId != null && typeof requestedId !== 'string') throw new Error('当前对话标识无效')
    const id = await resolveIpcConversationId(requestedId ?? null)
    if (typeof id !== 'string' || !id) throw new Error('当前对话标识无效')
    return id
  }

  async function limitsFor(requestedConversationId) {
    let conversationId = null
    try { conversationId = await resolveConversation(requestedConversationId) } catch { /* pre-session composer */ }
    const api = hostManager?.getApi?.()
    // Prefer a direct Host description when a runtime version provides the field.
    try {
      const description = rpcValue(await api?.host?.describe?.({}), '读取图片限制')
      if (description?.imageLimits) return normalizeImageLimits(description.imageLimits)
    } catch { /* older Host protocols expose image limits through session projections */ }
    const sessionId = conversationId
      ? (chat.getSessionId(conversationId) ?? conversationHub?.getSessionIdForConversation?.(conversationId))
      : null
    if (sessionId && typeof api?.sessions?.history === 'function') {
      try {
        const history = rpcValue(await api.sessions.history({ sessionId, maxMessages: 1 }), '读取图片限制投影')
        const projected = history?.projections?.values?.imageLimits
        if (projected) return normalizeImageLimits(projected)
      } catch { /* use the runtime's published default limits */ }
    }
    return normalizeImageLimits(DEFAULT_IMAGE_LIMITS)
  }

  async function readFiles(filePaths, limits) {
    if (filePaths.length > limits.maxImagesPerMessage) {
      throw codedError('TOO_MANY_IMAGES', `每条消息最多添加 ${limits.maxImagesPerMessage} 张图片`)
    }
    const candidates = []
    let totalBytes = 0
    for (const filePath of filePaths) {
      if (typeof filePath !== 'string' || !filePath) throw new Error('图片文件路径无效')
      let realPath
      let info
      try {
        realPath = await fs.realpath(filePath)
        info = await fs.stat(realPath)
      } catch {
        throw new Error('无法读取所选图片，请检查文件是否存在且可访问。')
      }
      if (!info.isFile()) throw new Error('所选项目不是图片文件')
      if (!Number.isSafeInteger(info.size) || info.size <= 0) throw codedError('INVALID_IMAGE', '图片文件为空或大小无效')
      if (info.size > limits.maxImageBytes) {
        throw codedError('IMAGE_TOO_LARGE', `单张图片不能超过 ${(limits.maxImageBytes / (1024 * 1024)).toFixed(0)} MB`)
      }
      totalBytes += info.size
      if (totalBytes > limits.maxMessageImageBytes) {
        throw codedError('IMAGES_TOO_LARGE', `图片总大小不能超过 ${(limits.maxMessageImageBytes / (1024 * 1024)).toFixed(0)} MB`)
      }
      candidates.push({ realPath, name: safeName(path.basename(realPath)), bytes: info.size })
    }

    const images = []
    for (const candidate of candidates) {
      let bytes
      try {
        bytes = await fs.readFile(candidate.realPath)
      } catch {
        throw new Error('无法读取所选图片，请检查文件是否存在且可访问。')
      }
      if (bytes.byteLength > limits.maxImageBytes) {
        throw codedError('IMAGE_TOO_LARGE', `单张图片不能超过 ${(limits.maxImageBytes / (1024 * 1024)).toFixed(0)} MB`)
      }
      const mediaType = detectImageMediaType(bytes)
      if (!mediaType || !limits.mediaTypes.includes(mediaType)) {
        throw codedError('UNSUPPORTED_IMAGE_TYPE', '只支持 PNG、JPEG、WebP 和 GIF 图片')
      }
      images.push({ mediaType, data: bytes.toString('base64'), name: candidate.name, bytes: bytes.byteLength })
    }
    return images
  }

  function cacheRead(key, value) {
    const bytes = Buffer.byteLength(value.data, 'ascii')
    if (bytes > PREVIEW_CACHE_MAX_BYTES) return value
    const existing = previewCache.get(key)
    if (existing) previewCacheBytes -= existing.bytes
    previewCache.delete(key)
    while (previewCache.size >= PREVIEW_CACHE_MAX_ENTRIES || previewCacheBytes + bytes > PREVIEW_CACHE_MAX_BYTES) {
      const oldestKey = previewCache.keys().next().value
      if (oldestKey === undefined) break
      const oldest = previewCache.get(oldestKey)
      previewCache.delete(oldestKey)
      previewCacheBytes -= oldest?.bytes ?? 0
    }
    previewCache.set(key, { value, bytes })
    previewCacheBytes += bytes
    return value
  }

  return {
    async getLimits({ conversationId } = {}) {
      return limitsFor(conversationId)
    },

    async readDroppedFile({ filePath, conversationId } = {}) {
      const limits = await limitsFor(conversationId)
      const images = await readFiles([filePath], limits)
      return images[0]
    },

    async readSelectedFiles({ filePaths, conversationId } = {}) {
      const limits = await limitsFor(conversationId)
      return readFiles(filePaths, limits)
    },

    async pickImages({ conversationId } = {}) {
      const limits = await limitsFor(conversationId)
      const result = await dialog.showOpenDialog({
        title: '添加图片',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      })
      if (result.canceled || result.filePaths.length === 0) return { cancelled: true, images: [] }
      return { cancelled: false, images: await readFiles(result.filePaths, limits) }
    },

    async getImage({ conversationId: requestedConversationId, attachmentId: requestedAttachmentId } = {}) {
      const id = attachmentId(requestedAttachmentId)
      const conversationId = await resolveConversation(requestedConversationId)
      const view = await conversationHub?.getView?.(conversationId)
      const referenced = (view?.transcript ?? []).some((row) => row.images?.some((image) => image.attachmentId === id))
        || (view?.toolRows ?? []).some((row) => row.resultImages?.some((image) => image.attachmentId === id))
      if (!referenced) throw new Error('当前会话没有引用这张图片')

      const chatSessionId = chat.getSessionId(conversationId)
      const projectedSessionId = conversationHub?.getSessionIdForConversation?.(conversationId)
      const sessionId = projectedSessionId ?? chatSessionId
      if (typeof sessionId !== 'string' || !sessionId
        || (typeof chatSessionId === 'string' && chatSessionId && projectedSessionId && projectedSessionId !== chatSessionId)) {
        throw new Error('当前对话尚未绑定可读取的 Host 会话')
      }
      const key = `${sessionId}\n${id}`
      const cached = previewCache.get(key)
      if (cached) {
        previewCache.delete(key)
        previewCache.set(key, cached)
        return cached.value
      }
      const api = hostManager.getApi()
      if (typeof api?.sessions?.attachment !== 'function') throw new Error('Host 图片附件服务尚未就绪')
      const response = await api.sessions.attachment({ sessionId, attachmentId: id })
      const validated = checkStoredImage(rpcValue(response, '读取会话图片'), id)
      return cacheRead(key, validated)
    },
  }
}
