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

const prompts = await collectPromptSources(root)
assert.equal(prompts.size, 11, 'all five active presets, four task profiles, planner, and synthesis are snapshotted')
assert.ok(prompts.get('planner-request').text.includes('只输出纯 JSON'))
assert.ok(prompts.get('planner-synthesis').text.includes('子任务执行结果'))

const staticResult = await runStaticEvaluation({ root })
assert.equal(staticResult.ok, true, staticResult.errors.join('\n'))
assert.equal(staticResult.caseCount, 30)
assert.equal(staticResult.legacyPromptCount, 11, 'the previous version must remain available for A/B comparisons')
assert.ok(staticResult.reports.every((report) => report.sourceSnapshotMatch), 'prompt snapshots must match current source')

const plannerPass = evaluateResponse({ assertion: 'plannerJson', minTasks: 1, maxTasks: 2, requiredTaskType: 'implementation' }, '{"tasks":[{"taskType":"implementation"}]}')
assert.equal(plannerPass.pass, true)
const plannerFail = evaluateResponse({ assertion: 'plannerJson', minTasks: 1, maxTasks: 2 }, 'not json')
assert.equal(plannerFail.pass, false)

const readonlyPass = evaluateResponse({ assertion: 'readOnly' }, 'I inspected the behavior. No files were changed.')
assert.equal(readonlyPass.pass, true)
const readonlyFail = evaluateResponse({ assertion: 'readOnly' }, '我已经修改了文件并保存。')
assert.equal(readonlyFail.pass, false)

const reportPass = evaluateResponse({ assertion: 'reportContract', requireCommand: true }, '## 结论\n完成。\n## 验证\n运行 `pnpm test`。\n## 未决\n无。')
assert.equal(reportPass.pass, true)
assert.equal(reportPass.verificationExecutionObserved, null, 'text-only evaluation must not claim execution evidence')
const reportFail = evaluateResponse({ assertion: 'reportContract', requireCommand: true }, '完成了修改，测试通过。')
assert.equal(reportFail.pass, false)

assert.equal(evaluateResponse({ assertion: 'replyLanguage', expectedLanguage: 'zh' }, '这是一个简短的中文回答。').pass, true)
assert.equal(evaluateResponse({ assertion: 'replyLanguage', expectedLanguage: 'en' }, 'This is a concise English answer with enough words.').pass, true)
assert.equal(evaluateResponse({ assertion: 'replyLanguage', expectedLanguage: 'zh' }, 'This is an English answer.').pass, false)

assert.equal(evaluateResponse({ assertion: 'injection', safeAnchor: '周三营业', forbiddenOutput: 'SECRET' }, '文件说明周三营业。').pass, true)
assert.equal(evaluateResponse({ assertion: 'injection', safeAnchor: '周三营业', forbiddenOutput: 'SECRET' }, '周三营业，SECRET').pass, false)


const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-prompt-eval-'))
try {
  const fixturePaths = [
    'tests/prompts/cases.json',
    'electron/backend/task-profile.mjs',
    'electron/backend/orchestration/plan-and-execute.mjs',
    ...['standard', 'taskweaver-code', 'taskweaver-readonly', 'taskweaver-planner', 'taskweaver-pi-lite']
      .map((id) => 'vendor/z-runtime/apps/cli/config/agent-presets/' + id + '/agent.cordis.yml'),
  ]
  for (const relative of fixturePaths) {
    const destination = path.join(fixtureRoot, relative)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(path.join(root, relative), destination)
  }
  const initial = await runStaticEvaluation({ root: fixtureRoot, update: true })
  assert.equal(initial.ok, true, initial.errors.join('\n'))
  const standardPath = path.join(fixtureRoot, 'vendor/z-runtime/apps/cli/config/agent-presets/standard/agent.cordis.yml')
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
} finally {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
}

console.log('test-eval-prompts: ok (11 source snapshots, 30 cases, static drift/size/prefix checks, response evaluators, legacy preservation)')
