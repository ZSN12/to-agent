#!/usr/bin/env node
/**
 * Refresh vendor/taskweaver-z-runtime bridge transport + provider-bridge without a full z-runtime deploy.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TASKWEAVER_RUNTIME_DEPLOY_DIR } from '../desktop/agent/z-host/resolve-runtime.mjs'
import { ensureTaskweaverScopeAliases } from './runtime-package-aliases.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vendorRoot = path.join(root, 'vendor', TASKWEAVER_RUNTIME_DEPLOY_DIR)
const transportFrom = path.join(root, 'packages', 'provider-bridge-transport')
const bridgeFrom = path.join(root, 'packages', 'provider-bridge')
const bridgeLib = path.join(bridgeFrom, 'lib', 'index.mjs')

async function copyDir(from, to, filter) {
  await fsp.mkdir(to, { recursive: true })
  for (const entry of await fsp.readdir(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (filter && !filter(src)) continue
    if (entry.isDirectory()) await copyDir(src, dest, filter)
    else await fsp.copyFile(src, dest)
  }
}

async function main() {
  if (!fs.existsSync(bridgeLib)) {
    throw new Error(`缺少 ${bridgeLib}，请先运行：pnpm --dir packages/provider-bridge run build`)
  }
  if (!fs.existsSync(vendorRoot)) {
    throw new Error(`缺少 ${vendorRoot}，请先运行一次 pnpm run build:z-runtime`)
  }

  const transportDest = path.join(vendorRoot, 'electron-vendor', 'taskweaver-bridge-transport')
  await fsp.rm(transportDest, { recursive: true, force: true })
  await copyDir(transportFrom, transportDest, (p) => !path.relative(transportFrom, p).split(path.sep).includes('node_modules'))

  const stagedBridgeDest = path.join(vendorRoot, 'electron-vendor', 'provider-bridge')
  await fsp.rm(stagedBridgeDest, { recursive: true, force: true })
  await copyDir(bridgeFrom, stagedBridgeDest, (p) => !path.relative(bridgeFrom, p).split(path.sep).includes('node_modules'))

  const runtimePackages = path.join(vendorRoot, 'runtime-packages')
  const runtimeBridgeDest = path.join(runtimePackages, '@taskweaver', 'provider-bridge')
  await fsp.rm(runtimeBridgeDest, { recursive: true, force: true })
  await copyDir(bridgeFrom, runtimeBridgeDest, (p) => !path.relative(bridgeFrom, p).split(path.sep).includes('node_modules'))

  const nestedNm = path.join(runtimePackages, 'node_modules')
  const nestedStat = await fsp.lstat(nestedNm).catch(() => null)
  if (nestedStat?.isSymbolicLink()) {
    const target = await fsp.readlink(nestedNm).catch(() => '')
    if (target === '.' || target === './') {
      await fsp.rm(nestedNm, { force: true })
    }
  }

  const linked = await ensureTaskweaverScopeAliases(runtimePackages)
  for (const dependency of ['@bufbuild/protobuf', '@modelcontextprotocol/sdk']) {
    const dest = path.join(runtimePackages, ...dependency.split('/'))
    if (fs.existsSync(path.join(dest, 'package.json'))) continue
    const from = [
      path.join(root, 'node_modules', ...dependency.split('/')),
      path.join(root, 'packages', 'runtime', 'node_modules', ...dependency.split('/')),
      path.join(runtimePackages, ...dependency.split('/')),
    ].find((candidate) => fs.existsSync(path.join(candidate, 'package.json')))
    if (!from) {
      console.warn(`sync-vendor-bridge-runtime: 跳过缺失依赖 ${dependency}（请 pnpm install 后重试）`)
      continue
    }
    await fsp.mkdir(path.dirname(dest), { recursive: true })
    await copyDir(from, dest, (p) => !path.relative(from, p).split(path.sep).includes('node_modules'))
  }

  const loader = await fsp.readFile(path.join(transportDest, 'cursor-adapter-loader.mjs'), 'utf8')
  if (loader.includes('src/adapters/cursor.ts')) {
    throw new Error('cursor-adapter-loader 仍指向 OpenCodex TypeScript')
  }

  console.log(
    `sync-vendor-bridge-runtime: 已更新 bridge；@taskweaver 别名 ${linked} 个`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
