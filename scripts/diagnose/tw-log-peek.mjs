#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const dir = process.argv[2]
const file = path.join(dir, 'session.jsonl.zstd')
const buf = fs.readFileSync(file)
const text = zlib.zstdDecompressSync(buf).toString('utf8')
const lines = text.split('\n').filter(Boolean)
console.log(`文件: ${file}`)
console.log(`解压后行数: ${lines.length}   原始 ${buf.length} B → ${text.length} B`)

const rows = []
for (const line of lines) {
  try { rows.push(JSON.parse(line)) } catch { /* skip */ }
}
console.log(`可解析事件: ${rows.length}`)

const typeCount = new Map()
for (const r of rows) {
  const t = r.type ?? r.event?.type ?? 'unknown'
  typeCount.set(t, (typeCount.get(t) ?? 0) + 1)
}
console.log('\n=== 事件类型分布 (Top 20) ===')
;[...typeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
  .forEach(([t, n]) => console.log(`  ${String(t).padEnd(40)} ${n}`))

// 采样一条看结构
console.log('\n=== 首条事件结构 ===')
console.log(JSON.stringify(rows[0], null, 2).slice(0, 1200))
