import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMemoryStore, buildMemoryPromptSections } from '../electron/backend/memory-store.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-memory-'))
try {
  const memory = createMemoryStore({ agentDataPath: root })
  const id = 'conv-test'
  await memory.init(id, '/tmp/ws', '实现登录限流')
  const loaded = await memory.load(id)
  assert.equal(loaded.user_goal, '实现登录限流')

  await memory.recordTaskResult(id, { id: 'T1', title: '调研', taskType: 'research', statusLabel: '已完成' }, { text: '找到 auth 模块' })
  const block = buildMemoryPromptSections(await memory.load(id), { id: 'T2', title: '实现', dependsOn: ['T1'] }, {})
  assert.match(block, /项目目标 L0/)
  assert.match(block, /T1/)
  assert.match(block, /auth 模块/)

  console.log('memory-store checks passed: L0 init, L1/L2 prompt sections')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
