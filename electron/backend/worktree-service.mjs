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

function workspaceHash(workspacePath) {
  return crypto.createHash('sha256').update(workspacePath).digest('hex').slice(0, 16)
}

function worktreeRoot(userDataPath, workspacePath) {
  return path.join(userDataPath, 'taskweaver-worktrees', workspaceHash(workspacePath))
}

const TASK_ID_RE = /^[A-Za-z0-9_-]{1,24}$/
const CONVERSATION_ID_RE = /^[a-f\d-]{36}$/i

export function assertValidTaskId(taskId) {
  if (!taskId || !TASK_ID_RE.test(taskId)) throw new Error('无效的任务 ID')
}

export function assertValidConversationId(conversationId) {
  if (!CONVERSATION_ID_RE.test(conversationId ?? '')) throw new Error('无效的对话 ID')
}

/** 解析任务 worktree 目录：<hash>/<conversationId>/<taskId>，拒绝路径穿越。 */
export function resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId) {
  assertValidConversationId(conversationId)
  assertValidTaskId(taskId)
  const root = path.resolve(worktreeRoot(userDataPath, workspacePath))
  const conversationRoot = path.resolve(root, conversationId)
  const target = path.resolve(conversationRoot, taskId)
  if (!isPathInside(root, target) || !isPathInside(conversationRoot, target)) {
    throw new Error('无效的任务 ID')
  }
  return target
}

/**
 * 为子任务创建独立 git worktree（不自动合并，仅隔离写入）。
 */
export async function createTaskWorktree({ workspacePath, conversationId, taskId, userDataPath }) {
  await assertWorkspaceRoot(workspacePath)
  const target = resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId)
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

export async function removeTaskWorktree({ workspacePath, conversationId, taskId, userDataPath, force = false }) {
  await assertWorkspaceRoot(workspacePath)
  const target = resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId)
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
    for (const name of names) {
      if (!TASK_ID_RE.test(name)) continue
      const full = path.join(conversationRoot, name)
      let stat
      try {
        stat = await fsp.stat(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        entries.push({ taskId: name, conversationId, path: full })
      }
    }
    return entries
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
}

/**
 * 对比 worktree 相对其检出 HEAD 的改动（未自动合并到主工作区）。
 */
export async function getTaskWorktreeDiff({ workspacePath, conversationId, taskId, userDataPath, maxPatchChars = 400_000 }) {
  await assertWorkspaceRoot(workspacePath)
  const target = resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId)
  if (!fs.existsSync(target)) {
    throw new Error(`未找到任务 ${taskId} 的 worktree`)
  }
  const stat = await runGit(['diff', '--stat', 'HEAD'], target)
  let patch = ''
  try {
    patch = await runGit(['diff', 'HEAD'], target)
  } catch {
    patch = ''
  }
  if (patch.length > maxPatchChars) {
    patch = `${patch.slice(0, maxPatchChars)}\n\n…（差异过长已截断）`
  }
  return { taskId, path: target, stat: stat || '（无文件变更）', patch }
}

async function hasWorkingTreeDiffFromHead(cwd, relativePath) {
  try {
    await execFileAsync('git', ['diff', '--quiet', 'HEAD', '--', relativePath], {
      cwd,
      timeout: 30_000,
      env: { ...process.env, LC_ALL: 'C' },
    })
    return false
  } catch (error) {
    return error && typeof error === 'object' && error.code === 1
  }
}

/**
 * 完整列出 worktree 内相对于主分支的所有改动：
 * 包含已跟踪文件的修改/删除/新增，以及未跟踪的新文件 (??)
 * @returns {Promise<Array<{ file: string, type: 'modify' | 'add' | 'delete' }>>}
 */
async function listWorktreeDetailedChanges(wtPath) {
  const result = new Map()

  // 1. 获取已提交/暂存的相对 HEAD 差异 (包括删除)
  try {
    const diffRaw = await runGit(['diff', '--name-status', 'HEAD'], wtPath)
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

async function readHeadFile(cwd, relativePath) {
  try {
    const { stdout } = await execFileAsync('git', ['show', `HEAD:${relativePath}`], {
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
export async function previewTaskWorktreeMerge({ workspacePath, conversationId, taskId, userDataPath }) {
  const diff = await getTaskWorktreeDiff({ workspacePath, conversationId, taskId, userDataPath, maxPatchChars: 2_000_000 })
  const wtPath = resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId)
  const changes = await listWorktreeDetailedChanges(wtPath)
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

    const headText = await readHeadFile(workspacePath, file)
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
  taskId,
  userDataPath,
  removeAfter = false,
  files: onlyFiles = null,
}) {
  const preview = await previewTaskWorktreeMerge({ workspacePath, conversationId, taskId, userDataPath })
  if (!preview.canApply) {
    throw new Error(preview.reason || '无法合并：主工作区与 worktree 改动冲突或无可合并内容')
  }
  const wtPath = resolveTaskWorktreeDir(userDataPath, workspacePath, conversationId, taskId)
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
      const removed = await removeTaskWorktree({ workspacePath, conversationId, taskId, userDataPath, force: true })
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

export function assertWorktreeInsideUserData(worktreePath, userDataPath, workspacePath) {
  const root = worktreeRoot(userDataPath, workspacePath)
  if (!isPathInside(root, worktreePath)) {
    throw new Error('worktree 路径不在 TaskWeaver 托管目录内')
  }
}
