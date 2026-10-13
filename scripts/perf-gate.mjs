#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import process from 'node:process'

const file = process.argv[2]
if (!file) {
  console.error('用法: node scripts/perf-gate.mjs <trace.jsonl>')
  process.exit(1)
}

let report
try {
  const jsonOutput = execFileSync('node', ['scripts/tw-startup-report.mjs', '--json', file], { encoding: 'utf8' })
  report = JSON.parse(jsonOutput)
} catch (error) {
  console.error('读取启动报告失败:', error?.message ?? error)
  process.exit(1)
}

const m = report.median ?? report.runs?.[0] ?? {}
const windowVisible = m.windowVisibleMs ?? 0
const firstCatalog = m.firstCatalogMs ?? 0
const catalogDiff = firstCatalog - windowVisible

const gates = [
  ['Host 启动次数', m.hostStarts === 1, `实际: ${m.hostStarts}`],
  ['Host 重启次数', m.hostRestarts === 0, `实际: ${m.hostRestarts}`],
  ['首屏目录耗时（带缓存 <1000ms）', catalogDiff < 1000, `实际: ${catalogDiff}ms`],
  ['首分钟 loadBundle 次数 (<=2)', (m.loadBundleFirstMinute ?? 0) <= 2, `实际: ${m.loadBundleFirstMinute}`],
  ['启动阶段 ocx 调用次数 (0)', (m.ocxCalls ?? 0) === 0, `实际: ${m.ocxCalls}`],
  ['启动阶段 live-discovery 次数 (0)', (m.liveDiscoveryAtStartup ?? 0) === 0, `实际: ${m.liveDiscoveryAtStartup}`],
]

let allPassed = true
console.log('=== TaskWeaver 启动性能回归门槛检查 ===')
for (const [name, passed, detail] of gates) {
  const symbol = passed ? '✅ PASS' : '❌ FAIL'
  console.log(`${symbol} - ${name} (${detail})`)
  if (!passed) allPassed = false
}

if (!allPassed) {
  console.error('\n❌ 性能回归门槛未通过！')
  process.exit(1)
} else {
  console.log('\n🎉 所有性能回归门槛均通过！')
  process.exit(0)
}
