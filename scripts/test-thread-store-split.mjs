import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createThreadStore } from '../backend/thread-store.mjs'

const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-thread-sqlite-test-'))
const execFileAsync = promisify(execFile)
const scriptsDir = path.dirname(fileURLToPath(import.meta.url))

async function writeLegacy(root, state) {
  const filePath = path.join(root, 'taskweaver-threads.json')
  const raw = `${JSON.stringify(state, null, 2)}\n`
  await fs.writeFile(filePath, raw, { mode: 0o600 })
  return { filePath, raw }
}

try {
  console.log('--- SQLite 迁移保留原始 V1 JSON，并逐项校验 thread/body ---')
  const v1Root = path.join(testRoot, 'v1')
  await fs.mkdir(v1Root)
  const v1Data = {
    currentThreadId: 'thread-1',
    threads: [
      {
        id: 'thread-1', conversationId: 'conv-1', title: '旧会话 1', workspacePath: '/ws/1',
        messages: [{ id: 'm1', author: 'user', text: '你好' }],
        tasks: [{ id: 't1', title: '任务 1' }], outputLogs: [{ id: 'l1', text: '日志 1' }],
        createdAt: 1000, updatedAt: 2000,
      },
      {
        id: 'thread-2', conversationId: 'conv-2', title: '旧会话 2', workspacePath: '/ws/2',
        messages: [{ id: 'm2', author: 'user', text: '另一个会话' }], tasks: [], outputLogs: [],
        createdAt: 1500, updatedAt: 2500,
      },
    ],
  }
  const { filePath: v1Path, raw: v1Raw } = await writeLegacy(v1Root, v1Data)
  const store = createThreadStore(v1Root, '/ws/default')
  const initial = await store.initialize()
  assert.equal(initial.id, 'thread-1')
  assert.equal(initial.title, '旧会话 1')
  assert.deepEqual(initial.messages, v1Data.threads[0].messages)
  assert.deepEqual(initial.tasks, v1Data.threads[0].tasks)
  assert.deepEqual(initial.outputLogs, v1Data.threads[0].outputLogs)
  assert.deepEqual(initial.threads.map((thread) => thread.id).sort(), ['thread-1', 'thread-2'])
  assert.deepEqual(initial.threads.map((thread) => thread.messageCount).sort(), [1, 1])
  assert.equal(await fs.readFile(v1Path, 'utf8'), v1Raw, 'migration must leave the legacy source byte-for-byte intact')
  assert.equal(await fs.readFile(`${v1Path}.pre-sqlite.bak`, 'utf8'), v1Raw, 'migration backup must preserve the exact source bytes')
  const db = new DatabaseSync(store.filePath, { readOnly: true })
  assert.equal(db.prepare("SELECT value FROM store_meta WHERE key = 'schema_version'").get().value, '2')
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM thread_summaries').get().count, 2)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM thread_bodies').get().count, 2)
  assert.equal(db.prepare('SELECT message_count FROM thread_summaries WHERE id = ?').get('thread-1').message_count, 1)
  db.close()
  console.log('✓ V1 JSON 迁移、备份、ID/数量/正文校验通过')

  console.log('--- 列表和单会话更新只读取摘要及目标正文 ---')
  const sqlite = new DatabaseSync(store.filePath)
  await store.updateConversation('conv-2', {
    messages: [
      ...v1Data.threads[1].messages,
      { id: 'm2a', author: 'assistant', text: '上一版已提交正文' },
    ],
  })
  sqlite.prepare('UPDATE thread_bodies SET body_json = ? WHERE thread_id = ?').run(
    JSON.stringify({ messages: {}, tasks: [], outputLogs: [] }), 'thread-2',
  )
  const summaryList = await store.listThreads()
  assert.equal(summaryList.length, 2, 'listing must remain usable when an unrelated body is damaged')
  const updated = await store.updateConversation('conv-1', {
    messages: [
      { id: 'm1', author: 'user', text: '你好' },
      { id: 'm1a', author: 'assistant', text: '收到' },
    ],
  })
  assert.equal(updated.messages.length, 2)
  assert.equal(updated.threads.find((thread) => thread.id === 'thread-1').messageCount, 2)
  await assert.rejects(store.getByConversationId('conv-2'), /会话正文结构损坏.*recoverConversation/)
  const recovered = await store.recoverConversation('conv-2')
  assert.deepEqual(recovered.messages, v1Data.threads[1].messages)
  assert.equal(recovered.threads.find((thread) => thread.id === 'thread-2').messageCount, 1)
  assert.equal(sqlite.prepare('SELECT previous_body_json FROM thread_bodies WHERE thread_id = ?').get('thread-2').previous_body_json, null)
  await assert.rejects(store.recoverConversation('conv-2'), /正文结构正常，无需恢复/)
  sqlite.close()
  await store.renameThread('thread-2', '新重命名标题')
  assert.equal((await store.listThreads()).find((thread) => thread.id === 'thread-2').title, '新重命名标题')
  console.log('✓ 会话列表不解析正文，局部更新与损坏隔离通过')

  console.log('--- fork/delete 在单个 SQLite 事务中维护正文和摘要 ---')
  const forked = await store.forkThread('thread-1', 'm1')
  assert.equal(forked.title, '旧会话 1 (分支)')
  assert.equal(forked.messages.length, 2, 'fork must preserve the complete selected turn')
  await store.deleteThread(forked.id)
  const afterDelete = new DatabaseSync(store.filePath, { readOnly: true })
  assert.equal(afterDelete.prepare('SELECT COUNT(*) AS count FROM thread_bodies WHERE thread_id = ?').get(forked.id).count, 0)
  afterDelete.close()
  const rollbackPath = path.join(v1Root, 'rollback-current-state.json')
  await store.exportRollbackSnapshot(rollbackPath)
  const rollback = JSON.parse(await fs.readFile(rollbackPath, 'utf8'))
  assert.equal(rollback.currentThreadId, (await store.getState()).currentThreadId)
  assert.deepEqual(rollback.threads.find((thread) => thread.id === 'thread-1').messages, updated.messages)
  await assert.rejects(store.exportRollbackSnapshot(rollbackPath), { code: 'EEXIST' })
  const cliRollbackPath = path.join(v1Root, 'rollback-cli.json')
  await execFileAsync(process.execPath, [path.join(scriptsDir, 'export-thread-store-rollback.mjs'), v1Root, cliRollbackPath])
  const cliRollback = JSON.parse(await fs.readFile(cliRollbackPath, 'utf8'))
  assert.deepEqual(cliRollback.threads.map((thread) => thread.id).sort(), ['thread-1', 'thread-2'])
  const expectedCliRecovery = await store.getByConversationId('conv-2')
  await store.updateConversation('conv-2', {
    messages: [...expectedCliRecovery.messages, { id: 'm2b', author: 'assistant', text: '恢复工具回归' }],
  })
  const recoveryDb = new DatabaseSync(store.filePath)
  recoveryDb.prepare('UPDATE thread_bodies SET body_json = ? WHERE thread_id = ?').run(
    JSON.stringify({ messages: {}, tasks: [], outputLogs: [] }), 'thread-2',
  )
  recoveryDb.close()
  const recoveryCli = await execFileAsync(process.execPath, [path.join(scriptsDir, 'recover-thread-store-conversation.mjs'), v1Root, 'conv-2'])
  assert.match(recoveryCli.stdout, /已恢复/)
  const recoveredByCli = await store.getByConversationId('conv-2')
  assert.deepEqual(recoveredByCli.messages, expectedCliRecovery.messages)
  await store.close()

  console.log('--- 已有 V2 摘要/分文件布局可迁移到 SQLite ---')
  const v2Root = path.join(testRoot, 'v2')
  const v2ThreadsDir = path.join(v2Root, 'threads')
  await fs.mkdir(v2ThreadsDir, { recursive: true })
  const v2Manifest = {
    version: 2,
    currentThreadId: 'v2-thread',
    threads: [{
      id: 'v2-thread', conversationId: 'v2-conv', workspacePath: '/ws/v2', title: 'V2 会话',
      titleSource: 'user', permissionMode: 'ask', pinned: false, archived: false,
      modelKey: null, thinkingLevel: null, createdAt: 3000, updatedAt: 4000, messageCount: 1,
    }],
  }
  const v2ManifestPath = path.join(v2Root, 'taskweaver-threads.json')
  const v2ManifestRaw = `${JSON.stringify(v2Manifest, null, 2)}\n`
  await fs.writeFile(v2ManifestPath, v2ManifestRaw, { mode: 0o600 })
  const v2Body = {
    id: 'v2-thread', conversationId: 'v2-conv',
    messages: [{ id: 'v2-message', author: 'user', text: '保留旧分文件正文' }], tasks: [], outputLogs: [],
  }
  const v2BodyPath = path.join(v2ThreadsDir, 'v2-thread.json')
  const v2BodyRaw = `${JSON.stringify(v2Body, null, 2)}\n`
  await fs.writeFile(v2BodyPath, v2BodyRaw, { mode: 0o600 })
  const v2Store = createThreadStore(v2Root, '/ws/default')
  const v2Imported = await v2Store.initialize()
  assert.deepEqual(v2Imported.messages, v2Body.messages)
  assert.equal(await fs.readFile(v2ManifestPath, 'utf8'), v2ManifestRaw)
  assert.equal(await fs.readFile(v2BodyPath, 'utf8'), v2BodyRaw)
  assert.equal(await fs.readFile(`${v2ManifestPath}.pre-sqlite.bak`, 'utf8'), v2ManifestRaw)
  await v2Store.close()
  console.log('✓ V2 分文件布局完整导入，旧源文件未被改写')

  console.log('--- 旧 SQLite schema 可原地升级，两个进程可并发首次迁移 ---')
  const oldSqliteRoot = path.join(testRoot, 'sqlite-v1')
  await fs.mkdir(oldSqliteRoot)
  const oldSqlitePath = path.join(oldSqliteRoot, 'taskweaver-threads.sqlite')
  const oldSqlite = new DatabaseSync(oldSqlitePath)
  oldSqlite.exec(`
    CREATE TABLE store_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE thread_summaries (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL UNIQUE, workspace_path TEXT, title TEXT NOT NULL,
      title_source TEXT NOT NULL, permission_mode TEXT NOT NULL, pinned INTEGER NOT NULL, archived INTEGER NOT NULL,
      model_key TEXT, thinking_level TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      message_count INTEGER NOT NULL CHECK(message_count >= 0)
    );
    CREATE INDEX thread_summaries_updated_idx ON thread_summaries(updated_at DESC);
    CREATE TABLE thread_bodies (
      thread_id TEXT PRIMARY KEY REFERENCES thread_summaries(id) ON DELETE CASCADE,
      body_json TEXT NOT NULL CHECK(json_valid(body_json))
    );
    INSERT INTO store_meta VALUES ('schema_version', '1');
    INSERT INTO store_meta VALUES ('current_thread_id', 'sqlite-v1-thread');
    INSERT INTO thread_summaries VALUES (
      'sqlite-v1-thread', 'sqlite-v1-conversation', '/ws/v1', 'SQLite v1', 'user', 'ask',
      0, 0, NULL, NULL, 500, 500, 1
    );
    INSERT INTO thread_bodies VALUES (
      'sqlite-v1-thread', '{"messages":[{"id":"v1-message","author":"user","text":"保留旧 SQLite 正文"}],"tasks":[],"outputLogs":[]}'
    );
  `)
  oldSqlite.close()
  const upgradedStore = createThreadStore(oldSqliteRoot, null)
  const upgraded = await upgradedStore.initialize()
  assert.equal(upgraded.messages[0].id, 'v1-message')
  const upgradedDb = new DatabaseSync(oldSqlitePath, { readOnly: true })
  assert.equal(upgradedDb.prepare("SELECT value FROM store_meta WHERE key = 'schema_version'").get().value, '2')
  assert.equal(upgradedDb.prepare('SELECT previous_body_json FROM thread_bodies WHERE thread_id = ?').get('sqlite-v1-thread').previous_body_json, null)
  upgradedDb.close()
  await upgradedStore.close()

  const concurrentRoot = path.join(testRoot, 'concurrent-migration')
  await fs.mkdir(concurrentRoot)
  const concurrentState = {
    currentThreadId: 'concurrent-1',
    threads: [
      { id: 'concurrent-1', conversationId: 'concurrent-conv-1', messages: [{ id: 'c1', text: 'one' }], tasks: [], outputLogs: [] },
      { id: 'concurrent-2', conversationId: 'concurrent-conv-2', messages: [{ id: 'c2', text: 'two' }], tasks: [], outputLogs: [] },
    ],
  }
  const { filePath: concurrentLegacyPath, raw: concurrentRaw } = await writeLegacy(concurrentRoot, concurrentState)
  const initializeChild = path.join(scriptsDir, 'fixtures', 'initialize-thread-store.mjs')
  const concurrentStarts = await Promise.all(Array.from({ length: 4 }, () =>
    execFileAsync(process.execPath, [initializeChild, concurrentRoot])))
  for (const child of concurrentStarts) {
    assert.deepEqual(JSON.parse(child.stdout).threadIds, ['concurrent-1', 'concurrent-2'])
  }
  assert.equal(await fs.readFile(concurrentLegacyPath, 'utf8'), concurrentRaw)
  const concurrentDb = new DatabaseSync(path.join(concurrentRoot, 'taskweaver-threads.sqlite'), { readOnly: true })
  assert.equal(concurrentDb.prepare('SELECT COUNT(*) AS count FROM thread_summaries').get().count, 2)
  assert.equal(concurrentDb.prepare('SELECT COUNT(*) AS count FROM thread_bodies').get().count, 2)
  concurrentDb.close()
  console.log('✓ SQLite v1 升级与四进程并发首次迁移都保留完整正文、摘要和原始文件')

  console.log('--- 中断迁移回滚事务并可安全重试 ---')
  const failedRoot = path.join(testRoot, 'failed')
  await fs.mkdir(failedRoot)
  const failureState = {
    currentThreadId: 'failure-1',
    threads: [
      { id: 'failure-1', conversationId: 'failure-conv-1', messages: [{ id: 'a', text: 'a' }], tasks: [], outputLogs: [] },
      { id: 'failure-2', conversationId: 'failure-conv-2', messages: [{ id: 'b', text: 'b' }], tasks: [], outputLogs: [] },
    ],
  }
  const { filePath: failedLegacyPath, raw: failedRaw } = await writeLegacy(failedRoot, failureState)
  const failedDbPath = path.join(failedRoot, 'taskweaver-threads.sqlite')
  const rawDb = new DatabaseSync(failedDbPath)
  rawDb.exec(`
    CREATE TABLE store_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE thread_summaries (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL UNIQUE, workspace_path TEXT, title TEXT NOT NULL,
      title_source TEXT NOT NULL, permission_mode TEXT NOT NULL, pinned INTEGER NOT NULL, archived INTEGER NOT NULL,
      model_key TEXT, thinking_level TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      message_count INTEGER NOT NULL CHECK(message_count >= 0)
    );
    CREATE INDEX thread_summaries_updated_idx ON thread_summaries(updated_at DESC);
    CREATE TABLE thread_bodies (
      thread_id TEXT PRIMARY KEY REFERENCES thread_summaries(id) ON DELETE CASCADE,
      body_json TEXT NOT NULL CHECK(json_valid(body_json))
    );
    CREATE TRIGGER fail_second_body BEFORE INSERT ON thread_bodies WHEN NEW.thread_id = 'failure-2'
      BEGIN SELECT RAISE(ABORT, 'injected migration failure'); END;
  `)
  rawDb.close()
  const failedStore = createThreadStore(failedRoot, '/ws/default')
  await assert.rejects(failedStore.initialize(), /injected migration failure/)
  assert.equal(await fs.readFile(failedLegacyPath, 'utf8'), failedRaw, 'failed migration must not change its source')
  const afterFailure = new DatabaseSync(failedDbPath)
  assert.equal(afterFailure.prepare('SELECT COUNT(*) AS count FROM thread_summaries').get().count, 0, 'failed migration must roll back earlier rows')
  assert.equal(afterFailure.prepare("SELECT value FROM store_meta WHERE key = 'schema_version'").get(), undefined)
  afterFailure.exec('DROP TRIGGER fail_second_body')
  afterFailure.close()
  const retried = await failedStore.initialize()
  assert.equal(retried.threads.length, 2)
  assert.equal(retried.messages[0].id, 'a')
  await failedStore.close()
  console.log('✓ 事务失败完整回滚，修复暂时故障后可重试')

  console.log('SQLite session store migration, locality, recovery, fork and delete checks passed')
} finally {
  await fs.rm(testRoot, { recursive: true, force: true })
}
