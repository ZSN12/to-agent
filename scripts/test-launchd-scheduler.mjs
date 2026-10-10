import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import { buildLaunchAgentPlist, launchAgentLabel } from '../desktop/backend/launchd-scheduler.mjs'
import { scriptHostNodeExecutable } from './lib/host-node-executable.mjs'

const label = launchAgentLabel('job-abc')
assert.match(label, /^com\.taskweaver\.scheduled\./)

const devNode = scriptHostNodeExecutable()
const xml = buildLaunchAgentPlist(
  { id: 'job-abc', intervalMinutes: 30 },
  { userDataPath: '/tmp/tw-user', nodePath: devNode },
)
assert.match(xml, /<key>StartInterval<\/key>\s*<integer>1800<\/integer>/)
assert.match(xml, /run-scheduled-job-cli\.mjs/)
assert.match(xml, /TASKWEAVER_USER_DATA/)
assert.match(xml, new RegExp(devNode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
assert.match(xml, /<key>TASKWEAVER_PACKAGED<\/key>\s*<string>0<\/string>/)
assert.match(xml, /<key>WorkingDirectory<\/key>\s*<string>\/tmp\/tw-user<\/string>/)

const resourcesPath = '/Applications/TaskWeaver.app/Contents/Resources'
const packagedNode = '/Applications/TaskWeaver.app/Contents/Resources/host-node/bin/node'
const packaged = buildLaunchAgentPlist(
  { id: 'job-packaged', intervalMinutes: 60 },
  {
    userDataPath: '/tmp/tw-user',
    isPackaged: true,
    resourcesPath,
    nodePath: packagedNode,
  },
)
assert.ok(fs.existsSync('scripts/run-scheduled-job-cli.mjs'))
assert.match(packaged, new RegExp(`${resourcesPath}/taskweaver-scheduled-runner\\.mjs`))
assert.match(packaged, /host-node\/bin\/node/)
assert.match(packaged, /<key>TASKWEAVER_PACKAGED<\/key>\s*<string>1<\/string>/)
assert.match(packaged, /<key>TASKWEAVER_RESOURCES_PATH<\/key>/)
assert.match(packaged, /<key>TASKWEAVER_APP_PATH<\/key>\s*<string>\/Applications\/TaskWeaver\.app<\/string>/)

const packaging = fs.readFileSync(path.resolve('packaging/mac-shell-resources.yml'), 'utf8')
assert.match(packaging, /run-scheduled-job-cli\.mjs/)
assert.match(packaging, /taskweaver-scheduled-runner\.mjs/)
assert.match(packaging, /taskweaver-headless\.mjs/)
assert.match(packaging, /run-agent-read-smoke\.mjs/)

console.log('launchd-scheduler tests passed')
