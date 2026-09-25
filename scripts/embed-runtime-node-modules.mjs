#!/usr/bin/env node
/**
 * 将 packages/pi 的依赖嵌入 coding-agent/node_modules。
 * npm workspace 的 @earendil-works/* 是指向 ../ai 等的绝对/相对符号链接，asar 内会断链，必须落成实体目录。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const piRoot = path.join(root, 'packages', 'pi')
const piNm = path.join(piRoot, 'node_modules')
const agentPkg = path.join(piRoot, 'packages', 'coding-agent')
const embedNm = path.join(agentPkg, 'node_modules')

/** @type {[string, string][]} folder under packages/pi/packages → npm name under @earendil-works */
const WORKSPACE_RUNTIME = [
  ['ai', 'pi-ai'],
  ['agent', 'pi-agent-core'],
  ['tui', 'pi-tui'],
]

const WORKSPACE_SKIP = new Set([
  'pi-ai',
  'pi-agent-core',
  'pi-tui',
  'pi-coding-agent',
  'pi-server',
  'pi-storage-sqlite-node',
])

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}

function copyTree(src, dest) {
  fs.cpSync(src, dest, { recursive: true, dereference: true, verbatimSymlinks: false })
}

if (!fs.existsSync(piNm)) {
  console.error('缺少 packages/pi/node_modules，请先执行: cd packages/pi && npm install')
  process.exit(1)
}

rmrf(embedNm)
fs.mkdirSync(embedNm, { recursive: true })

for (const entry of fs.readdirSync(piNm)) {
  const src = path.join(piNm, entry)
  const dest = path.join(embedNm, entry)
  if (entry === '@earendil-works') continue
  copyTree(src, dest)
}

const piScoped = path.join(piNm, '@earendil-works')
const embedScoped = path.join(embedNm, '@earendil-works')
fs.mkdirSync(embedScoped, { recursive: true })

if (fs.existsSync(piScoped)) {
  for (const name of fs.readdirSync(piScoped)) {
    if (WORKSPACE_SKIP.has(name)) continue
    copyTree(path.join(piScoped, name), path.join(embedScoped, name))
  }
}

for (const [folder, pkgName] of WORKSPACE_RUNTIME) {
  const src = path.join(piRoot, 'packages', folder)
  if (!fs.existsSync(path.join(src, 'dist', 'index.js')) && !fs.existsSync(path.join(src, 'package.json'))) {
    console.error(`缺少 ${src} 的构建产物，请先: npm run runtime:seed-dist`)
    process.exit(1)
  }
  copyTree(src, path.join(embedScoped, pkgName))
}

console.log('已嵌入执行层依赖（workspace 包已实体化）到 packages/pi/packages/coding-agent/node_modules')
