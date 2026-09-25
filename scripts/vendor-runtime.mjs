#!/usr/bin/env node
/**
 * 将当前 node_modules 中的 coding-agent 运行时拷贝到 vendor/runtime/coding-agent。
 * 仅需在升级运行时版本时执行一次；拷贝后根 package.json 不再从 registry 安装该包。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'node_modules', '@earendil-works', 'pi-coding-agent')
const target = path.join(root, 'vendor', 'runtime', 'coding-agent')

const COPY_TOP = ['dist', 'package.json', 'npm-shrinkwrap.json']
const SKIP_UNDER_NODE_MODULES = new Set(['.bin', '.cache'])

function assertSource() {
  if (!fs.existsSync(path.join(source, 'dist', 'index.js'))) {
    console.error(
      '未找到 @earendil-works/pi-coding-agent。请先执行: npm install @earendil-works/pi-coding-agent@0.81.1\n然后: node scripts/vendor-runtime.mjs',
    )
    process.exit(1)
  }
}

function rmrf(dir) {
  if (!fs.existsSync(dir)) return
  fs.rmSync(dir, { recursive: true, force: true })
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    for (const name of fs.readdirSync(src)) {
      if (SKIP_UNDER_NODE_MODULES.has(name)) continue
      copyRecursive(path.join(src, name), path.join(dest, name))
    }
    return
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function main() {
  assertSource()
  rmrf(target)
  fs.mkdirSync(target, { recursive: true })

  for (const name of COPY_TOP) {
    const from = path.join(source, name)
    if (!fs.existsSync(from)) continue
    const to = path.join(target, name)
    const st = fs.statSync(from)
    if (st.isDirectory()) copyRecursive(from, to)
    else fs.copyFileSync(from, to)
  }

  const srcModules = path.join(source, 'node_modules')
  const destModules = path.join(target, 'node_modules')
  if (fs.existsSync(srcModules)) {
    copyRecursive(srcModules, destModules)
  }

  const version = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8')).version
  fs.writeFileSync(
    path.join(root, 'vendor', 'runtime', 'VERSION'),
    `${version}\n`,
    'utf8',
  )

  console.log(`已拷贝运行时到 vendor/runtime/coding-agent（版本 ${version}）`)
  console.log('请从 package.json 移除 @earendil-works/pi-coding-agent 依赖后执行 npm install 更新 lockfile。')
}

main()
