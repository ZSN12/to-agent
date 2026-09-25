#!/usr/bin/env node
/** 将 vendor/runtime 中已验证的 dist 同步到 packages/pi 各工作区包，便于在源码全量 build 失败时仍能跑通 TaskWeaver。 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vendor = path.join(root, 'vendor', 'runtime', 'coding-agent')
const pi = path.join(root, 'packages', 'pi', 'packages')

const pairs = [
  [path.join(vendor, 'dist'), path.join(pi, 'coding-agent', 'dist')],
  [path.join(vendor, 'node_modules', '@earendil-works', 'pi-ai', 'dist'), path.join(pi, 'ai', 'dist')],
  [path.join(vendor, 'node_modules', '@earendil-works', 'pi-agent-core', 'dist'), path.join(pi, 'agent', 'dist')],
  [path.join(vendor, 'node_modules', '@earendil-works', 'pi-tui', 'dist'), path.join(pi, 'tui', 'dist')],
]

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.error(`缺少: ${src}\n请先执行 npm run vendor:runtime（需临时安装上游包）`)
    process.exit(1)
  }
  rmrf(dest)
  fs.cpSync(src, dest, { recursive: true })
}

for (const [src, dest] of pairs) {
  copyDir(src, dest)
  console.log(`synced ${path.relative(root, dest)}`)
}
