import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  resolveDshHostLaunch,
  resolveDshRuntimeRoot,
  resolveTaskWeaverRuntimeRoot,
  resolveZHostLaunch,
  resolveZRuntimeRoot,
  useZRuntime,
} from '../electron/agent/dsh-host/resolve-runtime.mjs'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dsh-resolution-'))
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function makeRuntime(root, layout = 'deployed') {
  const entry = layout === 'deployed' ? 'lib/bin.js' : 'apps/cli/lib/bin.js'
  const entryPath = path.join(root, entry)
  await fs.mkdir(path.dirname(entryPath), { recursive: true })
  await fs.writeFile(entryPath, '// test fixture\n')
  return root
}

try {
  const appPath = path.join(tempRoot, 'app')
  const resourcesPath = path.join(tempRoot, 'resources')
  const packaged = await makeRuntime(path.join(resourcesPath, 'taskweaver-dsh-runtime'))
  const external = await makeRuntime(path.join(tempRoot, 'external-runtime'))
  const appVendor = await makeRuntime(path.join(appPath, 'vendor', 'taskweaver-dsh-runtime'))
  const repoSource = await makeRuntime(path.join(appPath, 'dsh-source'), 'source')
  const sourceOnly = await makeRuntime(path.join(tempRoot, 'source-only-app', 'dsh-source'), 'source')

  assert.equal(resolveDshRuntimeRoot({
    appPath,
    resourcesPath,
    isPackaged: true,
    env: { TASKWEAVER_DSH_RUNTIME: external },
  }), packaged, 'packaged build must ignore external runtime override')
  assert.equal(resolveDshRuntimeRoot({
    appPath,
    resourcesPath: null,
    isPackaged: false,
    env: { TASKWEAVER_DSH_RUNTIME: external },
  }), external, 'development may use explicit runtime override')
  assert.equal(resolveDshRuntimeRoot({
    appPath,
    resourcesPath: null,
    isPackaged: false,
    env: {},
  }), appVendor, 'development prefers the deployed in-repo runtime')
  assert.equal(resolveDshRuntimeRoot({
    appPath: path.join(tempRoot, 'source-only-app'),
    resourcesPath: null,
    isPackaged: false,
    env: {},
  }), sourceOnly)

  assert.throws(() => resolveDshRuntimeRoot({
    appPath,
    resourcesPath: null,
    isPackaged: true,
    env: { TASKWEAVER_DSH_RUNTIME: external },
  }), /拒绝回退加载外部 DSH runtime/)
  assert.throws(() => resolveDshRuntimeRoot({
    appPath,
    resourcesPath: tempRoot,
    isPackaged: true,
    env: { TASKWEAVER_DSH_RUNTIME: external },
  }), /安装包缺少 DSH runtime/)

  const launch = resolveDshHostLaunch(packaged)
  assert.equal(launch.entrypoint, path.join(packaged, 'lib', 'bin.js'))
  assert.equal(launch.cwd, packaged, 'DSH process cwd must remain inside the bundled runtime')
  const sourceLaunch = resolveDshHostLaunch(repoSource)
  assert.equal(sourceLaunch.entrypoint, path.join(repoSource, 'apps', 'cli', 'lib', 'bin.js'))
  assert.equal(sourceLaunch.cwd, repoSource)

  const builderConfig = await fs.readFile(path.join(projectRoot, 'electron-builder.yml'), 'utf8')
  assert.match(builderConfig, /from:\s*vendor\/taskweaver-dsh-runtime[\s\S]*to:\s*taskweaver-dsh-runtime/)
  assert.match(builderConfig, /runtime-packages\/\*\*\/\*/)
  const buildScript = await fs.readFile(path.join(projectRoot, 'scripts', 'build-dsh-runtime.mjs'), 'utf8')
  assert.match(buildScript, /vendor',\s*'taskweaver-dsh-runtime'/)
  assert.match(buildScript, /taskweaver-dsh-client/)

  const zPackaged = await makeRuntime(path.join(resourcesPath, 'taskweaver-dsh-runtime'))
  const zExternal = await makeRuntime(path.join(tempRoot, 'external-z-runtime'))
  const appVendorZ = await makeRuntime(path.join(appPath, 'vendor', 'z-runtime'))
  const appZDeploy = await makeRuntime(path.join(appPath, 'vendor', 'taskweaver-dsh-runtime'))
  await fs.mkdir(path.join(appZDeploy, 'runtime-packages', '@z', 'dsh-agent'), { recursive: true })
  await fs.writeFile(path.join(appZDeploy, 'runtime-packages', '@z', 'dsh-agent', 'package.json'), '{}\n')

  assert.equal(resolveZRuntimeRoot({
    appPath,
    resourcesPath,
    isPackaged: true,
    env: { TASKWEAVER_Z_RUNTIME: zExternal },
  }), zPackaged, 'packaged Z build must ignore external override')
  assert.equal(resolveZRuntimeRoot({
    appPath,
    resourcesPath: null,
    isPackaged: false,
    env: { TASKWEAVER_Z_RUNTIME: zExternal },
  }), zExternal)
  assert.equal(resolveZRuntimeRoot({
    appPath,
    resourcesPath: null,
    isPackaged: false,
    env: {},
  }), appZDeploy, 'Z deploy under vendor/taskweaver-dsh-runtime wins over monorepo')
  assert.equal(resolveTaskWeaverRuntimeRoot({
    appPath,
    resourcesPath: null,
    isPackaged: false,
    env: { TASKWEAVER_USE_Z_RUNTIME: '1' },
  }), appZDeploy)
  assert.equal(resolveTaskWeaverRuntimeRoot({
    appPath,
    resourcesPath: null,
    isPackaged: false,
    env: {},
  }), appZDeploy, 'auto-detect @z deploy for resolveTaskWeaverRuntimeRoot')
  assert.equal(useZRuntime({ TASKWEAVER_USE_Z_RUNTIME: '1' }), true)
  assert.equal(useZRuntime({}, { appPath, isPackaged: false }), true)
  assert.equal(useZRuntime({}, { appPath: path.join(tempRoot, 'no-z-app'), isPackaged: false }), false)

  const zLaunch = resolveZHostLaunch(zPackaged)
  assert.equal(zLaunch.entrypoint, path.join(zPackaged, 'lib', 'bin.js'))
  assert.equal(zLaunch.cwd, zPackaged)

  console.log('DSH runtime resolution passed: packaged-only resources, dev override, source layout, runtime cwd, packaging paths, and Z runtime scaffold.')
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}
