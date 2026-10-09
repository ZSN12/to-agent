#!/usr/bin/env node
/**
 * TaskWeaver 本地 OpenCodex 模型代理子系统状态报告
 * （已彻底脱离外部上游对齐，作为本地第一方模块自主维护）
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveTaskWeaverOpenCodexRoot } from '../electron/backend/opencodex-package-root.mjs'

const root = resolveTaskWeaverOpenCodexRoot() || path.join(process.cwd(), 'vendor', 'opencodex')

let localVersion = 'unknown'
let packageName = '@taskweaver/opencodex'
try {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  localVersion = pkgJson.version || 'unknown'
  packageName = pkgJson.name || packageName
} catch {
  // best effort
}

console.log('================================================================================')
console.log('⚡ [TaskWeaver Model Proxy] 本地模型代理模块状态')
console.log('================================================================================')
console.log(`  - 模块归属:    TaskWeaver 自有子系统（完全本地化）`)
console.log(`  - 源码根目录:  ${root}`)
console.log(`  - 模块包名:    ${packageName}`)
console.log(`  - 当前版本:    ${localVersion}`)
console.log(`  - 架构地位:    第一方原生协议桥接层（支持自主定制与无限制改造）`)
console.log('================================================================================\n')
