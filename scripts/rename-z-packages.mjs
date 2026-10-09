#!/usr/bin/env node
/**
 * 阶段 1.2 (C2): 包名与 Z 运行时收敛工具
 *
 * 功能：
 * 1. 系统化建立 @z/dsh-* 到 @z/* 的映射表；
 * 2. 检测潜在命名碰撞与依赖冲突；
 * 3. 扫描并审计 TaskWeaver 及 vendor/z-runtime 中的引用；
 * 4. 支持 --dry-run (默认) 与 --apply 模式。
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultZRuntimeDir = path.join(projectRoot, 'vendor', 'z-runtime')

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.cache',
  'dist',
  'lib',
  'coverage',
  '.turbo',
])

/**
 * 遍历目录查找指定文件
 */
export async function walkDirectory(dir, filterFn, out = []) {
  if (!fs.existsSync(dir)) return out
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkDirectory(full, filterFn, out)
    } else if (filterFn(entry.name, full)) {
      out.push(full)
    }
  }
  return out
}

/**
 * 将旧包名映射为规范化的 @z/* 包名
 * @param {string} oldName
 * @returns {string}
 */
export function mapPackageName(oldName) {
  if (!oldName || typeof oldName !== 'string') return oldName
  if (oldName === '@z/dsh' || oldName === '@deepseek-ai/dsh') {
    return '@z/cli'
  }
  if (oldName.startsWith('@z/dsh-')) {
    return '@z/' + oldName.slice('@z/dsh-'.length)
  }
  if (oldName.startsWith('@deepseek-ai/dsh-')) {
    return '@z/' + oldName.slice('@deepseek-ai/dsh-'.length)
  }
  if (oldName.startsWith('@deepseek-ai/')) {
    return '@z/' + oldName.slice('@deepseek-ai/'.length)
  }
  return oldName
}

/**
 * 扫描并建立完整包映射表
 */
export async function buildPackageCatalog(zRuntimeDir = defaultZRuntimeDir) {
  const pkgFiles = await walkDirectory(
    zRuntimeDir,
    (name) => name === 'package.json',
  )

  const packages = []
  const mapping = new Map()
  const reverseMapping = new Map()

  for (const file of pkgFiles) {
    try {
      const content = await fsp.readFile(file, 'utf8')
      const json = JSON.parse(content)
      if (!json.name) continue

      const oldName = json.name
      const newName = mapPackageName(oldName)
      const relPath = path.relative(zRuntimeDir, file)

      packages.push({
        file,
        relPath,
        oldName,
        newName,
        dependencies: json.dependencies || {},
        devDependencies: json.devDependencies || {},
        peerDependencies: json.peerDependencies || {},
      })

      if (oldName !== newName) {
        mapping.set(oldName, newName)
        if (!reverseMapping.has(newName)) {
          reverseMapping.set(newName, new Set())
        }
        reverseMapping.get(newName).add(oldName)
      }
    } catch {
      /* ignore invalid JSON in fixtures/tests */
    }
  }

  return { packages, mapping, reverseMapping }
}

/**
 * 检测映射碰撞与冲突
 */
export function detectCollisions(catalog) {
  const collisions = []
  const existingNames = new Set(catalog.packages.map((p) => p.oldName))

  // 1. 目标包名是否已被现存非 DSH 包占用
  for (const [oldName, newName] of catalog.mapping.entries()) {
    if (existingNames.has(newName) && oldName !== newName) {
      collisions.push({
        type: 'target_already_exists',
        oldName,
        newName,
        message: `目标包名 ${newName} 已存在于现有包列表中，重命名 ${oldName} 会导致覆盖冲突`,
      })
    }
  }

  // 2. 是否有多个不同旧包映射到了同一个新包名
  for (const [newName, oldNamesSet] of catalog.reverseMapping.entries()) {
    const oldNames = Array.from(oldNamesSet)
    if (oldNames.length > 1) {
      collisions.push({
        type: 'multiple_sources_same_target',
        newName,
        oldNames,
        message: `多个旧包 (${oldNames.join(', ')}) 同时映射到了目标 ${newName}`,
      })
    }
  }

  return collisions
}

/**
 * 扫描 TaskWeaver 源码及脚本中的 @z/dsh-* 引用
 */
export async function scanCodebaseReferences(mapping, targetDirs = ['electron', 'scripts', 'src']) {
  const references = []
  const oldNames = Array.from(mapping.keys())
  if (oldNames.length === 0) return references

  for (const sub of targetDirs) {
    const fullDir = path.join(projectRoot, sub)
    if (!fs.existsSync(fullDir)) continue

    const files = await walkDirectory(fullDir, (name) =>
      /\.(m?js|ts|tsx|json|ya?ml|md)$/.test(name),
    )

    for (const file of files) {
      const rel = path.relative(projectRoot, file)
      const content = await fsp.readFile(file, 'utf8')
      for (const oldName of oldNames) {
        if (content.includes(oldName)) {
          references.push({
            file: rel,
            package: oldName,
            target: mapping.get(oldName),
          })
        }
      }
    }
  }

  return references
}

/**
 * 执行重命名 (仅在 --apply 时生效)
 */
export async function applyPackageRenaming(catalog, zRuntimeDir = defaultZRuntimeDir) {
  const { packages, mapping } = catalog
  let modifiedFiles = 0

  // 1. 更新所有 package.json
  for (const pkg of packages) {
    let changed = false
    const raw = await fsp.readFile(pkg.file, 'utf8')
    let json = JSON.parse(raw)

    if (json.name && mapping.has(json.name)) {
      json.name = mapping.get(json.name)
      changed = true
    }

    for (const depType of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      if (json[depType]) {
        for (const [depName, depVer] of Object.entries(json[depType])) {
          if (mapping.has(depName)) {
            const mappedName = mapping.get(depName)
            delete json[depType][depName]
            json[depType][mappedName] = depVer
            changed = true
          }
        }
      }
    }

    if (changed) {
      await fsp.writeFile(pkg.file, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
      modifiedFiles += 1
    }
  }

  return { modifiedFiles }
}

async function main() {
  const args = process.argv.slice(2)
  const isApply = args.includes('--apply')
  const isJson = args.includes('--json')
  const isAuditOnly = args.includes('--audit') || args.includes('--check')

  console.log('=== Z Runtime 包命名与依赖关系收敛分析 ===')
  console.log(`运行时基线路径: ${defaultZRuntimeDir}`)

  if (!fs.existsSync(defaultZRuntimeDir)) {
    console.error(`错误: 找不到目录 ${defaultZRuntimeDir}`)
    process.exit(1)
  }

  const catalog = await buildPackageCatalog(defaultZRuntimeDir)
  const collisions = detectCollisions(catalog)
  const references = await scanCodebaseReferences(catalog.mapping)

  if (isJson) {
    console.log(JSON.stringify({
      totalPackages: catalog.packages.length,
      renamablePackages: catalog.mapping.size,
      mapping: Object.fromEntries(catalog.mapping),
      collisions,
      references,
    }, null, 2))
    return
  }

  console.log(`\n1. 概况统计:`)
  console.log(`   - 总包数: ${catalog.packages.length}`)
  console.log(`   - 需重命名包数 (@z/dsh-* -> @z/*): ${catalog.mapping.size}`)

  console.log(`\n2. 命名碰撞检测:`)
  if (collisions.length === 0) {
    console.log('   ✓ 未检测到任何命名碰撞或重复映射（映射表干净可直接收敛）。')
  } else {
    console.error(`   ✗ 发现 ${collisions.length} 处潜在冲突:`)
    for (const col of collisions) {
      console.error(`     - [${col.type}] ${col.message}`)
    }
  }

  console.log(`\n3. 抽样映射表 (前 10 项):`)
  let count = 0
  for (const [from, to] of catalog.mapping.entries()) {
    console.log(`   ${from.padEnd(35)} -> ${to}`)
    if (++count >= 10) break
  }

  console.log(`\n4. TaskWeaver 源码外链引用审计:`)
  console.log(`   - 找到 ${references.length} 处对 @z/dsh-* 的引用`)
  const byFile = new Map()
  for (const ref of references) {
    byFile.set(ref.file, (byFile.get(ref.file) || 0) + 1)
  }
  for (const [file, refCount] of Array.from(byFile.entries()).slice(0, 10)) {
    console.log(`     * ${file}: ${refCount} 处`)
  }
  if (byFile.size > 10) {
    console.log(`     ... 另有 ${byFile.size - 10} 个文件引用`)
  }

  if (isApply) {
    if (collisions.length > 0) {
      console.error('存在命名冲突，终止应用改动。')
      process.exit(1)
    }
    console.log('\n正在应用重命名...')
    const result = await applyPackageRenaming(catalog, defaultZRuntimeDir)
    console.log(`✓ 成功更新 ${result.modifiedFiles} 个 package.json 文件`)
  } else {
    console.log('\n[提示] 当前为分析/Dry-Run 模式。如需实际批量应用请传入 --apply 参数。')
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('执行失败:', err)
    process.exit(1)
  })
}
