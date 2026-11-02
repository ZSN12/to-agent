import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import {
  resolveModelCompactionLimits,
  compactToolOutput,
  COMPACTION_LIMITS,
} from '../backend/context-compactor.mjs'

import {
  resolveTaskWorktreeDir,
  pruneOrphanWorktrees,
} from '../backend/worktree-service.mjs'

import { createNodeWorkspaceRegistry } from '../backend/orchestration/node-workspace.mjs'
import { scheduleOrphanWorktreePruning } from '../backend/startup.mjs'

const execFileAsync = promisify(execFile)

async function runGit(args, cwd) {
  await execFileAsync('git', args, { cwd, env: { ...process.env, LC_ALL: 'C' } })
}

console.log('=== 1. 测试模型上下文感知动态截断（resolveModelCompactionLimits） ===')

// 1.1 未传参或非法参数回退默认值
const defaultLimits1 = resolveModelCompactionLimits()
assert.equal(defaultLimits1.maxChars, COMPACTION_LIMITS.MAX_TOOL_OUTPUT_CHARS)
assert.equal(defaultLimits1.maxLines, COMPACTION_LIMITS.MAX_TOOL_OUTPUT_LINES)

const defaultLimits2 = resolveModelCompactionLimits(null)
assert.equal(defaultLimits2.maxChars, 3000)
assert.equal(defaultLimits2.maxLines, 60)

const defaultLimits3 = resolveModelCompactionLimits(-100)
assert.equal(defaultLimits3.maxChars, 3000)
assert.equal(defaultLimits3.maxLines, 60)

const defaultLimits4 = resolveModelCompactionLimits(Number.NaN)
assert.equal(defaultLimits4.maxChars, 3000)
assert.equal(defaultLimits4.maxLines, 60)

// 1.2 <= 32k 小模型（如 16k, 32k）
const smallLimits = resolveModelCompactionLimits(32_000)
assert.equal(smallLimits.maxChars, 2000)
assert.equal(smallLimits.maxLines, 40)
assert.equal(smallLimits.headLines, 15)
assert.equal(smallLimits.tailLines, 15)

// 1.3 64k ~ 128k 常规模型
const midLimits = resolveModelCompactionLimits(128_000)
assert.equal(midLimits.maxChars, 4000)
assert.equal(midLimits.maxLines, 60)
assert.equal(midLimits.headLines, 20)
assert.equal(midLimits.tailLines, 20)

// 1.4 200k 大窗口模型
const largeLimits = resolveModelCompactionLimits(200_000)
assert.equal(largeLimits.maxChars, 8000)
assert.equal(largeLimits.maxLines, 120)
assert.equal(largeLimits.headLines, 30)
assert.equal(largeLimits.tailLines, 30)

// 1.5 >= 500k 及超大窗口模型（如 1M）
const hugeLimits = resolveModelCompactionLimits(1_000_000)
assert.equal(hugeLimits.maxChars, 12000)
assert.equal(hugeLimits.maxLines, 200)
assert.equal(hugeLimits.headLines, 40)
assert.equal(hugeLimits.tailLines, 40)

console.log('✓ resolveModelCompactionLimits 阶梯映射测试全部通过')

// 1.6 compactToolOutput 传递 contextWindow 的动态折叠验证
const sampleText = 'A'.repeat(2500)
// 对于小模型（<=32k，上限 2000），2500 字符会被截断
const compactSmall = compactToolOutput(sampleText, { contextWindow: 32_000 })
assert.equal(compactSmall.compacted, true, '小模型下 2500 字符应触发截断')

// 对于大模型（128k，上限 4000），2500 字符不应截断
const compactMid = compactToolOutput(sampleText, { contextWindow: 128_000 })
assert.equal(compactMid.compacted, false, '128k 模型下 2500 字符不应截断')
assert.equal(compactMid.text, sampleText)

// 对于超大模型（1M，上限 12000），10000 字符不应截断
const sampleText10k = 'B'.repeat(10000)
const compactHuge = compactToolOutput(sampleText10k, { contextWindow: 1_000_000 })
assert.equal(compactHuge.compacted, false, '1M 模型下 10000 字符不应截断')

// 超过 12000 字符应截断
const sampleText15k = 'C'.repeat(15000)
const compactHugeOver = compactToolOutput(sampleText15k, { contextWindow: 1_000_000 })
assert.equal(compactHugeOver.compacted, true, '超过 12000 字符应触发截断')

console.log('✓ compactToolOutput 动态感知 contextWindow 测试全部通过')

console.log('=== 2. 测试 Git Worktree 孤儿清理（pruneOrphanWorktrees） ===')

const baseTestDir = path.join(os.homedir(), 'Documents', '毕设', '.test-worktree-gc')
await fs.mkdir(baseTestDir, { recursive: true })
const userData = await fs.mkdtemp(path.join(baseTestDir, 'data-'))
const repo = await fs.mkdtemp(path.join(baseTestDir, 'repo-'))

try {
  await runGit(['init'], repo)
  await fs.writeFile(path.join(repo, 'README.md'), '# Base repo\n', 'utf8')
  await runGit(['add', 'README.md'], repo)
  await runGit(['commit', '-m', 'Initial commit'], repo)

  const activeConvId = randomUUID()
  const inactiveConvId = randomUUID()
  const runId = randomUUID()

  // 创建 1: 活跃会话下的 worktree
  const activeTarget = resolveTaskWorktreeDir(userData, repo, activeConvId, 'T1', runId)
  await fs.mkdir(path.dirname(activeTarget), { recursive: true })
  await runGit(['worktree', 'add', '-b', `tw/${runId}/T1`, activeTarget, 'HEAD'], repo)

  // 创建 2: 非活跃会话下的新鲜 worktree（未过期）
  const freshTarget = resolveTaskWorktreeDir(userData, repo, inactiveConvId, 'fresh-task', runId)
  await fs.mkdir(path.dirname(freshTarget), { recursive: true })
  await runGit(['worktree', 'add', '-b', `tw/${runId}/fresh-task`, freshTarget, 'HEAD'], repo)

  // 创建 3: 非活跃会话下的过期 worktree，但有未提交脏文件（dirty check 应阻止删除）
  const dirtyTarget = resolveTaskWorktreeDir(userData, repo, inactiveConvId, 'dirty-task', runId)
  await fs.mkdir(path.dirname(dirtyTarget), { recursive: true })
  await runGit(['worktree', 'add', '-b', `tw/${runId}/dirty-task`, dirtyTarget, 'HEAD'], repo)
  await fs.writeFile(path.join(dirtyTarget, 'uncommitted.txt'), 'do not delete me\n', 'utf8')

  // 创建 4: 非活跃会话下的过期且干净的 worktree（应被成功 prune）
  const cleanTarget = resolveTaskWorktreeDir(userData, repo, inactiveConvId, 'clean-task', runId)
  await fs.mkdir(path.dirname(cleanTarget), { recursive: true })
  await runGit(['worktree', 'add', '-b', `tw/${runId}/clean-task`, cleanTarget, 'HEAD'], repo)

  // 将 dirtyTarget 与 cleanTarget 的修改时间设为 10 天前（模拟过期）
  const oldTime = new Date(Date.now() - 10 * 86400 * 1000)
  await fs.utimes(dirtyTarget, oldTime, oldTime)
  await fs.utimes(cleanTarget, oldTime, oldTime)

  // 执行 pruneOrphanWorktrees
  const report = await pruneOrphanWorktrees({
    userDataPath: userData,
    workspacePath: repo,
    activeConversationIds: [activeConvId],
    maxAgeMs: 3 * 86400 * 1000,
  })

  // 验证结果
  assert.equal(report.pruned.length, 1, '应只修剪 1 个过期且干净的 worktree')
  assert.equal(report.pruned[0].taskId, 'clean-task')
  assert.equal(report.pruned[0].path, cleanTarget)

  // 验证 cleanTarget 已从磁盘被安全移除
  let cleanExists = true
  try {
    await fs.stat(cleanTarget)
  } catch {
    cleanExists = false
  }
  assert.equal(cleanExists, false, 'cleanTarget 必须已被删除')

  // 验证 dirtyTarget 未被删除，并且 skipped 记录了 dirty 原因
  const dirtySkipped = report.skipped.find((s) => s.path === dirtyTarget)
  assert.ok(dirtySkipped, 'dirtyTarget 应该被记录在 skipped 中')
  assert.equal(dirtySkipped.reason, 'dirty', 'dirtyTarget 保留原因必须为 dirty')
  const dirtyFileContent = await fs.readFile(path.join(dirtyTarget, 'uncommitted.txt'), 'utf8')
  assert.equal(dirtyFileContent, 'do not delete me\n', '未提交的文件内容必须完整保留')

  // 验证 freshTarget 未被删除（未过期）
  const freshSkipped = report.skipped.find((s) => s.path === freshTarget)
  assert.ok(freshSkipped, 'freshTarget 应该被记录在 skipped 中')
  assert.equal(freshSkipped.reason, 'not_expired', '未过期保留原因应为 not_expired')

  // 验证 activeTarget 未被删除（活跃会话）
  let activeExists = true
  try {
    await fs.stat(activeTarget)
  } catch {
    activeExists = false
  }
  assert.equal(activeExists, true, '活跃会话中的 worktree 必须保留')

  console.log('✓ pruneOrphanWorktrees 孤儿回收与安全保护测试全部通过')

  console.log('=== 3. 测试 createNodeWorkspaceRegistry.cleanupAll ===')

  const registryConvId = randomUUID()
  const registryRunId = randomUUID()
  const tasks = [
    { id: 'T_IMPL', taskType: 'implementation', title: '编写代码', dependsOn: [] },
    { id: 'T_REVIEW', taskType: 'review', title: '审查代码', dependsOn: ['T_IMPL'] },
  ]

  const registry = createNodeWorkspaceRegistry({
    enabled: true,
    workspacePath: repo,
    conversationId: registryConvId,
    runId: registryRunId,
    userDataPath: userData,
    baseCommit: 'HEAD',
    tasks,
  })

  // 创建两个节点的 worktree
  const implNode = await registry.create(tasks[0])
  assert.ok(implNode?.path)
  const reviewNode = await registry.create(tasks[1])
  assert.ok(reviewNode?.path)

  // 在 implementation 节点写入文件并 commit
  await fs.writeFile(path.join(implNode.path, 'feature.txt'), 'feature code\n', 'utf8')
  const commitRes = await registry.commit(tasks[0])
  assert.ok(commitRes.commit)

  // 创建集成分支
  const integrationNode = await registry.createIntegration()
  assert.ok(integrationNode?.path, '集成分支应成功创建')

  // 调用 cleanupAll，只清理完成的 T_IMPL，保留 T_REVIEW（模拟未完成或需保留）
  const cleanupRes1 = await registry.cleanupAll({
    completedTaskIds: ['T_IMPL'],
  })

  assert.deepEqual(cleanupRes1.cleaned, ['T_IMPL'], 'T_IMPL 应该被安全清理')
  assert.ok(cleanupRes1.preserved.some((p) => p.taskId === 'T_REVIEW' && p.reason === 'not_completed'), '未标记完成的 T_REVIEW 应该被保留')

  let implExists = true
  try {
    await fs.stat(implNode.path)
  } catch {
    implExists = false
  }
  assert.equal(implExists, false, 'T_IMPL worktree 目录应该已被移除')

  // 集成 worktree 必须保留供预览
  let integrationExists = true
  try {
    await fs.stat(integrationNode.path)
  } catch {
    integrationExists = false
  }
  assert.equal(integrationExists, true, '集成预览 worktree 绝不能被 cleanupAll 清理')

  // 现在清理剩下的 review 节点
  const cleanupRes2 = await registry.cleanupAll({
    completedTaskIds: ['T_REVIEW'],
  })
  assert.deepEqual(cleanupRes2.cleaned, ['T_REVIEW'], 'T_REVIEW 应该被安全清理')

  console.log('✓ createNodeWorkspaceRegistry.cleanupAll 生命周期回收测试全部通过')

  console.log('=== 4. 测试 scheduleOrphanWorktreePruning 启动调度 ===')
  const timer = scheduleOrphanWorktreePruning({
    userDataPath: userData,
    delayMs: 50,
  })
  assert.ok(timer, '定时器应该返回有效句柄')
  clearTimeout(timer)
  console.log('✓ scheduleOrphanWorktreePruning 调度测试通过')

} finally {
  await fs.rm(baseTestDir, { recursive: true, force: true }).catch(() => {})
}

console.log('\n🎉 全部 Worktree 回收与模型上下文感知动态截断测试 100% 通过！')
