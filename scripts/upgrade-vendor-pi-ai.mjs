#!/usr/bin/env node
/**
 * Replace bundled @earendil-works/pi-ai in vendor/taskweaver-z-runtime.
 * Model catalogs (MiMo, OpenAI, etc.) ship inside pi-ai; "刷新目录" does not call provider APIs for catalog routes.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  resolveRuntimeNodePath,
  TASKWEAVER_RUNTIME_PACKAGES,
} from '../electron/agent/z-host/resolve-runtime.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const customRuntimeDir = process.env.TASKWEAVER_Z_RUNTIME
  ? path.resolve(process.env.TASKWEAVER_Z_RUNTIME)
  : null
if (customRuntimeDir) {
  const tempRoot = path.resolve(os.tmpdir())
  const vendorRoot = path.join(root, 'vendor')
  const safeBasename = /^taskweaver-z-runtime-build-[A-Za-z0-9._-]+$/
  const allowedParent = path.dirname(customRuntimeDir) === tempRoot || path.dirname(customRuntimeDir) === vendorRoot
  if (!allowedParent || !safeBasename.test(path.basename(customRuntimeDir))) {
    throw new Error(`TASKWEAVER_Z_RUNTIME must be a dedicated taskweaver-z-runtime-build-* child of ${tempRoot} or ${vendorRoot}`)
  }
}
const runtimeDir = customRuntimeDir ?? path.join(root, 'vendor', 'taskweaver-z-runtime')
const runtimeLock = JSON.parse(fs.readFileSync(path.join(root, 'runtime-lock.json'), 'utf8'))
const PI_AI_VERSION = String(runtimeLock?.piAi?.version ?? '')
if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(PI_AI_VERSION)) {
  throw new Error('runtime-lock.json 缺少有效的 piAi.version')
}
function runtimePackagesRoot() {
  const resolved = resolveRuntimeNodePath(runtimeDir)
  if (!resolved) {
    throw new Error(`缺少 runtime 依赖目录（${TASKWEAVER_RUNTIME_PACKAGES} 或 node_modules）`)
  }
  return resolved
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
  })
}

async function main() {
  if (!fs.existsSync(runtimeDir)) {
    throw new Error(`缺少 runtime deploy：${runtimeDir}，请先运行 npm run build:z-runtime`)
  }
  const targetDir = path.join(runtimePackagesRoot(), '@earendil-works', 'pi-ai')
  try {
    const installed = JSON.parse(await fsp.readFile(path.join(targetDir, 'package.json'), 'utf8'))
    if (installed.version === PI_AI_VERSION) {
      console.log(`upgrade-vendor-pi-ai: @earendil-works/pi-ai@${installed.version} 已符合 runtime-lock，跳过 npm pack`)
      return
    }
  } catch {
    // Missing or unreadable deployed package: fall back to the locked registry tarball.
  }
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'tw-pi-ai-'))
  try {
    await run('npm', ['pack', `@earendil-works/pi-ai@${PI_AI_VERSION}`, '--pack-destination', tmp], { cwd: tmp })
    const packed = (await fsp.readdir(tmp)).find((name) => name.endsWith('.tgz'))
    if (!packed) throw new Error('npm pack 未生成 tarball')
    await fsp.rm(targetDir, { recursive: true, force: true })
    await fsp.mkdir(path.dirname(targetDir), { recursive: true })
    await run('tar', ['-xzf', path.join(tmp, packed), '-C', tmp])
    await fsp.rename(path.join(tmp, 'package'), targetDir)
    const pkg = JSON.parse(await fsp.readFile(path.join(targetDir, 'package.json'), 'utf8'))
    if (pkg.version !== PI_AI_VERSION) {
      throw new Error(`pi-ai 版本不一致：锁定 ${PI_AI_VERSION}，实际 ${pkg.version}`)
    }
    console.log(`upgrade-vendor-pi-ai: @earendil-works/pi-ai@${pkg.version} → ${targetDir}`)
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
