import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { prepareRuntimeCwd, runtimePackagesResolveSmoke } from '../electron/agent/z-host/spawn-host.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const deploy = path.join(root, 'vendor', 'taskweaver-z-runtime')
if (!fs.existsSync(path.join(deploy, 'lib', 'bin.js'))) {
  console.log('test-taskweaver-bare-module-base: skip (no vendor/taskweaver-z-runtime deploy)')
  process.exit(0)
}

const home = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tw-bare-base-'))
const cwd = prepareRuntimeCwd(deploy, home, { useStableMirror: true })
assert.equal(runtimePackagesResolveSmoke(cwd), true, 'mirror cwd must resolve @z/dsh-persona')

const expectedBase = `${pathToFileURL(cwd).href}/`
assert.ok(expectedBase.includes('packaged-runtime'), 'TaskWeaver host cwd should use the stable mirror')

await fs.promises.rm(home, { recursive: true, force: true })
console.log('test-taskweaver-bare-module-base: ok')
