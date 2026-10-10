import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fsp from 'node:fs/promises'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { assertSafeWorkspacePath, isPathInside } from './security-path.mjs'
import { isGitRepository } from './git-service.mjs'

const execFileAsync = promisify(execFile)

async function assertWorkspaceRoot(workspacePath) {
  await assertSafeWorkspacePath(workspacePath, '.', { mustExist: true })
}

async function runGit(args, cwd) {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, LC_ALL: 'C' },
  })
  return (stdout || stderr || '').trim()
}

async function runGitText(args, cwd, { encoding = 'utf8' } = {}) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    encoding,
    env: { ...process.env, LC_ALL: 'C' },
  })
  return Buffer.isBuffer(stdout) ? stdout.toString(encoding) : String(stdout ?? '')
}

function workspaceHash(workspacePath) {
  return crypto.createHash('sha256').update(workspacePath).digest('hex').slice(0, 16)
}

function worktreeRoot(userDataPath, workspacePath) {
  return path.join(userDataPath, 'taskweaver-worktrees', workspaceHash(workspacePath))
}

const TASK_ID_RE = /^[A-Za-z0-9_-]{1,24}$/
const CONVERSATION_ID_RE = /^[a-f\d-]{36}$/i
const RUN_ID_RE = /^[a-f\d-]{36}$/i

export function assertValidTaskId(taskId) {
  if (!taskId || !TASK_ID_RE.test(taskId)) throw new Error('无效的任务 ID')
}

export function assertValidConversationId(conversationId) {
  if (!CONVERSATION_ID_RE.test(conversationId ?? '')) throw new Error('无效的对话 ID')
}

export function assertValidRunId(runId) {
  if (!RUN_ID_RE.test(runId ?? '')) throw new Error('无效的运行 ID')
}

/** Resolve a run-scoped path, or the pre-runId path for an older saved task. */
export function resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId, runId = null) {
  assertValidConversationId(conversationId)
  assertValidTaskId(taskId)
  const root = path.resolve(worktreeRoot(userDataPath, workspacePath))
  const conversationRoot = path.resolve(root, conversationId)
  if (runId !== null) assertValidRunId(runId)
  const target = path.resolve(conversationRoot, ...(runId ? [runId] : []), taskId)
  if (!isPathInside(root, target) || !isPathInside(conversationRoot, target)) {
    throw new Error('无效的任务 ID')
  }
  return target
}

/**
 * 为子任务创建独立 git worktree（不自动合并，仅隔离写入）。
 */
export async function createTaskWorktree({ workspacePath, conversationId, runId, taskId, userDataPath }) {
  await assertWorkspaceRoot(workspacePath)
  assertValidRunId(runId)
  const target = resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId, runId)
  if (!(await isGitRepository(workspacePath))) {
    throw new Error('当前工作区不是 Git 仓库，无法创建 worktree')
  }
  if (fs.existsSync(target)) {
    return { path: target, reused: true }
  }
  await fsp.mkdir(path.dirname(target), { recursive: true })
  await runGit(['worktree', 'add', '--detach', target, 'HEAD'], workspacePath)
  return { path: target, reused: false }
}

/** Read the exact committed baseline used by a DAG run. */
export async function getWorkspaceHeadCommit(workspacePath) {
  await assertWorkspaceRoot(workspacePath)
  if (!(await isGitRepository(workspacePath))) throw new Error('当前工作区不是 Git 仓库')
  const commit = await runGit(['rev-parse', '--verify', 'HEAD'], workspacePath)
  if (!commit) throw new Error('Git 仓库尚无基线提交，无法创建 DAG worktree')
  return commit
}

function nodeBranchName(runId, taskId) {
  assertValidRunId(runId)
  assertValidTaskId(taskId)
  return `tw/${runId}/${taskId}`
}

function asConflictError(error, { taskId, branches }) {
  const wrapped = new Error(`上游改动冲突：${branches.join('、')}`)
  wrapped.name = 'WorktreeMergeConflictError'
  wrapped.code = 'WORKTREE_MERGE_CONFLICT'
  wrapped.taskId = taskId
  wrapped.branches = [...branches]
  wrapped.cause = error
  return wrapped
}

async function addBranchWorktree({ workspacePath, target, branchName, baseCommit, mergeFrom = [], taskId }) {
  const exists = fs.existsSync(target)
  if (exists) {
    let currentBranch = ''
    try { currentBranch = await runGit(['branch', '--show-current'], target) } catch { /* an invalid old path is handled below */ }
    if (currentBranch !== branchName) {
      throw new Error(`任务 ${taskId} 的 worktree 路径已被其他分支占用，拒绝复用`)
    }
    return {
      path: target,
      branchName,
      reused: true,
      startCommit: await runGit(['rev-parse', '--verify', 'HEAD'], target),
    }
  }

  await fsp.mkdir(path.dirname(target), { recursive: true })
  await runGit(['worktree', 'add', '-b', branchName, target, baseCommit], workspacePath)
  const merged = []
  try {
    for (const branch of [...new Set(mergeFrom)]) {
      if (branch === branchName) continue
      await runGit(['merge', '--no-ff', '--no-edit', branch], target)
      merged.push(branch)
    }
  } catch (error) {
    await runGit(['merge', '--abort'], target).catch(() => {})
    await runGit(['worktree', 'remove', '--force', target], workspacePath).catch(() => {})
    await runGit(['branch', '-D', branchName], workspacePath).catch(() => {})
    const conflict = asConflictError(error, { taskId, branches: mergeFrom })
    throw conflict
  }
  return {
    path: target,
    branchName,
    reused: false,
    mergedBranches: merged,
    startCommit: await runGit(['rev-parse', '--verify', 'HEAD'], target),
  }
}

/**
 * Create a run-scoped node branch from the run baseline, then merge the
 * successful writer branches from its ancestors. Every node gets its own
 * worktree; read-only review nodes therefore inspect the same integrated diff
 * that downstream tests see.
 */
export async function createNodeWorktree({
  workspacePath,
  conversationId,
  runId,
  taskId,
  userDataPath,
  baseCommit,
  mergeFrom = [],
}) {
  await assertWorkspaceRoot(workspacePath)
  assertValidRunId(runId)
  const target = resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId, runId)
  const branchName = nodeBranchName(runId, taskId)
  const resolvedBase = baseCommit || await getWorkspaceHeadCommit(workspacePath)
  return addBranchWorktree({ workspacePath, target, branchName, baseCommit: resolvedBase, mergeFrom, taskId })
}

/** Commit a successful writing node so only its DAG descendants can inherit it. */
export async function commitNodeResult({ workspacePath, conversationId, runId, taskId, userDataPath, summary }) {
  const wtPath = resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId, runId)
  if (!fs.existsSync(wtPath)) throw new Error(`未找到任务 ${taskId} 的 worktree`)
  const branchName = nodeBranchName(runId, taskId)
  const currentBranch = await runGit(['branch', '--show-current'], wtPath)
  if (currentBranch !== branchName) throw new Error(`任务 ${taskId} 的 worktree 分支不匹配`)
  const status = await runGit(['status', '--porcelain', '--untracked-files=all'], wtPath)
  if (status) {
    await runGit(['add', '-A'], wtPath)
    try {
      await runGit(['commit', '-m', summary || `TaskWeaver DAG ${taskId}`], wtPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/author identity unknown|unable to auto-detect email|empty ident name/i.test(message)) throw error
      await execFileAsync('git', [
        '-c', 'user.name=TaskWeaver',
        '-c', 'user.email=taskweaver@localhost',
        'commit', '-m', summary || `TaskWeaver DAG ${taskId}`,
      ], {
        cwd: wtPath,
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, LC_ALL: 'C' },
      })
    }
  }
  return {
    branchName,
    commit: await runGit(['rev-parse', '--verify', 'HEAD'], wtPath),
    changed: Boolean(status),
  }
}

/** Build the user-previewable integration worktree; never updates the main checkout. */
export async function createIntegrationWorktree({
  workspacePath,
  conversationId,
  runId,
  userDataPath,
  baseCommit,
  mergeFrom = [],
}) {
  const taskId = 'integration'
  await assertWorkspaceRoot(workspacePath)
  assertValidRunId(runId)
  const target = resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId, runId)
  const branchName = nodeBranchName(runId, taskId)
  const resolvedBase = baseCommit || await getWorkspaceHeadCommit(workspacePath)
  return addBranchWorktree({
    workspacePath,
    target,
    branchName,
    baseCommit: resolvedBase,
    mergeFrom,
    taskId,
  })
}

/** Capture a failed isolated attempt, then restore the node to its upstream-only start. */
export async function captureNodeWorktreeFailureEvidence({
  workspacePath,
  conversationId,
  runId,
  taskId,
  userDataPath,
  startCommit,
  maxDiffChars = 400_000,
}) {
  const wtPath = resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId, runId)
  if (!fs.existsSync(wtPath)) throw new Error(`未找到任务 ${taskId} 的 worktree`)
  const untrackedRaw = await runGitText(['ls-files', '--others', '--exclude-standard', '-z'], wtPath)
  const untracked = untrackedRaw.split('\0').filter(Boolean)
  if (untracked.length) await runGit(['add', '-N', '--', ...untracked], wtPath)
  const [filesRaw, diff] = await Promise.all([
    runGitText(['diff', '--name-only', '-z', startCommit || 'HEAD'], wtPath),
    runGitText(['diff', '--binary', startCommit || 'HEAD'], wtPath),
  ])
  const relatedFiles = [...new Set([
    ...filesRaw.split('\0').filter(Boolean),
    ...untracked,
  ])].slice(0, 100)
  const evidence = {
    related_files: relatedFiles,
    diff: diff.length > maxDiffChars
      ? `${diff.slice(0, maxDiffChars)}\n…[失败尝试差异已截断]`
      : (diff || null),
  }
  return evidence
}

export async function resetNodeWorktree({
  workspacePath,
  conversationId,
  runId,
  taskId,
  userDataPath,
  startCommit,
}) {
  const wtPath = resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId, runId)
  if (!fs.existsSync(wtPath)) throw new Error(`未找到任务 ${taskId} 的 worktree`)
  await runGit(['reset', '--hard', startCommit || 'HEAD'], wtPath)
  await runGit(['clean', '-fd'], wtPath)
}

export async function captureAndResetNodeWorktree(options) {
  const evidence = await captureNodeWorktreeFailureEvidence(options)
  await resetNodeWorktree(options)
  return evidence
}

/** Stable fingerprint for deciding whether a non-isolated writer dirtied its shared workspace. */
export async function getGitWorkspaceMutationFingerprint(workspacePath) {
  await assertWorkspaceRoot(workspacePath)
  if (!(await isGitRepository(workspacePath))) return null
  const [status, diff, untrackedRaw] = await Promise.all([
    runGitText(['status', '--porcelain', '--untracked-files=all', '-z'], workspacePath),
    runGitText(['diff', '--binary', 'HEAD'], workspacePath),
    runGitText(['ls-files', '--others', '--exclude-standard', '-z'], workspacePath),
  ])
  const untracked = untrackedRaw.split('\0').filter(Boolean)
  const hashes = []
  for (const file of untracked) {
    try {
      const bytes = await fsp.readFile(path.join(workspacePath, file))
      hashes.push([file, crypto.createHash('sha256').update(bytes).digest('hex')])
    } catch {
      hashes.push([file, 'unreadable'])
    }
  }
  return crypto.createHash('sha256')
    .update(status)
    .update('\0')
    .update(diff)
    .update('\0')
    .update(JSON.stringify(hashes))
    .digest('hex')
}

/**
 * Parallel implementation worktrees must start from the committed workspace
 * state; otherwise `git worktree add <HEAD>` silently omits local edits.
 */
export async function isCleanGitWorkspace(workspacePath) {
  try {
    await assertWorkspaceRoot(workspacePath)
    if (!(await isGitRepository(workspacePath))) return false
    return (await runGit(['status', '--porcelain', '--untracked-files=all'], workspacePath)) === ''
  } catch {
    return false
  }
}

export async function removeTaskWorktree({ workspacePath, conversationId, runId = null, taskId, userDataPath, force = false }) {
  await assertWorkspaceRoot(workspacePath)
  const target = resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId, runId)
  if (!fs.existsSync(target)) return { removed: false }
  const args = ['worktree', 'remove', target]
  if (force) args.push('--force')
  await runGit(args, workspacePath)
  return { removed: true, path: target }
}

export async function listTaskWorktrees({ workspacePath, conversationId, userDataPath }) {
  await assertWorkspaceRoot(workspacePath)
  assertValidConversationId(conversationId)
  const conversationRoot = path.join(worktreeRoot(userDataPath, workspacePath), conversationId)
  try {
    const names = await fsp.readdir(conversationRoot)
    const entries = []
    const addWorktree = async (taskId, runId, full) => {
      if (!TASK_ID_RE.test(taskId)) return
      try {
        if ((await fsp.stat(full)).isDirectory()) {
          entries.push({ taskId, conversationId, ...(runId ? { runId } : {}), path: full })
        }
      } catch {
        // The worktree may have been removed while listing it.
      }
    }
    for (const name of names) {
      const full = path.join(conversationRoot, name)
      if (TASK_ID_RE.test(name)) {
        await addWorktree(name, null, full)
        continue
      }
      if (!RUN_ID_RE.test(name)) continue
      let taskIds
      try {
        taskIds = await fsp.readdir(full)
      } catch {
        continue
      }
      for (const taskId of taskIds) await addWorktree(taskId, name, path.join(full, taskId))
    }
    return entries.sort((a, b) => (a.runId ?? '').localeCompare(b.runId ?? '') || a.taskId.localeCompare(b.taskId))
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
}

/**
 * 对比 worktree 相对其检出 HEAD 的改动（未自动合并到主工作区）。
 */
async function resolveWorktreeComparisonBase(workspacePath, wtPath) {
  try {
    const mainHead = await runGit(['rev-parse', '--verify', 'HEAD'], workspacePath)
    return await runGit(['merge-base', mainHead, 'HEAD'], wtPath)
  } catch {
    return await runGit(['rev-parse', '--verify', 'HEAD'], wtPath)
  }
}

export async function getTaskWorktreeDiff({ workspacePath, conversationId, runId = null, taskId, userDataPath, maxPatchChars = 400_000 }) {
  await assertWorkspaceRoot(workspacePath)
  const target = resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId, runId)
  if (!fs.existsSync(target)) {
    throw new Error(`未找到任务 ${taskId} 的 worktree`)
  }
  const baseCommit = await resolveWorktreeComparisonBase(workspacePath, target)
  const stat = await runGit(['diff', '--stat', baseCommit], target)
  let patch = ''
  try {
    patch = await runGit(['diff', baseCommit], target)
  } catch {
    patch = ''
  }
  if (patch.length > maxPatchChars) {
    patch = `${patch.slice(0, maxPatchChars)}\n\n…（差异过长已截断）`
  }
  return { taskId, path: target, stat: stat || '（无文件变更）', patch }
}

/**
 * 完整列出 worktree 内相对于主分支的所有改动：
 * 包含已跟踪文件的修改/删除/新增，以及未跟踪的新文件 (??)
 * @returns {Promise<Array<{ file: string, type: 'modify' | 'add' | 'delete' }>>}
 */
async function listWorktreeDetailedChanges(wtPath, baseCommit = 'HEAD') {
  const result = new Map()

  // Include committed branch-chain changes as well as current uncommitted edits.
  try {
    const diffRaw = await runGit(['diff', '--name-status', baseCommit], wtPath)
    for (const line of diffRaw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const match = trimmed.match(/^([A-Z]+)\s+(.+)$/)
      if (!match) continue
      const status = match[1]
      let file = match[2].trim()
      if (file.includes('\t')) {
        const parts = file.split('\t')
        file = parts[parts.length - 1].trim()
      }
      if (file.startsWith('"') && file.endsWith('"')) {
        try { file = JSON.parse(file) } catch {}
      }
      if (status.startsWith('D')) {
        result.set(file, 'delete')
      } else if (status.startsWith('A')) {
        result.set(file, 'add')
      } else {
        result.set(file, 'modify')
      }
    }
  } catch {
    // ignore
  }

  // 2. 获取未提交的工作区变动与未跟踪的新文件
  try {
    const statusRaw = await runGit(['status', '--porcelain', '-uall'], wtPath)
    for (const rawLine of statusRaw.split('\n')) {
      if (!rawLine) continue
      const match = rawLine.match(/^([ MADRCU?!]{2})\s+(.+)$/)
      if (!match) continue
      const status = match[1]
      let file = match[2].trim()
      if (file.includes(' -> ')) {
        file = file.split(' -> ')[1].trim()
      }
      if (file.startsWith('"') && file.endsWith('"')) {
        try { file = JSON.parse(file) } catch {}
      }
      if (status.includes('?')) {
        result.set(file, 'add')
      } else if (status.includes('D')) {
        result.set(file, 'delete')
      } else if (status.includes('A')) {
        result.set(file, 'add')
      } else if (status.includes('M')) {
        if (!result.has(file)) result.set(file, 'modify')
      }
    }
  } catch {
    // ignore
  }

  return Array.from(result.entries()).map(([file, type]) => ({ file, type }))
}

async function readHeadFile(cwd, relativePath, commit = 'HEAD') {
  try {
    const { stdout } = await execFileAsync('git', ['show', `${commit}:${relativePath}`], {
      cwd,
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' },
    })
    return stdout
  } catch {
    return null
  }
}

/**
 * 检查 worktree 改动能否合并到主工作区（不写入）。
 */
export async function previewTaskWorktreeMerge({ workspacePath, conversationId, runId = null, taskId, userDataPath }) {
  const diff = await getTaskWorktreeDiff({ workspacePath, conversationId, runId, taskId, userDataPath, maxPatchChars: 2_000_000 })
  const wtPath = resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId, runId)
  const baseCommit = await resolveWorktreeComparisonBase(workspacePath, wtPath)
  const changes = await listWorktreeDetailedChanges(wtPath, baseCommit)
  const files = changes.map((c) => c.file)
  if (!files.length) {
    return {
      canApply: false,
      conflict: false,
      taskId,
      stat: diff.stat,
      files: [],
      changes: [],
      reason: 'worktree 中没有相对主工作区的文件改动',
    }
  }
  const conflicts = []
  for (const { file, type } of changes) {
    // 安全检查：防止路径逃逸或符号链接跨越工作区边界
    try {
      await assertSafeWorkspacePath(workspacePath, file)
    } catch (err) {
      return {
        canApply: false,
        conflict: true,
        taskId,
        stat: diff.stat,
        files,
        changes,
        reason: `检测到不安全的目标路径或符号链接逃逸风险：${file} (${err.message})`,
      }
    }

    const headText = await readHeadFile(workspacePath, file, baseCommit)
    let mainText = null
    try {
      mainText = await fsp.readFile(path.join(workspacePath, file), 'utf8')
    } catch {
      mainText = null
    }

    let wtText = null
    if (type !== 'delete') {
      try {
        wtText = await fsp.readFile(path.join(wtPath, file), 'utf8')
      } catch {
        wtText = null
      }
    }

    // 1. 子任务新增文件：如果主工作区已存在同名文件（无论已跟踪还是未跟踪），且内容不一致，视为冲突
    if (type === 'add') {
      if (mainText !== null && mainText !== wtText) {
        conflicts.push(file)
      }
      continue
    }

    // 2. 子任务删除文件：如果主工作区存在该文件且内容被用户修改（与 HEAD 不一致），或为未跟踪新建文件，视为冲突
    if (type === 'delete') {
      if (mainText !== null && (headText === null || mainText !== headText)) {
        conflicts.push(file)
      }
      continue
    }

    // 3. 子任务修改文件：如果主工作区相对于 HEAD 也有修改，且内容与 worktree 不一致，视为冲突
    if (type === 'modify') {
      const mainDirty = (headText !== null && mainText !== headText) || (headText === null && mainText !== null)
      if (mainDirty && mainText !== wtText) {
        conflicts.push(file)
      }
    }
  }

  if (conflicts.length) {
    return {
      canApply: false,
      conflict: true,
      taskId,
      stat: diff.stat,
      files,
      changes,
      conflicts,
      reason: `主工作区与 worktree 改动冲突（存在未跟踪覆盖或修改/删除冲突）：${conflicts.join('、')}`,
    }
  }
  return {
    canApply: true,
    conflict: false,
    taskId,
    stat: diff.stat,
    files,
    changes,
  }
}

/**
 * 将 worktree 内改动同步到主工作区；支持新增/修改/删除，带路径越界检查与事务回滚；可选合并后删除 worktree。
 */
export async function applyTaskWorktreeMerge({
  workspacePath,
  conversationId,
  runId = null,
  taskId,
  userDataPath,
  removeAfter = false,
  files: onlyFiles = null,
}) {
  const preview = await previewTaskWorktreeMerge({ workspacePath, conversationId, runId, taskId, userDataPath })
  if (!preview.canApply) {
    throw new Error(preview.reason || '无法合并：主工作区与 worktree 改动冲突或无可合并内容')
  }
  const wtPath = resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId, runId)
  const changes = preview.changes || []
  const targetChanges = Array.isArray(onlyFiles) && onlyFiles.length
    ? changes.filter((c) => onlyFiles.includes(c.file))
    : changes
  if (!targetChanges.length) throw new Error('没有选中任何文件可合并')

  // 安全检查所有目标路径
  for (const { file } of targetChanges) {
    await assertSafeWorkspacePath(workspacePath, file)
  }

  // 事务备份：记录每个文件在主工作区的原始状态，供失败时回滚
  const rollbackBackups = []
  try {
    for (const { file, type } of targetChanges) {
      const dest = path.join(workspacePath, file)
      let exists = false
      let originalContent = null
      try {
        originalContent = await fsp.readFile(dest)
        exists = true
      } catch (err) {
        if (err?.code !== 'ENOENT') throw err
      }
      rollbackBackups.push({ file, dest, exists, originalContent })

      if (type === 'delete') {
        if (exists) {
          await fsp.unlink(dest)
        }
      } else {
        const src = path.join(wtPath, file)
        await fsp.mkdir(path.dirname(dest), { recursive: true })
        await fsp.copyFile(src, dest)
      }
    }
  } catch (error) {
    // 发生错误，自动执行事务回滚
    for (const backup of rollbackBackups.reverse()) {
      try {
        if (backup.exists) {
          await fsp.mkdir(path.dirname(backup.dest), { recursive: true })
          await fsp.writeFile(backup.dest, backup.originalContent)
        } else {
          await fsp.unlink(backup.dest).catch(() => {})
        }
      } catch {
        // ignore rollback cleanup error
      }
    }
    throw new Error(`worktree 合并失败并已回滚主工作区: ${error.message}`)
  }

  let worktreeRemoved = false
  let cleanupError = null
  if (removeAfter) {
    try {
      const removed = await removeTaskWorktree({ workspacePath, conversationId, runId, taskId, userDataPath, force: true })
      worktreeRemoved = removed.removed
    } catch (err) {
      cleanupError = err instanceof Error ? err.message : String(err)
    }
  }
  return {
    applied: true,
    taskId,
    stat: preview.stat,
    files: targetChanges.map((c) => c.file),
    worktreeRemoved,
    cleanupSuccess: removeAfter ? !cleanupError : true,
    cleanupError,
  }
}
