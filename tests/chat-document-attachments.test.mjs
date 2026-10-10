import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createChatDocumentAttachmentService } from '../desktop/backend/chat-document-attachments.mjs'
import { createDshChatSend } from '../desktop/backend/dsh-chat/chat-send.mjs'

const pdf = Buffer.from('%PDF-1.7\nGenerated attachment fixture\n%%EOF\n')

async function fixtureFiles(t, names = ['brief.pdf']) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-document-attachment-test-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const paths = new Map()
  for (const name of names) {
    const filePath = path.join(directory, name)
    await fs.writeFile(filePath, name.endsWith('.pdf') ? pdf : Buffer.from('not an Office archive'))
    paths.set(name, filePath)
  }
  return { directory, paths }
}

function serviceFor(dialog) {
  return createChatDocumentAttachmentService({
    dialog,
    resolveIpcConversationId: async id => id,
  })
}

test('stages external documents as opaque conversation-scoped handles and consumes bytes once', async (t) => {
  const { paths } = await fixtureFiles(t)
  const service = serviceFor({ showOpenDialog: async () => ({ canceled: true, filePaths: [] }) })
  const staged = await service.stageDroppedFile({ filePath: paths.get('brief.pdf'), conversationId: 'conversation-a' })

  assert.deepEqual(Object.keys(staged).sort(), ['bytes', 'id', 'kind', 'name'])
  assert.equal(staged.kind, 'pdf')
  assert.equal(staged.bytes, pdf.byteLength)
  assert.equal('data' in staged, false)
  await assert.rejects(service.takeDocuments({ ids: [staged.id], conversationId: 'conversation-b' }), /not belong|不属于当前会话/u)

  const [consumed] = await service.takeDocuments({ ids: [staged.id], conversationId: 'conversation-a' })
  assert.equal(consumed.name, 'brief.pdf')
  assert.equal(Buffer.from(consumed.data, 'base64').equals(pdf), true)
  await assert.rejects(service.takeDocuments({ ids: [staged.id], conversationId: 'conversation-a' }), /expired|已过期/u)
})

test('combined picker rolls back partial staging when one selected document is invalid', async (t) => {
  const names = ['valid.pdf', 'invalid.docx', ...Array.from({ length: 8 }, (_, index) => `retry-${index}.pdf`)]
  const { paths } = await fixtureFiles(t, names)
  let selected = ['valid.pdf', 'invalid.docx']
  const service = serviceFor({
    showOpenDialog: async () => ({ canceled: false, filePaths: selected.map(name => paths.get(name)) }),
  })
  const imageService = { readSelectedFiles: async () => [] }

  await assert.rejects(service.pickAttachments({
    conversationId: 'conversation-a',
    imageService,
    workspaceReferenceForPath: async () => null,
  }), /Office|文件扩展名|有效/u)

  selected = names.slice(2)
  const result = await service.pickAttachments({
    conversationId: 'conversation-a',
    imageService,
    workspaceReferenceForPath: async () => null,
  })
  assert.equal(result.documents.length, 8)
  assert.deepEqual(result.documents.map(document => document.kind), Array(8).fill('pdf'))
  const consumed = await service.takeDocuments({ ids: result.documents.map(document => document.id), conversationId: 'conversation-a' })
  assert.equal(consumed.length, 8)
})

test('workspace documents stay references while external documents become staged chips', async (t) => {
  const { paths } = await fixtureFiles(t, ['inside.pdf', 'outside.pdf'])
  const service = serviceFor({
    showOpenDialog: async () => ({ canceled: false, filePaths: [paths.get('inside.pdf'), paths.get('outside.pdf')] }),
  })
  const result = await service.pickAttachments({
    conversationId: 'conversation-a',
    imageService: { readSelectedFiles: async () => [] },
    workspaceReferenceForPath: async filePath => filePath === paths.get('inside.pdf')
      ? { path: 'inside.pdf', kind: 'file', token: '@file:inside.pdf' }
      : null,
  })

  assert.deepEqual(result.references, [{ path: 'inside.pdf', kind: 'file', token: '@file:inside.pdf' }])
  assert.deepEqual(result.documents.map(({ name, kind }) => ({ name, kind })), [{ name: 'outside.pdf', kind: 'pdf' }])
})

test('staged document count is capped per conversation and releasing a chip frees its slot', async (t) => {
  const { paths } = await fixtureFiles(t)
  const service = serviceFor({ showOpenDialog: async () => ({ canceled: true, filePaths: [] }) })
  const staged = []
  for (let index = 0; index < 8; index += 1) {
    staged.push(await service.stageDroppedFile({ filePath: paths.get('brief.pdf'), conversationId: 'conversation-a' }))
  }
  await assert.rejects(
    service.stageDroppedFile({ filePath: paths.get('brief.pdf'), conversationId: 'conversation-a' }),
    error => error?.details?.reason === 'TOO_MANY_DOCUMENTS',
  )
  assert.deepEqual(await service.releaseDocuments({ ids: [staged[0].id], conversationId: 'conversation-a' }), { released: 1 })
  const replacement = await service.stageDroppedFile({ filePath: paths.get('brief.pdf'), conversationId: 'conversation-a' })
  assert.equal(replacement.kind, 'pdf')
})

test('document chip payload reaches the Host prompt as document content without renderer file bytes', async () => {
  const sentPrompts = []
  const activeTurn = { pendingQueuedTurns: 0, pendingPromptAdmissions: new Set() }
  const service = createDshChatSend({
    ensureReady: async () => ({ sessions: { prompt: async request => {
      sentPrompts.push(request)
      return { ok: true, value: { accepted: true } }
    } } }),
    ensureSession: async () => ({ sessionId: 'session-document', lastAppliedPermissionMode: 'ask' }),
    getWorkspacePath: async () => '/tmp',
    getPermissionMode: () => 'ask',
    running: new Map([['conversation-a', activeTurn]]),
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
  const data = pdf.toString('base64')

  const result = await service.send({
    text: '',
    modelKey: 'provider/model',
    conversationId: 'conversation-a',
    cwdOverride: '/tmp',
    documents: [{ name: 'brief.pdf', data }],
  })

  assert.deepEqual(result, { accepted: true, queued: true })
  assert.deepEqual(sentPrompts[0]?.content, [
    { type: 'text', text: '' },
    { type: 'document', name: 'brief.pdf', data },
  ])
})
