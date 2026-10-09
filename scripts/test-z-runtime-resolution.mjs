import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  resolveTaskWeaverHostLaunch,
  resolveTaskWeaverRuntimeRoot,
  TASKWEAVER_RUNTIME_PACKAGES,
  TASKWEAVER_Z_RUNTIME_DEPLOY_DIR,
} from '../electron/agent/z-host/index.mjs'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-z-resolution-'))
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function makeRuntime(root, layout = 'deployed') {
  const entry = layout === 'deployed' ? 'lib/bin.js' : 'host-cli/lib/bin.js'
  const entryPath = path.join(root, entry)
  await fs.mkdir(path.dirname(entryPath), { recursive: true })
  await fs.writeFile(entryPath, '// test fixture\n')
  return root
}

try {
  const appPath = path.join(tempRoot, 'app')
  const resourcesPath = path.join(tempRoot, 'resources')
  const packaged = await makeRuntime(path.join(resourcesPath, TASKWEAVER_Z_RUNTIME_DEPLOY_DIR))
  const external = await makeRuntime(path.join(tempRoot, 'external-runtime'))
  const appDeploy = await makeRuntime(path.join(appPath, 'vendor', TASKWEAVER_Z_RUNTIME_DEPLOY_DIR))
  const repoSource = await makeRuntime(path.join(appPath, 'packages', 'runtime'), 'source')

  assert.equal(resolveTaskWeaverRuntimeRoot({
    appPath,
    resourcesPath,
    isPackaged: true,
    env: { TASKWEAVER_Z_RUNTIME: external },
  }), packaged, 'packaged build must ignore external runtime override')
  assert.equal(resolveTaskWeaverRuntimeRoot({
    appPath,
    resourcesPath: null,
    isPackaged: false,
    env: { TASKWEAVER_Z_RUNTIME: external },
  }), external, 'development may use explicit runtime override')
  assert.equal(resolveTaskWeaverRuntimeRoot({
    appPath,
    resourcesPath: null,
    isPackaged: false,
    env: { TASKWEAVER_DSH_RUNTIME: external },
  }), external, 'development supports fallback to TASKWEAVER_DSH_RUNTIME')
  assert.equal(resolveTaskWeaverRuntimeRoot({
    appPath,
    resourcesPath: null,
    isPackaged: false,
    env: { TASKWEAVER_Z_RUNTIME: external, TASKWEAVER_DSH_RUNTIME: '/other/path' },
  }), external, 'TASKWEAVER_Z_RUNTIME has precedence over TASKWEAVER_DSH_RUNTIME')
  assert.equal(resolveTaskWeaverRuntimeRoot({
    appPath,
    resourcesPath: null,
    isPackaged: false,
    env: {},
  }), appDeploy, 'development prefers the deployed in-repo runtime')
  const sourceOnlyApp = path.join(tempRoot, 'source-only-app')
  const monorepoOnly = await makeRuntime(path.join(sourceOnlyApp, 'packages', 'runtime'), 'source')
  assert.equal(resolveTaskWeaverRuntimeRoot({
    appPath: sourceOnlyApp,
    resourcesPath: null,
    isPackaged: false,
    env: {},
  }), monorepoOnly)

  const legacyDeploy = await makeRuntime(path.join(tempRoot, 'legacy-app', 'vendor', 'taskweaver-dsh-runtime'))
  assert.equal(resolveTaskWeaverRuntimeRoot({
    appPath: path.join(tempRoot, 'legacy-app'),
    resourcesPath: null,
    isPackaged: false,
    env: {},
  }), legacyDeploy, 'legacy vendor/taskweaver-dsh-runtime still resolves')

  assert.throws(() => resolveTaskWeaverRuntimeRoot({
    appPath: path.join(tempRoot, 'no-runtime-app'),
    resourcesPath: null,
    isPackaged: false,
    env: {},
  }), /找不到可运行的 Z runtime/)

  assert.throws(() => resolveTaskWeaverRuntimeRoot({
    appPath,
    resourcesPath: null,
    isPackaged: true,
    env: { TASKWEAVER_Z_RUNTIME: external },
  }), /拒绝回退加载外部 Z runtime/)
  assert.throws(() => resolveTaskWeaverRuntimeRoot({
    appPath,
    resourcesPath: tempRoot,
    isPackaged: true,
    env: { TASKWEAVER_Z_RUNTIME: external },
  }), /安装包缺少 Z runtime/)

  const launch = resolveTaskWeaverHostLaunch(packaged)
  assert.equal(launch.entrypoint, path.join(packaged, 'lib', 'bin.js'))
  assert.equal(launch.cwd, packaged, 'host process cwd must remain inside the bundled runtime')
  const sourceLaunch = resolveTaskWeaverHostLaunch(repoSource)
  assert.equal(sourceLaunch.entrypoint, path.join(repoSource, 'apps', 'cli', 'lib', 'bin.js'))
  assert.equal(sourceLaunch.cwd, repoSource)

  const builderConfig = await fs.readFile(path.join(projectRoot, 'electron-builder.yml'), 'utf8')
  assert.match(builderConfig, /from:\s*vendor\/taskweaver-z-runtime[\s\S]*to:\s*taskweaver-z-runtime/)
  assert.match(builderConfig, /runtime-packages\/\*\*\/\*/)
  assert.match(builderConfig, /electron-vendor\/\*\*\/\*/, 'packaged Z runtime must include in-process bridge transport')
  const buildScript = await fs.readFile(path.join(projectRoot, 'scripts', 'build-host-runtime.mjs'), 'utf8')
  assert.match(buildScript, /TASKWEAVER_Z_RUNTIME_DEPLOY_DIR/)
  assert.match(buildScript, /TASKWEAVER_Z_RUNTIME_CLIENT_DIR/)
  const hostBuildConfig = JSON.parse(await fs.readFile(path.join(projectRoot, 'packages/runtime/tsconfig.host.taskweaver.json'), 'utf8'))
  assert.ok(hostBuildConfig.references.some((entry) => entry.path === './packages/fs/tool-fs-search'), 'preset-only search plugin must be typecompiled before bundling, not deployed from stale lib/types')
  for (const required of ['./packages/fs/tool-fs-inline-edit', './packages/fs/tool-fs-semantic-search']) {
    assert.ok(
      hostBuildConfig.references.some((entry) => entry.path === required),
      `integrated ${required} must be listed in tsconfig.host.taskweaver.json (see build-host-runtime TASKWEAVER_FS_TOOLS)`,
    )
  }
  assert.match(buildScript, /TASKWEAVER_RUNTIME_PACKAGES|runtime-packages/)

  console.log(`Z runtime resolution passed: packaged resources, dev override, monorepo fallback (${TASKWEAVER_RUNTIME_PACKAGES}), host cwd, packaging paths.`)
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}
