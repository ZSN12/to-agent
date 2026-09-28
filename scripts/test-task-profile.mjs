import assert from 'node:assert/strict'
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

console.log('task-profile 测试通过')
