import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import crypto from 'node:crypto'

const execFileAsync = promisify(execFile)

async function runGit(args, cwd) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: 10000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' },
    })
    return { ok: true, stdout: stdout.trim() }
  } catch (err) {
    return { ok: false, error: err.message, stdout: '' }
  }
}

/**
 * 检查当前工作区是否是 Git 仓库
 * @param {string} workspacePath 
 */
export async function isGitRepository(workspacePath) {
  if (!workspacePath) return false
  try {
    if (!fs.existsSync(workspacePath)) return false
    const res = await runGit(['rev-parse', '--is-inside-work-tree'], workspacePath)
    return res.ok && res.stdout === 'true'
  } catch {
    return false
  }
}

/**
 * 获取 Git 状态与变更统计
 * @param {string} workspacePath 
 */
export async function getGitStatus(workspacePath) {
  const isRepo = await isGitRepository(workspacePath)
  if (!isRepo) {
    return {
      isRepo: false,
      branch: null,
      staged: [],
      unstaged: [],
      untracked: [],
      stat: '',
      hasChanges: false,
    }
  }

  // 1. 获取当前分支
  const branchRes = await runGit(['branch', '--show-current'], workspacePath)
  const branch = branchRes.ok ? branchRes.stdout || 'HEAD (detached)' : 'main'

  // 2. 获取 status --porcelain
  const statusRes = await runGit(['status', '--porcelain=v1'], workspacePath)
  const staged = []
  const unstaged = []
  const untracked = []

  if (statusRes.ok && statusRes.stdout) {
    const lines = statusRes.stdout.split('\n')
    for (const line of lines) {
      if (!line) continue
      const x = line[0]
      const y = line[1]
      const file = line.slice(3).trim()

      if (x === '?' && y === '?') {
        untracked.push(file)
      } else {
        if (x !== ' ' && x !== '?') {
          staged.push({ file, status: x })
        }
        if (y !== ' ' && y !== '?') {
          unstaged.push({ file, status: y })
        }
      }
    }
  }

  // 3. 获取 diff --stat
  const statRes = await runGit(['diff', '--stat'], workspacePath)
  const stat = statRes.ok ? statRes.stdout : ''

  return {
    isRepo: true,
    branch,
    staged,
    unstaged,
    untracked,
    stat,
    hasChanges: staged.length > 0 || unstaged.length > 0 || untracked.length > 0,
  }
}

/**
 * 根据变更文件推导智能 Commit Message 建议
 * @param {string} workspacePath 
 */
export async function suggestCommitMessage(workspacePath) {
  const status = await getGitStatus(workspacePath)
  if (!status.isRepo || !status.hasChanges) {
    return {
      message: 'chore: no changes to commit',
      summary: '工作区暂无未提交的修改',
    }
  }

  const allChangedFiles = [
    ...status.staged.map((s) => s.file),
    ...status.unstaged.map((s) => s.file),
    ...status.untracked,
  ]

  // 分析主要修改目录
  const scopes = new Set()
  let hasSrc = false
  let hasBackend = false
  let hasStyle = false
  let hasDocs = false
  let hasTest = false

  for (const f of allChangedFiles) {
    if (f.startsWith('src/')) hasSrc = true
    if (f.startsWith('electron/backend/')) hasBackend = true
    if (f.endsWith('.css') || f.includes('style')) hasStyle = true
    if (f.endsWith('.md') || f.includes('docs/')) hasDocs = true
    if (f.includes('test') || f.includes('spec')) hasTest = true

    const parts = f.split('/')
    if (parts.length > 1) {
      scopes.add(parts[0])
    }
  }

  let type = 'feat'
  let scope = ''

  if (hasTest && !hasSrc && !hasBackend) {
    type = 'test'
    scope = 'test'
  } else if (hasDocs && !hasSrc && !hasBackend) {
    type = 'docs'
    scope = 'docs'
  } else if (hasStyle && !hasBackend) {
    type = 'style'
    scope = 'ui'
  } else if (hasBackend && !hasSrc) {
    type = 'feat'
    scope = 'backend'
  } else if (hasSrc && !hasBackend) {
    type = 'feat'
    scope = 'ui'
  } else {
    type = 'feat'
    scope = scopes.size === 1 ? [...scopes][0] : 'core'
  }

  // 生成描述
  const primaryFiles = allChangedFiles.slice(0, 3).map((f) => path.basename(f)).join(', ')
  const message = `${type}(${scope}): update ${primaryFiles}${allChangedFiles.length > 3 ? ` and ${allChangedFiles.length - 3} other files` : ''}`

  return {
    message,
    branch: status.branch,
    changedCount: allChangedFiles.length,
    stat: status.stat,
    untrackedCount: status.untracked.length,
  }
}

function getCheckpointsFile(workspacePath, userDataPath) {
  if (userDataPath) {
    const hash = crypto.createHash('sha256').update(path.resolve(workspacePath)).digest('hex').slice(0, 16)
    return path.join(userDataPath, `checkpoints-${hash}.json`)
  }
  return path.join(workspacePath, '.taskweaver', 'checkpoints.json')
}

async function loadCheckpoints(file) {
  try {
    const raw = await fsp.readFile(file, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.checkpoints) ? parsed.checkpoints : []
  } catch {
    return []
  }
}

async function saveCheckpoints(file, checkpoints) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, JSON.stringify({ checkpoints }, null, 2), 'utf8')
}

/**
 * 创建 Git 检查点（执行前快照）
 */
export async function createGitCheckpoint(workspacePath, { conversationId, taskId, summary, userDataPath } = {}) {
  const isRepo = await isGitRepository(workspacePath)
  if (!isRepo) {
    return { isRepo: false, error: '当前工作区不是 Git 仓库' }
  }

  // 1. 获取 HEAD commit
  const headRes = await runGit(['rev-parse', 'HEAD'], workspacePath)
  const headCommit = headRes.ok ? headRes.stdout : null
  if (!headCommit) {
    return { isRepo: true, error: '仓库尚未产生任何初始提交' }
  }

  // 2. 获取当前分支
  const branchRes = await runGit(['branch', '--show-current'], workspacePath)
  const branch = branchRes.ok ? branchRes.stdout || 'HEAD' : 'HEAD'

  // 3. 检查未提交的改动，使用 git stash create 生成快照 commit（不污染全局 stash 栈）
  const stashRes = await runGit(['stash', 'create'], workspacePath)
  const stashCommit = stashRes.ok && stashRes.stdout ? stashRes.stdout : null

  // 4. 获取简要修改文件统计
  const status = await getGitStatus(workspacePath)

  const checkpoint = {
    id: `cp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    conversationId: conversationId || null,
    taskId: taskId || null,
    timestamp: Date.now(),
    headCommit,
    stashCommit,
    branch,
    hasDirtyChanges: Boolean(stashCommit),
    changedFilesCount: status.staged.length + status.unstaged.length + status.untracked.length,
    summary: summary || (stashCommit ? `包含未提交改动的快照 (${branch})` : `基于 ${headCommit.slice(0, 7)} 的干净快照`),
  }

  const file = getCheckpointsFile(workspacePath, userDataPath)
  const existing = await loadCheckpoints(file)
  const updated = [checkpoint, ...existing].slice(0, 50)
  await saveCheckpoints(file, updated)

  return { isRepo: true, checkpoint }
}

/**
 * 获取 Git 检查点列表
 */
export async function listGitCheckpoints(workspacePath, { conversationId, userDataPath } = {}) {
  const isRepo = await isGitRepository(workspacePath)
  if (!isRepo) return []

  const file = getCheckpointsFile(workspacePath, userDataPath)
  const list = await loadCheckpoints(file)
  if (!conversationId) return list
  return list.filter((cp) => !cp.conversationId || cp.conversationId === conversationId)
}

/**
 * 获取当前工作区与指定检查点之间的文件差异
 */
export async function getGitCheckpointDiff(workspacePath, checkpointId, { userDataPath } = {}) {
  const isRepo = await isGitRepository(workspacePath)
  if (!isRepo) throw new Error('当前工作区不是 Git 仓库')

  const file = getCheckpointsFile(workspacePath, userDataPath)
  const existing = await loadCheckpoints(file)
  const cp = existing.find((item) => item.id === checkpointId)
  if (!cp) throw new Error('未找到指定检查点')

  const target = cp.stashCommit || cp.headCommit
  const diffRes = await runGit(['diff', target], workspacePath)
  const statRes = await runGit(['diff', '--stat', target], workspacePath)

  return {
    checkpoint: cp,
    diff: diffRes.ok ? diffRes.stdout : '',
    stat: statRes.ok ? statRes.stdout : '',
  }
}

/**
 * 还原 Git 检查点
 * 安全准则：若当前工作区有未保存的改动，必须要求确认且不会静默覆盖（先做还原前备份）。
 */
export async function restoreGitCheckpoint(workspacePath, checkpointId, { force = false, userDataPath } = {}) {
  const isRepo = await isGitRepository(workspacePath)
  if (!isRepo) throw new Error('当前工作区不是 Git 仓库')

  const file = getCheckpointsFile(workspacePath, userDataPath)
  const existing = await loadCheckpoints(file)
  const cp = existing.find((item) => item.id === checkpointId)
  if (!cp) throw new Error('未找到指定检查点')

  // 1. 检查当前是否有未提交改动
  const currentStatus = await getGitStatus(workspacePath)
  if (currentStatus.hasChanges && !force) {
    return {
      success: false,
      requireConfirm: true,
      hasChanges: true,
      changedFilesCount: currentStatus.staged.length + currentStatus.unstaged.length + currentStatus.untracked.length,
      stat: currentStatus.stat,
      message: '当前工作区有未保存的修改，还原将覆盖当前工作区。是否确认还原？',
    }
  }

  // 2. 若当前有改动且用户确认了 force，先自动安全备份当前状态，确保绝不丢失代码
  if (currentStatus.hasChanges) {
    const backupStash = await runGit(['stash', 'create'], workspacePath)
    if (backupStash.ok && backupStash.stdout) {
      const headRes = await runGit(['rev-parse', 'HEAD'], workspacePath)
      const backupCp = {
        id: `backup-before-restore-${Date.now()}`,
        timestamp: Date.now(),
        headCommit: headRes.stdout || cp.headCommit,
        stashCommit: backupStash.stdout,
        branch: currentStatus.branch,
        hasDirtyChanges: true,
        summary: '还原前自动安全备份快照',
      }
      await saveCheckpoints(file, [backupCp, ...existing].slice(0, 50))
    }
  }

  // 3. 执行还原
  // 先把 HEAD 重置到检查点的 headCommit
  const resetRes = await runGit(['reset', '--hard', cp.headCommit], workspacePath)
  if (!resetRes.ok) throw new Error(`Git reset 失败: ${resetRes.error}`)

  // 若快照包含未提交改动（stashCommit），将其还原到工作区
  if (cp.stashCommit) {
    const checkoutRes = await runGit(['checkout', cp.stashCommit, '--', '.'], workspacePath)
    if (!checkoutRes.ok) {
      await runGit(['stash', 'apply', '--index', cp.stashCommit], workspacePath)
    }
  }

  // 清除多余未跟踪文件
  await runGit(['clean', '-fd'], workspacePath)

  return {
    success: true,
    message: `已成功还原至检查点 [${cp.id}]`,
    checkpoint: cp,
  }
}

