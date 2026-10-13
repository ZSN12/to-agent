import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { collectPlannerPathHints, completeReadOnlyPlanScopes, validateReadOnlyPlanScopesFromIndex } from '../backend/orchestration/planner.mjs'
import { loadWorkspacePlannerHints, normalizePlannerHints } from '../backend/orchestration/planner-hints.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-planner-hints-'))
try {
  await Promise.all([
    fs.mkdir(path.join(root, 'src'), { recursive: true }),
    fs.mkdir(path.join(root, 'taskweaver-z-runtime'), { recursive: true }),
  ])
  await fs.writeFile(path.join(root, 'src', 'protocol.mjs'), 'export const protocol = true\n')
  await fs.mkdir(path.join(root, 'src', 'features', 'app', 'hooks'), { recursive: true })
  await fs.writeFile(path.join(root, 'src', 'features', 'app', 'hooks', 'send.ts'), 'export const send = true\n')
  await fs.writeFile(path.join(root, 'taskweaver-z-runtime', 'secret.mjs'), 'export const generated = true\n')

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

  assert.throws(() => normalizePlannerHints({ version: 1, ignoreDirectories: ['../outside'] }), /不能是绝对路径、通配符或包含 \.\./)
  assert.throws(() => normalizePlannerHints({ version: 1, pathWeights: [{ path: 'src/a.mjs', weight: 101 }] }), /权重必须在 0–100 之间/)
} finally {
  await fs.rm(root, { recursive: true, force: true })
}

console.log('Workspace planner hint checks passed')
