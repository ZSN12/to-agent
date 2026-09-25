import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  isGitRepository,
  createGitCheckpoint,
  listGitCheckpoints,
  getGitCheckpointDiff,
  restoreGitCheckpoint,
} from '../electron/backend/git-service.mjs'

const execFileAsync = promisify(execFile)
async function runGit(args, cwd) {
  return execFileAsync('git', args, { cwd, env: { ...process.env, LC_ALL: 'C' } })
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-git-checkpoint-test-'))
const nonRepoDir = path.join(root, 'non-repo')
const repoDir = path.join(root, 'test-repo')
await fs.mkdir(nonRepoDir, { recursive: true })
await fs.mkdir(repoDir, { recursive: true })

try {
  // 1. 非 Git 仓库测试
  assert.equal(await isGitRepository(nonRepoDir), false)
  const nonRepoRes = await createGitCheckpoint(nonRepoDir)
  assert.equal(nonRepoRes.isRepo, false)

  // 2. 初始化 Git 仓库并提交初始文件
  await runGit(['init'], repoDir)
  await runGit(['config', 'user.name', 'TaskWeaver Test'], repoDir)
  await runGit(['config', 'user.email', 'test@taskweaver.local'], repoDir)

  await fs.writeFile(path.join(repoDir, 'README.md'), '# Initial Project\nVersion 1.0\n')
  await runGit(['add', 'README.md'], repoDir)
  await runGit(['commit', '-m', 'initial commit'], repoDir)

  assert.equal(await isGitRepository(repoDir), true)

  // 3. 在干净状态下创建检查点 CP-1
  const cp1Res = await createGitCheckpoint(repoDir, {
    conversationId: 'conv-123',
    summary: '初始干净状态',
    userDataPath: root,
  })
  assert.equal(cp1Res.isRepo, true)
  assert.ok(cp1Res.checkpoint)
  assert.equal(cp1Res.checkpoint.hasDirtyChanges, false)
  assert.equal(cp1Res.checkpoint.stashCommit, null)
  const cp1Id = cp1Res.checkpoint.id

  // 4. 修改工作区文件并新增文件（未提交状态）
  await fs.writeFile(path.join(repoDir, 'README.md'), '# Initial Project\nVersion 1.1 with draft changes\n')
  await fs.writeFile(path.join(repoDir, 'new-feature.js'), 'export const hello = "world"\n')
  await runGit(['add', 'new-feature.js'], repoDir)

  // 5. 创建包含未提交修改的检查点 CP-2
  const cp2Res = await createGitCheckpoint(repoDir, {
    conversationId: 'conv-123',
    summary: '包含 draft 的快照',
    userDataPath: root,
  })
  assert.equal(cp2Res.isRepo, true)
  assert.ok(cp2Res.checkpoint.hasDirtyChanges)
  assert.ok(cp2Res.checkpoint.stashCommit, '有未提交变动时应生成 stashCommit 快照')
  const cp2Id = cp2Res.checkpoint.id

  // 验证创建快照并没有破坏或清空当前工作区！
  const currentContent = await fs.readFile(path.join(repoDir, 'README.md'), 'utf8')
  assert.ok(currentContent.includes('Version 1.1'))

  // 6. 检查点列表读取与过滤
  const allCps = await listGitCheckpoints(repoDir, { userDataPath: root })
  assert.equal(allCps.length, 2)
  assert.equal(allCps[0].id, cp2Id)

  // 7. 查看与 CP-1 的差异
  const diffRes = await getGitCheckpointDiff(repoDir, cp1Id, { userDataPath: root })
  assert.ok(diffRes.diff.includes('Version 1.1'))
  assert.ok(diffRes.stat.includes('README.md'))

  // 8. 进一步修改工作区（脏状态），尝试还原到 CP-1（初始状态）
  await fs.writeFile(path.join(repoDir, 'README.md'), '# Disaster Edit\nEverything broken!\n')

  // 8.1 缺少 force 时，必须拒绝静默覆盖并请求确认
  const rejectRestore = await restoreGitCheckpoint(repoDir, cp1Id, { force: false, userDataPath: root })
  assert.equal(rejectRestore.success, false)
  assert.equal(rejectRestore.requireConfirm, true)
  assert.ok(rejectRestore.hasChanges)
  assert.match(rejectRestore.message, /是否确认还原/)

  // 8.2 带 force: true 时，成功安全还原至 CP-1
  const forceRestore = await restoreGitCheckpoint(repoDir, cp1Id, { force: true, userDataPath: root })
  assert.equal(forceRestore.success, true)

  // 验证工作区已完全恢复至 CP-1 时的 Version 1.0
  const restoredContent = await fs.readFile(path.join(repoDir, 'README.md'), 'utf8')
  assert.ok(restoredContent.includes('Version 1.0'))
  assert.ok(!restoredContent.includes('Disaster Edit'))

  // 验证未跟踪的新增文件已被 clean
  const featureExists = await fs.access(path.join(repoDir, 'new-feature.js')).then(() => true).catch(() => false)
  assert.equal(featureExists, false, '恢复到早期快照时应清理新创建的未跟踪文件')

  // 9. 还原至包含未提交状态的 CP-2
  const restoreToCp2 = await restoreGitCheckpoint(repoDir, cp2Id, { force: true, userDataPath: root })
  assert.equal(restoreToCp2.success, true)
  const cp2RestoredContent = await fs.readFile(path.join(repoDir, 'README.md'), 'utf8')
  assert.ok(cp2RestoredContent.includes('Version 1.1'))

  // 10. 高风险用例测试：工作区【仅有纯未跟踪新文件】（未执行 git add）
  await fs.writeFile(path.join(repoDir, 'pure-untracked.txt'), 'secret untracked content\n')
  const cp3Res = await createGitCheckpoint(repoDir, {
    conversationId: 'conv-123',
    summary: '仅包含纯未跟踪文件的快照',
    userDataPath: root,
  })
  assert.equal(cp3Res.isRepo, true)
  assert.equal(cp3Res.checkpoint.hasDirtyChanges, true, '仅有未跟踪新文件时必须判定为有变更')
  assert.ok(cp3Res.checkpoint.stashCommit, '仅有未跟踪文件时必须生成完整 commit 对象')
  const cp3Id = cp3Res.checkpoint.id

  // 模拟误删该未跟踪文件
  await fs.rm(path.join(repoDir, 'pure-untracked.txt'))

  // 还原到 CP-3
  const restoreCp3 = await restoreGitCheckpoint(repoDir, cp3Id, { force: true, userDataPath: root })
  assert.equal(restoreCp3.success, true)
  const untrackedRestored = await fs.readFile(path.join(repoDir, 'pure-untracked.txt'), 'utf8')
  assert.equal(untrackedRestored, 'secret untracked content\n', '快照必须能完美找回纯未跟踪文件！')

  // 11. 测试 impact 精准分析 (willAdd, willOverwrite, willDelete)
  await fs.writeFile(path.join(repoDir, 'will-be-deleted.txt'), 'temporary scrap file\n')
  const dryRunRestore = await restoreGitCheckpoint(repoDir, cp1Id, { force: false, userDataPath: root })
  assert.equal(dryRunRestore.success, false)
  assert.equal(dryRunRestore.requireConfirm, true)
  assert.ok(dryRunRestore.willDelete.includes('will-be-deleted.txt'), 'willDelete 必须精准列出多余文件')
  assert.ok(dryRunRestore.willOverwrite.includes('README.md'), 'willOverwrite 必须精准列出修改文件')

  // 12. 测试还原前自动备份 (backupCheckpointId)
  const forceWithBackup = await restoreGitCheckpoint(repoDir, cp1Id, { force: true, userDataPath: root })
  assert.equal(forceWithBackup.success, true)
  assert.ok(forceWithBackup.backupCheckpointId, '强制还原时必须生成前置备份检查点 ID')

  // 验证前置备份快照已写入检查点列表
  const updatedCheckpoints = await listGitCheckpoints(repoDir, { userDataPath: root })
  const backupCp = updatedCheckpoints.find((item) => item.id === forceWithBackup.backupCheckpointId)
  assert.ok(backupCp, '列表中必须包含前置自动备份快照')

  // 验证通过该备份快照可以再度完美找回刚才被删除的文件
  const restoreFromBackup = await restoreGitCheckpoint(repoDir, backupCp.id, { force: true, userDataPath: root })
  assert.equal(restoreFromBackup.success, true)
  const salvagedContent = await fs.readFile(path.join(repoDir, 'will-be-deleted.txt'), 'utf8')
  assert.equal(salvagedContent, 'temporary scrap file\n', '通过前置备份快照可找回被还原移除的数据！')

  console.log('git-checkpoints tests passed successfully!')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
