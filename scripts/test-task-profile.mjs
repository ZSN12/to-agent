import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getTaskProfile, canRunSubtasksInParallel, getToolsForTask } from '../electron/backend/task-profile.mjs'
import { resolveSkillForSubtask } from '../electron/backend/skill-prompt.mjs'

assert.equal(getToolsForTask('research').includes('write'), false)
assert.equal(getToolsForTask('implementation').includes('write'), true)

const skill = { name: 'demo', instructions: 'x', baseDir: '/tmp' }
assert.equal(resolveSkillForSubtask(skill, 'research'), null)
assert.equal(resolveSkillForSubtask(skill, 'implementation')?.name, 'demo')

assert.equal(
  canRunSubtasksInParallel([
    { taskType: 'research' },
    { taskType: 'review' },
  ]),
  true,
)
assert.equal(
  canRunSubtasksInParallel([
    { taskType: 'research' },
    { taskType: 'implementation' },
  ]),
  false,
)

assert.match(getTaskProfile('test').preamble, /测试/)
assert.match(getTaskProfile('research').preamble, /精确文件路径时，优先直接用 read/)
assert.match(getTaskProfile('research').preamble, /必须 read 实际源码/)
assert.match(getTaskProfile('research').preamble, /报告控制在约 1500 个中文字符内/)
assert.match(getTaskProfile('review').preamble, /严格遵守子任务描述中的文件\/目录范围/)
assert.match(getTaskProfile('review').preamble, /至少成功 read 一个相关源码/)

const readonlyPresetPath = path.resolve('vendor/z-runtime/apps/cli/config/agent-presets/taskweaver-readonly/agent.cordis.yml')
const readonlyPreset = await fs.readFile(readonlyPresetPath, 'utf8')
assert.match(readonlyPreset, /name: '@z\/dsh-tool-fs'/, 'read-only Z preset must mount the filesystem read tool')
assert.match(readonlyPreset, /mutations: false/, 'read-only Z preset must disable filesystem mutations')
assert.doesNotMatch(readonlyPreset, /name: '@z\/dsh-tool-bash'/, 'read-only Z preset must not mount shell execution')
assert.match(readonlyPreset, /sampleOverCapGlobResults: true/, 'read-only search must sample over-cap results instead of repeatedly showing only the same newest files')
assert.match(readonlyPreset, /excludeDirectories:.*node_modules/, 'read-only search must exclude dependency trees by default')
assert.match(readonlyPreset, /at most six\n.*read\/glob\/grep\/find\/ls calls total/, 'read-only subagents must enforce a consistent inspection budget')
assert.match(readonlyPreset, /inspectionThresholds: \[4, 6\]/, 'read-only subagents must receive an agent-scoped synthesis reminder before the general host reminder')

const codePresetPath = path.resolve('vendor/z-runtime/apps/cli/config/agent-presets/taskweaver-code/agent.cordis.yml')
const codePreset = await fs.readFile(codePresetPath, 'utf8')
assert.match(codePreset, /name: '@z\/dsh-tool-fs'/, 'coding Z preset must mount the filesystem tools')
assert.match(codePreset, /sampleOverCapGlobResults: true/, 'coding search must sample over-cap results instead of repeatedly showing only the same newest files')
assert.match(codePreset, /five inspection\/tool calls/, 'coding subtasks must bound focused exploration')

console.log('task-profile 测试通过')
