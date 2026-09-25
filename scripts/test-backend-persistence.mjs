import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAppStateStore } from '../electron/backend/app-state-store.mjs'
import { SessionManager } from '../electron/agent/agent-runtime.mjs'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-backend-'))

try {
  const legacyDataPath = path.join(tempRoot, 'legacy-app-data')
  await fs.mkdir(legacyDataPath, { recursive: true })
  const legacyConversationId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  await fs.writeFile(path.join(legacyDataPath, 'taskweaver-app-state.json'), JSON.stringify({
    workspacePath: path.join(tempRoot, 'legacy-workspace'),
    conversationId: legacyConversationId,
    threadTitle: '旧版本会话',
    permissionMode: 'on-risk',
    messages: [{ id: 'legacy-message', author: 'user', text: '从单会话迁移' }],
    tasks: [{ id: 'T1', title: '旧 DAG' }],
  }))
  const migratedStore = createAppStateStore(legacyDataPath, path.join(tempRoot, 'fallback'))
  const migrated = await migratedStore.getState()
  assert.equal(migrated.conversationId, legacyConversationId)
  assert.equal(migrated.threadTitle, '旧版本会话')
  assert.equal(migrated.permissionMode, 'on-risk')
  assert.equal(migrated.messages[0].id, 'legacy-message')
  assert.equal(migrated.tasks[0].id, 'T1')

  const workspace = path.join(tempRoot, 'workspace')
  const store = createAppStateStore(path.join(tempRoot, 'app-data'), workspace)
  const firstState = await store.getState()
  assert.match(firstState.conversationId, /^[a-f\d-]{36}$/i)
  assert.equal(firstState.workspacePath, workspace)
  assert.equal(firstState.threads.length, 1)

  await store.appendMessages({ id: 'message-1', author: 'user', text: '持久化检查' })
  await store.appendOutputLog({ id: 'trace-1', toolName: 'read', status: 'done', inputSummary: 'src/main.ts', resultSummary: '读取完成', startedAt: 100 })
  const firstThread = await store.getState()
  assert.equal(firstThread.messages.length, 1)
  assert.equal(firstThread.threadTitle, '持久化检查')
  assert.equal(firstThread.outputLogs[0].id, 'trace-1')
  assert.equal((await store.listOutputLogs({ query: 'main.ts' })).length, 1)

  const otherWorkspace = path.join(tempRoot, 'other-workspace')
  await fs.mkdir(otherWorkspace, { recursive: true })
  const secondThread = await store.createThread({ workspacePath: otherWorkspace })
  assert.notEqual(secondThread.conversationId, firstThread.conversationId)
  assert.equal(secondThread.workspacePath, otherWorkspace)
  await store.appendMessages({ id: 'message-2', author: 'user', text: '另一个项目' })
  assert.equal((await store.getState()).messages.length, 1)
  assert.equal((await store.listOutputLogs()).length, 0, 'tool output must not leak across threads')
  for (let index = 0; index < 160; index += 1) {
    await store.appendOutputLog({ id: `bounded-${index}`, toolName: 'bash', status: index === 159 ? 'error' : 'done', inputSummary: `command-${index}`, resultSummary: 'output' })
  }
  assert.equal((await store.listOutputLogs()).length, 150, 'output log should stay bounded')
  assert.equal((await store.listOutputLogs({ status: 'error' })).length, 1)

  const restoredFirst = await store.switchThread(firstThread.currentThreadId)
  assert.equal(restoredFirst.messages[0].id, 'message-1')
  assert.equal(restoredFirst.workspacePath, workspace)
  assert.equal(restoredFirst.conversationId, firstThread.conversationId)

  const renamed = await store.renameThread(firstThread.currentThreadId, '持久化会话')
  assert.equal(renamed.find((thread) => thread.id === firstThread.currentThreadId)?.title, '持久化会话')

  const switchedWorkspace = await store.setWorkspace(otherWorkspace)
  assert.equal(switchedWorkspace.workspacePath, otherWorkspace)
  assert.equal(switchedWorkspace.messages.length, 0)
  assert.notEqual(switchedWorkspace.conversationId, secondThread.conversationId)
  assert.equal((await store.listThreads()).length, 3, 'changing projects should preserve prior threads')

  const restoredAfterRestart = createAppStateStore(path.join(tempRoot, 'app-data'), workspace)
  assert.equal((await restoredAfterRestart.switchThread(firstThread.currentThreadId)).messages[0].id, 'message-1')
  
  // Test forkThread
  await restoredAfterRestart.appendMessages(
    { id: 'fork-step-1', author: 'user', text: '步骤1' },
    { id: 'fork-step-2', author: 'assistant', text: '步骤2' },
    { id: 'fork-step-3', author: 'user', text: '步骤3' },
  )
  const forkedState = await restoredAfterRestart.forkThread(firstThread.currentThreadId, 'fork-step-2')
  assert.equal(forkedState.workspacePath, workspace, 'forked thread must inherit workspace')
  assert.ok(forkedState.threadTitle.includes('(分支)'), 'forked thread title should indicate branch')
  assert.equal(forkedState.messages.length, 3, 'forked thread should have sliced messages up to cut point (message-1, step-1, step-2)')
  assert.equal(forkedState.messages[forkedState.messages.length - 1].id, 'fork-step-2')
  assert.notEqual(forkedState.currentThreadId, firstThread.currentThreadId, 'forked thread should have a new ID')

  // Test togglePinThread
  const pinnedList = await restoredAfterRestart.togglePinThread(firstThread.currentThreadId)
  assert.equal(pinnedList.find((t) => t.id === firstThread.currentThreadId)?.pinned, true, 'thread should be pinned')
  const unpinnedList = await restoredAfterRestart.togglePinThread(firstThread.currentThreadId)
  assert.equal(unpinnedList.find((t) => t.id === firstThread.currentThreadId)?.pinned, false, 'thread should be unpinned')

  await store.switchThread(switchedWorkspace.currentThreadId)

  const clearedState = await store.clearConversation()
  assert.notEqual(clearedState.conversationId, switchedWorkspace.conversationId)
  assert.equal(clearedState.messages.length, 0)

  const sessionDir = path.join(tempRoot, 'sessions')
  const sessionFile = path.join(sessionDir, `${firstState.conversationId}.jsonl`)
  const manager = SessionManager.open(sessionFile, sessionDir, workspace)
  manager.appendMessage({ role: 'user', content: '执行记录持久化', timestamp: Date.now() })
  manager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: '已保存' }],
    api: 'openai-completions',
    provider: 'openai',
    model: 'test-model',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  })
  const originalSessionId = manager.getSessionId()

  const restored = SessionManager.open(sessionFile, sessionDir, workspace)
  assert.equal(restored.getSessionId(), originalSessionId)
  assert.equal(restored.buildSessionContext().messages[0].content, '执行记录持久化')

  console.log('backend persistence checks passed: legacy migration, isolated workspaces/threads, rename, new-thread flow and session restore')
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}
