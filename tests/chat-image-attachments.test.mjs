import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  createChatImageAttachmentService,
  detectImageMediaType,
  normalizeImageLimits,
} from '../desktop/backend/chat-image-attachments.mjs'
import { rpcValue } from '../desktop/backend/dsh-chat/prelude.mjs'
import { createDshChatSend } from '../desktop/backend/dsh-chat/chat-send.mjs'
import { createSerializeDshModel } from '../desktop/backend/model/serialize-model.mjs'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
)

test('detectImageMediaType accepts Buffer and Uint8Array signatures', () => {
  assert.equal(detectImageMediaType(onePixelPng), 'image/png')
  assert.equal(detectImageMediaType(new Uint8Array(onePixelPng)), 'image/png')
  assert.equal(detectImageMediaType(Buffer.from('not an image')), null)
})

test('image limits reject invalid values and retain supported media types', () => {
  assert.deepEqual(normalizeImageLimits({ maxImageBytes: -1, mediaTypes: ['image/png', 'image/svg+xml'] }), {
    maxImageBytes: 20 * 1024 * 1024,
    maxImagesPerMessage: 20,
    maxMessageImageBytes: 200 * 1024 * 1024,
    maxImagePixels: 64_000_000,
    maxImageDimension: 8192,
    mediaTypes: ['image/png'],
  })
})

test('drop intake reads selected image bytes without writing into the workspace', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-image-test-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const imagePath = path.join(directory, 'capture.png')
  await fs.writeFile(imagePath, onePixelPng)
  const workspacePath = path.join(directory, 'workspace')
  await fs.mkdir(workspacePath)

  const service = createChatImageAttachmentService({
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    chat: { getSessionId: () => null },
    conversationHub: null,
    hostManager: { getApi: () => ({ host: { describe: async () => ({
      ok: true,
      value: { imageLimits: { maxImageBytes: onePixelPng.byteLength, maxImagesPerMessage: 2 } },
    }) } }) },
    resolveIpcConversationId: async (id) => id,
  })

  const result = await service.readDroppedFile({ filePath: imagePath, conversationId: 'conversation-1' })
  assert.equal(result.mediaType, 'image/png')
  assert.equal(result.bytes, onePixelPng.byteLength)
  assert.equal(Buffer.from(result.data, 'base64').equals(onePixelPng), true)
  assert.deepEqual(await fs.readdir(workspacePath), [])
  const tooSmallService = createChatImageAttachmentService({
    dialog: {},
    chat: { getSessionId: () => null },
    conversationHub: null,
    hostManager: { getApi: () => ({ host: { describe: async () => ({
      ok: true,
      value: { imageLimits: { maxImageBytes: onePixelPng.byteLength - 1 } },
    }) } }) },
    resolveIpcConversationId: async (id) => id,
  })
  await assert.rejects(
    tooSmallService.readDroppedFile({ filePath: imagePath, conversationId: 'conversation-1' }),
    /不能超过/,
  )
})

test('historical image reads require a transcript reference and use the bounded cache', async () => {
  const attachmentId = `sha256:${createHash('sha256').update(onePixelPng).digest('hex')}`
  let reads = 0
  const api = {
    sessions: {
      attachment: async () => {
        reads += 1
        return {
          ok: true,
          value: {
            attachment: {
              attachmentId,
              mediaType: 'image/png',
              bytes: onePixelPng.byteLength,
              width: 1,
              height: 1,
            },
            data: onePixelPng.toString('base64'),
          },
        }
      },
    },
  }
  const service = createChatImageAttachmentService({
    dialog: {},
    chat: { getSessionId: () => 'session-1' },
    conversationHub: {
      getView: async () => ({ transcript: [{ images: [{ attachmentId }] }], toolRows: [] }),
      getSessionIdForConversation: () => 'session-1',
    },
    hostManager: { getApi: () => api },
    resolveIpcConversationId: async (id) => id,
  })

  const first = await service.getImage({ conversationId: 'conversation-1', attachmentId })
  const second = await service.getImage({ conversationId: 'conversation-1', attachmentId })
  assert.equal(first.data, onePixelPng.toString('base64'))
  assert.equal(second.data, first.data)
  assert.equal(reads, 1)
})

test('RPC errors preserve structured attachment reasons for localized UI handling', () => {
  assert.throws(() => rpcValue({ ok: false, error: {
    code: 'attachment-error',
    message: 'request rejected',
    details: { reason: 'MODEL_DOES_NOT_SUPPORT_IMAGES' },
  } }, 'send'), (error) => {
    assert.equal(error.code, 'attachment-error')
    assert.equal(error.details.reason, 'MODEL_DOES_NOT_SUPPORT_IMAGES')
    return true
  })
})

test('image-only user sends reach the Host prompt as image content blocks', async () => {
  const sentPrompts = []
  const activeTurn = {
    pendingQueuedTurns: 0,
    pendingPromptAdmissions: new Set(),
  }
  const service = createDshChatSend({
    ensureReady: async () => ({ sessions: { prompt: async (request) => {
      sentPrompts.push(request)
      return { ok: true, value: { accepted: true } }
    } } }),
    ensureSession: async () => ({
      sessionId: 'session-1',
      lastAppliedPermissionMode: 'ask',
    }),
    getWorkspacePath: async () => '/tmp/taskweaver-workspace',
    getPermissionMode: () => 'ask',
    running: new Map([['conversation-1', activeTurn]]),
    observedSequences: new Map(),
    cancellingSessions: new Set(),
    queueSnapshots: new Map(),
    logger: null,
    emit: () => {},
    ensurePermissionModeApplied: async () => {},
    configureModel: async () => {},
    selectedReasoningEffort: async () => null,
    ensureSessionModelSelection: async () => {},
    scheduleIdleHistoryReconciliation: () => {},
  })

  const attachment = { mediaType: 'image/png', data: onePixelPng.toString('base64'), name: 'capture.png' }
  const result = await service.send({
    text: '',
    modelKey: 'provider/vision-model',
    conversationId: 'conversation-1',
    cwdOverride: '/tmp/taskweaver-workspace',
    attachments: [attachment],
  })
  assert.deepEqual(result, { accepted: true, queued: true })
  assert.deepEqual(sentPrompts[0].content, [
    { type: 'text', text: '' },
    { type: 'image', ...attachment },
  ])
})

test('model serialization exposes explicit vision capabilities and leaves unknown models unknown', () => {
  const serialize = createSerializeDshModel({
    getPriceRegistry: () => ({}),
    getCatalogPriceMeta: () => ({}),
  })
  const provider = { id: 'provider' }
  const imageModel = serialize(provider, { id: 'vision', inputModalities: ['text', 'image'] }, new Set())
  assert.equal(imageModel.vision, true)
  const textModel = serialize(provider, { id: 'text' }, new Set(), null, { input: ['text'], vision: true })
  assert.equal(textModel.vision, false)
  const unknownModel = serialize(provider, { id: 'unknown' }, new Set())
  assert.equal(Object.hasOwn(unknownModel, 'vision'), false)
})
