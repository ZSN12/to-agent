import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import crypto from 'node:crypto'
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
    const stderr = err?.stderr ? String(err.stderr).trim() : ''
    const msg = stderr || err.message || String(err)
    return { ok: false, error: msg, stdout: (err.stdout || '').trim() }
  }
}

export const CHECKPOINT_KIND = Object.freeze({
  INTERNAL: 'internal_protection',
  GIT_COMMIT: 'git_commit',
})

export const DEFAULT_MANUAL_COMMIT_MESSAGE = 'chore(taskweaver): create workspace snapshot'

const workspaceCommitLocks = new Map()

async function withWorkspaceCommitLock(workspacePath, fn) {
  const key = path.resolve(workspacePath)
  const previous = workspaceCommitLocks.get(key) || Promise.resolve()
  let release = () => {}
  const current = previous.then(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  workspaceCommitLocks.set(key, current)
  await previous
  try {
    return await fn()
  } finally {
    release()
    if (workspaceCommitLocks.get(key) === current) {
      workspaceCommitLocks.delete(key)
    }
  }
}

async function resolveHeadCommit(workspacePath) {
  const headRes = await runGit(['rev-parse', 'HEAD'], workspacePath)
  return headRes.ok ? headRes.stdout.trim() : null
}

async function isDetachedHead(workspacePath) {
  const head = await resolveHeadCommit(workspacePath)
  if (!head) return false
  const branchRes = await runGit(['branch', '--show-current'], workspacePath)
  return !(branchRes.ok && branchRes.stdout)
}

/**
 * 手动提交预览：将纳入 git add -A 的变更清单（尊重 .gitignore）。
 */
export async function previewManualGitCommit(workspacePath) {
  const isRepo = await isGitRepository(workspacePath)
  if (!isRepo) {
    return { ok: false, isRepo: false, error: '当前工作区不是 Git 仓库' }
  }

  const headCommit = await resolveHeadCommit(workspacePath)
  const branchRes = await runGit(['branch', '--show-current'], workspacePath)
  const branch = branchRes.ok && branchRes.stdout ? branchRes.stdout : null
  const detached = headCommit ? await isDetachedHead(workspacePath) : false

  if (detached) {
    return {
      ok: false,
      isRepo: true,
      detached: true,
      error: '当前处于 detached HEAD，请先切换到分支后再提交快照',
      branch: 'HEAD (detached)',
      headCommit,
    }
  }

  const status = await getGitStatus(workspacePath)
  const nameRes = await runGit(['diff', '--name-status', 'HEAD'], workspacePath)

  const files = []
  const parseNameStatus = (block) => {
    if (!block) return
    for (const line of block.split('\n')) {
      if (!line.trim()) continue
      const tab = line.indexOf('\t')
      if (tab < 0) continue
      const code = line.slice(0, tab).trim()
      const file = line.slice(tab + 1).trim()
      if (!file) continue
      const statusLetter = code[0]
      files.push({ file, change: statusLetter })
    }
  }
  parseNameStatus(nameRes.ok ? nameRes.stdout : '')
  for (const file of status.untracked) {
    if (!files.some((item) => item.file === file)) {
      files.push({ file, change: '?' })
    }
  }

  let hasCommittableChanges = status.hasChanges
  if (headCommit) {
    const empty = await runGit(['diff', '--quiet', 'HEAD'], workspacePath)
    const cachedEmpty = await runGit(['diff', '--cached', '--quiet'], workspacePath)
    const untrackedRes = await runGit(['ls-files', '--others', '--exclude-standard'], workspacePath)
    const hasUntracked = untrackedRes.ok && Boolean(untrackedRes.stdout.trim())
    hasCommittableChanges = !(empty.ok && cachedEmpty.ok) || hasUntracked
  } else {
    hasCommittableChanges = files.length > 0 || status.hasChanges
  }

  const headRes = headCommit ? await runGit(['rev-parse', '--short', 'HEAD'], workspacePath) : null
  const headShortSha = headRes?.ok ? headRes.stdout : null

  let stateFingerprint = 'EMPTY:EMPTY'
  try {
    const { treeSha } = await captureWorkspaceTree(workspacePath, headCommit)
    stateFingerprint = `${headCommit || 'EMPTY'}:${treeSha}`
  } catch {
    stateFingerprint = `${headCommit || 'EMPTY'}:unknown`
  }

  const stagedCount = status.staged.length
  const unstagedCount = status.unstaged.length
  const untrackedCount = status.untracked.length

  return {
    ok: true,
    isRepo: true,
    detached: false,
    branch: branch || (headCommit ? 'main' : null),
    headCommit,
    headShortSha,
    hasCommittableChanges,
    clean: !hasCommittableChanges,
    defaultMessage: DEFAULT_MANUAL_COMMIT_MESSAGE,
    files,
    stagedCount,
    unstagedCount,
    untrackedCount,
    stateFingerprint,
    notice: '提交将推进当前分支的本地历史，不会 push 到远程。',
  }
}

/**
 * 用户手动「提交快照」：在当前分支创建普通 git commit（可见于 git log）。
 */
export async function createManualGitCommitSnapshot(
  workspacePath,
  { message, expectedPreviewFingerprint, conversationId, userDataPath, gitEnv = {}, commitGitConfig = [] } = {},
) {
  const gitRun = (args) => runGit(args, workspacePath, gitEnv)
  return withWorkspaceCommitLock(workspacePath, async () => {
    const preview = await previewManualGitCommit(workspacePath)
    if (!preview.ok) return preview

    if (expectedPreviewFingerprint && preview.stateFingerprint !== expectedPreviewFingerprint) {
      return {
        ok: false,
        isRepo: true,
        stalePreview: true,
        error: '工作区在预览后已变化，请重新查看将提交的文件清单后再确认',
        preview,
      }
    }

    if (preview.clean || !preview.hasCommittableChanges) {
      return {
        ok: true,
        isRepo: true,
        clean: true,
        headShortSha: preview.headShortSha,
        headCommit: preview.headCommit,
        message: '当前工作区干净，HEAD 已是最新快照',
      }
    }

    const commitMessage = (message || DEFAULT_MANUAL_COMMIT_MESSAGE).trim() || DEFAULT_MANUAL_COMMIT_MESSAGE

    const gitDirRes = await gitRun(['rev-parse', '--git-dir'])
    const gitDir = gitDirRes.ok ? path.resolve(workspacePath, gitDirRes.stdout) : path.join(workspacePath, '.git')
    const indexPath = path.join(gitDir, 'index')
    const indexBackup = path.join(gitDir, `tw_index_backup_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`)

    let indexBackedUp = false
    try {
      if (fs.existsSync(indexPath)) {
        await fsp.copyFile(indexPath, indexBackup)
        indexBackedUp = true
      }

      const addRes = await gitRun(['add', '-A'])
      if (!addRes.ok) {
        return { ok: false, isRepo: true, error: `暂存失败: ${addRes.error}` }
      }

      const parentBeforeRes = await gitRun(['rev-parse', 'HEAD'])
      const parentBefore = parentBeforeRes.ok ? parentBeforeRes.stdout.trim() : null
      const commitRes = await gitRun([...commitGitConfig, 'commit', '-m', commitMessage])
      if (!commitRes.ok) {
        if (indexBackedUp) {
          await fsp.copyFile(indexBackup, indexPath).catch(() => {})
        }
        return { ok: false, isRepo: true, error: `Git 提交失败: ${commitRes.error}` }
      }

      const shaRes = await gitRun(['rev-parse', 'HEAD'])
      if (!shaRes.ok || !shaRes.stdout) {
        return { ok: false, isRepo: true, error: '提交后无法读取 commit SHA' }
      }
      const commitSha = shaRes.stdout.trim()
      const branchRes = await gitRun(['branch', '--show-current'])
      const branch = branchRes.ok && branchRes.stdout ? branchRes.stdout : preview.branch || 'HEAD'

      const statRes = await gitRun(['show', '--stat', '--oneline', '-1'])
      const diffNumRes = await gitRun(['show', '--name-only', '--format=', commitSha])
      const changedFilesCount = diffNumRes.ok && diffNumRes.stdout
        ? diffNumRes.stdout.split('\n').filter(Boolean).length
        : preview.files.length

      const checkpointId = `gc-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
      const checkpoint = {
        id: checkpointId,
        kind: CHECKPOINT_KIND.GIT_COMMIT,
        conversationId: conversationId || null,
        taskId: null,
        timestamp: Date.now(),
        headCommit: parentBefore || 'EMPTY_REPO',
        commitSha,
        commitMessage,
        stashCommit: commitSha,
        branch,
        hasDirtyChanges: true,
        changedFilesCount,
        summary: commitMessage,
        gitRef: null,
        stat: statRes.ok ? statRes.stdout : '',
      }

      const file = getCheckpointsFile(workspacePath, userDataPath)
      const existing = await loadCheckpoints(file)
      const MAX_CHECKPOINTS = 50
      const combined = [checkpoint, ...existing]
      const updated = combined.slice(0, MAX_CHECKPOINTS)
      const evicted = combined.slice(MAX_CHECKPOINTS)
      for (const oldCp of evicted) {
        if (oldCp?.kind === CHECKPOINT_KIND.INTERNAL && oldCp?.id) {
          await runGit(['update-ref', '-d', `refs/taskweaver/checkpoints/${oldCp.id}`], workspacePath).catch(() => {})
        }
      }
      await saveCheckpoints(file, updated)

      const porcelain = await gitRun(['status', '--porcelain'])
      const workspaceClean = porcelain.ok && !porcelain.stdout.trim()

      return {
        ok: true,
        isRepo: true,
        clean: false,
        checkpoint,
        commitSha,
        branch,
        commitMessage,
        changedFilesCount,
        workspaceClean,
      }
    } finally {
      if (indexBackedUp) {
        await fsp.rm(indexBackup, { force: true }).catch(() => {})
      }
    }
  })
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

const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/**
 * 在独立临时索引中构建工作区完整树对象（包含 staged, unstaged, untracked 所有文件）
 * 绝不污染用户当前的 .git/index，也不依赖易丢未跟踪文件的 git stash create
 * 支持空仓库（尚未产生初始提交）
 * @param {string} workspacePath
 * @param {string | null} headCommit
 * @returns {Promise<{ treeSha: string, headTreeSha: string, hasChanges: boolean }>}
 */
async function captureWorkspaceTree(workspacePath, headCommit) {
  const gitDirRes = await runGit(['rev-parse', '--git-dir'], workspacePath)
  const gitDir = gitDirRes.ok && gitDirRes.stdout ? path.resolve(workspacePath, gitDirRes.stdout) : path.join(workspacePath, '.git')
  const tempIndex = path.join(gitDir, `tw_idx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`)
  const env = { GIT_INDEX_FILE: tempIndex }

  try {
    if (headCommit) {
      // 1. 初始化临时索引为 HEAD
      await runGit(['read-tree', headCommit], workspacePath, env)
    }
    // 2. 将当前工作区所有改动（包括未跟踪新文件、符号链接、权限变更）全量加进临时索引
    await runGit(['add', '-A'], workspacePath, env)
    // 3. 写入并获取当前工作区对应的新树 SHA
    const writeRes = await runGit(['write-tree'], workspacePath, env)
    if (!writeRes.ok || !writeRes.stdout) {
      throw new Error(`生成工作区快照树失败: ${writeRes.error}`)
    }
    const treeSha = writeRes.stdout.trim()

    // 4. 获取基准树 SHA 进行比对
    let headTreeSha = EMPTY_TREE_SHA
    if (headCommit) {
      const headTreeRes = await runGit(['rev-parse', `${headCommit}^{tree}`], workspacePath)
      headTreeSha = headTreeRes.ok ? headTreeRes.stdout.trim() : EMPTY_TREE_SHA
    }

    return {
      treeSha,
      headTreeSha,
      hasChanges: Boolean(treeSha && treeSha !== headTreeSha),
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
 * @param {string} targetTreeOrCommit
 * @param {string} currentTreeSha
 */
async function calculateCheckpointImpact(workspacePath, targetTreeOrCommit, currentTreeSha) {
  const treeRef = targetTreeOrCommit.includes('^{tree}') || (targetTreeOrCommit.length === 40 && !targetTreeOrCommit.includes(':'))
    ? targetTreeOrCommit
    : `${targetTreeOrCommit}^{tree}`

  const diffTreeRes = await runGit(
    ['diff-tree', '-r', '--name-status', treeRef, currentTreeSha],
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
    ['diff', '--stat', treeRef, currentTreeSha],
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
 * 完整包含未跟踪文件、符号链接与已暂存改动，支持未提交的初始空仓库
 */
export async function createGitCheckpoint(workspacePath, { conversationId, taskId, summary, userDataPath } = {}) {
  const isRepo = await isGitRepository(workspacePath)
  if (!isRepo) {
    return { ok: false, isRepo: false, error: '当前工作区不是 Git 仓库' }
  }

  const status = await getGitStatus(workspacePath)

  // 1. 获取 HEAD commit（允许为空仓库）
  const headRes = await runGit(['rev-parse', 'HEAD'], workspacePath)
  const headCommit = headRes.ok ? headRes.stdout.trim() : null

  // 2. 获取当前分支
  const branchRes = await runGit(['branch', '--show-current'], workspacePath)
  const branch = branchRes.ok ? branchRes.stdout || 'HEAD' : 'HEAD'

  // 3. 使用临时独立索引精确捕获包含未跟踪文件的完整工作区树
  let treeSha, hasChanges
  try {
    const captured = await captureWorkspaceTree(workspacePath, headCommit)
    treeSha = captured.treeSha
    hasChanges = captured.hasChanges
  } catch (err) {
    return { ok: false, isRepo: true, error: `工作区状态快照失败: ${err.message}` }
  }

  let stashCommit = null
  if (hasChanges) {
    const commitMsg = summary ? `TaskWeaver Checkpoint: ${summary}` : `TaskWeaver Checkpoint: 工作区改动快照 (${branch})`
    const commitArgs = headCommit
      ? ['commit-tree', treeSha, '-p', headCommit, '-m', commitMsg]
      : ['commit-tree', treeSha, '-m', commitMsg]
    const commitRes = await runGit(commitArgs, workspacePath)
    if (commitRes.ok && commitRes.stdout) {
      stashCommit = commitRes.stdout.trim()
    } else {
      return { ok: false, isRepo: true, error: `创建快照提交对象失败: ${commitRes.error}` }
    }
  }

  const checkpointId = `cp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
  const gitRef = `refs/taskweaver/checkpoints/${checkpointId}`

  const checkpoint = {
    id: checkpointId,
    kind: CHECKPOINT_KIND.INTERNAL,
    conversationId: conversationId || null,
    taskId: taskId || null,
    timestamp: Date.now(),
    headCommit: headCommit || 'EMPTY_REPO',
    stashCommit,
    branch,
    hasDirtyChanges: hasChanges,
    changedFilesCount: status.staged.length + status.unstaged.length + status.untracked.length,
    summary: summary || (hasChanges ? `包含未提交改动的快照 (${branch})` : (headCommit ? `基于 ${headCommit.slice(0, 7)} 的干净快照` : '初始空仓库干净状态')),
    gitRef,
  }

  // 为快照提交创建持久稳定的 Git 引用，彻底避免 git gc / git prune 误删
  const targetRefSha = stashCommit || headCommit
  if (targetRefSha && targetRefSha !== 'EMPTY_REPO') {
    const refRes = await runGit(['update-ref', gitRef, targetRefSha], workspacePath)
    if (!refRes.ok) {
      return {
        ok: false,
        isRepo: true,
        error: `持久化快照 Git 引用失败: ${refRes.error || 'update-ref 命令异常'}`,
      }
    }
  }

  const file = getCheckpointsFile(workspacePath, userDataPath)
  const existing = await loadCheckpoints(file)
  
  // 最大保留 50 个检查点，被淘汰的旧检查点同步清理对应的 Git ref
  const MAX_CHECKPOINTS = 50
  const combined = [checkpoint, ...existing]
  const updated = combined.slice(0, MAX_CHECKPOINTS)
  const evicted = combined.slice(MAX_CHECKPOINTS)
  for (const oldCp of evicted) {
    if (oldCp?.kind === CHECKPOINT_KIND.GIT_COMMIT) continue
    if (oldCp?.id) {
      await runGit(['update-ref', '-d', `refs/taskweaver/checkpoints/${oldCp.id}`], workspacePath).catch(() => {})
    }
  }

  await saveCheckpoints(file, updated)

  return { ok: true, isRepo: true, checkpoint }
}

/**
 * 删除指定的 Git 快照，并同步清理对应 Git 引用
 */
export async function deleteGitCheckpoint(workspacePath, checkpointId, { conversationId, userDataPath } = {}) {
  const isRepo = await isGitRepository(workspacePath)
  if (!isRepo) throw new Error('当前工作区不是 Git 仓库')

  // 检查工作区可写性
  try {
    await fsp.access(workspacePath, fs.constants.W_OK)
  } catch (err) {
    return { ok: false, error: `工作区无写入权限，无法删除快照: ${err.message}` }
  }

  const file = getCheckpointsFile(workspacePath, userDataPath)
  const existing = await loadCheckpoints(file)
  const target = existing.find((c) => c.id === checkpointId)
  if (!target) {
    return { ok: false, error: `未找到指定的快照 [${checkpointId}]` }
  }
  try {
    assertCheckpointConversation(target, conversationId)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  // Git 提交快照只移除元数据，不改写分支历史
  const isGitCommitSnapshot = target.kind === CHECKPOINT_KIND.GIT_COMMIT
  if (!isGitCommitSnapshot) {
    const gitRef = `refs/taskweaver/checkpoints/${checkpointId}`
    const checkRefRes = await runGit(['rev-parse', '--verify', gitRef], workspacePath)
    if (checkRefRes.ok && checkRefRes.stdout) {
      const delRefRes = await runGit(['update-ref', '-d', gitRef], workspacePath)
      if (!delRefRes.ok) {
        return { ok: false, error: `清理底层 Git 引用失败: ${delRefRes.error || 'update-ref -d 异常'}` }
      }
    }
  }

  // 2. 从持久化列表中移除并保存
  const updated = existing.filter((c) => c.id !== checkpointId)
  await saveCheckpoints(file, updated)

  return { ok: true, deletedId: checkpointId }
}

/**
 * 获取 Git 检查点列表
 */
function assertCheckpointConversation(cp, conversationId) {
  if (!conversationId) return
  if (cp.conversationId && cp.conversationId !== conversationId) {
    throw new Error('该检查点不属于当前对话')
  }
}

export async function listGitCheckpoints(workspacePath, { conversationId, userDataPath } = {}) {
  const isRepo = await isGitRepository(workspacePath)
  if (!isRepo) return []

  const file = getCheckpointsFile(workspacePath, userDataPath)
  const list = await loadCheckpoints(file)
  if (!conversationId) return list
  return list.filter((item) => !item.conversationId || item.conversationId === conversationId)
}

/**
 * 获取当前工作区与指定检查点之间的文件差异
 */
export async function getGitCheckpointDiff(workspacePath, checkpointId, { conversationId, userDataPath } = {}) {
  const isRepo = await isGitRepository(workspacePath)
  if (!isRepo) throw new Error('当前工作区不是 Git 仓库')

  const file = getCheckpointsFile(workspacePath, userDataPath)
  const existing = await loadCheckpoints(file)
  const cp = existing.find((item) => item.id === checkpointId)
  if (!cp) throw new Error('未找到指定检查点')
  assertCheckpointConversation(cp, conversationId)

  const target = cp.commitSha || cp.stashCommit || cp.headCommit
  const targetRef = target === 'EMPTY_REPO' ? EMPTY_TREE_SHA : target
  const diffRes = await runGit(['diff', targetRef], workspacePath)
  const statRes = await runGit(['diff', '--stat', targetRef], workspacePath)

  return {
    checkpoint: cp,
    diff: diffRes.ok ? diffRes.stdout : '',
    stat: statRes.ok ? statRes.stdout : '',
  }
}

/**
 * Git 提交快照：将当前分支重置到对应 commit（git reset --hard）。
 */
async function restoreGitCommitCheckpoint(workspacePath, cp, { force = false, expectedStateFingerprint, userDataPath } = {}) {
  const targetSha = cp.commitSha
  if (!targetSha) throw new Error('该 Git 提交快照缺少 commit SHA')

  const branchRes = await runGit(['branch', '--show-current'], workspacePath)
  if (!branchRes.ok || !branchRes.stdout) {
    throw new Error('当前处于 detached HEAD，请先切换到分支后再还原到此提交')
  }

  const headRes = await runGit(['rev-parse', 'HEAD'], workspacePath)
  const headCommit = headRes.ok ? headRes.stdout.trim() : null
  if (!headCommit) {
    throw new Error('仓库尚无提交，无法还原到 Git 提交快照')
  }

  let onHistory = headCommit === targetSha
  if (!onHistory) {
    const ancestorRes = await runGit(['merge-base', '--is-ancestor', targetSha, headCommit], workspacePath)
    onHistory = ancestorRes.ok
  }
  if (!onHistory) {
    throw new Error('该提交不在当前分支历史上，无法直接重置。可在终端使用 git cherry-pick 或新建分支检出')
  }

  const { treeSha: currentTreeSha, hasChanges } = await captureWorkspaceTree(workspacePath, headCommit)
  const stateFingerprint = `${headCommit}:${currentTreeSha}`

  const countRes = await runGit(['rev-list', '--count', `${targetSha}..HEAD`], workspacePath)
  const commitsDropped = countRes.ok ? Number.parseInt(countRes.stdout, 10) || 0 : 0

  const targetTree = `${targetSha}^{tree}`
  const impact = await calculateCheckpointImpact(workspacePath, targetTree, currentTreeSha)

  const needsReset = commitsDropped > 0 || hasChanges || headCommit !== targetSha

  if (!force) {
    if (!needsReset) {
      return {
        success: true,
        message: '当前分支已在此提交，工作区无额外改动',
        checkpoint: cp,
        restoreMode: 'git_reset_hard',
        commitsDropped: 0,
      }
    }
    const dropHint =
      commitsDropped > 0
        ? `当前分支将回退 ${commitsDropped} 个本地提交（未 push 前仍可能通过 git reflog 找回）。`
        : '将丢弃当前未提交的改动。'
    return {
      success: false,
      requireConfirm: true,
      restoreMode: 'git_reset_hard',
      hasChanges: true,
      commitsDropped,
      targetCommitSha: targetSha,
      changedFilesCount: impact.totalAffected,
      willAdd: impact.willAdd,
      willOverwrite: impact.willOverwrite,
      willDelete: impact.willDelete,
      stat: impact.stat,
      stateFingerprint,
      message: `将把分支 ${branchRes.stdout} 重置到提交 ${targetSha.slice(0, 7)}。${dropHint}不会 push 到远程。是否确认？`,
    }
  }

  if (expectedStateFingerprint && expectedStateFingerprint !== stateFingerprint) {
    return {
      success: false,
      requireConfirm: true,
      stateMismatch: true,
      restoreMode: 'git_reset_hard',
      hasChanges: true,
      commitsDropped,
      targetCommitSha: targetSha,
      changedFilesCount: impact.totalAffected,
      willAdd: impact.willAdd,
      willOverwrite: impact.willOverwrite,
      willDelete: impact.willDelete,
      stat: impact.stat,
      stateFingerprint,
      message: '工作区在预览后发生变动，已拒绝按旧预览还原。请核对最新变动后再次确认。',
    }
  }

  let backupCheckpoint = null
  const backupRes = await createGitCheckpoint(workspacePath, {
    summary: `重置到 ${targetSha.slice(0, 7)} 前自动保护备份`,
    userDataPath,
  })
  if (backupRes?.ok && backupRes.checkpoint) {
    backupCheckpoint = backupRes.checkpoint
  } else {
    throw new Error(`还原前自动创建安全备份失败（${backupRes?.error || '未知错误'}）。为防止工作区内容丢失，已中止还原！`)
  }

  try {
    const resetRes = await runGit(['reset', '--hard', targetSha], workspacePath)
    if (!resetRes.ok) {
      throw new Error(resetRes.error || 'git reset --hard 失败')
    }
    return {
      success: true,
      message: `已将分支重置到提交 ${targetSha.slice(0, 7)}`,
      checkpoint: cp,
      backupCheckpointId: backupCheckpoint?.id || null,
      restoreMode: 'git_reset_hard',
      commitsDropped,
      targetCommitSha: targetSha,
    }
  } catch (error) {
    if (headCommit) {
      await runGit(['reset', '--hard', headCommit], workspacePath).catch(() => {})
    }
    throw new Error(
      `重置到 Git 提交失败: ${error.message}。已尝试将分支恢复到操作前的 HEAD。自动保护备份 [${backupCheckpoint.id}] 仍可用于恢复文件。`,
    )
  }
}

/**
 * 还原 Git 检查点
 * - Git 提交快照：git reset --hard 到对应 commit
 * - 自动保护快照：仅恢复工作区文件，不移动分支 HEAD
 */
export async function restoreGitCheckpoint(workspacePath, checkpointId, { force = false, expectedStateFingerprint, conversationId, userDataPath } = {}) {
  const isRepo = await isGitRepository(workspacePath)
  if (!isRepo) throw new Error('当前工作区不是 Git 仓库')

  const file = getCheckpointsFile(workspacePath, userDataPath)
  const existing = await loadCheckpoints(file)
  const cp = existing.find((item) => item.id === checkpointId)
  if (!cp) throw new Error('未找到指定检查点')
  assertCheckpointConversation(cp, conversationId)

  if (cp.kind === CHECKPOINT_KIND.GIT_COMMIT && cp.commitSha) {
    return restoreGitCommitCheckpoint(workspacePath, cp, { force, expectedStateFingerprint, userDataPath })
  }

  const targetCommit = cp.stashCommit || cp.headCommit
  const isTargetEmptyRepo = targetCommit === 'EMPTY_REPO'
  const targetTree = isTargetEmptyRepo ? EMPTY_TREE_SHA : `${targetCommit}^{tree}`

  // 1. 获取当前工作区的完整树对象（包含未跟踪文件）
  const headRes = await runGit(['rev-parse', 'HEAD'], workspacePath)
  const headCommit = headRes.ok ? headRes.stdout.trim() : null

  const { treeSha: currentTreeSha, hasChanges } = await captureWorkspaceTree(workspacePath, headCommit)
  const stateFingerprint = `${headCommit || 'EMPTY'}:${currentTreeSha}`

  // 2. 精确计算还原到目标提交的影响清单
  const impact = await calculateCheckpointImpact(workspacePath, targetTree, currentTreeSha)

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
      stateFingerprint,
      message: `还原将变更工作区：将新增 ${impact.willAdd.length} 个文件，覆盖 ${impact.willOverwrite.length} 个文件，移除 ${impact.willDelete.length} 个文件。是否确认还原？`,
    }
  }

  // 4. 若传入了预期的状态指纹，但工作区在预览后发生变动：拒绝执行旧预览，强制刷新预览再次确认
  if (expectedStateFingerprint && expectedStateFingerprint !== stateFingerprint) {
    return {
      success: false,
      requireConfirm: true,
      stateMismatch: true,
      hasChanges: true,
      changedFilesCount: impact.totalAffected,
      willAdd: impact.willAdd,
      willOverwrite: impact.willOverwrite,
      willDelete: impact.willDelete,
      stat: impact.stat,
      stateFingerprint,
      message: '工作区在预览后发生变动，已拒绝按旧预览还原。请核对最新变动后再次确认。',
    }
  }

  // 5. 若用户已确认（force = true）且当前有改动：先无条件自动安全备份当前状态
  let backupCheckpoint = null
  if (hasChanges || impact.totalAffected > 0) {
    const backupRes = await createGitCheckpoint(workspacePath, {
      summary: `还原至 [${cp.id}] 前自动备份`,
      userDataPath,
    })
    if (backupRes?.ok && backupRes.checkpoint) {
      backupCheckpoint = backupRes.checkpoint
    } else {
      throw new Error(`还原前自动创建安全备份失败（${backupRes?.error || '未知错误'}）。为防止工作区内容丢失，已中止还原！`)
    }
  }

  // 6. 执行还原操作
  try {
    // 6.1 针对 willDelete 中的文件进行安全受控移除（必须用 lstat 区分符号链接，绝不跟随 symlink 误删目标源！）
    for (const relFile of impact.willDelete) {
      try {
        const fullPath = path.resolve(workspacePath, relFile)
        const stat = await fsp.lstat(fullPath)
        if (stat.isSymbolicLink()) {
          await fsp.unlink(fullPath)
        } else if (stat.isDirectory()) {
          await fsp.rm(fullPath, { recursive: true, force: true })
        } else {
          await fsp.unlink(fullPath)
        }
      } catch {
        // 文件可能已经被移动或不存在，忽略
      }
    }

    // 6.2 将目标提交中的所有文件全量检出到工作区，严格校验每一项 Git 命令返回值
    if (isTargetEmptyRepo) {
      const readTreeRes = await runGit(['read-tree', '--empty'], workspacePath)
      if (!readTreeRes.ok) {
        throw new Error(`清空临时索引失败: ${readTreeRes.error || 'read-tree --empty 失败'}`)
      }
    } else {
      const checkoutRes = await runGit(['checkout', targetCommit, '--', '.'], workspacePath)
      if (!checkoutRes.ok) {
        throw new Error(`检出快照文件失败: ${checkoutRes.error || 'checkout 失败'}`)
      }
      if (headCommit) {
        const resetRes = await runGit(['reset', 'HEAD'], workspacePath)
        if (!resetRes.ok) {
          throw new Error(`重置暂存区状态失败: ${resetRes.error || 'reset HEAD 失败'}`)
        }
      }
    }

    return {
      success: true,
      message: `已成功还原至自动保护快照 [${cp.id}]`,
      checkpoint: cp,
      backupCheckpointId: backupCheckpoint?.id || null,
      restoreMode: 'workspace_files',
      willAdd: impact.willAdd,
      willOverwrite: impact.willOverwrite,
      willDelete: impact.willDelete,
    }
  } catch (error) {
    // 恢复失败：优先尝试自动安全回滚至 backupCheckpoint
    let rollbackSuccess = false
    if (backupCheckpoint) {
      const rollbackTarget = backupCheckpoint.stashCommit || backupCheckpoint.headCommit
      if (rollbackTarget && rollbackTarget !== 'EMPTY_REPO') {
        const rollbackRes = await runGit(['checkout', rollbackTarget, '--', '.'], workspacePath)
        if (rollbackRes.ok) {
          if (headCommit) await runGit(['reset', 'HEAD'], workspacePath).catch(() => {})
          rollbackSuccess = true
        }
      }
    }

    const backupSha = backupCheckpoint ? (backupCheckpoint.stashCommit || backupCheckpoint.headCommit) : null
    if (rollbackSuccess) {
      throw new Error(`检查点还原失败（${error.message}），工作区已安全自动回滚至还原前的原状态。前置备份快照已保留：[${backupCheckpoint.id}]`)
    } else {
      const guide = backupSha && backupSha !== 'EMPTY_REPO'
        ? `应急恢复指引：可在终端执行 \`git checkout ${backupSha} -- .\` 恢复工作区。`
        : '请检查 Git 状态或暂存区排查冲突。'
      throw new Error(`检查点还原失败: ${error.message}。${backupCheckpoint ? `已在前置备份中保留当前状态快照 [${backupCheckpoint.id}] (Commit: ${backupSha})。` : ''}${guide}`)
    }
  }
}

