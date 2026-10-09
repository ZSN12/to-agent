#!/usr/bin/env node
/**
 * 将 release 里的 TaskWeaver.app 复制到桌面隔离路径，便于计划 1.12 / 2.13 手测。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'release/mac-arm64/TaskWeaver.app')

if (!fs.existsSync(source)) {
  console.error('未找到 release/mac-arm64/TaskWeaver.app')
  console.error('请先执行: npm run build:z-runtime && npm run app:builder')
  process.exit(1)
}

const force = process.argv.includes('--force')
const stamp = new Date().toISOString().slice(0, 10)
const dest = path.join(os.homedir(), 'Desktop', `TaskWeaver-smoke-${stamp}.app`)

if (fs.existsSync(dest)) {
  if (!force) {
    console.error(`目标已存在: ${dest}`)
    console.error('加 --force 可覆盖复制（会先删除旧目录）')
    process.exit(1)
  }
  await fs.promises.rm(dest, { recursive: true, force: true })
}

await fs.promises.cp(source, dest, { recursive: true })

console.log('已复制打包产物到桌面（勿在 release/ 目录直接手测）：')
console.log(`  ${dest}`)
console.log('')
console.log('打开应用:')
console.log(`  open "${dest}"`)
console.log('')
console.log('按 docs/pkg-manual-smoke.md 逐项勾选，完成后更新 docs/optimization-plan-progress.md 中 1.12 / 2.13。')
