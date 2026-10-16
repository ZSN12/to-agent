import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRewindStore } from '../backend/rewind-store.mjs'
import { resolveForkCompletedTurns, sliceForkMessages } from '../backend/fork-turns.mjs'
import { createHandleEnvelope } from '../backend/dsh-chat/envelope-dispatch.mjs'
import { createEmptyTurnActivity } from '../backend/turn-activity.mjs'

async function recordTurn(store, { conversationId, workspacePath, sessionId, turn, content }) {
  const callId = `call-${turn}`
  assert.equal(await store.captureBefore({
    conversationId,
    workspacePath,
    turn,
    sessionId,
    callId,
    toolName: 'write',
    input: { file_path: 'src/example.ts', content },
  }), true)
  await fs.writeFile(path.join(workspacePath, 'src/example.ts'), content)
  assert.equal(await store.markToolResult({ conversationId, sessionId, callId, success: true }), true)
  await store.finalizeTurn({ conversationId, workspacePath, turn })
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-rewind-'))
try {
  const userDataPath = path.join(tempRoot, 'user-data')
  const workspacePath = path.join(tempRoot, 'workspace')
  const workspaceConflictPath = path.join(tempRoot, 'workspace-conflict')
  const workspaceEventPath = path.join(tempRoot, 'workspace-events')
  const workspaceLargeFilePath = path.join(tempRoot, 'workspace-large-file')
  await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true })
  await fs.mkdir(path.join(workspaceConflictPath, 'src'), { recursive: true })
  await fs.mkdir(path.join(workspaceEventPath, 'src'), { recursive: true })
  await fs.mkdir(path.join(workspaceLargeFilePath, 'src'), { recursive: true })
  await fs.writeFile(path.join(workspacePath, 'src/example.ts'), 'initial\n')
  await fs.writeFile(path.join(workspaceConflictPath, 'src/example.ts'), 'initial\n')
  await fs.writeFile(path.join(workspaceEventPath, 'src/example.ts'), 'initial\n')
  await fs.writeFile(path.join(workspaceLargeFilePath, 'src/example.ts'), 'initial\n')

  const store = createRewindStore(userDataPath)
  const conversationId = 'test-rewind-safe'
  const conflictConversationId = 'test-rewind-conflict'
  const messages = [
    { id: 'user-1', author: 'user', text: '第一轮' },
    { id: 'assistant-1', author: 'assistant', text: '完成一' },
    { id: 'user-2', author: 'user', text: '第二轮' },
    { id: 'assistant-2', author: 'assistant', text: '完成二' },
    { id: 'user-3', author: 'user', text: '第三轮' },
    { id: 'assistant-3', author: 'assistant', text: '完成三' },
  ]

  for (const [turn, content] of [[1, 'one\n'], [2, 'two\n'], [3, 'three\n']]) {
    await recordTurn(store, { conversationId, workspacePath, sessionId: 'host-safe', turn, content })
    await recordTurn(store, { conversationId: conflictConversationId, workspacePath: workspaceConflictPath, sessionId: 'host-conflict', turn, content })
  }

  const eventConversationId = 'test-rewind-events'
  const eventSessionId = 'host-rewind-events'
  const eventTurn = {
    eventConversationId,
    workspacePath: workspaceEventPath,
    taskId: null,
    command: false,
    silentText: false,
    webContents: null,
    thinking: '',
    thinkingStartedAt: null,
    thinkingEndedAt: null,
    toolCalls: 0,
    toolResults: 0,
    toolCallsById: new Map(),
    fileChanges: new Map(),
    turnActivity: createEmptyTurnActivity(),
  }
  const eventSessions = new Map([[
    eventConversationId,
    { sessionId: eventSessionId, ownerConversationId: eventConversationId },
  ]])
  const handleEnvelope = createHandleEnvelope({
    sessions: eventSessions,
    running: new Map([[eventConversationId, eventTurn]]),
    observedSequences: new Map(),
    queueSnapshots: new Map(),
    pendingQuestions: new Map(),
    orchestrationRuns: new Map(),
    fanoutMuxFrame() {},
    registerPendingApproval() {},
    settleApproval() {},
    emitPermission() {},
    emitUserQuestion() {},
    getPermissionMode: () => 'ask',
    emit() {},
    finishTurn() {},
    recoverSession: async () => {},
    rewindStore: store,
  })
  let sequence = 0
  const dispatchEvent = (type, turn, data) => handleEnvelope({}, {
    payload: {
      type: 'session/event',
      sessionId: eventSessionId,
      event: { seq: sequence++, time: Date.now(), type, data },
    },
  })
  for (const [turn, content] of [[1, 'one\n'], [2, 'two\n'], [3, 'three\n']]) {
    const callId = `event-call-${turn}`
    const before = await fs.readFile(path.join(workspaceEventPath, 'src/example.ts'), 'utf8')
    await dispatchEvent('tool/call', turn, {
      turn,
      step: 1,
      callId,
      name: 'write',
      arguments: JSON.stringify({ file_path: 'src/example.ts', content }),
    })
    await fs.writeFile(path.join(workspaceEventPath, 'src/example.ts'), content)
    await dispatchEvent('tool/result', turn, {
      message: {
        source: { callId },
        content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: 'Updated file' }] }],
      },
      meta: { diffs: [{ path: 'src/example.ts', oldText: before, newText: content }] },
    })
    await dispatchEvent('turn/end', turn, { turn, reason: { kind: 'completed' } })
  }
  const eventPreview = await store.preview({ conversationId: eventConversationId, workspacePath: workspaceEventPath, targetTurn: 1 })
  assert.deepEqual(eventPreview.conflicts, [])
  await store.restore({ conversationId: eventConversationId, workspacePath: workspaceEventPath, targetTurn: 1 })
  assert.equal(await fs.readFile(path.join(workspaceEventPath, 'src/example.ts'), 'utf8'), 'one\n')

  const selectedMessages = sliceForkMessages(messages, 'user-1')
  assert.equal(resolveForkCompletedTurns(messages, 'user-1'), 1)
  assert.deepEqual(selectedMessages.map((message) => message.id), ['user-1', 'assistant-1'])

  const safePreview = await store.preview({ conversationId, workspacePath, targetTurn: 1 })
  assert.deepEqual(safePreview.conflicts, [])
  assert.deepEqual(safePreview.unavailable, [])
  assert.equal(safePreview.fileCount, 1)
  const restored = await store.restore({ conversationId, workspacePath, targetTurn: 1 })
  assert.equal(restored.ok, true)
  assert.deepEqual(restored.restoredFiles, ['src/example.ts'])
  assert.equal(await fs.readFile(path.join(workspacePath, 'src/example.ts'), 'utf8'), 'one\n')

  await fs.writeFile(path.join(workspaceConflictPath, 'src/example.ts'), 'external change\n')
  const conflictPreview = await store.preview({
    conversationId: conflictConversationId,
    workspacePath: workspaceConflictPath,
    targetTurn: 1,
  })
  assert.deepEqual(conflictPreview.conflicts, ['src/example.ts'])
  const refused = await store.restore({
    conversationId: conflictConversationId,
    workspacePath: workspaceConflictPath,
    targetTurn: 1,
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.reason, 'conflicts')
  assert.equal(await fs.readFile(path.join(workspaceConflictPath, 'src/example.ts'), 'utf8'), 'external change\n')

  await fs.writeFile(path.join(workspaceConflictPath, 'src/example.ts'), 'new external change\n')
  const staleConfirmation = await store.restore({
    conversationId: conflictConversationId,
    workspacePath: workspaceConflictPath,
    targetTurn: 1,
    confirmationToken: conflictPreview.conflictToken,
  })
  assert.equal(staleConfirmation.ok, false)
  assert.equal(staleConfirmation.reason, 'conflicts')
  assert.equal(await fs.readFile(path.join(workspaceConflictPath, 'src/example.ts'), 'utf8'), 'new external change\n')

  const latestConflictPreview = await store.preview({
    conversationId: conflictConversationId,
    workspacePath: workspaceConflictPath,
    targetTurn: 1,
  })
  const confirmed = await store.restore({
    conversationId: conflictConversationId,
    workspacePath: workspaceConflictPath,
    targetTurn: 1,
    confirmationToken: latestConflictPreview.conflictToken,
  })
  assert.equal(confirmed.ok, true)
  assert.equal(await fs.readFile(path.join(workspaceConflictPath, 'src/example.ts'), 'utf8'), 'one\n')

  const escaped = await store.captureBefore({
    conversationId,
    workspacePath,
    turn: 4,
    sessionId: 'host-safe',
    callId: 'call-escape',
    toolName: 'write',
    input: { file_path: '../outside.txt', content: 'bad' },
  })
  assert.equal(escaped, false)

  const largeConversationId = 'test-rewind-large-postimage'
  const largeFileCallId = 'call-large-postimage'
  assert.equal(await store.captureBefore({
    conversationId: largeConversationId,
    workspacePath: workspaceLargeFilePath,
    turn: 1,
    sessionId: 'host-large-postimage',
    callId: largeFileCallId,
    toolName: 'write',
    input: { file_path: 'src/example.ts', content: 'large output' },
  }), true)
  await fs.writeFile(path.join(workspaceLargeFilePath, 'src/example.ts'), Buffer.alloc(16 * 1024 * 1024 + 1, 0x61))
  await store.markToolResult({
    conversationId: largeConversationId,
    sessionId: 'host-large-postimage',
    callId: largeFileCallId,
    success: true,
  })
  await store.finalizeTurn({ conversationId: largeConversationId, workspacePath: workspaceLargeFilePath, turn: 1 })
  const largePreview = await store.preview({
    conversationId: largeConversationId,
    workspacePath: workspaceLargeFilePath,
    targetTurn: 1,
  })
  assert.deepEqual(largePreview.unavailable, ['src/example.ts'])

  const snapshotPath = path.join(userDataPath, 'taskweaver', 'rewind', Buffer.from(conversationId).toString('base64url'))
  assert.equal((await fs.stat(snapshotPath)).mode & 0o777, 0o700)
  assert.equal((await fs.stat(path.join(snapshotPath, '1.json'))).mode & 0o777, 0o600)
  console.log('rewind-store: ok (Host tool-event capture, three-turn rewind, transcript fork point, conflict refusal/stale-token recheck/confirmation, path fence, private snapshots)')
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}
