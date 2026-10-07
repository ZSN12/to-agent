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
assert.match(getTaskProfile('research').preamble, /已知路径的小文件可直接 read/)
assert.match(getTaskProfile('research').preamble, /必须 read 实际源码/)
assert.match(getTaskProfile('research').preamble, /大型源码文件若目标符号\/区段尚未定位，先在该精确文件内 grep/)
assert.match(getTaskProfile('research').preamble, /若需核实多文件调用链，先并行定位各文件中的关键符号，再并行读取/)
assert.match(getTaskProfile('research').preamble, /只建立回答问题所需的最短链路，入口到目标调用由源码证实后立即结束/)
assert.match(getTaskProfile('research').preamble, /文件工具路径必须使用工作区相对路径，禁止传绝对路径/)
assert.match(getTaskProfile('research').preamble, /完成条件：子任务要求的结论均有源码证据.*立即整理回答/)
assert.match(getTaskProfile('review').preamble, /严格遵守子任务描述中的文件\/目录范围/)
assert.match(getTaskProfile('review').preamble, /至少成功 read 一个相关源码/)
assert.match(getTaskProfile('review').preamble, /文件工具路径必须使用工作区相对路径，禁止传绝对路径/)

const readonlyPresetPath = path.resolve('vendor/z-runtime/apps/cli/config/agent-presets/taskweaver-readonly/agent.cordis.yml')
const readonlyPreset = await fs.readFile(readonlyPresetPath, 'utf8')
assert.match(readonlyPreset, /name: '@z\/dsh-tool-fs'/, 'read-only Z preset must mount the filesystem read tool')
assert.match(readonlyPreset, /mutations: false/, 'read-only Z preset must disable filesystem mutations')
assert.doesNotMatch(readonlyPreset, /name: '@z\/dsh-tool-bash'/, 'read-only Z preset must not mount shell execution')
assert.match(readonlyPreset, /sampleOverCapGlobResults: true/, 'read-only search must sample over-cap results instead of repeatedly showing only the same newest files')
assert.match(readonlyPreset, /excludeDirectories:.*node_modules/, 'read-only search must exclude dependency trees by default')
assert.match(readonlyPreset, /excludeDirectories:.*vendor/, 'read-only search must keep third-party trees out of broad discovery by default')
assert.doesNotMatch(readonlyPreset, /inspection(?:Tools|Thresholds|Limit)/, 'read-only subagents must not have cumulative inspection budgets')
assert.doesNotMatch(readonlyPreset, /(?:at most|hard ceiling of) (?:five|six|twelve).*calls? per task/i, 'read-only subagents must not have a total call-count cap')
assert.match(readonlyPreset, /mode: native/, 'read-only subagents must use DSH Web standard native tool presentation')
assert.match(readonlyPreset, /do not wrap simple filesystem reads in generated code/, 'read-only subagents should avoid unnecessary Code Mode wrappers')
assert.match(readonlyPreset, /first search within that exact file[\s\S]*?read only the nearby line ranges/, 'large named source files should be located before reading narrow ranges')
assert.match(readonlyPreset, /Approximate line numbers[\s\S]*?hints, not authoritative anchors[\s\S]*?one narrow search/i, 'read-only subagents should verify approximate line hints before reading')
assert.match(readonlyPreset, /several requested symbols[\s\S]*?one contiguous range covering nearby\/adjacent hops/i, 'read-only subagents should combine nearby symbol reads')
assert.match(getTaskProfile('research').preamble, /先在该精确文件内 grep，再用 read\(offset, limit\)/, 'research agents should avoid reading large files just to locate symbols')

const codePresetPath = path.resolve('vendor/z-runtime/apps/cli/config/agent-presets/taskweaver-code/agent.cordis.yml')
const codePreset = await fs.readFile(codePresetPath, 'utf8')
assert.match(codePreset, /name: '@z\/dsh-tool-fs'/, 'coding Z preset must mount the filesystem tools')
assert.match(codePreset, /sampleOverCapGlobResults: true/, 'coding search must sample over-cap results instead of repeatedly showing only the same newest files')
assert.doesNotMatch(codePreset, /(?:at most|more than) five inspection\/tool calls/, 'coding subtasks must not stop at a total call-count cap')

console.log('task-profile 测试通过')
