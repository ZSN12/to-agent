import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  CODE_OUTPUT_ATTACHMENT_MAX_BYTES,
  createCodeOutputAttachmentService,
  validateCodeOutputAttachment,
} from '../backend/code-output-attachment.mjs'

const payload = Buffer.from('verified image bytes')
const ID = `sha256:${createHash('sha256').update(payload).digest('hex')}`
const base = {
  attachment: {
    attachmentId: ID,
    mediaType: 'image/png',
    bytes: payload.byteLength,
    width: 3,
    height: 2,
    name: 'result.png',
  },
  data: payload.toString('base64'),
}

assert.deepEqual(validateCodeOutputAttachment(base, ID), base,
  'a bounded Host attachment is narrowed to the renderer-safe response')
assert.throws(() => validateCodeOutputAttachment({
  ...base,
  attachment: { ...base.attachment, attachmentId: 'file:///etc/passwd' },
}, ID), /标识无效/, 'local paths cannot be used as attachment ids')
assert.throws(() => validateCodeOutputAttachment({
  ...base,
  attachment: { ...base.attachment, mediaType: 'image/svg+xml' },
}, ID), /不支持的图片类型/)
assert.throws(() => validateCodeOutputAttachment({
  ...base,
  attachment: { ...base.attachment, bytes: CODE_OUTPUT_ATTACHMENT_MAX_BYTES + 1 },
}, ID), /超过预览大小限制/)
assert.throws(() => validateCodeOutputAttachment({
  ...base,
  attachment: { ...base.attachment, bytes: payload.byteLength + 1 },
}, ID), /长度与附件元数据不一致/)
assert.throws(() => validateCodeOutputAttachment({
  ...base,
  data: Buffer.alloc(payload.byteLength, 0x42).toString('base64'),
}, ID), /内容摘要与附件标识不一致/)

const requests = []
const attachmentService = createCodeOutputAttachmentService({
  chat: { getSessionId: (conversationId) => conversationId === 'conversation-1' ? 'session-1' : null },
  conversationHub: { getSessionIdForConversation: () => 'session-1' },
  hostManager: {
    getApi: () => ({
      sessions: {
        attachment: async (request) => {
          requests.push(request)
          return { result: { ok: true, value: base } }
        },
      },
    }),
  },
  resolveIpcConversationId: async (requested) => requested ?? 'conversation-1',
})

assert.deepEqual(await attachmentService.get({
  conversationId: 'conversation-1',
  attachmentId: ID,
  sessionId: 'renderer-supplied-session',
  path: '/tmp/image.png',
}), base, 'only the main-process session is used; extra renderer fields are ignored')
assert.deepEqual(requests, [{ sessionId: 'session-1', attachmentId: ID }],
  'Host receives only the current session id and opaque attachment id')

const unauthorized = createCodeOutputAttachmentService({
  chat: { getSessionId: () => 'session-1' },
  conversationHub: { getSessionIdForConversation: () => 'different-session' },
  hostManager: { getApi: () => { throw new Error('Host must not be queried') } },
  resolveIpcConversationId: async () => 'conversation-1',
})
await assert.rejects(unauthorized.get({ attachmentId: ID }), /尚未绑定/,
  'a stale or mismatched projection cannot authorize an attachment read')

console.log('code output attachment authorization tests passed')
