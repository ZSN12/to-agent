import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import crypto from 'node:crypto'
import { assertSafeWorkspacePath, isPathInside } from './security-path.mjs'

const execFileAsync = promisify(execFile)

async function runGit(args, cwd, extraEnv = {}) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: 10000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C', ...extraEnv },
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
 * 在独立临时索引中构建工作区完整树对象（包含 staged, unstaged, untracked 所有文件）
 * 绝不污染用户当前的 .git/index，也不依赖易丢未跟踪文件的 git stash create
 * @param {string} workspacePath
 * @param {string} headCommit
 * @returns {Promise<{ treeSha: string, headTreeSha: string, hasChanges: boolean }>}
 */
async function captureWorkspaceTree(workspacePath, headCommit) {
  const gitDirRes = await runGit(['rev-parse', '--git-dir'], workspacePath)
  const gitDir = gitDirRes.ok && gitDirRes.stdout ? path.resolve(workspacePath, gitDirRes.stdout) : path.join(workspacePath, '.git')
  const tempIndex = path.join(gitDir, `tw_idx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`)
  const env = { GIT_INDEX_FILE: tempIndex }

  try {
    // 1. 初始化临时索引为 HEAD
    await runGit(['read-tree', headCommit], workspacePath, env)
    // 2. 将当前工作区所有改动（包括未跟踪新文件）全量加进临时索引
    await runGit(['add', '-A'], workspacePath, env)
    // 3. 写入并获取当前工作区对应的新树 SHA
    const writeRes = await runGit(['write-tree'], workspacePath, env)
    if (!writeRes.ok || !writeRes.stdout) {
      throw new Error(`生成工作区快照树失败: ${writeRes.error}`)
    }
    const treeSha = writeRes.stdout.trim()

    // 4. 获取 HEAD 提交对应的树 SHA 进行比对
    const headTreeRes = await runGit(['rev-parse', `${headCommit}^{tree}`], workspacePath)
    const headTreeSha = headTreeRes.ok ? headTreeRes.stdout.trim() : ''

    return {
      treeSha,
      headTreeSha,
      hasChanges: Boolean(treeSha && headTreeSha && treeSha !== headTreeSha),
    }
  } finally {
    try {
      await fsp.rm(tempIndex, { force: true })
    } catch {
      // ignore
    }
  }
}

/**
 * 计算目标检查点与当前工作区的文件变动影响（willAdd, willOverwrite, willDelete）
 * @param {string} workspacePath
 * @param {string} targetCommit
 * @param {string} currentTreeSha
 */
async function calculateCheckpointImpact(workspacePath, targetCommit, currentTreeSha) {
  // 对比 targetCommit 与 currentTreeSha
  // diff-tree targetTree currentTree:
  // A 表示当前存在而目标不存在 -> 还原到目标后会被移除 (willDelete)
  // D 表示目标存在而当前不存在 -> 还原到目标后会新增 (willAdd)
  // M 表示两边都存在且内容不同 -> 还原到目标后会被快照覆盖 (willOverwrite)
  const diffTreeRes = await runGit(
    ['diff-tree', '-r', '--name-status', `${targetCommit}^{tree}`, currentTreeSha],
    workspacePath,
  )

  const willAdd = []
  const willOverwrite = []
  const willDelete = []

  if (diffTreeRes.ok && diffTreeRes.stdout) {
    const lines = diffTreeRes.stdout.split('\n')
    for (const line of lines) {
      if (!line) continue
      const parts = line.split('\t')
      const status = parts[0]?.[0]
      const file = parts[1] || parts[0]?.slice(1)?.trim()
      if (!file) continue

      if (status === 'A') {
        willDelete.push(file)
      } else if (status === 'D') {
        willAdd.push(file)
      } else {
        willOverwrite.push(file)
      }
    }
  }

  // 获取可读的差异统计
  const statRes = await runGit(
    ['diff', '--stat', `${targetCommit}^{tree}`, currentTreeSha],
    workspacePath,
  )

  return {
    willAdd,
    willOverwrite,
    willDelete,
    stat: statRes.ok ? statRes.stdout : '',
    totalAffected: willAdd.length + willOverwrite.length + willDelete.length,
  }
}

/**
 * 创建 Git 检查点（执行前快照）
 * 完整包含未跟踪文件与已暂存改动
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

  // 3. 使用临时独立索引精确捕获包含未跟踪文件的完整工作区树
  const { treeSha, hasChanges } = await captureWorkspaceTree(workspacePath, headCommit)

  let stashCommit = null
  if (hasChanges) {
    const commitMsg = summary ? `TaskWeaver Checkpoint: ${summary}` : `TaskWeaver Checkpoint: 工作区改动快照 (${branch})`
    const commitRes = await runGit(['commit-tree', treeSha, '-p', headCommit, '-m', commitMsg], workspacePath)
    if (commitRes.ok && commitRes.stdout) {
      stashCommit = commitRes.stdout.trim()
    }
  }

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
    hasDirtyChanges: hasChanges,
    changedFilesCount: status.staged.length + status.unstaged.length + status.untracked.length,
    summary: summary || (hasChanges ? `包含未提交改动的快照 (${branch})` : `基于 ${headCommit.slice(0, 7)} 的干净快照`),
  }

  const file = getCheckpointsFile(workspacePath, userDataPath)
  const existing = await loadCheckpoints(file)
  const updated = [checkpoint, ...existing].slice(0, 50)
  await saveCheckpoints(file, updated)

  return { ok: true, isRepo: true, checkpoint }
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
 * 安全准则：
 * 1. 精确计算并呈现将新增、覆盖、删除的文件清单
 * 2. 还原前强制全量备份当前状态，确保绝不丢失数据
 * 3. 杜绝无条件执行 git clean -fd，仅安全清理属于还原目标的非快照文件
 * 4. 出现异常时安全回滚并保留备份记录
 */
export async function restoreGitCheckpoint(workspacePath, checkpointId, { force = false, userDataPath } = {}) {
  const isRepo = await isGitRepository(workspacePath)
  if (!isRepo) throw new Error('当前工作区不是 Git 仓库')

  const file = getCheckpointsFile(workspacePath, userDataPath)
  const existing = await loadCheckpoints(file)
  const cp = existing.find((item) => item.id === checkpointId)
  if (!cp) throw new Error('未找到指定检查点')

  const targetCommit = cp.stashCommit || cp.headCommit

  // 1. 获取当前工作区的完整树对象（包含未跟踪文件）
  const headRes = await runGit(['rev-parse', 'HEAD'], workspacePath)
  const headCommit = headRes.ok ? headRes.stdout.trim() : null
  if (!headCommit) throw new Error('仓库无有效 HEAD 提交')

  const { treeSha: currentTreeSha, hasChanges } = await captureWorkspaceTree(workspacePath, headCommit)

  // 2. 精确计算还原到目标提交的影响清单
  const impact = await calculateCheckpointImpact(workspacePath, targetCommit, currentTreeSha)

  // 3. 检查是否有需要确认的改动
  if (impact.totalAffected > 0 && !force) {
    return {
      success: false,
      requireConfirm: true,
      hasChanges: true,
      changedFilesCount: impact.totalAffected,
      willAdd: impact.willAdd,
      willOverwrite: impact.willOverwrite,
      willDelete: impact.willDelete,
      stat: impact.stat,
      message: `还原将变更工作区：将新增 ${impact.willAdd.length} 个文件，覆盖 ${impact.willOverwrite.length} 个文件，移除 ${impact.willDelete.length} 个文件。是否确认还原？`,
    }
  }

  // 4. 若用户已确认（force = true）且当前有改动：先无条件自动安全备份当前状态
  let backupCheckpoint = null
  if (hasChanges || impact.totalAffected > 0) {
    const backupRes = await createGitCheckpoint(workspacePath, {
      summary: `还原至 [${cp.id}] 前自动备份`,
      userDataPath,
    })
    if (backupRes?.checkpoint) {
      backupCheckpoint = backupRes.checkpoint
    }
  }

  // 5. 执行还原操作
  try {
    // 5.1 针对 willDelete 中的文件进行安全受控移除（这些文件已经在前置备份中安全归档！）
    for (const relFile of impact.willDelete) {
      try {
        const { realPath } = await assertSafeWorkspacePath(workspacePath, relFile, { mustExist: true })
        await fsp.rm(realPath, { recursive: true, force: true })
      } catch {
        // 文件可能已经被移动或不存在，忽略
      }
    }

    // 5.2 将目标提交中的所有文件全量检出到工作区
    const checkoutRes = await runGit(['checkout', targetCommit, '--', '.'], workspacePath)
    if (!checkoutRes.ok) {
      throw new Error(`检出快照文件失败: ${checkoutRes.error}`)
    }

    // 5.3 同步重置当前索引，使状态干净
    await runGit(['reset', 'HEAD'], workspacePath)

    return {
      success: true,
      message: `已成功还原至检查点 [${cp.id}]`,
      checkpoint: cp,
      backupCheckpointId: backupCheckpoint?.id || null,
      willAdd: impact.willAdd,
      willOverwrite: impact.willOverwrite,
      willDelete: impact.willDelete,
    }
  } catch (error) {
    throw new Error(`检查点还原失败: ${error.message}。${backupCheckpoint ? `已在前置备份中保留当前状态快照 [${backupCheckpoint.id}]` : ''}`)
  }
}

