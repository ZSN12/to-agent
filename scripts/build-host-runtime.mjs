#!/usr/bin/env node
/**
 * Build Z runtime deploy for TaskWeaver packaging (`packages/runtime` → vendor/taskweaver-z-runtime).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  resolveTaskWeaverHostLaunch,
  resolveRuntimeNodePath,
  TASKWEAVER_RUNTIME_PACKAGES,
  TASKWEAVER_RUNTIME_DEPLOY_DIR,
  TASKWEAVER_RUNTIME_CLIENT_DIR,
} from '../backend/agent/z-host/resolve-runtime.mjs'
import { scriptHostNodeExecutable } from './lib/host-node-executable.mjs'
import { assertTaskWeaverPresetDeployMatches } from '../backend/agent/z-host/preset-integrity.mjs'
import {
  copyPackageIntoStaging,
  finalizeRuntimeLayout,
  healDeployPackageClosure,
  packageHasRunnableEntry,
  runtimeModulesDir,
} from './runtime-deploy-closure.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const zRuntimeSource = path.join(root, 'packages', 'runtime')
const legacyOutputVariables = ['TASKWEAVER_DSH_RUNTIME_OUTPUT_DIR', 'TASKWEAVER_Z_RUNTIME_OUTPUT_DIR']
const legacyOutputValues = []
for (const name of legacyOutputVariables) {
  const value = process.env[name]
  if (!value) continue
  console.warn(`[TaskWeaver] ${name} 已弃用，请改用 TASKWEAVER_RUNTIME_OUTPUT_DIR。`)
  legacyOutputValues.push(value)
}
const rawOutDir = process.env.TASKWEAVER_RUNTIME_OUTPUT_DIR || legacyOutputValues[0]
const customOutDir = rawOutDir
  ? path.resolve(rawOutDir)
  : null
if (customOutDir) {
  const tempRoot = path.resolve(os.tmpdir())
  const safeBasename = /^taskweaver-(?:z|dsh)-runtime-build-[A-Za-z0-9._-]+$/
  if (path.dirname(customOutDir) !== tempRoot || !safeBasename.test(path.basename(customOutDir))) {
    throw new Error(`TASKWEAVER_RUNTIME_OUTPUT_DIR must be a dedicated taskweaver-z-runtime-build-* child of ${tempRoot}`)
  }
}
const targetOutDir = customOutDir ?? path.join(root, 'vendor', TASKWEAVER_RUNTIME_DEPLOY_DIR)
const legacyOutDir = path.join(root, 'vendor', 'taskweaver-dsh-runtime')

/** @returns {{ monorepoRoot: string, cliFilter: string, scope: string, label: string }} */
function resolveMonorepo() {
  const zReady = fs.existsSync(path.join(zRuntimeSource, 'host-cli/package.json'))
  if (!zReady) {
    throw new Error('缺少 packages/runtime；请确保已检出 Z 运行时源码树')
  }
  return { monorepoRoot: zRuntimeSource, cliFilter: '@taskweaver/dsh', scope: '@taskweaver/', label: 'Z Runtime' }
}
const skipBuild = process.argv.includes('--skip-build')
const skipDeploy = process.argv.includes('--skip-deploy')
// Build and patch a sibling staging tree. Keep the last known-good deploy in
// place until pnpm deploy, runtime repair, and all packaging checks succeed.
const outDir = skipDeploy
  ? targetOutDir
  : path.join(
      path.dirname(targetOutDir),
      `taskweaver-z-runtime-build-${path.basename(targetOutDir)}-${process.pid}-${Date.now()}`,
    )
const clientOut = path.join(outDir, TASKWEAVER_RUNTIME_CLIENT_DIR)
let stagingOutputOwned = false
const maxRepair = 80
const runtimeLockPath = path.join(root, 'runtime-lock.json')

async function readRuntimeLock() {
  const lock = JSON.parse(await fsp.readFile(runtimeLockPath, 'utf8'))
  if (lock?.schemaVersion !== 1 || (!lock?.runtime?.autonomous && !lock?.dsh?.commit) || !lock?.piAi?.version) {
    throw new Error('runtime-lock.json 格式无效')
  }
  return lock
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))))
  })
}

function pnpmBin() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

function pnpmArgs(args) {
  // Do not let pnpm's pre-run dependency check silently purge an existing
  // production-only node_modules tree when a local build needs dev tools.
  return ['--config.verify-deps-before-run=warn', ...args]
}

async function publishRuntimeBuild(stagingDir, targetDir) {
  const previousDir = path.join(
    path.dirname(targetDir),
    `.${path.basename(targetDir)}.previous-${process.pid}-${Date.now()}`,
  )
  let movedPrevious = false

  if (fs.existsSync(targetDir)) {
    await fsp.rename(targetDir, previousDir)
    movedPrevious = true
  }
  try {
    await fsp.rename(stagingDir, targetDir)
  } catch (error) {
    if (movedPrevious && !fs.existsSync(targetDir)) {
      await fsp.rename(previousDir, targetDir)
    }
    throw error
  }

  if (movedPrevious) {
    await fsp.rm(previousDir, { recursive: true, force: true }).catch((error) => {
      console.warn(`build-host-runtime: 新 deploy 已发布，但旧备份清理失败：${previousDir}`, error)
    })
  }
}

async function copyDir(from, to, filter) {
  await fsp.mkdir(to, { recursive: true })
  const entries = await fsp.readdir(from, { withFileTypes: true })
  for (const entry of entries) {
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (filter && !filter(src)) continue
    if (entry.isDirectory()) await copyDir(src, dest, filter)
    else await fsp.copyFile(src, dest)
  }
}

const MISSING_PKG = /Cannot find package '([^']+)'/
const MISSING_MODULE = /Cannot find module '[^']*\/node_modules\/((?:@[^/]+\/)?[^/']+)\//

async function tryBootSmoke(stagingRoot, homeDir) {
  const launch = resolveTaskWeaverHostLaunch(stagingRoot)
  const nodePath = resolveRuntimeNodePath(stagingRoot)
  return new Promise((resolve) => {
    const child = spawn(scriptHostNodeExecutable(), [launch.entrypoint, '--profile', 'web', '--host', '127.0.0.1', '--port', '0'], {
      cwd: launch.cwd,
      env: {
        ...process.env,
        TASKWEAVER_HOME: path.join(homeDir, 'runtime'),
        TASKWEAVER_TELEMETRY_DISABLED: '1',
        TASKWEAVER_EMBEDDED: '1',
        ...(nodePath ? { NODE_PATH: nodePath } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let buf = ''
    const done = (ok, detail) => {
      try { child.kill('SIGTERM') } catch { /* already exited */ }
      resolve({ ok, detail })
    }
    const timer = setTimeout(() => done(false, 'timeout'), 45_000)
    timer.unref?.()
    const onData = (chunk) => {
      buf = `${buf}${chunk}`.slice(-32_000)
      if (/expose-internals is required for HMR/i.test(buf)) {
        clearTimeout(timer)
        done(false, `hmr-crash\n${buf.slice(-4000)}`)
        return
      }
      if (/(?:z|dsh) web:\s+https?:\/\/127\.0\.0\.1:\d+/i.test(buf)) {
        clearTimeout(timer)
        done(true, buf.match(/(?:z|dsh) web:\s+(https?:\/\/127\.0\.0\.1:\d+)/i)?.[1] ?? 'ready')
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('close', (code) => {
      if (timer._destroyed) return
      clearTimeout(timer)
      const match = buf.match(MISSING_PKG) ?? buf.match(MISSING_MODULE)
      done(false, match ? `missing:${match[1]}` : `exit:${code}\n${buf.slice(-2000)}`)
    })
  })
}

async function repairClosure(stagingRoot, monorepoRoot) {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'tw-dsh-repair-'))
  const repairAttempts = new Map()
  try {
    for (let i = 0; i < maxRepair; i += 1) {
      const result = await tryBootSmoke(stagingRoot, home)
      if (result.ok) return result.detail
      if (!result.detail?.startsWith('missing:')) {
        throw new Error(`Z runtime 冒烟失败：${result.detail}`)
      }
      const pkg = result.detail.slice('missing:'.length)
      const attempts = repairAttempts.get(pkg) ?? 0
      if (attempts > 0) {
        throw new Error(
          `Z runtime 仍缺少 ${pkg}（已尝试补齐 ${attempts} 次）。`
          + ' 若 monorepo 仅有 src/ 无 lib/，请先执行 host-cli build:lib:host（勿使用 --skip-build）。',
        )
      }
      const copied = await copyPackageIntoStaging(monorepoRoot, stagingRoot, pkg, root)
      if (!copied) {
        throw new Error(
          `无法从 monorepo 补齐依赖：${pkg}（需已编译的 package main/exports 入口）。`
          + ' 请先执行 pnpm --dir packages/runtime run build:host。',
        )
      }
      repairAttempts.set(pkg, attempts + 1)
      console.log(`build-host-runtime: 补齐 ${pkg}`)
    }
    throw new Error(`Z runtime 依赖修复超过 ${maxRepair} 轮`)
  } finally {
    await fsp.rm(home, { recursive: true, force: true })
  }
}

/** API-only Host 不需要浏览器 dist / UI roster；deploy 若仍带上则删除。 */
async function pruneTaskWeaverBrowserFrontend(stagingRoot, scope) {
  const packageRoots = [
    path.join(runtimeModulesDir(stagingRoot), scope.replace(/\/$/, '')),
    path.join(stagingRoot, TASKWEAVER_RUNTIME_PACKAGES, '@taskweaver'),
  ]
  const exactNames = new Set([
    'dsh-web-frontend',
    'dsh-client-hmr',
    'dsh-client-modules',
    'dsh-client-locale',
    'dsh-cordis-client-runner',
    'dsh-host-frontend-static',
  ])
  for (const rootDir of packageRoots) {
    if (!fs.existsSync(rootDir)) continue
    const names = await fsp.readdir(rootDir)
    for (const name of names) {
      if (!exactNames.has(name) && !name.startsWith('dsh-client-ui-')) continue
      if (name === 'dsh-client-ui-slots') continue
      const dir = path.join(rootDir, name)
      await fsp.rm(dir, { recursive: true, force: true })
      console.log(`build-host-runtime: 已移除 API-only 不需要的 ${name}`)
    }
  }
}

/** 删除 host-cli/lib 里过期的 hash chunk，避免 entry 仍 import 旧的 deploy-layout。 */
async function pruneStaleCliHashedChunks(monorepoRoot) {
  const libDir = path.join(monorepoRoot, 'host-cli/lib')
  if (!fs.existsSync(libDir)) return
  const keep = new Set(['bin.js', 'entry.js'])
  for (const name of await fsp.readdir(libDir)) {
    if (!name.endsWith('.js') || keep.has(name)) continue
    if (/^[\w.-]+-[A-Za-z0-9_-]+\.js$/.test(name)) {
      await fsp.rm(path.join(libDir, name), { force: true })
    }
  }
}

/** tsdown 有时只更新 lib/types，入口 lib/index.js 需与 types 对齐（@taskweaver/dsh-home-paths 等）。 */
async function syncHostPackageRuntimeLibs(monorepoRoot) {
  const packages = [
    { label: '@taskweaver/dsh-app-boot', libDir: path.join(monorepoRoot, 'boot/app-boot/lib') },
    { label: '@taskweaver/dsh-subprocess', libDir: path.join(monorepoRoot, 'subprocess/subprocess/lib'), alwaysSyncIndex: true },
    { label: '@taskweaver/dsh-shell', libDir: path.join(monorepoRoot, 'shell/shell/lib'), alwaysSyncIndex: true },
    { label: '@taskweaver/dsh-shell-env', libDir: path.join(monorepoRoot, 'shell/shell-env/lib'), alwaysSyncIndex: true },
    { label: '@taskweaver/dsh-home-paths', libDir: path.join(monorepoRoot, 'util/home-paths/lib') },
    { label: '@taskweaver/dsh-launch-environment', libDir: path.join(monorepoRoot, 'util/launch-environment/lib') },
    { label: '@taskweaver/dsh-web', libDir: path.join(monorepoRoot, 'web/web/lib') },
    { label: '@taskweaver/dsh-web-search-taskweaver', libDir: path.join(monorepoRoot, 'web/web-search-taskweaver/lib') },
    { label: '@taskweaver/dsh-tool-web', libDir: path.join(monorepoRoot, 'web/tool-web/lib') },
    { label: '@taskweaver/dsh-orchestration', libDir: path.join(monorepoRoot, 'interaction/orchestration/lib'), alwaysSyncIndex: true },
    { label: '@taskweaver/dsh-tool-orchestrate', libDir: path.join(monorepoRoot, 'interaction/tool-orchestrate/lib'), alwaysSyncIndex: true },
    { label: '@taskweaver/ui-verify', libDir: path.join(monorepoRoot, 'interaction/ui-verify/lib') },
    { label: '@taskweaver/tool-ui-verify', libDir: path.join(monorepoRoot, 'interaction/tool-ui-verify/lib') },
    { label: '@taskweaver/dsh-tool-fs-semantic-search', libDir: path.join(monorepoRoot, 'fs/tool-fs-semantic-search/lib') },
  ]
  for (const { label, libDir, alwaysSyncIndex = false } of packages) {
    for (const name of ['index', 'invariant']) {
      const from = path.join(libDir, 'types', `${name}.js`)
      const to = path.join(libDir, `${name}.js`)
      if (!fs.existsSync(from)) continue
      const source = fs.readFileSync(from, 'utf8')
      const looksCjs = /Object\.defineProperty\(exports,\s*['"]__esModule['"]/.test(source)
      const destText = fs.existsSync(to) ? fs.readFileSync(to, 'utf8') : ''
      const needsRuntimeHomePath = name === 'index'
        && source.includes('runtimeHomePath')
        && !destText.includes('runtimeHomePath')
      if (looksCjs && !needsRuntimeHomePath) continue
      if (!fs.existsSync(to) || needsRuntimeHomePath || (name === 'index' && alwaysSyncIndex)) {
        await fsp.copyFile(from, to)
        console.log(`build-host-runtime: 同步 ${label}/lib/${name}.js`)
      }
    }
    const typesSrc = path.join(libDir, 'types', 'types.js')
    const typesDest = path.join(libDir, 'types.js')
    if (fs.existsSync(typesSrc)) {
      const needsCopy = !fs.existsSync(typesDest)
        || fs.statSync(typesDest).mtimeMs < fs.statSync(typesSrc).mtimeMs
      if (needsCopy) {
        await fsp.copyFile(typesSrc, typesDest)
        console.log(`build-host-runtime: 同步 ${label}/lib/types.js`)
      }
    }
    const typesDir = path.join(libDir, 'types')
    if (fs.existsSync(typesDir)) {
      for (const name of await fsp.readdir(typesDir)) {
        if (!name.endsWith('.js')) continue
        const from = path.join(typesDir, name)
        const to = path.join(libDir, name)
        const needsCopy = !fs.existsSync(to)
          || fs.statSync(to).mtimeMs < fs.statSync(from).mtimeMs
        if (needsCopy) {
          await fsp.copyFile(from, to)
          console.log(`build-host-runtime: 同步 ${label}/lib/${name}`)
        }
      }
    }
  }
}

async function assertTaskWeaverProfileBootBundled(monorepoRoot) {
  const libDir = path.join(monorepoRoot, 'host-cli/lib')
  const chunks = (await fsp.readdir(libDir).catch(() => [])).filter((name) => name.startsWith('profile-boot-') && name.endsWith('.js'))
  if (!chunks.length) return
  let worst = { name: '', size: 0, text: '' }
  for (const name of chunks) {
    const file = path.join(libDir, name)
    const text = await fsp.readFile(file, 'utf8')
    const size = text.length
    if (size > worst.size) worst = { name, size, text }
  }
  const hmrMounts = worst.text.includes('cordis-plugin-hmr') && /ctx\.plugin\(Hmr\b/.test(worst.text)
  const hmrMountIsEmbeddedGuarded = /if\s*\(\s*!taskweaverEmbedded\(\)\s*&&[\s\S]{0,2000}?ctx\.plugin\(Hmr\b/.test(worst.text)
  if (hmrMounts && !hmrMountIsEmbeddedGuarded) {
    throw new Error(`${worst.name} 在没有 TASKWEAVER_EMBEDDED 守卫时挂载 cordis-plugin-hmr`)
  }
}

function resolveCliBuildArtifact(monorepoRoot, ...relPaths) {
  for (const rel of relPaths) {
    const candidate = path.join(monorepoRoot, 'host-cli', rel)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

async function stageDeployedCliEntry(stagingRoot, monorepoRoot) {
  const libDir = path.join(stagingRoot, 'lib')
  await fsp.mkdir(libDir, { recursive: true })
  const bundledEntry = resolveCliBuildArtifact(monorepoRoot, 'lib/entry.js')
  if (bundledEntry && fs.readFileSync(bundledEntry, 'utf8').includes('ensureDeployNodeModules')) {
    await fsp.copyFile(bundledEntry, path.join(libDir, 'entry.js'))
    return
  }
  const deployLayoutFrom = resolveCliBuildArtifact(
    monorepoRoot,
    'lib/types/deploy-layout.js',
    'lib/deploy-layout.js',
  )
  if (!deployLayoutFrom) {
    throw new Error('缺少 DSH CLI entry/deploy-layout 构建产物（请先 pnpm run build:lib:host）')
  }
  await fsp.copyFile(deployLayoutFrom, path.join(libDir, 'deploy-layout.js'))
  const entry = `#!/usr/bin/env node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDeployNodeModules, migrateLegacyTaskWeaverHomePatch } from './deploy-layout.js'

const runtimeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
ensureDeployNodeModules(runtimeRoot)
migrateLegacyTaskWeaverHomePatch()

await import('./bin.js')
`
  await fsp.writeFile(path.join(libDir, 'entry.js'), entry, 'utf8')
}

/** Node-safe SessionManager (lib/types tree); deploy package omits this in favor of web client.js. */
async function stageTaskWeaverBridgeTransport(stagingRoot, taskweaverRepoRoot) {
  const from = path.join(taskweaverRepoRoot, 'packages', 'provider-bridge-transport')
  const index = path.join(from, 'index.mjs')
  if (!fs.existsSync(index)) {
    throw new Error(`缺少 TaskWeaver Provider Bridge transport：${index}`)
  }
  const providerBridgeFrom = path.join(taskweaverRepoRoot, 'packages', 'provider-bridge')
  const providerBridgeEntry = ['lib/index.mjs', 'lib/index.js']
    .map((rel) => path.join(providerBridgeFrom, rel))
    .find((candidate) => fs.existsSync(candidate))
  if (!providerBridgeEntry) {
    throw new Error(`缺少已构建的 @taskweaver/provider-bridge（lib/index.mjs）；请先运行 pnpm run build:host`)
  }
  const providerBridgePackage = path.join(runtimeModulesDir(stagingRoot), '@taskweaver', 'provider-bridge')
  await fsp.rm(providerBridgePackage, { recursive: true, force: true })
  await copyDir(providerBridgeFrom, providerBridgePackage, (p) => (
    !path.relative(providerBridgeFrom, p).split(path.sep).includes('node_modules')
  ))
  if (!packageHasRunnableEntry(providerBridgePackage)) {
    throw new Error(`@taskweaver/provider-bridge 构建产物不完整：${providerBridgePackage}`)
  }
  const providerManifest = JSON.parse(await fsp.readFile(path.join(providerBridgePackage, 'package.json'), 'utf8'))
  for (const dependency of Object.keys(providerManifest.dependencies ?? {})) {
    const dest = path.join(runtimeModulesDir(stagingRoot), ...dependency.split('/'))
    if (fs.existsSync(dest)) continue
    let copied = await copyPackageIntoStaging(taskweaverRepoRoot, stagingRoot, dependency, root)
    if (!copied) copied = await copyPackageIntoStaging(root, stagingRoot, dependency, root)
    if (!copied) {
      throw new Error(`Runtime deploy 缺少 Provider Bridge 依赖 ${dependency}；请确认 Host CLI 声明了 @taskweaver/provider-bridge`)
    }
  }
  const destRoot = path.join(stagingRoot, 'electron-vendor', 'taskweaver-bridge-transport')
  await fsp.rm(destRoot, { recursive: true, force: true })
  await copyDir(from, destRoot, (p) => !path.relative(from, p).split(path.sep).includes('node_modules'))
  await fsp.rm(path.join(destRoot, 'node_modules'), { recursive: true, force: true }).catch(() => {})
  const stagedBridgeLib = path.join(stagingRoot, 'electron-vendor', 'provider-bridge')
  await fsp.rm(stagedBridgeLib, { recursive: true, force: true })
  await copyDir(providerBridgeFrom, stagedBridgeLib, (p) => (
    !path.relative(providerBridgeFrom, p).split(path.sep).includes('node_modules')
  ))
  const cursorLoader = await fsp.readFile(path.join(destRoot, 'cursor-adapter-loader.mjs'), 'utf8')
  if (!cursorLoader.includes('@taskweaver/provider-bridge') || cursorLoader.includes('src/adapters/cursor.ts')) {
    throw new Error(
      'taskweaver-bridge-transport/cursor-adapter-loader.mjs 仍指向 OpenCodex TypeScript；请使用 packages/provider-bridge-transport 中的编译桥接加载器',
    )
  }
  console.log('build-host-runtime: 已打入 @taskweaver/provider-bridge 与 electron-vendor/taskweaver-bridge-transport')
}

async function stageDshChatRegistry(stagingRoot) {
  const from = path.join(root, 'backend', 'vendor', 'dsh-chat-registry.mjs')
  if (!fs.existsSync(from)) {
    throw new Error('缺少 backend/vendor/dsh-chat-registry.mjs；请先运行 scripts/build-dsh-chat-registry.mjs')
  }
  const destRoot = path.join(stagingRoot, 'electron-vendor')
  await fsp.mkdir(destRoot, { recursive: true })
  await fsp.copyFile(from, path.join(destRoot, 'dsh-chat-registry.mjs'))
  console.log('build-host-runtime: 已打入 backend-vendor/dsh-chat-registry.mjs')
}

async function stageMainProcessSessionManagerLib(stagingRoot, monorepoRoot) {
  const srcTypes = path.join(monorepoRoot, 'client/runtime/lib/types')
  const manager = path.join(srcTypes, 'client/sessions/manager.js')
  if (!fs.existsSync(manager)) {
    console.warn(
      'build-host-runtime: client/runtime/lib/types 未构建，主进程 SessionManager 将不可用（请先构建 runtime client face）',
    )
    return
  }
  const destRoot = path.join(stagingRoot, 'electron-vendor', 'dsh-client-runtime-lib')
  const destTypes = path.join(destRoot, 'lib/types')
  await fsp.rm(destRoot, { recursive: true, force: true })
  await copyDir(srcTypes, destTypes)
  console.log('build-host-runtime: 已打入 electron-vendor/dsh-client-runtime-lib（SessionManager）')
}

async function stageApiClient(stagingRoot, scope) {
  const rel = 'lib/types/client/web-api-client.js'
  const from = path.join(runtimeModulesDir(stagingRoot), `${scope}dsh-client-connection`, rel)
  if (!fs.existsSync(from)) {
    throw new Error(`部署产物缺少 ApiProxy 客户端：${from}`)
  }
  const packageDir = path.dirname(path.dirname(path.dirname(path.dirname(from))))
  const clientSourceDir = path.join(packageDir, 'lib/types/client')
  const clientDestDir = path.join(clientOut, 'lib/types/client')
  await fsp.rm(clientDestDir, { recursive: true, force: true })
  await copyDir(clientSourceDir, clientDestDir)
  const apiPathSource = path.join(packageDir, 'lib/types/api-path.js')
  if (fs.existsSync(apiPathSource)) {
    const apiPathDest = path.join(clientOut, 'lib/types/api-path.js')
    await fsp.mkdir(path.dirname(apiPathDest), { recursive: true })
    await fsp.copyFile(apiPathSource, apiPathDest)
  }
  const pkgFrom = path.join(runtimeModulesDir(stagingRoot), `${scope}dsh-client-connection/package.json`)
  if (fs.existsSync(pkgFrom)) {
    await fsp.copyFile(pkgFrom, path.join(clientOut, 'package.json'))
  }
}

const TASKWEAVER_FS_TOOLS = [
  { ref: './fs/tool-document', name: '@taskweaver/dsh-tool-document', id: 'tool-document' },
  { ref: './fs/tool-fs-inline-edit', name: '@taskweaver/dsh-tool-fs-inline-edit', id: 'tool-fs-inline-edit' },
  { ref: './fs/tool-fs-semantic-search', name: '@taskweaver/dsh-tool-fs-semantic-search', id: 'tool-fs-semantic-search' },
]

const TASKWEAVER_ORCHESTRATION_TOOL = {
  ref: './interaction/tool-orchestrate',
  name: '@taskweaver/dsh-tool-orchestrate',
  packageDir: 'interaction/tool-orchestrate',
}

function assertTaskWeaverFsToolsIntegrated(monorepoRoot) {
  const hostTsconfigPath = path.join(monorepoRoot, 'tsconfig.host.taskweaver.json')
  if (!fs.existsSync(hostTsconfigPath)) throw new Error('缺少 TaskWeaver Host TypeScript 配置')
  const hostTsconfig = JSON.parse(fs.readFileSync(hostTsconfigPath, 'utf8'))
  const refs = hostTsconfig.references ?? []
  const cliPackage = JSON.parse(fs.readFileSync(path.join(monorepoRoot, 'host-cli', 'package.json'), 'utf8'))
  const cliDependencies = cliPackage.dependencies ?? {}
  for (const tool of TASKWEAVER_FS_TOOLS) {
    if (!refs.some((entry) => entry.path === tool.ref)) {
      throw new Error(
        `tsconfig.host.taskweaver.json 缺少已启用文件系统能力 ${tool.ref}`,
      )
    }
    if (!cliDependencies[tool.name]) throw new Error(`host-cli/package.json 缺少运行时依赖 ${tool.name}`)
    const packageJson = path.join(monorepoRoot, 'fs', tool.ref.split('/').at(-1), 'package.json')
    if (!fs.existsSync(packageJson)) throw new Error(`缺少已接入插件包：${packageJson}`)
    for (const preset of ['tw-default', 'tw-taskweaver-code']) {
      const presetPath = path.join(monorepoRoot, 'host-cli', 'config', 'agent-presets', preset, 'agent.cordis.yml')
      const source = fs.readFileSync(presetPath, 'utf8')
      if (!source.includes(`id: ${tool.id}`) || !source.includes(`name: '${tool.name}'`)) {
        throw new Error(`${preset} preset 未挂载 ${tool.name}`)
      }
    }
  }
  const orchestration = TASKWEAVER_ORCHESTRATION_TOOL
  if (!refs.some((entry) => entry.path === orchestration.ref)) {
    throw new Error(`tsconfig.host.taskweaver.json 缺少 DAG 编排工具 ${orchestration.ref}`)
  }
  if (!cliDependencies[orchestration.name]) {
    throw new Error(`host-cli/package.json 缺少运行时依赖 ${orchestration.name}`)
  }
  if (!fs.existsSync(path.join(monorepoRoot, orchestration.packageDir, 'package.json'))) {
    throw new Error(`缺少已接入插件包：${orchestration.packageDir}`)
  }
  for (const preset of ['tw-default', 'tw-code']) {
    const presetPath = path.join(monorepoRoot, 'host-cli', 'config', 'agent-presets', preset, 'agent.cordis.yml')
    const source = fs.readFileSync(presetPath, 'utf8')
    if (!source.includes('id: tool-orchestrate') || !source.includes(`name: '${orchestration.name}'`)) {
      throw new Error(`${preset} preset 未挂载 ${orchestration.name}`)
    }
    if (source.includes('tool-subagent') || source.includes('tool-workflow') || source.includes('tool-ralph')) {
      throw new Error(`${preset} preset 仍包含直接子 Agent 工具`)
    }
  }
}

async function main() {
  if (!customOutDir && !fs.existsSync(targetOutDir) && fs.existsSync(legacyOutDir)) {
    console.log(`build-host-runtime: 迁移 ${legacyOutDir} → ${targetOutDir}`)
    await fsp.rename(legacyOutDir, targetOutDir)
  }
  const runtimeLock = await readRuntimeLock()
  const { monorepoRoot, cliFilter, scope, label } = resolveMonorepo()
  if (!fs.existsSync(monorepoRoot)) {
    throw new Error(`缺少 runtime monorepo：${monorepoRoot}`)
  }
  console.log(`build-host-runtime: 使用 ${label}（${monorepoRoot}）`)
  assertTaskWeaverFsToolsIntegrated(monorepoRoot)
  const taskweaverBuildEnv = {
    ...process.env,
    CI: 'true',
    npm_config_ignore_scripts: 'true',
  }
  const zNodeModules = path.join(monorepoRoot, 'node_modules')
  const zTsdown = path.join(zNodeModules, 'tsdown', 'dist', 'run.mjs')
  if (monorepoRoot === zRuntimeSource && (!fs.existsSync(zTsdown) || !fs.existsSync(path.join(zNodeModules, '.bin', 'tsc')))) {
    console.log('build-host-runtime: packages/runtime pnpm install --ignore-scripts …')
    await run(pnpmBin(), pnpmArgs(['install', '--ignore-scripts']), { cwd: monorepoRoot, env: taskweaverBuildEnv })
  }
  if (!skipBuild) {
    console.log('build-host-runtime: 构建 @taskweaver/provider-bridge …')
    await run(pnpmBin(), pnpmArgs(['--dir', path.join(root, 'packages', 'provider-bridge'), 'run', 'build']), {
      cwd: root,
      env: taskweaverBuildEnv,
    })
    console.log(`build-host-runtime: ${label} host-cli build:lib:host …`)
    const tscBin = path.join(monorepoRoot, 'node_modules/.bin/tsc')
    const tsdownBin = path.join(monorepoRoot, 'node_modules/.bin/tsdown')
    // The runtime solution config builds the TaskWeaver Host plus its minimal
    // Client graph in one dependency-aware TypeScript pass.
    await run(tscBin, ['-b', 'tsconfig.host.taskweaver.json'], { cwd: monorepoRoot, env: taskweaverBuildEnv })
    await pruneStaleCliHashedChunks(monorepoRoot)
    await run(tsdownBin, ['--env.TASKWEAVER_BUILD_FACE', 'host', '--filter', '@taskweaver/dsh'], { cwd: monorepoRoot, env: taskweaverBuildEnv })
    await syncHostPackageRuntimeLibs(monorepoRoot)
    await assertTaskWeaverProfileBootBundled(monorepoRoot)
  }
  if (!skipDeploy) {
    console.log(`build-host-runtime: pnpm deploy → ${outDir}`)
    if (fs.existsSync(outDir)) throw new Error(`Runtime staging path already exists; refusing to overwrite: ${outDir}`)
    stagingOutputOwned = true
    await run(pnpmBin(), pnpmArgs([
      '--filter', cliFilter, 'deploy',
      '--legacy', '--prod',
      '--config.node-linker=hoisted',
      '--config.auto-install-peers=false',
      '--config.link-workspace-packages=false',
      '--config.ignore-scripts=true',
      outDir,
    ]), { cwd: monorepoRoot, env: { ...process.env, CI: 'true' } })
    for (const doc of ['README.md', 'README.zh.md', 'README.i18n.yaml']) {
      await fsp.rm(path.join(outDir, doc), { force: true })
    }
  } else if (!fs.existsSync(outDir)) {
    throw new Error(`--skip-deploy 但 vendor/${TASKWEAVER_RUNTIME_DEPLOY_DIR} 不存在`)
  }
  await healDeployPackageClosure({
    monorepoRoot,
    stagingRoot: outDir,
    desktopRepoRoot: root,
  })
  await stageDeployedCliEntry(outDir, monorepoRoot)
  const presetIntegrity = await assertTaskWeaverPresetDeployMatches(
    path.join(monorepoRoot, 'host-cli', 'config', 'agent-presets'),
    path.join(outDir, 'config', 'agent-presets'),
  )
  console.log(`build-host-runtime: TaskWeaver agent presets match source (${presetIntegrity.presets.map((preset) => preset.id).join(', ')})`)
  await finalizeRuntimeLayout(outDir)
  const url = await repairClosure(outDir, monorepoRoot)
  await pruneTaskWeaverBrowserFrontend(outDir, scope)
  await stageApiClient(outDir, scope)
  await stageTaskWeaverBridgeTransport(outDir, root)
  await stageMainProcessSessionManagerLib(outDir, monorepoRoot)
  console.log('build-host-runtime: 同步 dsh-chat-registry …')
  await run(process.execPath, [path.join(root, 'scripts/build-dsh-chat-registry.mjs')])
  await stageDshChatRegistry(outDir)
  console.log('build-host-runtime: 校验锁定的 pi-ai 版本 …')
  const packagesRoot = resolveRuntimeNodePath(outDir) ?? runtimeModulesDir(outDir)
  const piPackage = JSON.parse(await fsp.readFile(path.join(
    packagesRoot,
    '@earendil-works',
    'pi-ai',
    'package.json',
  ), 'utf8'))
  if (piPackage.version !== runtimeLock.piAi.version) {
    throw new Error(`Runtime pi-ai ${piPackage.version} 与 runtime-lock ${runtimeLock.piAi.version} 不一致`)
  }
  await finalizeRuntimeLayout(outDir)
  await fsp.writeFile(
    path.join(outDir, 'taskweaver-runtime-meta.json'),
    `${JSON.stringify({ ...runtimeLock, builtAt: new Date().toISOString(), apiOnlyHost: true }, null, 2)}\n`,
  )
  if (!skipDeploy) {
    await publishRuntimeBuild(outDir, targetOutDir)
    stagingOutputOwned = false
  }
  console.log(`build-host-runtime: 完成（冒烟 ${url}）`)
}

main().catch(async (error) => {
  if (stagingOutputOwned) {
    await fsp.rm(outDir, { recursive: true, force: true }).catch((cleanupError) => {
      console.warn(`build-host-runtime: staging 清理失败：${outDir}`, cleanupError)
    })
  }
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
