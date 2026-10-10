#!/usr/bin/env node
/**
 * Replace vendor/taskweaver-z-runtime/lib with freshly built @taskweaver/dsh host-cli bundles.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { TASKWEAVER_RUNTIME_DEPLOY_DIR } from '../desktop/agent/z-host/resolve-runtime.mjs'
import { finalizeRuntimeLayout, healDeployPackageClosure } from './runtime-deploy-closure.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = path.join(root, 'packages', 'runtime')
const hostCliLib = path.join(runtimeRoot, 'host-cli', 'lib')
const vendorRoot = path.join(root, 'vendor', TASKWEAVER_RUNTIME_DEPLOY_DIR)
const vendorLib = path.join(vendorRoot, 'lib')

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
  })
}

async function main() {
  const entry = path.join(hostCliLib, 'entry.js')
  if (!fs.existsSync(entry)) {
    console.log('sync-vendor-host-lib: 构建 host-cli …')
    await run('pnpm', ['run', 'build:host'], {
      cwd: root,
      env: { ...process.env, CI: 'true', npm_config_confirmModulesPurge: 'false' },
    })
  }
  if (!fs.existsSync(entry)) {
    throw new Error(`缺少 ${entry}；请先 pnpm run build:host`)
  }
  if (!fs.existsSync(vendorRoot)) {
    throw new Error(`缺少 ${vendorRoot}；请先 pnpm run build:z-runtime`)
  }

  await fsp.rm(vendorLib, { recursive: true, force: true })
  await fsp.mkdir(vendorLib, { recursive: true })
  for (const name of await fsp.readdir(hostCliLib)) {
    if (!name.endsWith('.js') && !name.endsWith('.mjs')) continue
    await fsp.copyFile(path.join(hostCliLib, name), path.join(vendorLib, name))
  }

  await healDeployPackageClosure({
    monorepoRoot: runtimeRoot,
    stagingRoot: vendorRoot,
    desktopRepoRoot: root,
  })
  await finalizeRuntimeLayout(vendorRoot)

  console.log(`sync-vendor-host-lib: 已同步 ${vendorLib} 并修复 deploy 包闭包`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
