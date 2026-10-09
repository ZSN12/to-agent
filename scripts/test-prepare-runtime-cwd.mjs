import assert from 'node:assert/strict'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import {
  bridgeTransportChildEnv,
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

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-prepare-cwd-'))
const dshHome = path.join(tempRoot, 'dsh')
await fs.mkdir(dshHome, { recursive: true })
const packagesDir = path.join(runtimeRoot, TASKWEAVER_RUNTIME_PACKAGES)
const personaPkg = path.join(packagesDir, '@z', 'dsh-persona', 'package.json')
await fs.access(personaPkg, fs.constants.R_OK)

try {
  const inPlace = prepareRuntimeCwd(runtimeRoot, dshHome, { useStableMirror: false })
  assert.equal(runtimePackagesResolveSmoke(inPlace), true, 'in-place cwd must resolve @z/dsh-persona')

  const mirrored = prepareRuntimeCwd(runtimeRoot, dshHome, { useStableMirror: true })
  assert.equal(mirrored, path.join(dshHome, 'packaged-runtime'))
  assert.equal(runtimePackagesResolveSmoke(mirrored), true, 'stable mirror must resolve @z/dsh-persona')

  const stagedTransport = path.join(runtimeRoot, 'electron-vendor', 'taskweaver-bridge-transport', 'index.mjs')
  if (await fs.access(stagedTransport).then(() => true, () => false)) {
    assert.equal(
      fsSync.existsSync(path.join(mirrored, 'electron-vendor', 'taskweaver-bridge-transport', 'index.mjs')),
      true,
      'stable mirror must symlink electron-vendor for bridge transport',
    )
    const bridgeEnv = bridgeTransportChildEnv(mirrored, undefined, runtimeRoot)
    assert.ok(bridgeEnv.TASKWEAVER_BRIDGE_TRANSPORT?.includes('taskweaver-bridge-transport'),
      'bridge env must point at deploy electron-vendor transport')
    assert.equal(bridgeEnv.TASKWEAVER_Z_RUNTIME, path.resolve(runtimeRoot))
  }

  // Simulate build:z-runtime's atomic swap. A Host started from this stable
  // cwd must remain in an existing directory and resolve the replacement tree.
  const fixtureRoot = path.join(tempRoot, 'runtime-fixture')
  const fixtureHome = path.join(tempRoot, 'fixture-dsh')
  const fixtureRuntime = path.join(fixtureRoot, 'runtime')
  const writeFixture = async (version) => {
    const persona = path.join(fixtureRuntime, 'runtime-packages', '@z', 'dsh-persona')
    await fs.mkdir(persona, { recursive: true })
    await fs.writeFile(path.join(persona, 'package.json'), JSON.stringify({ name: '@z/dsh-persona', version }))
  }
  await fs.mkdir(fixtureHome, { recursive: true })
  await writeFixture('1')
  const stableCwd = prepareRuntimeCwd(fixtureRuntime, fixtureHome, { useStableMirror: true })
  const stableRealCwd = await fs.realpath(stableCwd)
  const previousRuntime = path.join(fixtureRoot, 'runtime-previous')
  const originalCwd = process.cwd()
  try {
    // Reproduce the old Host behavior: the process cwd is the deployment
    // directory, which build:z-runtime renames and then removes.
    process.chdir(fixtureRuntime)
    await fs.rename(fixtureRuntime, previousRuntime)
    await writeFixture('2')
    await fs.rm(previousRuntime, { recursive: true, force: true })
    assert.throws(() => process.cwd(), /uv_cwd|ENOENT/,
      'removing a live process cwd makes Node unable to resolve its cwd')

    // The production Host now starts from this stable mirror instead.
    process.chdir(stableCwd)
    assert.equal(process.cwd(), stableRealCwd)
    assert.equal(await fs.stat(stableCwd).then((stat) => stat.isDirectory()), true,
      'Host cwd must survive replacement of the runtime directory')
    assert.equal(runtimePackagesResolveSmoke(stableCwd), true,
      'stable mirror must resolve @z packages from the replacement runtime')
    const workerCwd = await new Promise((resolve, reject) => {
      const worker = new Worker('require("node:worker_threads").parentPort.postMessage(process.cwd())', { eval: true })
      worker.once('message', resolve)
      worker.once('error', reject)
    })
    assert.equal(workerCwd, stableRealCwd, 'worker threads must inherit the surviving Host cwd')
  } finally {
    process.chdir(originalCwd)
  }

  console.log('test-prepare-runtime-cwd: ok')
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}
