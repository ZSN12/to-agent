import assert from 'node:assert/strict'
import { buildLaunchAgentPlist, launchAgentLabel } from '../electron/backend/launchd-scheduler.mjs'

const label = launchAgentLabel('job-abc')
assert.match(label, /^com\.taskweaver\.scheduled\./)

const xml = buildLaunchAgentPlist(
  { id: 'job-abc', intervalMinutes: 30 },
  { userDataPath: '/tmp/tw-user' },
)
assert.match(xml, /<key>StartInterval<\/key>\s*<integer>1800<\/integer>/)
assert.match(xml, /run-scheduled-job-cli\.mjs/)
assert.match(xml, /TASKWEAVER_USER_DATA/)
assert.match(xml, /scheduled-job-cli/)

console.log('launchd-scheduler tests passed')
