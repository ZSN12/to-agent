import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createThreadStore } from '../electron/backend/thread-store.mjs'

console.log('--- 开始测试 ThreadStore 会话归档、搜索与生命周期隔离 ---')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-thread-test-'))

try {
  const store = createThreadStore(tmpDir, '/default/workspace')
  await store.initialize()

  // 1. 创建属于不同工作区的测试会话
  const state1 = await store.createThread({
    title: '用户登录模块重构',
    workspacePath: '/Users/test/projects/frontend',
  })
  const t1 = state1.threads.find((t) => t.title === '用户登录模块重构')

  const state2 = await store.createThread({
    title: '数据库连接池优化',
    workspacePath: '/Users/test/projects/backend',
  })
  const t2 = state2.threads.find((t) => t.title === '数据库连接池优化')

  const state3 = await store.createThread({
    title: '临时快速脚本草稿',
    workspacePath: null,
  })
  const t3 = state3.threads.find((t) => t.title === '临时快速脚本草稿')

  assert.ok(t1 && t2 && t3)
  assert.equal(t1.archived, false)
  assert.equal(t2.archived, false)
  assert.equal(t3.archived, false)

  // 2. 验证置顶功能
  const pinnedList = await store.togglePinThread(t1.id)
  const pinnedT1 = pinnedList.find((t) => t.id === t1.id)
  assert.equal(pinnedT1?.pinned, true)

  // 3. 验证归档与取消归档
  const archiveList1 = await store.toggleArchiveThread(t2.id)
  const archivedT2 = archiveList1.find((t) => t.id === t2.id)
  assert.equal(archivedT2?.archived, true, 't2 应当标记为已归档')

  const threadsAfterArchive = await store.listThreads()
  const foundT2 = threadsAfterArchive.find((t) => t.id === t2.id)
  assert.equal(foundT2?.archived, true)

  const archiveList2 = await store.toggleArchiveThread(t2.id)
  const unarchivedT2 = archiveList2.find((t) => t.id === t2.id)
  assert.equal(unarchivedT2?.archived, false, '再次调用应当取消归档')

  // 再次归档 t2 便于后续测试
  await store.toggleArchiveThread(t2.id)

  // 4. 验证会话搜索 (searchThreads)
  // 4.1 按标题关键词搜索
  const searchLogin = await store.searchThreads('登录')
  assert.equal(searchLogin.length, 1)
  assert.equal(searchLogin[0].id, t1.id)

  // 4.2 按工作区过滤搜索
  const searchBackend = await store.searchThreads('', { workspacePath: '/Users/test/projects/backend' })
  assert.equal(searchBackend.length, 1)
  assert.equal(searchBackend[0].id, t2.id)

  // 4.3 搜索不存在的关键词
  const searchNone = await store.searchThreads('不存在的内容XYZ')
  assert.equal(searchNone.length, 0)

  // 5. 验证重命名
  await store.renameThread(t3.id, '快速脚本 (已定稿)')
  const threadsAfterRename = await store.listThreads()
  const renamedT3 = threadsAfterRename.find((t) => t.id === t3.id)
  assert.equal(renamedT3?.title, '快速脚本 (已定稿)')

  // 6. 验证删除会话
  const stateAfterDelete = await store.deleteThread(t1.id)
  assert.ok(!stateAfterDelete.threads.some((t) => t.id === t1.id), '被删除的 t1 不应存在')

  // 7. 验证独立工作区持久化与跨重启数据恢复
  const newStore = createThreadStore(tmpDir, '/default/workspace')
  const reloaded = await newStore.listThreads()
  assert.ok(reloaded.length >= 2, '重启重建 store 后数据应完整恢复')
  const reloadedT2 = reloaded.find((t) => t.id === t2.id)
  assert.equal(reloadedT2?.archived, true, '已归档状态在重启后应持久保留')

  console.log('✓ ThreadStore 会话创建、归档、搜索、重命名、删除及跨启动持久化测试全部通过！')
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
