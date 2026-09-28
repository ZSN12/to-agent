#!/usr/bin/env node
/**
 * Build a self-contained DSH web-profile runtime for TaskWeaver packaging.
 * Output: vendor/taskweaver-dsh-runtime (including TaskWeaver's DSH API client module)
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDshHostLaunch } from '../electron/agent/dsh-host/resolve-runtime.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dshSource = path.join(root, 'dsh-source')
const outDir = path.join(root, 'vendor', 'taskweaver-dsh-runtime')
const clientOut = path.join(outDir, 'taskweaver-dsh-client')
const skipBuild = process.argv.includes('--skip-build')
const skipDeploy = process.argv.includes('--skip-deploy')
const maxRepair = 80

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

function resolvePackageDir(monorepoRoot, stagingRoot, packageName) {
  const roots = [monorepoRoot, stagingRoot].filter(Boolean)
  for (const root of roots) {
    try {
      const launch = resolveDshHostLaunch(root)
      const require = createRequire(launch.entrypoint)
      return path.dirname(require.resolve(`${packageName}/package.json`))
    } catch {
      /* try next root */
    }
  }
  if (monorepoRoot && packageName.startsWith('@deepseek-ai/')) {
    const short = packageName.slice('@deepseek-ai/'.length)
    const vendorDir = path.join(monorepoRoot, 'vendor', short)
    if (fs.existsSync(path.join(vendorDir, 'package.json'))) return vendorDir
  }
  return null
}

async function copyPackageIntoStaging(monorepoRoot, stagingRoot, packageName) {
  const pkgDir = resolvePackageDir(monorepoRoot, stagingRoot, packageName)
  if (!pkgDir) return false
  const dest = path.join(stagingRoot, 'node_modules', ...packageName.split('/'))
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  await copyDir(pkgDir, dest, (p) => {
    const rel = path.relative(pkgDir, p)
    return !rel.split(path.sep).includes('node_modules')
  })
  return true
}

const MISSING_PKG = /Cannot find package '([^']+)'/

async function tryBootSmoke(stagingRoot, homeDir) {
  const launch = resolveDshHostLaunch(stagingRoot)
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [launch.entrypoint, 'web', '--no-open', '--port', '0'], {
      cwd: launch.cwd,
      env: { ...process.env, DSH_HOME: path.join(homeDir, 'dsh'), DSH_TELEMETRY_DISABLED: '1' },
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
      const match = buf.match(MISSING_PKG)
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
      console.log(`build-dsh-runtime: 补齐 ${pkg}`)
    }
    throw new Error(`DSH runtime 依赖修复超过 ${maxRepair} 轮`)
  } finally {
    await fsp.rm(home, { recursive: true, force: true })
  }
}

async function stageApiClient(stagingRoot) {
  const rel = 'lib/types/client/web-api-client.js'
  const from = path.join(stagingRoot, 'node_modules/@deepseek-ai/dsh-client-connection', rel)
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
  const pkgFrom = path.join(stagingRoot, 'node_modules/@deepseek-ai/dsh-client-connection/package.json')
  if (fs.existsSync(pkgFrom)) {
    await fsp.copyFile(pkgFrom, path.join(clientOut, 'package.json'))
  }
}

async function main() {
  if (!fs.existsSync(dshSource)) {
    throw new Error(`缺少 dsh-source：${dshSource}`)
  }
  if (!skipBuild) {
    console.log('build-dsh-runtime: pnpm run build …')
    await run(pnpmBin(), ['run', 'build'], { cwd: dshSource })
  }
  if (!skipDeploy) {
    console.log(`build-dsh-runtime: pnpm deploy → ${outDir}`)
    await fsp.rm(outDir, { recursive: true, force: true })
    await run(pnpmBin(), [
      '--filter', '@deepseek-ai/dsh', 'deploy',
      '--legacy', '--prod',
      '--config.node-linker=hoisted',
      '--config.auto-install-peers=false',
      '--config.link-workspace-packages=true',
      outDir,
    ], { cwd: dshSource })
    for (const doc of ['README.md', 'README.zh.md', 'README.i18n.yaml']) {
      await fsp.rm(path.join(outDir, doc), { force: true })
    }
  } else if (!fs.existsSync(outDir)) {
    throw new Error('--skip-deploy 但 vendor/taskweaver-dsh-runtime 不存在')
  }
  const url = await repairClosure(outDir, dshSource)
  await stageApiClient(outDir)
  console.log(`build-dsh-runtime: 完成（冒烟 ${url}）`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
