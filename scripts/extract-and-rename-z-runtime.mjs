#!/usr/bin/env node
/**
 * 阶段 1：从 dsh-source 提取完整 monorepo 到 vendor/z-runtime，并重命名 @deepseek-ai/* → @z/*
 * 见 docs/完整改造.md
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dshSource = process.env.DSH_SOURCE_PATH
  ? path.resolve(process.env.DSH_SOURCE_PATH)
  : path.join(root, 'dsh-source')
const zRuntime = path.join(root, 'vendor', 'z-runtime')

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.cache',
  'dist',
  'lib',
  'coverage',
  '.turbo',
  '.claude',
  '.github',
])

function shouldSkip(relPath, entryName) {
  if (SKIP_DIR_NAMES.has(entryName)) return true
  const parts = relPath.split(path.sep)
  if (parts.includes('node_modules')) return true
  return false
}

async function copyDir(from, to, rel = '') {
  await fsp.mkdir(to, { recursive: true })
  const entries = await fsp.readdir(from, { withFileTypes: true })
  for (const entry of entries) {
    const childRel = rel ? `${rel}${path.sep}${entry.name}` : entry.name
    if (shouldSkip(childRel, entry.name)) continue
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (entry.isDirectory()) {
      await copyDir(src, dest, childRel)
    } else if (entry.isSymbolicLink()) {
      /* skip symlinks (e.g. socket paths under .claude) */
    } else {
      await fsp.copyFile(src, dest)
    }
  }
}

async function replaceInFile(filePath, replacers) {
  let content = await fsp.readFile(filePath, 'utf8')
  let changed = false
  for (const [search, replace] of replacers) {
    const next = typeof search === 'string'
      ? content.split(search).join(replace)
      : content.replace(search, replace)
    if (next !== content) {
      content = next
      changed = true
    }
  }
  if (changed) await fsp.writeFile(filePath, content, 'utf8')
  return changed
}

async function walkFiles(dir, exts, out = []) {
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      await walkFiles(full, exts, out)
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full)
    }
  }
  return out
}

async function main() {
  if (!fs.existsSync(dshSource)) {
    throw new Error(`缺少上游 DSH 源码树：${dshSource}（可设置 DSH_SOURCE_PATH 指向外部克隆）`)
  }
  console.log('步骤 1/5: 复制 dsh-source → vendor/z-runtime（跳过 node_modules / 构建产物）')
  if (fs.existsSync(zRuntime)) {
    await fsp.rm(zRuntime, { recursive: true, force: true })
  }
  await copyDir(dshSource, zRuntime)

  console.log('步骤 2/5: package.json 中 @deepseek-ai/* → @z/*')
  const pkgFiles = await walkFiles(zRuntime, ['package.json'])
  let pkgRenamed = 0
  for (const file of pkgFiles) {
    if (await replaceInFile(file, [[/@deepseek-ai\//g, '@z/']])) pkgRenamed++
  }
  console.log(`  已更新 ${pkgRenamed} 个 package.json`)

  console.log('步骤 3/5: 源码与配置中的包引用')
  const textFiles = await walkFiles(zRuntime, ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.yml', '.yaml', '.md', '.json'])
  const replacers = [[/@deepseek-ai\//g, '@z/']]
  let srcUpdated = 0
  for (const file of textFiles) {
    if (file.includes(`${path.sep}node_modules${path.sep}`)) continue
    if (await replaceInFile(file, replacers)) srcUpdated++
  }
  console.log(`  已更新 ${srcUpdated} 个文本文件`)

  console.log('步骤 4/5: 精简 postinstall（避免 lefthook 阻断 TaskWeaver 构建）')
  const rootPkg = path.join(zRuntime, 'package.json')
  if (fs.existsSync(rootPkg)) {
    const pkg = JSON.parse(await fsp.readFile(rootPkg, 'utf8'))
    delete pkg.scripts?.postinstall
    await fsp.writeFile(rootPkg, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
  }
  const lefthook = path.join(zRuntime, 'scripts', 'install-lefthook.mjs')
  if (fs.existsSync(lefthook)) await fsp.rm(lefthook, { force: true })

  console.log('步骤 5/5: README')
  await fsp.writeFile(
    path.join(zRuntime, 'README.md'),
    `# TaskWeaver Z Runtime

基于 DSH fork，包作用域为 \`@z/*\`。构建：

\`\`\`bash
pnpm install --ignore-scripts
pnpm run build:lib:host
\`\`\`
`,
    'utf8',
  )

  console.log('完成。下一步: npm run build:z-runtime')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
