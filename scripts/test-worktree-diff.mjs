import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  captureNodeWorktreeFailureEvidence,
  createNodeWorktree,
  createTaskWorktree,
  getTaskWorktreeDiff,
  listTaskWorktrees,
  previewTaskWorktreeMerge,
  applyTaskWorktreeMerge,
  removeTaskWorktree,
  resolveTaskWorktreeDir,
  resetNodeWorktree,
} from '../desktop/backend/worktree-service.mjs'
import { createNodeWorkspaceRegistry } from '../desktop/backend/orchestration/node-workspace.mjs'

const execFileAsync = promisify(execFile)

async function runGit(args, cwd) {
  await execFileAsync('git', args, { cwd, env: { ...process.env, LC_ALL: 'C' } })
}

const base = path.join(os.homedir(), 'Documents', '毕设', '.test-worktree-diff')
await fs.mkdir(base, { recursive: true })
const userData = await fs.mkdtemp(path.join(base, 'data-'))
const repo = await fs.mkdtemp(path.join(base, 'repo-'))
const conversationId = randomUUID()
const firstRunId = randomUUID()
const secondRunId = randomUUID()
const wt = (taskId, runId = firstRunId) => ({ workspacePath: repo, conversationId, runId, taskId, userDataPath: userData })
try {
  await runGit(['init'], repo)
  await fs.writeFile(path.join(repo, 'README.md'), 'hello\n', 'utf8')
  await runGit(['add', 'README.md'], repo)
  await runGit(['commit', '-m', 'init'], repo)

  await assert.rejects(
    () =>
      getTaskWorktreeDiff(wt('../outside')),
    /无效的任务 ID/,
  )

  const { path: wtPath } = await createTaskWorktree(wt('T1'))
  assert.equal(wtPath, resolveTaskWorktreeDir(userData, repo, conversationId, 'T1', firstRunId))
  assert.equal(path.basename(path.dirname(wtPath)), firstRunId, 'new worktrees are separated by runId')
  await fs.writeFile(path.join(wtPath, 'README.md'), 'hello world\n', 'utf8')

  const diff = await getTaskWorktreeDiff(wt('T1'))
  assert.equal(diff.taskId, 'T1')
  assert.match(diff.stat, /README/)
  assert.match(diff.patch, /hello world/)

  const preview = await previewTaskWorktreeMerge(wt('T1'))
  assert.equal(preview.canApply, true)
  assert.equal(preview.conflict, false)

  await applyTaskWorktreeMerge({ ...wt('T1'), removeAfter: true })
  const mainReadme = await fs.readFile(path.join(repo, 'README.md'), 'utf8')
  assert.match(mainReadme, /hello world/)

  const { path: secondRunWorktree, reused } = await createTaskWorktree(wt('T1', secondRunId))
  assert.equal(reused, false, 'a later run creates a fresh worktree for the same task ID')
  assert.notEqual(secondRunWorktree, wtPath)
  assert.equal(path.basename(path.dirname(secondRunWorktree)), secondRunId)

  // 测试 2：测试未跟踪新增文件与删除文件的合并
  await fs.writeFile(path.join(repo, 'to-delete.txt'), 'delete me\n', 'utf8')
  await runGit(['add', 'to-delete.txt'], repo)
  await runGit(['commit', '-m', 'add to-delete'], repo)

  const { path: wtPath2 } = await createTaskWorktree(wt('T2'))
  // 在 worktree 中删除 to-delete.txt 并新增未跟踪的 untracked-new.txt
  await fs.unlink(path.join(wtPath2, 'to-delete.txt'))
  await fs.writeFile(path.join(wtPath2, 'untracked-new.txt'), 'new content\n', 'utf8')

  const preview2 = await previewTaskWorktreeMerge(wt('T2'))
  assert.equal(preview2.canApply, true)
  assert.ok(preview2.files.includes('untracked-new.txt'), '必须能检测到未跟踪新增文件')
  assert.ok(preview2.files.includes('to-delete.txt'), '必须能检测到被删除文件')

  await applyTaskWorktreeMerge({ ...wt('T2'), removeAfter: true })
  // 检查主工作区：untracked-new.txt 必须存在，to-delete.txt 必须已被删除
  const mainNewFile = await fs.readFile(path.join(repo, 'untracked-new.txt'), 'utf8')
  assert.equal(mainNewFile, 'new content\n')
  await assert.rejects(fs.readFile(path.join(repo, 'to-delete.txt'), 'utf8'))

  // 测试 3：主工作区未跟踪文件同名覆盖冲突检测
  await fs.writeFile(path.join(repo, 'local-untracked.txt'), 'user private work\n', 'utf8')
  const { path: wtPath3 } = await createTaskWorktree(wt('T3'))
  // 子任务也新增同名文件，但内容不同
  await fs.writeFile(path.join(wtPath3, 'local-untracked.txt'), 'task conflicting work\n', 'utf8')
  const preview3 = await previewTaskWorktreeMerge(wt('T3'))
  assert.equal(preview3.canApply, false, '同名未跟踪文件且内容不同必须阻止合并')
  assert.equal(preview3.conflict, true)
  assert.ok(preview3.conflicts.includes('local-untracked.txt'))
  await assert.rejects(
    applyTaskWorktreeMerge(wt('T3')),
    /冲突/
  )
  const preservedUntracked = await fs.readFile(path.join(repo, 'local-untracked.txt'), 'utf8')
  assert.equal(preservedUntracked, 'user private work\n', '主工作区未跟踪文件不能被覆盖')
  await fs.unlink(path.join(repo, 'local-untracked.txt'))

  // 测试 4：子任务删除文件与主工作区本地修改冲突检测
  await fs.writeFile(path.join(repo, 'critical.txt'), 'base content v1\n', 'utf8')
  await runGit(['add', 'critical.txt'], repo)
  await runGit(['commit', '-m', 'add critical.txt'], repo)

  const { path: wtPath4 } = await createTaskWorktree(wt('T4'))
  // 子任务删除了 critical.txt
  await fs.unlink(path.join(wtPath4, 'critical.txt'))
  // 用户在主工作区修改了 critical.txt
  await fs.writeFile(path.join(repo, 'critical.txt'), 'base content v1 + user edits\n', 'utf8')

  const preview4 = await previewTaskWorktreeMerge(wt('T4'))
  assert.equal(preview4.canApply, false, '子任务删除与主工作区修改必须报冲突')
  assert.equal(preview4.conflict, true)
  assert.ok(preview4.conflicts.includes('critical.txt'))
  await assert.rejects(
    applyTaskWorktreeMerge(wt('T4')),
    /冲突/
  )
  const preservedCritical = await fs.readFile(path.join(repo, 'critical.txt'), 'utf8')
  assert.equal(preservedCritical, 'base content v1 + user edits\n', '用户修改的文件绝不能被误删')

  const legacyPath = resolveTaskWorktreeDir(userData, repo, conversationId, 'OLD')
  await fs.mkdir(path.dirname(legacyPath), { recursive: true })
  await runGit(['worktree', 'add', '--detach', legacyPath, 'HEAD'], repo)
  const listed = await listTaskWorktrees({ workspacePath: repo, conversationId, userDataPath: userData })
  assert.ok(listed.some((entry) => entry.taskId === 'T1' && entry.runId === secondRunId), 'new worktrees expose their runId')
  assert.ok(listed.some((entry) => entry.taskId === 'OLD' && entry.runId === undefined && entry.path === legacyPath), 'listing continues to include the old conversation/task layout')

  // Branch-linked DAGs: descendants receive only their successful ancestors;
  // integration is a user-previewable branch and leaves the session checkout alone.
  const branchRepo = await fs.mkdtemp(path.join(base, 'branch-repo-'))
  const branchData = await fs.mkdtemp(path.join(base, 'branch-data-'))
  const branchConversationId = randomUUID()
  const branchRunId = randomUUID()
  const branchTasks = [
    { id: 'T1', taskType: 'implementation', dependsOn: [] },
    { id: 'T2', taskType: 'implementation', dependsOn: [] },
    { id: 'T3', taskType: 'test', dependsOn: ['T1'] },
    { id: 'T4', taskType: 'review', dependsOn: ['T1', 'T2'] },
  ]
  try {
    await runGit(['init', '-b', 'main'], branchRepo)
    await runGit(['config', 'user.name', 'TaskWeaver Test'], branchRepo)
    await runGit(['config', 'user.email', 'test@taskweaver.local'], branchRepo)
    await fs.writeFile(path.join(branchRepo, 'README.md'), 'baseline\n', 'utf8')
    await runGit(['add', '-A'], branchRepo)
    await runGit(['commit', '-m', 'baseline'], branchRepo)
    const baseCommit = await (async () => {
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: branchRepo })
      return stdout.trim()
    })()
    const registry = createNodeWorkspaceRegistry({
      enabled: true,
      workspacePath: branchRepo,
      conversationId: branchConversationId,
      runId: branchRunId,
      userDataPath: branchData,
      baseCommit,
      tasks: branchTasks,
    })
    const t1 = await registry.create(branchTasks[0])
    await fs.writeFile(path.join(t1.path, 'a.txt'), 'from T1\n', 'utf8')
    await registry.commit(branchTasks[0])
    const t2 = await registry.create(branchTasks[1])
    await fs.writeFile(path.join(t2.path, 'b.txt'), 'from T2\n', 'utf8')
    await registry.commit(branchTasks[1])

    const t3 = await registry.create(branchTasks[2])
    assert.equal(await fs.readFile(path.join(t3.path, 'a.txt'), 'utf8'), 'from T1\n', 'dependent tests see their implementation branch')
    await assert.rejects(fs.readFile(path.join(t3.path, 'b.txt'), 'utf8'), { code: 'ENOENT' }, 'unrelated work is not leaked to a dependent node')
    await registry.commit(branchTasks[2])
    const t4 = await registry.create(branchTasks[3])
    assert.equal(await fs.readFile(path.join(t4.path, 'a.txt'), 'utf8'), 'from T1\n')
    assert.equal(await fs.readFile(path.join(t4.path, 'b.txt'), 'utf8'), 'from T2\n', 'review sees all dependency branches')

    const integration = await registry.createIntegration()
    assert.ok(integration?.branchName.endsWith('/integration'))
    assert.equal(await fs.readFile(path.join(integration.path, 'a.txt'), 'utf8'), 'from T1\n')
    assert.equal(await fs.readFile(path.join(integration.path, 'b.txt'), 'utf8'), 'from T2\n')
    const integrationPreview = await previewTaskWorktreeMerge({
      workspacePath: branchRepo,
      conversationId: branchConversationId,
      runId: branchRunId,
      taskId: 'integration',
      userDataPath: branchData,
    })
    assert.equal(integrationPreview.canApply, true, 'P6 merge preview must include committed branch-chain output')
    assert.ok(integrationPreview.files.includes('a.txt') && integrationPreview.files.includes('b.txt'))
    await assert.rejects(fs.readFile(path.join(branchRepo, 'a.txt'), 'utf8'), { code: 'ENOENT' }, 'DAG never merges into the session checkout automatically')

    const freshRunId = randomUUID()
    const freshWorktree = await createNodeWorktree({
      workspacePath: branchRepo,
      conversationId: branchConversationId,
      runId: freshRunId,
      taskId: 'T1',
      userDataPath: branchData,
      baseCommit,
    })
    assert.notEqual(freshWorktree.path, t1.path, 'same conversation/task in a later run gets a distinct directory')
    await assert.rejects(fs.readFile(path.join(freshWorktree.path, 'a.txt'), 'utf8'), { code: 'ENOENT' }, 'later run starts from its own run baseline')

    const failedAttempt = await createNodeWorktree({
      workspacePath: branchRepo,
      conversationId: branchConversationId,
      runId: freshRunId,
      taskId: 'T8',
      userDataPath: branchData,
      baseCommit,
    })
    await fs.writeFile(path.join(failedAttempt.path, 'README.md'), 'partial failed edit\n', 'utf8')
    await fs.writeFile(path.join(failedAttempt.path, 'partial.txt'), 'partial file\n', 'utf8')
    const failureEvidence = await captureNodeWorktreeFailureEvidence({
      workspacePath: branchRepo,
      conversationId: branchConversationId,
      runId: freshRunId,
      taskId: 'T8',
      userDataPath: branchData,
      startCommit: failedAttempt.startCommit,
    })
    assert.deepEqual(failureEvidence.related_files.sort(), ['README.md', 'partial.txt'])
    assert.match(failureEvidence.diff, /partial failed edit/)
    await resetNodeWorktree({
      workspacePath: branchRepo,
      conversationId: branchConversationId,
      runId: freshRunId,
      taskId: 'T8',
      userDataPath: branchData,
      startCommit: failedAttempt.startCommit,
    })
    assert.equal(await fs.readFile(path.join(failedAttempt.path, 'README.md'), 'utf8'), 'baseline\n')
    await assert.rejects(fs.readFile(path.join(failedAttempt.path, 'partial.txt'), 'utf8'), { code: 'ENOENT' })

    const conflictRunId = randomUUID()
    const conflictTasks = [
      { id: 'T5', taskType: 'implementation', dependsOn: [] },
      { id: 'T6', taskType: 'implementation', dependsOn: [] },
      { id: 'T7', taskType: 'review', dependsOn: ['T5', 'T6'] },
    ]
    const conflictRegistry = createNodeWorkspaceRegistry({
      enabled: true,
      workspacePath: branchRepo,
      conversationId: branchConversationId,
      runId: conflictRunId,
      userDataPath: branchData,
      baseCommit,
      tasks: conflictTasks,
    })
    const t5 = await conflictRegistry.create(conflictTasks[0])
    const t6 = await conflictRegistry.create(conflictTasks[1])
    await fs.writeFile(path.join(t5.path, 'README.md'), 'left\n', 'utf8')
    await fs.writeFile(path.join(t6.path, 'README.md'), 'right\n', 'utf8')
    await conflictRegistry.commit(conflictTasks[0])
    await conflictRegistry.commit(conflictTasks[1])
    await assert.rejects(conflictRegistry.create(conflictTasks[2]), (error) => error.code === 'WORKTREE_MERGE_CONFLICT')
    assert.equal(await fs.readFile(path.join(branchRepo, 'README.md'), 'utf8'), 'baseline\n', 'upstream conflicts never mutate the main checkout')

    const mainStatus = await execFileAsync('git', ['status', '--porcelain'], { cwd: branchRepo })
    assert.equal(mainStatus.stdout.trim(), '', 'node commits and integration leave the main checkout clean')
  } finally {
    const entries = await listTaskWorktrees({ workspacePath: branchRepo, conversationId: branchConversationId, userDataPath: branchData }).catch(() => [])
    for (const entry of entries) {
      await removeTaskWorktree({
        workspacePath: branchRepo,
        conversationId: branchConversationId,
        runId: entry.runId ?? null,
        taskId: entry.taskId,
        userDataPath: branchData,
        force: true,
      }).catch(() => {})
    }
    await fs.rm(branchData, { recursive: true, force: true })
    await fs.rm(branchRepo, { recursive: true, force: true })
  }

  console.log('worktree-diff + DAG branches passed: run-scoped paths, branch-chain visibility, integration preview, retry reset evidence, and conflict guards')
} finally {
  await fs.rm(userData, { recursive: true, force: true })
  await fs.rm(repo, { recursive: true, force: true })
}

// Keep the IPC adapter contract in the existing P6 worktree test entrypoint.
await import('./test-p6-ipc-wiring.mjs')
