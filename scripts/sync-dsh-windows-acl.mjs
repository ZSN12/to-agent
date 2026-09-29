#!/usr/bin/env node
/**
 * 从本地 DSH 源码树复制 windows-acl runner 到 electron/vendor（仅 Windows 打包需要）。
 * 默认源：vendor/z-runtime/packages/sandbox/sandbox-windows-acl/lib
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultSrc = path.join(root, 'vendor', 'z-runtime', 'packages', 'sandbox', 'sandbox-windows-acl', 'lib')
const src = process.env.DSH_WINDOWS_ACL_SRC || defaultSrc
const dest = path.join(root, 'electron', 'vendor', 'dsh-sandbox', 'windows')

async function copyDir(from, to) {
  await fsp.mkdir(to, { recursive: true })
  const entries = await fsp.readdir(from, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue
    const s = path.join(from, entry.name)
    const d = path.join(to, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else await fsp.copyFile(s, d)
  }
}

if (!fs.existsSync(src)) {
  console.error(`DSH windows-acl 源目录不存在: ${src}`)
  console.error('设置 DSH_WINDOWS_ACL_SRC 或在 vendor/z-runtime 内构建 sandbox-windows-acl')
  process.exit(1)
}

await copyDir(src, dest)
console.log(`sync-dsh-windows-acl: 已复制到 ${dest}`)
