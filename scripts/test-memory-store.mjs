import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMemoryStore, buildMemoryPromptSections, memoryPromptLimits } from '../electron/backend/memory-store.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-memory-'))
try {
  const memory = createMemoryStore({ agentDataPath: root })
  const id = 'conv-test'
  await memory.init(id, '/tmp/ws', '实现登录限流')
  const firstRunId = 'run-one'
  await memory.beginRun(id, firstRunId)
  const loaded = await memory.load(id)
  assert.equal(loaded.user_goal, '实现登录限流')

  await memory.recordTaskResult(id, { id: 'T1', runId: firstRunId, title: '调研', taskType: 'research', statusLabel: '已完成' }, {
    text: '找到 auth 模块',
    executionEvidence: { source: 'z-host-tool-events', observedToolCalls: [{ toolName: 'read', status: 'done', inputSummary: 'README.md' }] },
  })
  await memory.recordTaskResult(id, { id: 'T2', runId: firstRunId, title: '样式整理', taskType: 'implementation', statusLabel: '已完成' }, { text: '调整按钮间距与颜色' })
  await memory.recordTaskResult(id, { id: 'T3', runId: firstRunId, title: '限流实现', taskType: 'implementation', statusLabel: '已完成' }, { text: 'rateLimitRequest 在 auth 中校验请求频率' })
  const evidenceBundle = {
    task_id: 'T2',
    failure_class: 'execution',
    error_summary: '测试失败',
    attempted_actions: ['model-a: failed'],
  }
  await memory.recordEvidenceBundle(id, evidenceBundle)
  const firstRunOutputs = (await memory.load(id)).runs[firstRunId]
  const block = buildMemoryPromptSections(
    await memory.load(id),
    { id: 'T4', runId: firstRunId, title: '实现限流', dependsOn: ['T1', 'T2', 'T3'] },
    firstRunOutputs,
  )
  assert.equal((await memory.load(id)).runs[firstRunId].T1.tool_evidence.observedToolCalls[0].inputSummary, 'README.md', 'memory should retain bounded runtime tool evidence for audit')
  assert.match(block, /项目目标 L0/)
  assert.match(block, /T1/)
  assert.match(block, /auth 模块/)
  assert.ok(block.indexOf('T3 · 限流实现') < block.indexOf('T2 · 样式整理'), 'relevant dependency results should appear first')
  const largeDependencies = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`T${index + 1}`, {
    title: `任务 ${index + 1}`,
    text: `相关实现细节 ${index + 1} `.repeat(2_000),
  }]))
  const boundedBlock = buildMemoryPromptSections(
    { user_goal: '相关实现', rolling_summary: '', runs: {}, run_order: [] },
    { id: 'T7', runId: 'run-large', title: '相关实现', dependsOn: Object.keys(largeDependencies) },
    largeDependencies,
  )
  const l2Section = boundedBlock.split('【依赖任务输出 L2')[1]
  assert.ok(l2Section.length <= memoryPromptLimits.MAX_DEPENDENCY_CONTEXT_CHARS, 'dependency prompt context should have a deterministic size limit')
  assert.match(l2Section, /内容已截断/, 'oversized dependency output should be explicitly marked as truncated')
  const refreshedDependency = buildMemoryPromptSections(
    await memory.load(id),
    { id: 'T4', runId: firstRunId, title: '限流实现', dependsOn: ['T1'] },
    { T1: { title: '本轮调研', text: '本轮刚刷新出的结果' } },
  )
  assert.match(refreshedDependency, /本轮刚刷新出的结果/, 'current-run dependency output should override stale persisted memory')
  assert.match(refreshedDependency, /T1 · 本轮调研/, 'current-run dependency title should override stale persisted memory')
  const secondRunId = 'run-two'
  await memory.beginRun(id, secondRunId)
  await memory.recordTaskResult(id, { id: 'T1', runId: secondRunId, title: '调研', taskType: 'research' }, { text: '第二轮确认 auth 配置已经迁移' })
  const secondRunMemory = await memory.load(id)
  const secondRunPrompt = buildMemoryPromptSections(secondRunMemory, {
    id: 'T2', runId: secondRunId, title: 'auth 配置迁移', dependsOn: ['T1'],
  }, {})
  const secondRunDependencies = secondRunPrompt.split('【依赖任务输出 L2')[1]
  assert.doesNotMatch(secondRunDependencies, /找到 auth 模块/, 'a later run must not reuse an earlier run’s dependency result')
  assert.match(secondRunDependencies, /无前置子任务结果/, 'dependencies are sourced only from the current DAG execution')
  assert.match(secondRunPrompt, new RegExp(`\\[run:${secondRunId}\\]`), 'summary lines identify their originating run')
  assert.match(secondRunPrompt, new RegExp(`\\[run:${firstRunId}\\]`), 'L1 may retain the immediately previous run as context')
  assert.equal(secondRunMemory.runs[firstRunId].T1.text, '找到 auth 模块')
  assert.equal(secondRunMemory.runs[secondRunId].T1.text, '第二轮确认 auth 配置已经迁移')
  const thirdRunId = 'run-three'
  await memory.beginRun(id, thirdRunId)
  const thirdRunPrompt = buildMemoryPromptSections(await memory.load(id), {
    id: 'T4', runId: thirdRunId, title: 'auth 配置重构',
  }, {})
  assert.doesNotMatch(thirdRunPrompt, /找到 auth 模块/, 'L1 only includes the current and immediately previous run')
  assert.match(thirdRunPrompt, /第二轮确认 auth 配置已经迁移/)
  assert.doesNotMatch(block.match(/【进展摘要 L1[^]*?(?=\n\n【|$)/)?.[0] ?? '', /调整按钮间距与颜色/, 'irrelevant summary entries should not displace task-relevant memory')
  assert.equal((await memory.load(id)).evidence_bundles[0].task_id, 'T2')
  const retryBlock = buildMemoryPromptSections(
    await memory.load(id),
    { id: 'T2', runId: firstRunId, title: '实现', dependsOn: ['T1'] },
    {},
    { evidenceBundle },
  )
  assert.match(retryBlock, /失败证据 L4/)
  assert.match(retryBlock, /不要重复已失败的操作/)

  const otherId = 'conv-other'
  await memory.init(otherId, '/tmp/other-workspace', '修复支付回调')
  assert.equal((await memory.load(otherId)).user_goal, '修复支付回调')
  assert.equal((await memory.load(id)).user_goal, '实现登录限流', '每个会话的长期任务记忆必须独立')
  assert.doesNotMatch(buildMemoryPromptSections(await memory.load(otherId), { id: 'T1', title: '调研' }, {}), /auth 模块/)

  const legacyId = 'conv-legacy-memory'
  await memory.save(legacyId, {
    conversation_id: legacyId,
    user_goal: '旧版记忆迁移',
    rolling_summary: 'T1（调研）：旧版历史结论',
    dependency_outputs: { T1: { title: '旧调研', text: '旧版历史结论' } },
    facts: [],
    evidence_bundles: [],
  })
  await memory.beginRun(legacyId, 'run-modern')
  const migratedMemory = await memory.load(legacyId)
  assert.equal(migratedMemory.runs.legacy.T1.text, '旧版历史结论')
  assert.equal(Object.hasOwn(migratedMemory, 'dependency_outputs'), false, 'legacy outputs are migrated out of the unscoped schema')
  const migratedPrompt = buildMemoryPromptSections(migratedMemory, {
    id: 'T2', runId: 'run-modern', title: '新任务', dependsOn: ['T1'],
  }, {})
  assert.match(migratedPrompt, /\[run:legacy\]/)
  assert.doesNotMatch(migratedPrompt.split('【依赖任务输出 L2')[1], /旧版历史结论/, 'migrated history is not a dependency fallback')

  const concurrentId = 'conv-concurrent-writes'
  await memory.init(concurrentId, '/tmp/concurrent-workspace', '并发写入回归')
  const concurrentRunId = 'run-concurrent'
  await memory.beginRun(concurrentId, concurrentRunId)
  const secondMemoryStore = createMemoryStore({ agentDataPath: root })
  await Promise.all([
    ...Array.from({ length: 24 }, (_, index) => (index % 2 ? memory : secondMemoryStore).recordTaskResult(
      concurrentId,
      { id: `T${index}`, runId: concurrentRunId, title: `并行任务 ${index}`, taskType: 'research', statusLabel: '已完成' },
      { text: `并行结果 ${index}` },
    )),
    ...Array.from({ length: 12 }, (_, index) => (index % 2 ? secondMemoryStore : memory).recordEvidenceBundle(concurrentId, {
      task_id: `E${index}`,
      failure_class: 'execution',
      error_summary: `并发失败证据 ${index}`,
      attempted_actions: [`attempt-${index}`],
    })),
  ])
  const concurrentMemory = await memory.load(concurrentId)
  assert.equal(Object.keys(concurrentMemory.runs[concurrentRunId]).length, 24, 'parallel task completions must not overwrite each other')
  for (let index = 0; index < 24; index += 1) {
    assert.equal(concurrentMemory.runs[concurrentRunId][`T${index}`].text, `并行结果 ${index}`)
  }
  assert.equal(concurrentMemory.evidence_bundles.length, 12, 'concurrent task and evidence writes must share one serialized snapshot queue')
  assert.ok(JSON.parse(await fs.readFile(path.join(root, 'memory', `${concurrentId}.json`), 'utf8')))

  console.log('memory-store checks passed: per-conversation L0-L2 memory, isolated L4 evidence persistence and retry injection')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
