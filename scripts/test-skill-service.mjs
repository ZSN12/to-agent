import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createSkillService } from '../electron/backend/skill-service.mjs'
import { decideExecutionMode } from '../electron/backend/orchestration-policy.mjs'
import { applySkillInstructions } from '../electron/backend/skill-prompt.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-skills-'))
try {
  const workspace = path.join(root, 'workspace')
  const appData = path.join(root, 'app-data')
  const skillDir = path.join(appData, 'skills', 'agent-teams')
  await fs.mkdir(skillDir, { recursive: true })
  await fs.mkdir(workspace, { recursive: true })
  const projectSkillDir = path.join(workspace, '.taskweaver', 'skills', 'workspace-review')
  await fs.mkdir(projectSkillDir, { recursive: true })
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), [
    '---',
    'name: agent-teams',
    'description: 多 Agent skill for decomposing complex engineering work',
    '---',
    '',
    'Use a task graph only for genuinely independent work.',
  ].join('\n'))
  await fs.writeFile(path.join(projectSkillDir, 'SKILL.md'), [
    '---',
    'name: workspace-review',
    'description: Workspace-only review workflow',
    '---',
    '',
    'Review the current repository conventions.',
  ].join('\n'))

  let trusted = false
  const service = createSkillService({
    agentDataPath: appData,
    builtInSkillsPath: path.resolve('electron/skills'),
    getWorkspacePath: () => workspace,
    getWorkspaceTrusted: () => trusted,
  })
  const skills = service.list()
  assert.equal(skills.length, 2)
  assert.equal(skills.find((skill) => skill.name === 'agent-teams')?.multiAgent, true)
  assert.equal(skills.find((skill) => skill.name === 'multi-agent-orchestration')?.multiAgent, true)
  assert.equal(skills.some((skill) => skill.name === 'workspace-review'), false, 'untrusted workspace skills must stay hidden')
  trusted = true
  assert.equal(service.list().some((skill) => skill.name === 'workspace-review'), true, 'trusted workspace skills should be discoverable')
  const selected = await service.resolve('agent-teams')
  const orchestration = await service.resolve('multi-agent-orchestration')
  assert.equal(selected.source, 'app')
  assert.match(selected.instructions, /genuinely independent work/)
  assert.equal(decideExecutionMode('修一个小 bug', orchestration).mode, 'multi-agent')
  assert.equal(decideExecutionMode('修一个小 bug', skills[0]).mode, 'multi-agent')
  assert.equal(decideExecutionMode('修一个小 bug').mode, 'single-agent')
  assert.equal(applySkillInstructions('修一个 bug', null), '修一个 bug')
  const injected = applySkillInstructions('修一个 bug', selected)
  assert.match(injected, /用户在 TaskWeaver 中明确选择的 Skill/)
  assert.match(injected, /<taskweaver_skill_instructions>/)
  assert.match(injected, /<user_task>\n\n修一个 bug/)
  await assert.rejects(service.resolve('missing-skill'), /找不到可用的 Skill/)
  console.log('skill service checks passed: discovery, explicit instruction loading/injection, multi-agent routing, safe default')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
