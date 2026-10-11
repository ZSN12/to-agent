import { createHash } from 'node:crypto'
import { rpcValue } from './dsh-chat/prelude.mjs'

export const CODE_OUTPUT_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024

const IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const ATTACHMENT_ID = /^sha256:[a-f0-9]{64}$/
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function attachmentId(value) {
  if (typeof value !== 'string' || !ATTACHMENT_ID.test(value)) {
    throw new Error('图片附件标识无效')
  }
  return value
}

function checkedDimension(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= 8192
}

/** Validate and narrow untrusted RPC output before forwarding image bytes to the renderer. */
export function validateCodeOutputAttachment(value, expectedAttachmentId) {
  const expectedId = attachmentId(expectedAttachmentId)
  const ref = value?.attachment
  const data = value?.data
  if (!ref || typeof ref !== 'object' || attachmentId(ref.attachmentId) !== expectedId) {
    throw new Error('Host 返回的图片附件与当前结果不匹配')
  }
  if (!IMAGE_MEDIA_TYPES.has(ref.mediaType)) throw new Error('Host 返回了不支持的图片类型')
  if (!Number.isSafeInteger(ref.bytes) || ref.bytes <= 0 || ref.bytes > CODE_OUTPUT_ATTACHMENT_MAX_BYTES) {
    throw new Error('Host 返回的图片超过预览大小限制')
  }
  if (!checkedDimension(ref.width) || !checkedDimension(ref.height)) {
    throw new Error('Host 返回的图片尺寸无效')
  }
  if (typeof data !== 'string') throw new Error('Host 返回的图片数据无效')
  const expectedBase64Length = 4 * Math.ceil(ref.bytes / 3)
  if (data.length !== expectedBase64Length || !BASE64.test(data)) {
    throw new Error('Host 返回的图片编码无效')
  }
  const decoded = Buffer.from(data, 'base64')
  if (decoded.byteLength !== ref.bytes || decoded.toString('base64') !== data) {
    throw new Error('Host 返回的图片长度与附件元数据不一致')
  }
  if (`sha256:${createHash('sha256').update(decoded).digest('hex')}` !== expectedId) {
    throw new Error('Host 返回的图片内容摘要与附件标识不一致')
  }

  const name = typeof ref.name === 'string'
    ? ref.name.replace(/[\u0000-\u001f/\\]/g, '').trim().slice(0, 120)
    : ''
  return {
    attachment: {
      attachmentId: expectedId,
      mediaType: ref.mediaType,
      bytes: ref.bytes,
      width: ref.width,
      height: ref.height,
      ...(name ? { name } : {}),
    },
    data,
  }
}

/**
 * Read one code-result image through the current conversation's Host session.
 * The renderer supplies only the opaque image id. Session identity comes from
 * the main-process chat and is checked against the conversation projection.
 */
export function createCodeOutputAttachmentService({
  chat,
  conversationHub,
  hostManager,
  resolveIpcConversationId,
}) {
  return {
    async get({ conversationId: requestedConversationId, attachmentId: requestedAttachmentId } = {}) {
      const id = attachmentId(requestedAttachmentId)
      if (requestedConversationId != null && typeof requestedConversationId !== 'string') {
        throw new Error('当前对话标识无效')
      }
      const conversationId = await resolveIpcConversationId(requestedConversationId ?? null)
      if (typeof conversationId !== 'string' || !conversationId) throw new Error('当前对话标识无效')

      const sessionId = chat.getSessionId(conversationId)
      const projectedSessionId = conversationHub.getSessionIdForConversation(conversationId)
      if (typeof sessionId !== 'string' || !sessionId || projectedSessionId !== sessionId) {
        throw new Error('当前对话尚未绑定可读取的 Host 会话')
      }

      const api = hostManager.getApi()
      if (typeof api?.sessions?.attachment !== 'function') throw new Error('Host 附件服务尚未就绪')
      const response = await api.sessions.attachment({ sessionId, attachmentId: id })
      return validateCodeOutputAttachment(rpcValue(response, '读取代码执行图片'), id)
    },
  }
}
