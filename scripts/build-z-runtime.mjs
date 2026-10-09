#!/usr/bin/env node
/**
 * Build Z runtime deploy for TaskWeaver packaging (`vendor/z-runtime` → vendor/taskweaver-z-runtime).
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  resolveTaskWeaverHostLaunch,
  resolveRuntimeNodePath,
  TASKWEAVER_RUNTIME_PACKAGES,
  TASKWEAVER_Z_RUNTIME_DEPLOY_DIR,
  TASKWEAVER_Z_RUNTIME_CLIENT_DIR,
} from '../electron/agent/z-host/resolve-runtime.mjs'
import { assertTaskWeaverPresetDeployMatches } from '../electron/agent/z-host/preset-integrity.mjs'
import { patchTaskWeaverRuntimeNoHmr, patchZRuntimeSourceBundlesNoHmr } from './patch-taskweaver-runtime-no-hmr.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const zRuntimeSource = path.join(root, 'vendor', 'z-runtime')
const rawOutDir = process.env.TASKWEAVER_Z_RUNTIME_OUTPUT_DIR || process.env.TASKWEAVER_DSH_RUNTIME_OUTPUT_DIR
const customOutDir = rawOutDir
  ? path.resolve(rawOutDir)
  : null
if (customOutDir) {
  const tempRoot = path.resolve(os.tmpdir())
  const safeBasename = /^taskweaver-(?:z|dsh)-runtime-build-[A-Za-z0-9._-]+$/
  if (path.dirname(customOutDir) !== tempRoot || !safeBasename.test(path.basename(customOutDir))) {
    throw new Error(`TASKWEAVER_Z_RUNTIME_OUTPUT_DIR must be a dedicated taskweaver-z-runtime-build-* child of ${tempRoot}`)
  }
}
const targetOutDir = customOutDir ?? path.join(root, 'vendor', TASKWEAVER_Z_RUNTIME_DEPLOY_DIR)
const legacyOutDir = path.join(root, 'vendor', 'taskweaver-dsh-runtime')

/** @returns {{ monorepoRoot: string, cliFilter: string, scope: string, label: string }} */
function resolveMonorepo() {
  const zReady = fs.existsSync(path.join(zRuntimeSource, 'apps/cli/package.json'))
  if (!zReady) {
    throw new Error('缺少 vendor/z-runtime；请确保已检出 Z 运行时源码树')
  }
  return { monorepoRoot: zRuntimeSource, cliFilter: '@z/dsh', scope: '@z/', label: 'Z Runtime' }
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
const clientOut = path.join(outDir, TASKWEAVER_Z_RUNTIME_CLIENT_DIR)
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
      console.warn(`build-z-runtime: 新 deploy 已发布，但旧备份清理失败：${previousDir}`, error)
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

/** Workspace packages that pnpm deploy omits but agent presets import at runtime. */
function monorepoPackagePaths(scope) {
  return {
    [`${scope}dsh-workflow`]: 'packages/workflow/workflow',
  }
}

function packageHasRunnableEntry(pkgDir) {
  const pkgJsonPath = path.join(pkgDir, 'package.json')
  if (!fs.existsSync(pkgJsonPath)) return false
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    const candidates = []
    if (typeof pkg.main === 'string') candidates.push(pkg.main)
    const dotExport = pkg.exports?.['.']
    if (typeof dotExport === 'string') candidates.push(dotExport)
    else if (dotExport && typeof dotExport.default === 'string') candidates.push(dotExport.default)
    if (!candidates.length) candidates.push('index.js')
    return candidates.some((rel) => fs.existsSync(path.join(pkgDir, rel)))
  } catch {
    return false
  }
}

function resolvePackageDir(monorepoRoot, stagingRoot, packageName) {
  const candidates = []
  // Prefer deploy staging (pnpm 已带 lib/)，避免用 monorepo 源码树覆盖掉可运行副本。
  const roots = [stagingRoot, monorepoRoot].filter(Boolean)
  for (const rootDir of roots) {
    try {
      const launch = resolveTaskWeaverHostLaunch(rootDir)
      const require = createRequire(launch.entrypoint)
      candidates.push(path.dirname(require.resolve(`${packageName}/package.json`)))
    } catch {
      /* try next root */
    }
  }
  if (monorepoRoot) {
    const scope = packageName.startsWith('@z/') ? '@z/' : '@deepseek-ai/'
    const rel = monorepoPackagePaths(scope)[packageName]
    if (rel) {
      candidates.push(path.join(monorepoRoot, rel))
    }
    const short = packageName.replace(/^@[^/]+\//, '')
    candidates.push(path.join(monorepoRoot, 'vendor', short))
  }
  for (const dir of candidates) {
    if (packageHasRunnableEntry(dir)) return dir
  }
  return null
}

async function copyPackageIntoStaging(monorepoRoot, stagingRoot, packageName) {
  const dest = path.join(runtimeModulesDir(stagingRoot), ...packageName.split('/'))
  if (packageHasRunnableEntry(dest)) return true
  const pkgDir = resolvePackageDir(monorepoRoot, stagingRoot, packageName)
  if (!pkgDir) return false
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  await copyDir(pkgDir, dest, (p) => {
    const rel = path.relative(pkgDir, p)
    return !rel.split(path.sep).includes('node_modules')
  })
  return packageHasRunnableEntry(dest)
}

const MISSING_PKG = /Cannot find package '([^']+)'/
const MISSING_MODULE = /Cannot find module '[^']*\/node_modules\/((?:@[^/]+\/)?[^/']+)\//

/**
 * pnpm deploy 会带上 preset 插件，但 peer 依赖（如 dsh-workflow）不会自动落地；
 * `code` preset 在首条消息挂载 workflow-worker-thread 时会因此失败。
 */
/** pnpm deploy 常漏掉 workspace vendor 与 preset peer，启动冒烟前强制补齐。 */
function runtimePeerPackages(scope) {
  return [`${scope}cosmokit`, `${scope}schemastery`, `${scope}dsh-workflow`]
}

async function ensureRuntimePeerPackages(stagingRoot, monorepoRoot, scope) {
  for (const packageName of runtimePeerPackages(scope)) {
    const pkgJson = path.join(runtimeModulesDir(stagingRoot), ...packageName.split('/'), 'package.json')
    if (fs.existsSync(pkgJson)) continue
    const copied = await copyPackageIntoStaging(monorepoRoot, stagingRoot, packageName)
    if (!copied) throw new Error(`无法从 monorepo 补齐 runtime peer：${packageName}`)
    console.log(`build-z-runtime: 预补齐 ${packageName}`)
  }
}

function runtimeModulesDir(stagingRoot) {
  return path.join(stagingRoot, 'node_modules')
}

async function relayoutRuntimePackagesForPackaging(outDir) {
  const nm = path.join(outDir, 'node_modules')
  const rp = path.join(outDir, TASKWEAVER_RUNTIME_PACKAGES)
  if (!fs.existsSync(nm)) return
  if (fs.existsSync(rp)) await fsp.rm(rp, { recursive: true, force: true })
  await fsp.rename(nm, rp)
  const resolverLink = path.join(outDir, 'node_modules')
  if (!fs.existsSync(resolverLink)) {
    await fsp.symlink(TASKWEAVER_RUNTIME_PACKAGES, resolverLink, 'dir')
    console.log('build-z-runtime: node_modules → runtime-packages（@z/* 可解析）')
  }
  console.log(`build-z-runtime: ${TASKWEAVER_RUNTIME_PACKAGES}（供 electron-builder 打包）`)
}

async function tryBootSmoke(stagingRoot, homeDir) {
  const launch = resolveTaskWeaverHostLaunch(stagingRoot)
  const nodePath = resolveRuntimeNodePath(stagingRoot)
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [launch.entrypoint, 'web', '--no-open', '--port', '0'], {
      cwd: launch.cwd,
      env: {
        ...process.env,
        Z_HOME: path.join(homeDir, 'z'),
        Z_TELEMETRY_DISABLED: '1',
        Z_TASKWEAVER_EMBEDDED: '1',
        DSH_HOME: path.join(homeDir, 'z'),
        DSH_TELEMETRY_DISABLED: '1',
        DSH_TASKWEAVER_EMBEDDED: '1',
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
          + ' 若 monorepo 仅有 src/ 无 lib/，请先执行 apps/cli build:lib:host（勿使用 --skip-build）。',
        )
      }
      const copied = await copyPackageIntoStaging(monorepoRoot, stagingRoot, pkg)
      if (!copied) {
        throw new Error(
          `无法从 monorepo 补齐依赖：${pkg}（需已编译的 package main/exports 入口）。`
          + ' 请先执行 vendor/z-runtime 的 tsc -b tsconfig.host.json。',
        )
      }
      repairAttempts.set(pkg, attempts + 1)
      console.log(`build-z-runtime: 补齐 ${pkg}`)
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
    path.join(stagingRoot, TASKWEAVER_RUNTIME_PACKAGES, '@z'),
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
      console.log(`build-z-runtime: 已移除 API-only 不需要的 ${name}`)
    }
  }
}

/** 删除 apps/cli/lib 里过期的 hash chunk，避免 entry 仍 import 旧的 deploy-layout。 */
async function pruneStaleCliHashedChunks(monorepoRoot) {
  const libDir = path.join(monorepoRoot, 'apps/cli/lib')
  if (!fs.existsSync(libDir)) return
  const keep = new Set(['bin.js', 'entry.js'])
  for (const name of await fsp.readdir(libDir)) {
    if (!name.endsWith('.js') || keep.has(name)) continue
    if (/^[\w.-]+-[A-Za-z0-9_-]+\.js$/.test(name)) {
      await fsp.rm(path.join(libDir, name), { force: true })
    }
  }
}

/** tsdown 有时只更新 lib/types，入口 lib/index.js 需与 types 对齐（@z/dsh-home-paths 等）。 */
async function syncHostPackageRuntimeLibs(monorepoRoot) {
  const homePaths = path.join(monorepoRoot, 'packages/util/home-paths/lib')
  for (const name of ['index', 'invariant']) {
    const from = path.join(homePaths, 'types', `${name}.js`)
    const to = path.join(homePaths, `${name}.js`)
    if (!fs.existsSync(from)) continue
    const needsCopy = !fs.existsSync(to)
      || fs.statSync(to).mtimeMs < fs.statSync(from).mtimeMs
    if (needsCopy) {
      await fsp.copyFile(from, to)
      console.log(`build-z-runtime: 同步 @z/dsh-home-paths/lib/${name}.js`)
    }
  }
}

async function assertTaskWeaverProfileBootBundled(monorepoRoot) {
  const libDir = path.join(monorepoRoot, 'apps/cli/lib')
  const chunks = (await fsp.readdir(libDir).catch(() => [])).filter((name) => name.startsWith('profile-boot-') && name.endsWith('.js'))
  if (!chunks.length) return
  let worst = { name: '', size: 0, text: '' }
  for (const name of chunks) {
    const file = path.join(libDir, name)
    const text = await fsp.readFile(file, 'utf8')
    const size = text.length
    if (size > worst.size) worst = { name, size, text }
  }
  if (worst.text.includes('cordis-plugin-hmr') && /mount.*hmr|plugin-hmr/i.test(worst.text)) {
    throw new Error(`${worst.name} 仍在启动后挂载 cordis-plugin-hmr；请先 pnpm run build:lib:host 或从 vendor 同步无 HMR 的 profile-boot`)
  }
}

function resolveCliBuildArtifact(monorepoRoot, ...relPaths) {
  for (const rel of relPaths) {
    const candidate = path.join(monorepoRoot, 'apps/cli', rel)
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
  const from = path.join(taskweaverRepoRoot, 'packages', 'taskweaver-bridge-transport')
  const index = path.join(from, 'index.mjs')
  if (!fs.existsSync(index)) {
    console.warn('build-z-runtime: 跳过 taskweaver-bridge-transport（仓库包不存在）')
    return
  }
  const destRoot = path.join(stagingRoot, 'electron-vendor', 'taskweaver-bridge-transport')
  await fsp.rm(destRoot, { recursive: true, force: true })
  await copyDir(from, destRoot)
  console.log('build-z-runtime: 已打入 electron-vendor/taskweaver-bridge-transport')
}

async function stageDshChatRegistry(stagingRoot) {
  const from = path.join(root, 'electron', 'vendor', 'dsh-chat-registry.mjs')
  if (!fs.existsSync(from)) {
    throw new Error('缺少 electron/vendor/dsh-chat-registry.mjs；请先运行 scripts/build-dsh-chat-registry.mjs')
  }
  const destRoot = path.join(stagingRoot, 'electron-vendor')
  await fsp.mkdir(destRoot, { recursive: true })
  await fsp.copyFile(from, path.join(destRoot, 'dsh-chat-registry.mjs'))
  console.log('build-z-runtime: 已打入 electron-vendor/dsh-chat-registry.mjs')
}

async function stageMainProcessSessionManagerLib(stagingRoot, monorepoRoot) {
  const srcTypes = path.join(monorepoRoot, 'packages/client/runtime/lib/types')
  const manager = path.join(srcTypes, 'client/sessions/manager.js')
  if (!fs.existsSync(manager)) {
    console.warn(
      'build-z-runtime: packages/client/runtime/lib/types 未构建，主进程 SessionManager 将不可用（请在 z-runtime 内 build client face）',
    )
    return
  }
  const destRoot = path.join(stagingRoot, 'electron-vendor', 'dsh-client-runtime-lib')
  const destTypes = path.join(destRoot, 'lib/types')
  await fsp.rm(destRoot, { recursive: true, force: true })
  await copyDir(srcTypes, destTypes)
  console.log('build-z-runtime: 已打入 electron-vendor/dsh-client-runtime-lib（SessionManager）')
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
  { ref: './packages/fs/tool-fs-inline-edit', name: '@z/dsh-tool-fs-inline-edit', id: 'tool-fs-inline-edit' },
  { ref: './packages/fs/tool-fs-semantic-search', name: '@z/dsh-tool-fs-semantic-search', id: 'tool-fs-semantic-search' },
]

function assertTaskWeaverFsToolsIntegrated(monorepoRoot) {
  const hostTsconfigPath = path.join(monorepoRoot, 'tsconfig.host.taskweaver.json')
  if (!fs.existsSync(hostTsconfigPath)) throw new Error('缺少 TaskWeaver Host TypeScript 配置')
  const hostTsconfig = JSON.parse(fs.readFileSync(hostTsconfigPath, 'utf8'))
  const refs = hostTsconfig.references ?? []
  const cliPackage = JSON.parse(fs.readFileSync(path.join(monorepoRoot, 'apps', 'cli', 'package.json'), 'utf8'))
  const cliDependencies = cliPackage.dependencies ?? {}
  for (const tool of TASKWEAVER_FS_TOOLS) {
    if (!refs.some((entry) => entry.path === tool.ref)) {
      throw new Error(
        `tsconfig.host.taskweaver.json 缺少已启用文件系统能力 ${tool.ref}`,
      )
    }
    if (!cliDependencies[tool.name]) throw new Error(`apps/cli/package.json 缺少运行时依赖 ${tool.name}`)
    const packageJson = path.join(monorepoRoot, 'packages', 'fs', tool.ref.split('/').at(-1), 'package.json')
    if (!fs.existsSync(packageJson)) throw new Error(`缺少已接入插件包：${packageJson}`)
    for (const preset of ['standard', 'taskweaver-code']) {
      const presetPath = path.join(monorepoRoot, 'apps', 'cli', 'config', 'agent-presets', preset, 'agent.cordis.yml')
      const source = fs.readFileSync(presetPath, 'utf8')
      if (!source.includes(`id: ${tool.id}`) || !source.includes(`name: '${tool.name}'`)) {
        throw new Error(`${preset} preset 未挂载 ${tool.name}`)
      }
    }
  }
}

async function main() {
  if (!customOutDir && !fs.existsSync(targetOutDir) && fs.existsSync(legacyOutDir)) {
    console.log(`build-z-runtime: 迁移 ${legacyOutDir} → ${targetOutDir}`)
    await fsp.rename(legacyOutDir, targetOutDir)
  }
  const runtimeLock = await readRuntimeLock()
  const { monorepoRoot, cliFilter, scope, label } = resolveMonorepo()
  if (!fs.existsSync(monorepoRoot)) {
    throw new Error(`缺少 runtime monorepo：${monorepoRoot}`)
  }
  console.log(`build-z-runtime: 使用 ${label}（${monorepoRoot}）`)
  assertTaskWeaverFsToolsIntegrated(monorepoRoot)
  const dshBuildEnv = {
    ...process.env,
    CI: 'true',
    npm_config_ignore_scripts: 'true',
  }
  const zNodeModules = path.join(monorepoRoot, 'node_modules')
  const zTsdown = path.join(zNodeModules, 'tsdown', 'dist', 'run.mjs')
  if (monorepoRoot === zRuntimeSource && (!fs.existsSync(zTsdown) || !fs.existsSync(path.join(zNodeModules, '.bin', 'tsc')))) {
    console.log('build-z-runtime: vendor/z-runtime pnpm install --ignore-scripts …')
    await run(pnpmBin(), ['install', '--ignore-scripts'], { cwd: monorepoRoot, env: dshBuildEnv })
  }
  if (!skipBuild) {
    console.log(`build-z-runtime: ${label} apps/cli build:lib:host …`)
    const hostTsconfig = fs.existsSync(path.join(monorepoRoot, 'tsconfig.host.taskweaver.json'))
      ? 'tsconfig.host.taskweaver.json'
      : 'tsconfig.host.json'
    const tscBin = path.join(monorepoRoot, 'node_modules/.bin/tsc')
    const tsdownBin = path.join(monorepoRoot, 'node_modules/.bin/tsdown')
    await run(tscBin, ['-b', hostTsconfig], { cwd: monorepoRoot, env: dshBuildEnv })
    await pruneStaleCliHashedChunks(monorepoRoot)
    await run(tsdownBin, ['--env.DSH_BUILD_FACE', 'host'], { cwd: monorepoRoot, env: dshBuildEnv })
    await run(tsdownBin, ['--env.DSH_BUILD_FACE', 'host', '--filter', '@z/dsh'], { cwd: monorepoRoot, env: dshBuildEnv })
    await syncHostPackageRuntimeLibs(monorepoRoot)
    console.log('build-z-runtime: 最小 client 编译（SessionManager / web-api-client，无 UI roster）')
    const minClientTsconfig = fs.existsSync(path.join(monorepoRoot, 'tsconfig.client.taskweaver-min.json'))
      ? 'tsconfig.client.taskweaver-min.json'
      : (fs.existsSync(path.join(monorepoRoot, 'tsconfig.client.taskweaver.json'))
        ? 'tsconfig.client.taskweaver.json'
        : 'tsconfig.client.json')
    await run(tscBin, ['-b', minClientTsconfig], { cwd: monorepoRoot, env: dshBuildEnv })
    await assertTaskWeaverProfileBootBundled(monorepoRoot)
  }
  if (!skipDeploy) {
    console.log(`build-z-runtime: pnpm deploy → ${outDir}`)
    if (fs.existsSync(outDir)) throw new Error(`Runtime staging path already exists; refusing to overwrite: ${outDir}`)
    stagingOutputOwned = true
    await run(pnpmBin(), [
      '--filter', cliFilter, 'deploy',
      '--legacy', '--prod',
      '--config.node-linker=hoisted',
      '--config.auto-install-peers=false',
      '--config.link-workspace-packages=true',
      '--config.ignore-scripts=true',
      outDir,
    ], { cwd: monorepoRoot, env: { ...process.env, CI: 'true' } })
    for (const doc of ['README.md', 'README.zh.md', 'README.i18n.yaml']) {
      await fsp.rm(path.join(outDir, doc), { force: true })
    }
  } else if (!fs.existsSync(outDir)) {
    throw new Error(`--skip-deploy 但 vendor/${TASKWEAVER_Z_RUNTIME_DEPLOY_DIR} 不存在`)
  }
  await patchZRuntimeSourceBundlesNoHmr()
  await patchTaskWeaverRuntimeNoHmr(outDir)
  await ensureRuntimePeerPackages(outDir, monorepoRoot, scope)
  await stageDeployedCliEntry(outDir, monorepoRoot)
  const presetIntegrity = await assertTaskWeaverPresetDeployMatches(
    path.join(monorepoRoot, 'apps', 'cli', 'config', 'agent-presets'),
    path.join(outDir, 'config', 'agent-presets'),
  )
  console.log(`build-z-runtime: TaskWeaver agent presets match source (${presetIntegrity.presets.map((preset) => preset.id).join(', ')})`)
  const url = await repairClosure(outDir, monorepoRoot)
  await pruneTaskWeaverBrowserFrontend(outDir, scope)
  await stageApiClient(outDir, scope)
  await stageTaskWeaverBridgeTransport(outDir, root)
  await stageMainProcessSessionManagerLib(outDir, monorepoRoot)
  console.log('build-z-runtime: 同步 dsh-chat-registry …')
  await run(process.execPath, [path.join(root, 'scripts/build-dsh-chat-registry.mjs')])
  await stageDshChatRegistry(outDir)
  console.log('build-z-runtime: 同步 pi-ai 模型目录 …')
  const piAiEnv = { ...process.env }
  if (skipDeploy) delete piAiEnv.TASKWEAVER_Z_RUNTIME
  else piAiEnv.TASKWEAVER_Z_RUNTIME = outDir
  await run(process.execPath, [path.join(root, 'scripts/upgrade-vendor-pi-ai.mjs')], { env: piAiEnv })
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
  await relayoutRuntimePackagesForPackaging(outDir)
  await fsp.writeFile(
    path.join(outDir, 'taskweaver-runtime-meta.json'),
    `${JSON.stringify({ ...runtimeLock, builtAt: new Date().toISOString(), apiOnlyHost: true }, null, 2)}\n`,
  )
  if (!skipDeploy) {
    await publishRuntimeBuild(outDir, targetOutDir)
    stagingOutputOwned = false
  }
  console.log(`build-z-runtime: 完成（冒烟 ${url}）`)
}

main().catch(async (error) => {
  if (stagingOutputOwned) {
    await fsp.rm(outDir, { recursive: true, force: true }).catch((cleanupError) => {
      console.warn(`build-z-runtime: staging 清理失败：${outDir}`, cleanupError)
    })
  }
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
