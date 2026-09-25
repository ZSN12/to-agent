import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createPermissionService } from '../electron/backend/permission-service.mjs'
import { createTaskWeaverResourceLoader } from '../electron/agent/taskweaver-resources.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-permissions-'))
const workspace = path.join(root, 'workspace')
const outside = path.join(root, 'outside')
await fs.mkdir(workspace, { recursive: true })
await fs.mkdir(outside, { recursive: true })
await fs.writeFile(path.join(outside, 'private.txt'), 'outside workspace')
await fs.symlink(outside, path.join(workspace, 'linked-outside'))
const pendingDialogs = []
let dialogResponse = 1
const dialog = { showMessageBox: async (...args) => { pendingDialogs.push(args); return { response: dialogResponse } } }
const contents = { isDestroyed: () => false }
const permissions = createPermissionService({ dialog, getParentWindow: () => null, getWorkspacePath: () => workspace })

try {
  const bashCall = { toolName: 'bash', input: { command: 'npm test' } }
  const allowed = await permissions.withExecution('ask', contents, () => permissions.authorize(bashCall))
  assert.deepEqual(allowed, undefined)
  assert.equal(pendingDialogs.length, 1)
  assert.match(pendingDialogs[0][0].message, /运行终端命令/)

  dialogResponse = 0
  const rejected = await permissions.withExecution('ask', contents, () => permissions.authorize(bashCall))
  assert.equal(rejected.block, true)
  assert.match(rejected.reason, /用户拒绝/)

  const safe = await permissions.withExecution('on-risk', contents, () => permissions.authorize(bashCall))
  assert.equal(safe, undefined)
  const dangerous = await permissions.withExecution('on-risk', contents, () => permissions.authorize({ toolName: 'bash', input: { command: 'rm -rf ./build' } }))
  assert.equal(dangerous.block, true)
  assert.match(dangerous.reason, /用户拒绝/)
  assert.match(pendingDialogs.at(-1)[0].message, /删除或重置数据/)

  const networkInstall = await permissions.withExecution('on-risk', contents, () => permissions.authorize({ toolName: 'bash', input: { command: 'npm install example-package' } }))
  assert.equal(networkInstall.block, true)
  assert.match(pendingDialogs.at(-1)[0].message, /网络/)

  const outsideRead = await permissions.withExecution('on-risk', contents, () => permissions.authorize({ toolName: 'read', input: { path: 'linked-outside/private.txt' } }))
  assert.equal(outsideRead.block, true)
  assert.match(pendingDialogs.at(-1)[0].message, /读取工作区以外/)

  const outsideWrite = await permissions.withExecution('on-risk', contents, () => permissions.authorize({ toolName: 'write', input: { path: path.join(outside, 'private.txt') } }))
  assert.equal(outsideWrite.block, true)
  assert.match(pendingDialogs.at(-1)[0].message, /修改工作区以外/)

  const full = await permissions.withExecution('full', contents, () => permissions.authorize({ toolName: 'bash', input: { command: 'rm -rf /tmp/example' } }))
  assert.equal(full, undefined)

  dialogResponse = 0

  const unavailable = await permissions.withExecution('ask', null, () => permissions.authorize(bashCall))
  assert.equal(unavailable.block, true)
  assert.match(unavailable.reason, /已阻止/)

  const { resourceLoader } = createTaskWeaverResourceLoader({
    cwd: workspace,
    agentDir: path.join(root, 'agent'),
    builtInSkillsPath: path.resolve('electron/skills'),
    builtInExtensionsPath: path.resolve('electron/extensions/taskweaver-permissions.ts'),
  })
  await resourceLoader.reload()
  assert.ok(resourceLoader.getExtensions().extensions.some((extension) => extension.path.includes('taskweaver-permissions.ts')))
  console.log('permission checks passed: one-shot approval/rejection, network/destructive gates, symlink-aware workspace access, unrestricted mode, fail-closed and extension discovery')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
