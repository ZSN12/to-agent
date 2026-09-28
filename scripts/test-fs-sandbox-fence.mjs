import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { checkFileMutationAllowed, isPathUnder } from '../electron/backend/fs-sandbox-fence.mjs'

const root = path.join(os.homedir(), `.tw-fs-fence-${process.pid}`)
await fs.mkdir(root, { recursive: true })
const workspace = path.join(root, 'ws')
await fs.mkdir(workspace, { recursive: true })
const inside = path.join(workspace, 'a.txt')
await fs.writeFile(inside, 'x')

const ro = await checkFileMutationAllowed({ mode: 'read-only' }, workspace, inside)
assert.equal(ro.allowed, false)

const ok = await checkFileMutationAllowed({ mode: 'workspace-write', workspaceRoot: workspace }, workspace, 'a.txt')
assert.equal(ok.allowed, true)

const outside = path.join(root, 'outside.txt')
const bad = await checkFileMutationAllowed({ mode: 'workspace-write', workspaceRoot: workspace }, workspace, outside)
assert.equal(bad.allowed, false)

assert.equal(await isPathUnder(inside, workspace), true)

console.log('fs-sandbox-fence 测试通过')
await fs.rm(root, { recursive: true, force: true })
