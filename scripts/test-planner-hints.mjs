import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { collectPlannerPathHints, completeReadOnlyPlanScopes, validateReadOnlyPlanScopesFromIndex } from '../backend/orchestration/planner.mjs'
import { loadWorkspacePlannerHints, normalizePlannerHints } from '../backend/orchestration/planner-hints.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-planner-hints-'))
const temporaryRoots = [root]
try {
  await Promise.all([
    fs.mkdir(path.join(root, 'src'), { recursive: true }),
    fs.mkdir(path.join(root, 'taskweaver-z-runtime'), { recursive: true }),
    fs.mkdir(path.join(root, 'vendor'), { recursive: true }),
  ])
  await fs.writeFile(path.join(root, 'src', 'protocol.mjs'), 'export const protocol = true\n')
  await fs.mkdir(path.join(root, 'src', 'features', 'app', 'hooks'), { recursive: true })
  await fs.writeFile(path.join(root, 'src', 'features', 'app', 'hooks', 'send.ts'), 'export const send = true\n')
  await fs.writeFile(path.join(root, 'taskweaver-z-runtime', 'secret.mjs'), 'export const generated = true\n')
  await fs.writeFile(path.join(root, 'vendor', 'third-party.mjs'), 'export const vendored = true\n')

  const absent = await loadWorkspacePlannerHints(root)
  assert.deepEqual(absent, {
    version: 1,
    ignoreDirectories: [],
    scopeRules: [],
    rankingRules: [],
    pathWeights: [],
  }, 'a workspace without planner-hints.json uses no repository-specific hints')
  const genericIndex = await collectPlannerPathHints(root, 'request chain', { maxVisited: 500, limit: 30, disableWorkspaceHints: true })
  assert.ok(genericIndex.paths.includes('taskweaver-z-runtime/secret.mjs'), 'disabled hints do not hide workspace paths')
  assert.ok(genericIndex.paths.includes('src/features/app/hooks/send.ts'), 'the bounded index reaches current nested application hooks')
  assert.ok(!genericIndex.paths.some((item) => item === 'vendor' || item.startsWith('vendor/')),
    'the ignored lowercase vendor directory is not exposed as a path candidate')

  await fs.mkdir(path.join(root, '.taskweaver'), { recursive: true })
  await fs.writeFile(path.join(root, '.taskweaver', 'planner-hints.json'), JSON.stringify({
    version: 1,
    ignoreDirectories: ['taskweaver-z-runtime'],
    scopeRules: [{
      requestTermsAny: ['request chain'],
      taskTermsAny: ['inspect'],
      taskTermsNone: ['stop here'],
      requiredPaths: ['src/protocol.mjs', 'desktop/preload.cjs'],
    }],
    rankingRules: [{
      queryTermsAny: ['request chain'],
      prependPaths: ['desktop/preload.cjs', 'src/protocol.mjs'],
      boostPaths: [
        { path: 'desktop/preload.cjs', weight: 100 },
        { path: 'src/protocol.mjs', weight: 15 },
      ],
      preferredDirectories: ['src'],
    }],
    pathWeights: [],
  }))

  const workspaceHints = await loadWorkspacePlannerHints(root)
  const indexed = await collectPlannerPathHints(root, 'request chain', { maxVisited: 500, limit: 30, workspaceHints })
  assert.equal(indexed.paths[0], 'src/protocol.mjs', 'workspace ranking rules can prioritize a repository-owned entry path')
  assert.ok(!indexed.paths.includes('desktop/preload.cjs'), 'missing configured paths must not be added to the current workspace index')
  assert.ok(!indexed.paths.includes('taskweaver-z-runtime/secret.mjs'), 'workspace ignore rules can omit generated product directories')

  const request = 'Inspect the request chain'
  const widened = completeReadOnlyPlanScopes([
    { id: 'T1', taskType: 'research', title: 'Inspect request chain', description: 'Inspect this task.', scopePaths: ['src'] },
  ], request, ['src', 'src/protocol.mjs'], workspaceHints)
  assert.deepEqual(widened[0].scopePaths, ['src', 'src/protocol.mjs'])
  assert.deepEqual(validateReadOnlyPlanScopesFromIndex(widened, indexed.paths), widened,
    'both indexed files and directories are valid literal read scopes')
  assert.throws(() => validateReadOnlyPlanScopesFromIndex([
    { id: 'T1', taskType: 'research', scopePaths: ['desktop/preload.cjs'] },
  ], indexed.paths), /不在当前工作区路径索引中的路径/,
  'a stale path must be rejected before a read-only task can execute')

  const bounded = completeReadOnlyPlanScopes([
    { id: 'T1', taskType: 'research', title: 'Inspect request chain', description: '范围仅限 src。Stop here.', scopePaths: ['src'] },
  ], request, ['src', 'src/protocol.mjs'], workspaceHints)
  assert.deepEqual(bounded[0].scopePaths, ['src'], 'explicit scope boundaries override workspace completion hints')

  const evaluationIndex = await collectPlannerPathHints(root, 'request chain', { maxVisited: 500, limit: 30, disableWorkspaceHints: true })
  assert.equal(evaluationIndex.workspaceHints.scopeRules.length, 0, 'evaluation mode can disable repository-specific planning rules')
  assert.ok(evaluationIndex.paths.includes('taskweaver-z-runtime/secret.mjs'), 'evaluation mode indexes the sample repository without product exclusions')
  const evaluationScopes = completeReadOnlyPlanScopes([
    { id: 'T1', taskType: 'research', title: 'Inspect request chain', description: 'Inspect this task.', scopePaths: ['src'] },
  ], request, ['src', 'src/protocol.mjs'], evaluationIndex.workspaceHints)
  assert.deepEqual(evaluationScopes[0].scopePaths, ['src'], 'disabled evaluation hints do not add repository-specific paths')

  const makeWorkspace = async (prefix) => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
    temporaryRoots.push(workspace)
    return workspace
  }
  const writeFiles = async (workspace, count) => Promise.all(Array.from({ length: count }, (_, index) =>
    fs.writeFile(path.join(workspace, `file-${String(index).padStart(3, '0')}.mjs`), 'export const item = true\n')))

  const exactBudgetRoot = await makeWorkspace('taskweaver-planner-exact-budget-')
  await writeFiles(exactBudgetRoot, 100)
  const exactBudget = await collectPlannerPathHints(exactBudgetRoot, 'file', {
    maxVisited: 100,
    limit: 160,
    disableWorkspaceHints: true,
  })
  assert.equal(exactBudget.visitedEntries, 100, 'visitedEntries counts entries actually examined, without a budget-check increment')
  assert.equal(exactBudget.truncated, false, 'exactly exhausting the scan budget at the final entry is complete')
  assert.deepEqual(exactBudget.truncationReasons, [], 'exact budget exhaustion has no truncation reason')
  assert.equal(exactBudget.paths.length, 100, 'all candidates fit when the scan budget is exactly exhausted')

  const exceededBudgetRoot = await makeWorkspace('taskweaver-planner-exceeded-budget-')
  await writeFiles(exceededBudgetRoot, 101)
  const exceededBudget = await collectPlannerPathHints(exceededBudgetRoot, 'file', {
    maxVisited: 100,
    limit: 160,
    disableWorkspaceHints: true,
  })
  assert.equal(exceededBudget.visitedEntries, 100, 'the scan budget never reports the unprocessed next entry as visited')
  assert.equal(exceededBudget.truncated, true, 'remaining entries after the scan budget make the index incomplete')
  assert.deepEqual(exceededBudget.truncationReasons, ['scan-budget'])
  assert.match(exceededBudget.truncationMessage, /目录项扫描预算.*仍有目录项或待扫描目录未检查/)

  const queuedDirectoryRoot = await makeWorkspace('taskweaver-planner-queued-directory-')
  await writeFiles(queuedDirectoryRoot, 99)
  await fs.mkdir(path.join(queuedDirectoryRoot, 'z-queued'))
  await fs.writeFile(path.join(queuedDirectoryRoot, 'z-queued', 'deferred.mjs'), 'export const deferred = true\n')
  const queuedDirectory = await collectPlannerPathHints(queuedDirectoryRoot, 'file', {
    maxVisited: 100,
    limit: 160,
    disableWorkspaceHints: true,
  })
  assert.equal(queuedDirectory.visitedEntries, 100)
  assert.deepEqual(queuedDirectory.truncationReasons, ['scan-budget'], 'a queued directory is incomplete even when the current directory ended exactly at the cap')

  const depthLimitedRoot = await makeWorkspace('taskweaver-planner-depth-limit-')
  const deeperDirectory = path.join(depthLimitedRoot, 'd1', 'd2', 'd3', 'd4', 'd5')
  await fs.mkdir(deeperDirectory, { recursive: true })
  await fs.writeFile(path.join(deeperDirectory, 'deep.mjs'), 'export const deep = true\n')
  const depthLimited = await collectPlannerPathHints(depthLimitedRoot, 'deep', {
    maxVisited: 500,
    limit: 160,
    disableWorkspaceHints: true,
  })
  assert.equal(depthLimited.visitedEntries, 5)
  assert.deepEqual(depthLimited.truncationReasons, ['depth-limit'], 'a directory below the configured traversal depth is reported as incomplete')
  assert.match(depthLimited.truncationMessage, /4 层目录深度限制.*更深目录未扫描/)

  const displayLimitRoot = await makeWorkspace('taskweaver-planner-display-limit-')
  await writeFiles(displayLimitRoot, 11)
  const displayLimited = await collectPlannerPathHints(displayLimitRoot, 'file', {
    maxVisited: 500,
    limit: 10,
    disableWorkspaceHints: true,
  })
  assert.equal(displayLimited.visitedEntries, 11)
  assert.deepEqual(displayLimited.truncationReasons, ['display-limit'], 'only real candidates omitted from the unique displayed list trigger display truncation')
  assert.match(displayLimited.truncationMessage, /10 条展示上限.*仍有 1 个候选未展示/)

  const prependedDuplicatesRoot = await makeWorkspace('taskweaver-planner-prepended-duplicates-')
  await writeFiles(prependedDuplicatesRoot, 10)
  const duplicateHints = normalizePlannerHints({
    rankingRules: [{
      queryTermsAny: ['file'],
      prependPaths: ['file-000.mjs', 'file-001.mjs', 'file-002.mjs'],
    }],
  })
  const prependedDuplicates = await collectPlannerPathHints(prependedDuplicatesRoot, 'file', {
    maxVisited: 500,
    limit: 10,
    workspaceHints: duplicateHints,
  })
  assert.equal(prependedDuplicates.paths.length, 10)
  assert.equal(new Set(prependedDuplicates.paths).size, 10, 'configured prepend paths are deduplicated against ranked paths')
  assert.equal(prependedDuplicates.truncated, false, 'duplicate configured paths do not create a false display-truncation signal')
  assert.deepEqual(prependedDuplicates.truncationReasons, [])

  assert.throws(() => normalizePlannerHints({ version: 1, ignoreDirectories: ['../outside'] }), /不能是绝对路径、通配符或包含 \.\./)
  assert.throws(() => normalizePlannerHints({ version: 1, pathWeights: [{ path: 'src/a.mjs', weight: 101 }] }), /权重必须在 0–100 之间/)
} finally {
  await Promise.all(temporaryRoots.map((temporaryRoot) => fs.rm(temporaryRoot, { recursive: true, force: true })))
}

console.log('Workspace planner hint checks passed')
