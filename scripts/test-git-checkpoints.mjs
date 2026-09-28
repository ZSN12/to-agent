import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  isGitRepository,
  createGitCheckpoint,
  previewManualGitCommit,
  createManualGitCommitSnapshot,
  CHECKPOINT_KIND,
  listGitCheckpoints,
  getGitCheckpointDiff,
  restoreGitCheckpoint,
  deleteGitCheckpoint,
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
  assert.equal(cp1Res.checkpoint.kind, CHECKPOINT_KIND.INTERNAL)
  const cp1Id = cp1Res.checkpoint.id

  // 4. 修改工作区文件并新增文件（未提交状态）
  await fs.writeFile(path.join(repoDir, 'README.md'), '# Initial Project\nVersion 1.1 with draft changes\n')
  await fs.writeFile(path.join(repoDir, 'new-feature.js'), 'export const hello = "world"\n')
  await runGit(['add', 'new-feature.js'], repoDir)

  const headBeforeInternalCp = await runGit(['rev-parse', 'HEAD'], repoDir)

  // 5. 创建包含未提交修改的检查点 CP-2
  const cp2Res = await createGitCheckpoint(repoDir, {
    conversationId: 'conv-123',
    summary: '包含 draft 的快照',
    userDataPath: root,
  })
  assert.equal(cp2Res.isRepo, true)
  assert.ok(cp2Res.checkpoint.hasDirtyChanges)
  assert.ok(cp2Res.checkpoint.stashCommit, '有未提交变动时应生成 stashCommit 快照')
  assert.equal(cp2Res.checkpoint.kind, CHECKPOINT_KIND.INTERNAL)
  const headAfterInternalCp = await runGit(['rev-parse', 'HEAD'], repoDir)
  assert.equal(headBeforeInternalCp.stdout.trim(), headAfterInternalCp.stdout.trim(), '内部保护快照不得移动 HEAD')
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

  // 13. 空仓库测试 (Unborn HEAD / 尚未做过任何 commit 的全新仓库)
  const emptyRepoDir = path.join(root, 'empty-repo')
  await fs.mkdir(emptyRepoDir, { recursive: true })
  await runGit(['init'], emptyRepoDir)
  await runGit(['config', 'user.name', 'TaskWeaver Test'], emptyRepoDir)
  await runGit(['config', 'user.email', 'test@taskweaver.local'], emptyRepoDir)

  // 13.1 在全新空仓库中创建快照
  const emptyCp1 = await createGitCheckpoint(emptyRepoDir, { summary: '全新空仓库快照', userDataPath: root })
  assert.equal(emptyCp1.ok, true)
  assert.equal(emptyCp1.checkpoint.hasDirtyChanges, false)
  assert.equal(emptyCp1.checkpoint.headCommit, 'EMPTY_REPO')

  // 13.2 空仓库中新增未跟踪文件后创建快照
  await fs.writeFile(path.join(emptyRepoDir, 'first-file.txt'), 'hello from unborn branch\n')
  const emptyCp2 = await createGitCheckpoint(emptyRepoDir, { summary: '空仓库带未提交文件快照', userDataPath: root })
  assert.equal(emptyCp2.ok, true)
  assert.equal(emptyCp2.checkpoint.hasDirtyChanges, true)
  assert.ok(emptyCp2.checkpoint.stashCommit)

  // 13.3 测试空仓库快照还原
  await fs.rm(path.join(emptyRepoDir, 'first-file.txt'))
  const restoreEmpty = await restoreGitCheckpoint(emptyRepoDir, emptyCp2.checkpoint.id, { force: true, userDataPath: root })
  assert.equal(restoreEmpty.success, true)
  const restoredFirst = await fs.readFile(path.join(emptyRepoDir, 'first-file.txt'), 'utf8')
  assert.equal(restoredFirst, 'hello from unborn branch\n', '空仓库快照必须能完美恢复文件')

  // 14. 符号链接安全测试（验证不会跟随符号链接去递归删除外部目标源）
  const externalTargetDir = path.join(root, 'external-secret-dir')
  await fs.mkdir(externalTargetDir, { recursive: true })
  await fs.writeFile(path.join(externalTargetDir, 'important-external-doc.txt'), 'external data must be preserved\n')

  // 在工作区创建指向外部目录的符号链接
  const symlinkPath = path.join(repoDir, 'symlink-to-external')
  await fs.symlink(externalTargetDir, symlinkPath, 'dir')

  // 创建包含符号链接的快照
  const symlinkCp = await createGitCheckpoint(repoDir, { summary: '包含符号链接的快照', userDataPath: root })
  assert.equal(symlinkCp.ok, true)

  // 还原到不包含该符号链接的早期快照 CP-1（此时 symlinkPath 处于 willDelete 中）
  const restoreDelSymlink = await restoreGitCheckpoint(repoDir, cp1Id, { force: true, userDataPath: root })
  assert.equal(restoreDelSymlink.success, true)

  // 验证：符号链接本身已被安全移除，但外部源文件绝对完好无损！
  const symlinkStillExists = await fs.lstat(symlinkPath).then(() => true).catch(() => false)
  assert.equal(symlinkStillExists, false, '工作区内的符号链接自身必须被删除')
  const externalFileExists = await fs.readFile(path.join(externalTargetDir, 'important-external-doc.txt'), 'utf8')
  assert.equal(externalFileExists, 'external data must be preserved\n', '符号链接指向的外部目录内容绝不能被误删！')

  // 15. 文件权限测试 (Executable permission 0755)
  const execScriptPath = path.join(repoDir, 'run-script.sh')
  await fs.writeFile(execScriptPath, '#!/bin/sh\necho "executable script"\n', { mode: 0o755 })
  await runGit(['add', 'run-script.sh'], repoDir)
  await runGit(['commit', '-m', 'add executable script'], repoDir)

  const permCp = await createGitCheckpoint(repoDir, { summary: '权限快照', userDataPath: root })
  assert.equal(permCp.ok, true)

  // 修改文件权限为非可执行 (0644)
  await fs.chmod(execScriptPath, 0o644)
  const permModifiedStat = await fs.stat(execScriptPath)
  assert.equal((permModifiedStat.mode & 0o111) === 0, true, '权限已被修改为非可执行')

  // 还原回 permCp
  const restorePerm = await restoreGitCheckpoint(repoDir, permCp.checkpoint.id, { force: true, userDataPath: root })
  assert.equal(restorePerm.success, true)
  const restoredPermStat = await fs.stat(execScriptPath)
  assert.equal((restoredPermStat.mode & 0o111) !== 0, true, '还原后可执行权限必须被完整保留！')

  // 16. Git GC 防回收验证 (refs/taskweaver/checkpoints/${id})
  await fs.writeFile(path.join(repoDir, 'gc-test-file.txt'), 'content that must survive git gc\n')
  const gcCp = await createGitCheckpoint(repoDir, { summary: '防 GC 测试快照', userDataPath: root })
  assert.equal(gcCp.ok, true)
  const gcCpId = gcCp.checkpoint.id
  const gcGitRef = gcCp.checkpoint.gitRef
  assert.ok(gcGitRef.startsWith('refs/taskweaver/checkpoints/'))

  // 验证 Git ref 确实存在且指向 stashCommit
  const parseRefRes = await runGit(['rev-parse', gcGitRef], repoDir)
  assert.equal(parseRefRes.stdout.trim(), gcCp.checkpoint.stashCommit)

  // 执行激进的 git gc 清理
  await runGit(['gc', '--prune=now'], repoDir)

  // 验证快照的 commit 在 gc 后依然完整保留（若没有 update-ref，dangling commit 会被直接清除）
  const catCommit = await runGit(['cat-file', '-e', gcCp.checkpoint.stashCommit], repoDir)
  assert.equal(catCommit.ok !== false, true, '被 refs 引用的快照 commit 绝不能被 git gc 清除！')

  // 改变工作区并成功还原到 gcCp
  await fs.rm(path.join(repoDir, 'gc-test-file.txt'))
  const restoreGcCp = await restoreGitCheckpoint(repoDir, gcCpId, { force: true, userDataPath: root })
  assert.equal(restoreGcCp.success, true)
  const survivedContent = await fs.readFile(path.join(repoDir, 'gc-test-file.txt'), 'utf8')
  assert.equal(survivedContent, 'content that must survive git gc\n', '经历 git gc 后快照仍能完美还原')

  // 17. 删除快照与 Git ref 同步清理测试
  const deleteRes = await deleteGitCheckpoint(repoDir, gcCpId, { userDataPath: root })
  assert.equal(deleteRes.ok, true)
  assert.equal(deleteRes.deletedId, gcCpId)

  // 验证 metadata 列表中已被移除
  const afterDeleteList = await listGitCheckpoints(repoDir, { userDataPath: root })
  assert.equal(afterDeleteList.some((c) => c.id === gcCpId), false, '快照列表中必须已不存在该条目')

  // 验证 Git 引用已被安全删除
  const checkRefDeleted = await runGit(['rev-parse', '--verify', gcGitRef], repoDir).catch((e) => ({ ok: false }))
  assert.equal(checkRefDeleted.ok === false || !checkRefDeleted.stdout, true, '删除快照后其 Git 引用必须被彻底清理')

  // 18. 还原状态指纹校验 (State Fingerprint Verification)
  // 18.1 获取还原影响预览及当时的指纹
  const preview = await restoreGitCheckpoint(repoDir, cp1Id, { force: false, userDataPath: root })
  assert.equal(preview.requireConfirm, true)
  assert.ok(preview.stateFingerprint, '预览必须返回当时的工作区状态指纹')

  // 18.2 模拟用户在弹窗确认前，工作区内容被外部修改
  await fs.writeFile(path.join(repoDir, 'concurrent-edit.txt'), 'concurrent edit during preview\n')

  // 18.3 携带旧指纹确认还原，后端必须拒绝并提示重新预览
  const mismatchRestore = await restoreGitCheckpoint(repoDir, cp1Id, {
    force: true,
    expectedStateFingerprint: preview.stateFingerprint,
    userDataPath: root,
  })
  assert.equal(mismatchRestore.success, false)
  assert.equal(mismatchRestore.stateMismatch, true, '工作区变动后必须判定为 stateMismatch')
  assert.match(mismatchRestore.message, /工作区在预览后发生变动/)
  // 验证并发修改的文件没有被旧预览盲目抹除
  const concurrentExists = await fs.readFile(path.join(repoDir, 'concurrent-edit.txt'), 'utf8')
  assert.equal(concurrentExists, 'concurrent edit during preview\n')

  // 18.4 使用最新指纹确认还原，能够顺利安全还原
  const validRestore = await restoreGitCheckpoint(repoDir, cp1Id, {
    force: true,
    expectedStateFingerprint: mismatchRestore.stateFingerprint,
    userDataPath: root,
  })
  assert.equal(validRestore.success, true)

  // 19. 超过保留上限 (50) 时的自动淘汰与 Git ref 同步清理
  const bulkCpIds = []
  for (let i = 0; i < 53; i++) {
    await fs.writeFile(path.join(repoDir, 'bulk.txt'), `bulk iteration ${i}\n`)
    const res = await createGitCheckpoint(repoDir, { summary: `批量快照 ${i}`, userDataPath: root })
    assert.equal(res.ok, true)
    bulkCpIds.push(res.checkpoint.id)
  }

  const boundedList = await listGitCheckpoints(repoDir, { userDataPath: root })
  assert.equal(boundedList.length, 50, '快照列表必须被截断至最多 50 个')

  // 被淘汰的前 3 个快照应该不在列表中
  const oldestEvictedId = bulkCpIds[0]
  assert.equal(boundedList.some((c) => c.id === oldestEvictedId), false)

  // 验证被淘汰快照的 Git ref 已经被底层自动删除
  const evictedRefCheck = await runGit(['rev-parse', '--verify', `refs/taskweaver/checkpoints/${oldestEvictedId}`], repoDir).catch(() => ({ ok: false }))
  assert.equal(evictedRefCheck.ok === false || !evictedRefCheck.stdout, true, '被淘汰快照的底层 Git ref 必须已被清理')

  // 20. 快照语义边界测试：staged, unstaged, untracked 与 ignored 隔离验证
  await fs.writeFile(path.join(repoDir, '.gitignore'), '*.ignored\n')
  await runGit(['add', '.gitignore'], repoDir)
  await runGit(['commit', '-m', 'add gitignore'], repoDir)

  // 准备各类文件：已暂存、未暂存、未跟踪、被忽略
  await fs.writeFile(path.join(repoDir, 'staged.txt'), 'staged content\n')
  await runGit(['add', 'staged.txt'], repoDir)

  await fs.writeFile(path.join(repoDir, 'README.md'), '# Modified Unstaged\n')
  await fs.writeFile(path.join(repoDir, 'untracked.txt'), 'untracked content\n')
  await fs.writeFile(path.join(repoDir, 'temp.ignored'), 'ignored cache file\n')

  const boundaryCp = await createGitCheckpoint(repoDir, { summary: '语义边界测试快照', userDataPath: root })
  assert.equal(boundaryCp.ok, true)

  // 验证 ignored 文件没有被纳入快照提交树
  const diffTree = await runGit(['diff-tree', '-r', '--name-only', 'HEAD', boundaryCp.checkpoint.stashCommit], repoDir)
  assert.equal(diffTree.stdout.includes('temp.ignored'), false, '.gitignore 忽略的文件绝不能进入快照')

  // 删除工作区代码文件并还原
  await fs.rm(path.join(repoDir, 'staged.txt'))
  await fs.rm(path.join(repoDir, 'untracked.txt'))
  await fs.writeFile(path.join(repoDir, 'README.md'), '# Broken\n')

  const restoreBoundary = await restoreGitCheckpoint(repoDir, boundaryCp.checkpoint.id, { force: true, userDataPath: root })
  assert.equal(restoreBoundary.success, true)

  // 验证受跟踪与未跟踪文件均被完整找回
  assert.equal(await fs.readFile(path.join(repoDir, 'staged.txt'), 'utf8'), 'staged content\n')
  assert.equal(await fs.readFile(path.join(repoDir, 'untracked.txt'), 'utf8'), 'untracked content\n')
  assert.equal(await fs.readFile(path.join(repoDir, 'README.md'), 'utf8'), '# Modified Unstaged\n')
  // 验证 ignored 文件始终保持原样
  assert.equal(await fs.readFile(path.join(repoDir, 'temp.ignored'), 'utf8'), 'ignored cache file\n')

  // 21. 删除不存在快照测试：必须给出明确错误，不能静默成功
  const nonExistDelete = await deleteGitCheckpoint(repoDir, 'cp-non-existent-999', { userDataPath: root })
  assert.equal(nonExistDelete.ok, false)
  assert.match(nonExistDelete.error, /未找到指定的快照/)

  // 22. 手动 Git 提交快照：真实 commit、与内部检查点分离
  const manualRepo = path.join(root, 'manual-commit-repo')
  await fs.mkdir(manualRepo, { recursive: true })
  await runGit(['init', '-b', 'main'], manualRepo)
  await runGit(['config', 'user.name', 'TaskWeaver Test'], manualRepo)
  await runGit(['config', 'user.email', 'test@taskweaver.local'], manualRepo)
  await fs.writeFile(path.join(manualRepo, 'README.md'), 'v1\n')
  await fs.writeFile(path.join(manualRepo, '.gitignore'), '*.ignored\n')
  await runGit(['add', 'README.md', '.gitignore'], manualRepo)
  await runGit(['commit', '-m', 'init'], manualRepo)
  await fs.writeFile(path.join(manualRepo, 'to-delete.txt'), 'gone\n')
  await runGit(['add', 'to-delete.txt'], manualRepo)
  await runGit(['commit', '-m', 'add to-delete'], manualRepo)
  await fs.writeFile(path.join(manualRepo, 'staged-only.txt'), 'staged\n')
  await runGit(['add', 'staged-only.txt'], manualRepo)
  await fs.writeFile(path.join(manualRepo, 'README.md'), 'v2 unstaged\n')
  await fs.writeFile(path.join(manualRepo, 'new-untracked.txt'), 'new\n')
  await fs.writeFile(path.join(manualRepo, 'secret.ignored'), 'ignored\n')
  await fs.rm(path.join(manualRepo, 'to-delete.txt'))

  const previewManual = await previewManualGitCommit(manualRepo)
  assert.equal(previewManual.ok, true)
  assert.equal(previewManual.hasCommittableChanges, true)

  const manualRes = await createManualGitCommitSnapshot(manualRepo, {
    message: 'chore(taskweaver): create workspace snapshot',
    expectedPreviewFingerprint: previewManual.stateFingerprint,
    userDataPath: root,
  })
  assert.equal(manualRes.ok, true)
  assert.ok(manualRes.commitSha)
  assert.equal(manualRes.checkpoint.kind, CHECKPOINT_KIND.GIT_COMMIT)

  const logRes = await runGit(['log', '-1', '--format=%H'], manualRepo)
  assert.equal(logRes.stdout.trim(), manualRes.commitSha)
  const logMsg = await runGit(['log', '-1', '--format=%s'], manualRepo)
  assert.equal(logMsg.stdout.trim(), 'chore(taskweaver): create workspace snapshot')

  const showNames = await runGit(['show', '--name-only', '--format=', manualRes.commitSha], manualRepo)
  assert.ok(showNames.stdout.includes('staged-only.txt'))
  assert.ok(showNames.stdout.includes('new-untracked.txt'))
  assert.ok(showNames.stdout.includes('README.md'))
  assert.equal(showNames.stdout.includes('secret.ignored'), false, '忽略文件不得进入手动提交')

  const porcelainManual = await runGit(['status', '--porcelain'], manualRepo)
  assert.equal(porcelainManual.stdout.trim(), '', '提交后工作区应干净')

  const fakeRef = await runGit(['rev-parse', '--verify', `refs/taskweaver/checkpoints/${manualRes.checkpoint.id}`], manualRepo).catch(() => ({ stdout: '' }))
  assert.equal(Boolean(fakeRef.stdout?.trim()), false, '手动提交不得创建 taskweaver checkpoints ref')

  const cleanManual = await createManualGitCommitSnapshot(manualRepo, { userDataPath: root })
  assert.equal(cleanManual.ok, true)
  assert.equal(cleanManual.clean, true)
  assert.ok(cleanManual.message.includes('干净'))

  const detachedSha = manualRes.commitSha
  await runGit(['checkout', detachedSha], manualRepo)
  const detachedBlock = await previewManualGitCommit(manualRepo)
  assert.equal(detachedBlock.ok, false)
  assert.match(detachedBlock.error, /detached/i)

  await runGit(['checkout', 'main'], manualRepo)
  await fs.writeFile(path.join(manualRepo, 'README.md'), 'v3 committed\n')
  await runGit(['add', 'README.md'], manualRepo)
  await runGit(['commit', '-m', 'advance head'], manualRepo)
  await fs.writeFile(path.join(manualRepo, 'README.md'), 'dirty working tree\n')
  const previewManualRestore = await restoreGitCheckpoint(manualRepo, manualRes.checkpoint.id, { force: false, userDataPath: root })
  assert.equal(previewManualRestore.requireConfirm, true)
  assert.equal(previewManualRestore.restoreMode, 'git_reset_hard')
  assert.ok((previewManualRestore.commitsDropped ?? 0) >= 1)

  const restoreManualCp = await restoreGitCheckpoint(manualRepo, manualRes.checkpoint.id, {
    force: true,
    expectedStateFingerprint: previewManualRestore.stateFingerprint,
    userDataPath: root,
  })
  assert.equal(restoreManualCp.success, true)
  const headAfterManualRestore = await runGit(['rev-parse', 'HEAD'], manualRepo)
  assert.equal(headAfterManualRestore.stdout.trim(), manualRes.commitSha, '还原 Git 提交快照应将 HEAD 重置到目标 commit')
  const statusAfterManualRestore = await runGit(['status', '--porcelain'], manualRepo)
  assert.equal(statusAfterManualRestore.stdout.trim(), '', '重置后工作区应与该提交一致')
  const readmeAfterReset = await fs.readFile(path.join(manualRepo, 'README.md'), 'utf8')
  assert.ok(readmeAfterReset.includes('v2 unstaged'), '文件内容应对齐目标提交')

  const emptyManualRepo = path.join(root, 'empty-manual-repo')
  await fs.mkdir(emptyManualRepo, { recursive: true })
  await runGit(['init', '-b', 'main'], emptyManualRepo)
  await runGit(['config', 'user.name', 'TaskWeaver Test'], emptyManualRepo)
  await runGit(['config', 'user.email', 'test@taskweaver.local'], emptyManualRepo)
  await fs.writeFile(path.join(emptyManualRepo, 'first.txt'), 'hello\n')
  const emptyManualPreview = await previewManualGitCommit(emptyManualRepo)
  assert.equal(emptyManualPreview.ok, true)
  const emptyManualCommit = await createManualGitCommitSnapshot(emptyManualRepo, {
    expectedPreviewFingerprint: emptyManualPreview.stateFingerprint,
    userDataPath: root,
  })
  assert.equal(emptyManualCommit.ok, true)
  assert.ok(emptyManualCommit.commitSha)

  const noIdRepo = path.join(root, 'no-identity-repo')
  await fs.mkdir(noIdRepo, { recursive: true })
  await runGit(['init', '-b', 'main'], noIdRepo)
  await fs.writeFile(path.join(noIdRepo, 'orphan.txt'), 'x\n')
  const emptyGitConfig = path.join(root, 'empty.gitconfig')
  await fs.writeFile(emptyGitConfig, '')
  const isolatedGitEnv = { GIT_CONFIG_GLOBAL: emptyGitConfig, GIT_CONFIG_SYSTEM: emptyGitConfig }
  const noIdPreview = await previewManualGitCommit(noIdRepo)
  const isolatedHome = path.join(root, 'git-isolated-home')
  await fs.mkdir(isolatedHome, { recursive: true })
  const noIdCommit = await createManualGitCommitSnapshot(noIdRepo, {
    expectedPreviewFingerprint: noIdPreview.stateFingerprint,
    userDataPath: root,
    gitEnv: { ...isolatedGitEnv, HOME: isolatedHome },
    commitGitConfig: ['-c', 'user.useConfigOnly=true'],
  })
  assert.equal(noIdCommit.ok, false)
  assert.match(noIdCommit.error, /Author identity|user\.name|empty ident|身份|tell git who you are/i)

  const hookRepo = path.join(root, 'hook-fail-repo')
  await fs.mkdir(hookRepo, { recursive: true })
  await runGit(['init', '-b', 'main'], hookRepo)
  await runGit(['config', 'user.name', 'TaskWeaver Test'], hookRepo)
  await runGit(['config', 'user.email', 'test@taskweaver.local'], hookRepo)
  await fs.writeFile(path.join(hookRepo, 'base.txt'), 'base\n')
  await runGit(['add', 'base.txt'], hookRepo)
  await runGit(['commit', '-m', 'base'], hookRepo)
  await fs.mkdir(path.join(hookRepo, '.git/hooks'), { recursive: true })
  await fs.writeFile(path.join(hookRepo, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  await fs.writeFile(path.join(hookRepo, 'change.txt'), 'fail\n')
  const hookPreview = await previewManualGitCommit(hookRepo)
  const hookFail = await createManualGitCommitSnapshot(hookRepo, {
    expectedPreviewFingerprint: hookPreview.stateFingerprint,
    userDataPath: root,
  })
  assert.equal(hookFail.ok, false)
  const hookStatus = await runGit(['status', '--porcelain'], hookRepo)
  assert.ok(hookStatus.stdout.includes('change.txt'), '提交失败后工作区改动应保留')

  console.log('git-checkpoints (含手动 Git 提交、状态指纹防篡改、淘汰清理、语义边界与错误处理) 全部测试通过！')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
