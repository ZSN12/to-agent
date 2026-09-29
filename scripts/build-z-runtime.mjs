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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const zRuntimeSource = path.join(root, 'vendor', 'z-runtime')
const outDir = path.join(root, 'vendor', TASKWEAVER_Z_RUNTIME_DEPLOY_DIR)
const legacyOutDir = path.join(root, 'vendor', 'taskweaver-dsh-runtime')

/** @returns {{ monorepoRoot: string, cliFilter: string, scope: string, label: string }} */
function resolveMonorepo() {
  const zReady = fs.existsSync(path.join(zRuntimeSource, 'apps/cli/package.json'))
  const zCliBuilt = fs.existsSync(path.join(zRuntimeSource, 'apps/cli/lib/bin.js'))
  if (!zReady) {
    throw new Error('缺少 vendor/z-runtime；请确保已检出 Z 运行时源码树')
  }
  if (!zCliBuilt) {
    throw new Error(
      'vendor/z-runtime/apps/cli/lib/bin.js 不存在；请先运行 npm run build:z-runtime（或在 vendor/z-runtime 内完成 host/client 构建）',
    )
  }
  return { monorepoRoot: zRuntimeSource, cliFilter: '@z/dsh', scope: '@z/', label: 'Z Runtime' }
}
const clientOut = path.join(outDir, TASKWEAVER_Z_RUNTIME_CLIENT_DIR)
const skipBuild = process.argv.includes('--skip-build')
const skipDeploy = process.argv.includes('--skip-deploy')
const maxRepair = 80
const runtimeLockPath = path.join(root, 'runtime-lock.json')

async function readRuntimeLock() {
  const lock = JSON.parse(await fsp.readFile(runtimeLockPath, 'utf8'))
  if (lock?.schemaVersion !== 1 || !lock?.dsh?.commit || !lock?.piAi?.version) {
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

function resolvePackageDir(monorepoRoot, stagingRoot, packageName) {
  const roots = [monorepoRoot, stagingRoot].filter(Boolean)
  for (const rootDir of roots) {
    try {
      const launch = resolveTaskWeaverHostLaunch(rootDir)
      const require = createRequire(launch.entrypoint)
      return path.dirname(require.resolve(`${packageName}/package.json`))
    } catch {
      /* try next root */
    }
  }
  if (monorepoRoot) {
    const scope = packageName.startsWith('@z/') ? '@z/' : '@deepseek-ai/'
    const rel = monorepoPackagePaths(scope)[packageName]
    if (rel) {
      const fromMonorepo = path.join(monorepoRoot, rel)
      if (fs.existsSync(path.join(fromMonorepo, 'package.json'))) return fromMonorepo
    }
  }
  if (monorepoRoot && (packageName.startsWith('@deepseek-ai/') || packageName.startsWith('@z/'))) {
    const short = packageName.replace(/^@[^/]+\//, '')
    const vendorDir = path.join(monorepoRoot, 'vendor', short)
    if (fs.existsSync(path.join(vendorDir, 'package.json'))) return vendorDir
  }
  return null
}

async function copyPackageIntoStaging(monorepoRoot, stagingRoot, packageName) {
  const pkgDir = resolvePackageDir(monorepoRoot, stagingRoot, packageName)
  if (!pkgDir) return false
  const dest = path.join(runtimeModulesDir(stagingRoot), ...packageName.split('/'))
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  await copyDir(pkgDir, dest, (p) => {
    const rel = path.relative(pkgDir, p)
    return !rel.split(path.sep).includes('node_modules')
  })
  return true
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
        DSH_HOME: path.join(homeDir, 'dsh'),
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
      if (/dsh web:\s+https?:\/\/127\.0\.0\.1:\d+/i.test(buf)) {
        clearTimeout(timer)
        done(true, buf.match(/dsh web:\s+(https?:\/\/127\.0\.0\.1:\d+)/i)?.[1] ?? 'ready')
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
  try {
    for (let i = 0; i < maxRepair; i += 1) {
      const result = await tryBootSmoke(stagingRoot, home)
      if (result.ok) return result.detail
      if (!result.detail?.startsWith('missing:')) {
        throw new Error(`DSH runtime 冒烟失败：${result.detail}`)
      }
      const pkg = result.detail.slice('missing:'.length)
      const copied = await copyPackageIntoStaging(monorepoRoot, stagingRoot, pkg)
      if (!copied) throw new Error(`无法从 monorepo 补齐依赖：${pkg}`)
      console.log(`build-z-runtime: 补齐 ${pkg}`)
    }
    throw new Error(`DSH runtime 依赖修复超过 ${maxRepair} 轮`)
  } finally {
    await fsp.rm(home, { recursive: true, force: true })
  }
}

async function ensureWebFrontendDist(monorepoRoot, scope, env) {
  const distDir = path.join(monorepoRoot, 'apps/web/dist')
  const distIndex = path.join(distDir, 'index.html')
  if (fs.existsSync(distIndex)) return
  const filter = `${scope}dsh-web-frontend`
  console.log(`build-z-runtime: 构建 ${filter} dist（web 冒烟需要）…`)
  await run(pnpmBin(), ['--filter', filter, 'run', 'build'], { cwd: monorepoRoot, env })
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

async function stageWebFrontendDist(stagingRoot, monorepoRoot, scope) {
  const from = path.join(monorepoRoot, 'apps/web/dist')
  const index = path.join(from, 'index.html')
  if (!fs.existsSync(index)) {
    throw new Error(`缺少 web frontend dist：${index}`)
  }
  const destRoot = path.join(runtimeModulesDir(stagingRoot), `${scope}dsh-web-frontend`)
  const dest = path.join(destRoot, 'dist')
  await fsp.mkdir(destRoot, { recursive: true })
  await fsp.rm(dest, { recursive: true, force: true })
  await copyDir(from, dest)
  const pkgFrom = path.join(monorepoRoot, 'apps/web/package.json')
  if (fs.existsSync(pkgFrom)) {
    await fsp.copyFile(pkgFrom, path.join(destRoot, 'package.json'))
  }
  console.log(`build-z-runtime: 已打入 ${scope}dsh-web-frontend/dist`)
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

async function main() {
  if (!fs.existsSync(outDir) && fs.existsSync(legacyOutDir)) {
    console.log(`build-z-runtime: 迁移 ${legacyOutDir} → ${outDir}`)
    await fsp.rename(legacyOutDir, outDir)
  }
  const runtimeLock = await readRuntimeLock()
  const { monorepoRoot, cliFilter, scope, label } = resolveMonorepo()
  if (!fs.existsSync(monorepoRoot)) {
    throw new Error(`缺少 runtime monorepo：${monorepoRoot}`)
  }
  console.log(`build-z-runtime: 使用 ${label}（${monorepoRoot}）`)
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
    await run(pnpmBin(), ['exec', 'tsc', '-b', hostTsconfig], { cwd: monorepoRoot, env: dshBuildEnv })
    await run(pnpmBin(), ['exec', 'tsdown', '--env.DSH_BUILD_FACE', 'host'], { cwd: monorepoRoot, env: dshBuildEnv })
    console.log('build-z-runtime: client face (UI 包 lib/index.js) …')
    const clientTsconfig = fs.existsSync(path.join(monorepoRoot, 'tsconfig.client.taskweaver.json'))
      ? 'tsconfig.client.taskweaver.json'
      : 'tsconfig.client.json'
    await run(pnpmBin(), ['exec', 'tsc', '-b', clientTsconfig], { cwd: monorepoRoot, env: dshBuildEnv })
    await run(pnpmBin(), ['exec', 'tsdown', '--env.DSH_BUILD_FACE', 'client'], { cwd: monorepoRoot, env: dshBuildEnv })
    await assertTaskWeaverProfileBootBundled(monorepoRoot)
  }
  await ensureWebFrontendDist(monorepoRoot, scope, dshBuildEnv)
  if (!skipDeploy) {
    console.log(`build-z-runtime: pnpm deploy → ${outDir}`)
    await fsp.rm(outDir, { recursive: true, force: true })
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
  await ensureRuntimePeerPackages(outDir, monorepoRoot, scope)
  await stageDeployedCliEntry(outDir, monorepoRoot)
  await stageWebFrontendDist(outDir, monorepoRoot, scope)
  const url = await repairClosure(outDir, monorepoRoot)
  await stageApiClient(outDir, scope)
  console.log('build-z-runtime: 同步 pi-ai 模型目录 …')
  await run(process.execPath, [path.join(root, 'scripts/upgrade-vendor-pi-ai.mjs')])
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
    `${JSON.stringify({ ...runtimeLock, builtAt: new Date().toISOString() }, null, 2)}\n`,
  )
  console.log(`build-z-runtime: 完成（冒烟 ${url}）`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
