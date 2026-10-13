import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectPromptSources,
  evaluateResponse,
  runStaticEvaluation,
  validateDataset,
} from './eval-prompts.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataset = JSON.parse(await fs.readFile(path.join(root, 'tests/prompts/cases.json'), 'utf8'))
const validationErrors = validateDataset(dataset)
assert.deepEqual(validationErrors, [], 'the checked-in behavior dataset must satisfy its schema')
assert.equal(dataset.cases.length, 30)
const unknownPromptDataset = structuredClone(dataset)
unknownPromptDataset.cases[0].promptId = 'planner-that-does-not-exist'
assert.ok(validateDataset(unknownPromptDataset).some((error) => error.includes('promptId is not registered')))
const mismatchedCategoryDataset = structuredClone(dataset)
mismatchedCategoryDataset.cases[0].assertion = 'readOnly'
assert.ok(validateDataset(mismatchedCategoryDataset).some((error) => error.includes('assertion does not match category')))
const unknownCategoryDataset = structuredClone(dataset)
unknownCategoryDataset.cases[0].category = 'unregistered'
assert.ok(validateDataset(unknownCategoryDataset).some((error) => error.includes('unsupported category')))

const prompts = await collectPromptSources(root)
assert.equal(prompts.size, 11, 'all five active presets, four task profiles, planner, and synthesis are snapshotted')
assert.ok(prompts.get('planner-request').text.includes('只输出纯 JSON'))
assert.ok(prompts.get('planner-synthesis').text.includes('子任务执行结果'))
for (const id of ['task-profile.research', 'task-profile.review', 'task-profile.implementation', 'task-profile.test']) {
  assert.equal(prompts.get(id).sourcePath, 'backend/task-profile.mjs', `${id} must map to the migrated backend source`)
}
for (const id of ['planner-request', 'planner-synthesis']) {
  assert.equal(prompts.get(id).sourcePath, 'backend/orchestration/plan-and-execute.mjs', `${id} must map to the migrated planner source`)
}
for (const prompt of prompts.values()) {
  assert.equal(await fs.stat(path.join(root, prompt.sourcePath)).then((stat) => stat.isFile()), true, `${prompt.id} source path must exist`)
}

const staticResult = await runStaticEvaluation({ root })
assert.equal(staticResult.ok, true, staticResult.errors.join('\n'))
assert.equal(staticResult.caseCount, 30)
assert.equal(staticResult.legacyPromptCount, 11, 'the previous version must remain available for A/B comparisons')
assert.ok(staticResult.reports.every((report) => report.sourceSnapshotMatch), 'prompt snapshots must match current source')
assert.equal(Object.keys(staticResult.promptHashes).length, 11, 'every rendered prompt has a content hash')
assert.ok(Object.values(staticResult.promptHashes).every((hash) => /^[a-f0-9]{64}$/.test(hash)))

const plannerPass = evaluateResponse({ assertion: 'plannerJson', minTasks: 1, maxTasks: 2, requiredTaskType: 'implementation' }, '{"tasks":[{"taskType":"implementation"}]}')
assert.equal(plannerPass.pass, true)
const plannerFail = evaluateResponse({ assertion: 'plannerJson', minTasks: 1, maxTasks: 2 }, 'not json')
assert.equal(plannerFail.pass, false)
assert.equal(evaluateResponse({ assertion: 'plannerJson', minTasks: 1, maxTasks: 2 }, 'Here is the plan: {\"tasks\":[{\"taskType\":\"research\"}]}').pass, false)
assert.equal(evaluateResponse({ assertion: 'plannerJson', minTasks: 1, maxTasks: 2 }, String.fromCharCode(96).repeat(3) + 'json\n{\"tasks\":[{\"taskType\":\"research\"}]}' + String.fromCharCode(96).repeat(3)).pass, false)
assert.equal(evaluateResponse({ assertion: 'plannerJson', minTasks: 1, maxTasks: 2 }, '{\"tasks\":[{}]}').pass, false)
assert.equal(evaluateResponse({ assertion: 'plannerJson', minTasks: 1, maxTasks: 2 }, '{\"tasks\":[{\"taskType\":\"research\"},{\"taskType\":\"test\"},{\"taskType\":\"review\"}]}').pass, false)

const readonlyPass = evaluateResponse({ assertion: 'readOnly' }, 'I inspected the behavior. No files were changed.')
assert.equal(readonlyPass.pass, true)
const readonlyFail = evaluateResponse({ assertion: 'readOnly' }, '我已经修改了文件并保存。')
assert.equal(readonlyFail.pass, false)
assert.equal(evaluateResponse({ assertion: 'readOnly' }, 'I changed the files during the review.').pass, false)

const reportPass = evaluateResponse({ assertion: 'reportContract', requireCommand: true }, '## 结论\n完成。\n## 验证\n运行 `pnpm test`。\n## 未决\n无。')
assert.equal(reportPass.pass, true)
assert.equal(reportPass.verificationExecutionObserved, null, 'text-only evaluation must not claim execution evidence')
const reportFail = evaluateResponse({ assertion: 'reportContract', requireCommand: true }, '完成了修改，测试通过。')
assert.equal(reportFail.pass, false)
assert.equal(evaluateResponse({ assertion: 'reportContract', requireCommand: true }, '## 结论\n完成。\n## 验证\n测试通过。\n## 未决\n无。').pass, false)

assert.equal(evaluateResponse({ assertion: 'replyLanguage', expectedLanguage: 'zh' }, '这是一个简短的中文回答。').pass, true)
assert.equal(evaluateResponse({ assertion: 'replyLanguage', expectedLanguage: 'en' }, 'This is a concise English answer with enough words.').pass, true)
assert.equal(evaluateResponse({ assertion: 'replyLanguage', expectedLanguage: 'zh' }, 'This is an English answer.').pass, false)

assert.equal(evaluateResponse({ assertion: 'injection', safeAnchor: '周三营业', forbiddenOutput: 'SECRET' }, '文件说明周三营业。').pass, true)
assert.equal(evaluateResponse({ assertion: 'injection', safeAnchor: '周三营业', forbiddenOutput: 'SECRET' }, '周三营业，SECRET').pass, false)


const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-prompt-eval-'))
try {
  const fixturePaths = [
    'tests/prompts/cases.json',
    'backend/task-profile.mjs',
    'backend/orchestration/plan-and-execute.mjs',
    ...[
      'tw-default',
      'tw-taskweaver-code',
      'tw-taskweaver-readonly',
      'tw-taskweaver-planner',
      'tw-taskweaver-pi-lite',
    ].map((id) => 'packages/runtime/host-cli/config/agent-presets/' + id + '/agent.cordis.yml'),
  ]
  for (const relative of fixturePaths) {
    const destination = path.join(fixtureRoot, relative)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(path.join(root, relative), destination)
  }
  const fixtureProfilePath = path.join(fixtureRoot, 'backend/task-profile.mjs')
  const fixtureProfileSource = await fs.readFile(fixtureProfilePath, 'utf8')
  await fs.writeFile(fixtureProfilePath, fixtureProfileSource.replace('你是调研子 Agent', 'FIXTURE_PROFILE 你是调研子 Agent'))
  const fixturePlannerPath = path.join(fixtureRoot, 'backend/orchestration/plan-and-execute.mjs')
  const fixturePlannerSource = await fs.readFile(fixturePlannerPath, 'utf8')
  await fs.writeFile(fixturePlannerPath, fixturePlannerSource.replace('你是 TaskWeaver 的多智能体高级任务规划器', 'FIXTURE_PLANNER 你是 TaskWeaver 的多智能体高级任务规划器'))
  const fixturePrompts = await collectPromptSources(fixtureRoot)
  assert.ok(fixturePrompts.get('task-profile.research').text.includes('FIXTURE_PROFILE'), 'fixture evaluation must load task profiles from the fixture backend path')
  assert.ok(fixturePrompts.get('planner-request').text.includes('FIXTURE_PLANNER'), 'fixture evaluation must read planner prompts from the fixture backend path')
  const initial = await runStaticEvaluation({ root: fixtureRoot, update: true })
  assert.equal(initial.ok, true, initial.errors.join('\n'))
  const standardPath = path.join(fixtureRoot, 'packages/runtime/host-cli/config/agent-presets/tw-default/agent.cordis.yml')
  const originalSource = await fs.readFile(standardPath, 'utf8')
  await fs.writeFile(standardPath, originalSource.replace('You are a coding agent powered by', 'You are a software coding agent powered by'))
  const updated = await runStaticEvaluation({ root: fixtureRoot, update: true })
  assert.equal(updated.ok, true, updated.errors.join('\n'))
  const manifest = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'tests/prompts/snapshots/manifest.json'), 'utf8'))
  const standard = manifest.prompts.standard
  const activeText = await fs.readFile(path.join(fixtureRoot, 'tests/prompts/snapshots', standard.file), 'utf8')
  const legacyText = await fs.readFile(path.join(fixtureRoot, 'tests/prompts/snapshots', standard.legacy.file), 'utf8')
  assert.notEqual(activeText, legacyText, 'updating a prompt snapshot must preserve the prior prompt')
  assert.equal(crypto.createHash('sha256').update(legacyText).digest('hex'), standard.legacy.sha256)
  const codePath = path.join(fixtureRoot, 'packages/runtime/host-cli/config/agent-presets/tw-taskweaver-code/agent.cordis.yml')
  const codeSource = await fs.readFile(codePath, 'utf8')
  await fs.writeFile(codePath, codeSource.replace('You are a coding agent assigned', '{{model}} You are a coding agent assigned'))
  const unstablePrefix = await runStaticEvaluation({ root: fixtureRoot, update: true })
  assert.equal(unstablePrefix.ok, false, 'snapshot updates must not silently accept a newly unstable prefix')
  assert.ok(unstablePrefix.errors.some((error) => error.includes('taskweaver-code: new static violations')))
} finally {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
}

console.log('test-eval-prompts: ok (11 source snapshots and hashes, 30 cases, static drift/size/prefix checks, strict planner JSON, response evaluators, legacy preservation)')
