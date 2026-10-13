#!/usr/bin/env node
/**
 * Repair vendor/taskweaver-z-runtime without a full pnpm deploy (heal lib/ shells + relayout).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TASKWEAVER_RUNTIME_DEPLOY_DIR } from '../backend/agent/z-host/resolve-runtime.mjs'
import {
  finalizeRuntimeLayout,
  healDeployPackageClosure,
} from './runtime-deploy-closure.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const monorepoRoot = path.join(root, 'packages', 'runtime')
const vendorRoot = path.join(root, 'vendor', TASKWEAVER_RUNTIME_DEPLOY_DIR)

async function main() {
  if (!fs.existsSync(vendorRoot)) {
    throw new Error(`缺少 ${vendorRoot}；请先 pnpm run build:z-runtime`)
  }
  await healDeployPackageClosure({
    monorepoRoot,
    stagingRoot: vendorRoot,
    desktopRepoRoot: root,
  })
  await finalizeRuntimeLayout(vendorRoot)
  console.log('heal-vendor-runtime: 完成')
}

main().catch((error) => {
  console.error('heal-vendor-runtime:', error instanceof Error ? error.message : error)
  process.exit(1)
})
