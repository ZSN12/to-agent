import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  prepareRuntimeCwd,
  resolveTaskWeaverRuntimeRoot,
  runtimePackagesResolveSmoke,
  TASKWEAVER_RUNTIME_PACKAGES,
} from '../electron/agent/z-host/index.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = resolveTaskWeaverRuntimeRoot({
  appPath: projectRoot,
  isPackaged: false,
  env: process.env,
})

const dshHome = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-prepare-cwd-'))
const packagesDir = path.join(runtimeRoot, TASKWEAVER_RUNTIME_PACKAGES)
const personaPkg = path.join(packagesDir, '@z', 'dsh-persona', 'package.json')
await fs.access(personaPkg, fs.constants.R_OK)

const inPlace = prepareRuntimeCwd(runtimeRoot, dshHome, { preferWritableMirror: false })
assert.equal(runtimePackagesResolveSmoke(inPlace), true, 'in-place cwd must resolve @z/dsh-persona')

const mirrored = prepareRuntimeCwd(runtimeRoot, dshHome, { preferWritableMirror: true })
assert.equal(mirrored, path.join(dshHome, 'packaged-runtime'))
assert.equal(runtimePackagesResolveSmoke(mirrored), true, 'packaged mirror must resolve @z/dsh-persona')

console.log('test-prepare-runtime-cwd: ok')
