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
  let currentWorkspace = workspace
  const catalogSessions = []
  const hostManager = {
    async start() {
      return {
        api: {
          sessions: {
            async create(payload) {
              assert.match(payload.sessionId, /^tw-skills-catalog-[a-f0-9]{20}$/)
              catalogSessions.push({ sessionId: payload.sessionId, cwd: payload.cwd })
              return { result: { ok: true, value: { sessionId: payload.sessionId, cwd: payload.cwd } } }
            },
          },
          skills: {
            async list({ sessionId }) {
              assert.equal(catalogSessions.at(-1)?.sessionId, sessionId)
              return {
                result: {
                  ok: true,
                  value: {
                    skills: [
                      { name: 'agent-teams', description: 'DSH catalog description', modelInvocable: true },
                      { name: 'dsh-only-skill', description: 'Only in DSH registry', modelInvocable: true },
                    ],
                  },
                },
              }
            },
          },
        },
      }
    },
  }
  const service = createSkillService({
    agentDataPath: appData,
    builtInSkillsPath: path.resolve('electron/skills'),
    getWorkspacePath: () => currentWorkspace,
    getWorkspaceTrusted: () => trusted,
    hostManager,
  })
  const skills = await service.list()
  assert.equal(skills.find((skill) => skill.name === 'agent-teams')?.description, 'DSH catalog description')
  assert.equal(skills.find((skill) => skill.name === 'dsh-only-skill')?.source, 'dsh')
  assert.equal(skills.find((skill) => skill.name === 'dsh-only-skill')?.sourceLabel, 'DSH')
  assert.equal(skills.find((skill) => skill.name === 'agent-teams')?.multiAgent, true)
  assert.equal(skills.find((skill) => skill.name === 'multi-agent-orchestration')?.multiAgent, true)
  assert.equal(skills.some((skill) => skill.name === 'workspace-review'), false, 'untrusted workspace skills must stay hidden')
  trusted = true
  const trustedSkills = await service.list()
  assert.equal(trustedSkills.some((skill) => skill.name === 'workspace-review'), true, 'trusted workspace skills should be discoverable')
  const firstCatalogSession = catalogSessions.at(-1).sessionId
  currentWorkspace = path.join(root, 'other-workspace')
  await fs.mkdir(currentWorkspace, { recursive: true })
  await service.list()
  assert.notEqual(catalogSessions.at(-1).sessionId, firstCatalogSession, 'DSH catalog sessions must be workspace-scoped to prevent stale Skill catalogs crossing projects')
  assert.equal(catalogSessions.at(-1).cwd, currentWorkspace)
  currentWorkspace = workspace
  const selected = await service.resolve('agent-teams')
  const orchestration = await service.resolve('multi-agent-orchestration')
  const dshNative = await service.resolve('dsh-only-skill')
  assert.equal(selected.source, 'app')
  assert.match(selected.instructions, /genuinely independent work/)
  assert.deepEqual(
    { source: dshNative.source, instructions: dshNative.instructions, nativeInvocation: dshNative.nativeInvocation, instructionSource: dshNative.instructionSource },
    { source: 'dsh', instructions: '', nativeInvocation: '/dsh-only-skill', instructionSource: 'dsh-native' },
    'DSH-only skills must be passed as a native first-line invocation marker, never represented as locally loaded content',
  )
  assert.equal(decideExecutionMode('修一个小 bug', orchestration).mode, 'multi-agent')
  assert.equal(decideExecutionMode('修一个小 bug', skills[0]).mode, 'multi-agent')
  assert.equal(decideExecutionMode('修一个小 bug').mode, 'single-agent')
  assert.equal(applySkillInstructions('修一个 bug', null), '修一个 bug')
  const injected = applySkillInstructions('修一个 bug', selected)
  assert.match(injected, /用户在 TaskWeaver 中明确选择的 Skill/)
  assert.match(injected, /<taskweaver_skill_instructions>/)
  assert.match(injected, /<user_task>\n\n修一个 bug/)
  await assert.rejects(service.resolve('missing-skill'), /找不到可用的 Skill/)

  const localOnly = createSkillService({
    agentDataPath: appData,
    builtInSkillsPath: path.resolve('electron/skills'),
    getWorkspacePath: () => workspace,
    getWorkspaceTrusted: () => trusted,
  })
  const fallback = await localOnly.list()
  assert.ok(fallback.some((skill) => skill.name === 'agent-teams'))
  console.log('skill service checks passed: DSH list merge, instruction loading/injection, multi-agent routing, safe default')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
