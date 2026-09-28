import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  createTaskWorktree,
  getTaskWorktreeDiff,
  previewTaskWorktreeMerge,
  applyTaskWorktreeMerge,
} from '../electron/backend/worktree-service.mjs'

const execFileAsync = promisify(execFile)

async function runGit(args, cwd) {
  await execFileAsync('git', args, { cwd, env: { ...process.env, LC_ALL: 'C' } })
}

const base = path.join(os.homedir(), 'Documents', '毕设', '.test-worktree-diff')
await fs.mkdir(base, { recursive: true })
const userData = await fs.mkdtemp(path.join(base, 'data-'))
const repo = await fs.mkdtemp(path.join(base, 'repo-'))
const conversationId = randomUUID()
const wt = (taskId) => ({ workspacePath: repo, conversationId, taskId, userDataPath: userData })
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

  console.log('worktree-diff + merge 测试通过（覆盖已跟踪修改、未跟踪新增及删除、未跟踪覆盖冲突拦截、删除修改冲突拦截）')
} finally {
  await fs.rm(userData, { recursive: true, force: true })
  await fs.rm(repo, { recursive: true, force: true })
}

