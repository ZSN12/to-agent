import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDshHostLaunch, resolveDshRuntimeRoot } from '../electron/agent/dsh-host/resolve-runtime.mjs'

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
  const buildScript = await fs.readFile(path.join(projectRoot, 'scripts', 'build-dsh-runtime.mjs'), 'utf8')
  assert.match(buildScript, /vendor',\s*'taskweaver-dsh-runtime'/)
  assert.match(buildScript, /taskweaver-dsh-client/)
  console.log('DSH runtime resolution passed: packaged-only resources, dev override, source layout, runtime cwd, and packaging paths.')
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}
