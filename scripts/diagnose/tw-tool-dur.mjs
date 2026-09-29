#!/usr/bin/env node
/**
 * 只读：核对「工具耗时」统计是否失真。
 *
 * 背景：tw-session-analyze.mjs 用 (tool/result.time - tool/call.time) 累加，
 * 并行调用时求和会超过整轮墙钟时间。这里打印单次调用的真实分布，
 * 用来判断「累计 243 分钟」是不是统计假象。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'

const APP_DATA = path.join(os.homedir(), 'Library', 'Application Support', 'taskweaver-desktop')
const SESSIONS_DIR = path.join(APP_DATA, 'dsh', 'sessions')

function decompressMultiFrame(buf) {
  const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
  const starts = []
  let from = 0
  for (;;) {
    const at = buf.indexOf(MAGIC, from)
    if (at < 0) break
    starts.push(at)
    from = at + 4
  }
  const parts = []
  for (let i = 0; i < starts.length; i += 1) {
    try { parts.push(zlib.zstdDecompressSync(buf.subarray(starts[i], i + 1 < starts.length ? starts[i + 1] : buf.length))) } catch { /* skip */ }
  }
  return Buffer.concat(parts).toString('utf8')
}

function findSession(wanted) {
  const out = []
  for (const slug of fs.readdirSync(SESSIONS_DIR)) {
    const slugDir = path.join(SESSIONS_DIR, slug)
    if (!fs.statSync(slugDir).isDirectory()) continue
    for (const id of fs.readdirSync(slugDir)) {
      const log = path.join(slugDir, id, 'session.jsonl.zstd')
      if (fs.existsSync(log)) out.push({ id, log, mtime: fs.statSync(log).mtimeMs })
    }
  }
  out.sort((a, b) => b.mtime - a.mtime)
  return wanted ? (out.find((s) => s.id.includes(wanted)) ?? out[0]) : out[0]
}

const target = findSession(process.argv[2])
const rows = decompressMultiFrame(fs.readFileSync(target.log))
  .split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l) } catch { return null } })
  .filter(Boolean)

const calls = new Map()
const results = new Map()
for (const r of rows) {
  if (r.type === 'tool/call') {
    const id = r.data?.callId
    if (!calls.has(id)) calls.set(id, { name: r.data?.name, t: r.time, seq: r.seq, n: 0 })
    calls.get(id).n += 1
  }
  if (r.type === 'tool/result') {
    const id = r.data?.message?.source?.callId
    results.set(id, (results.get(id) ?? []).concat([{ t: r.time, seq: r.seq }]))
  }
}

const callEvents = [...calls.values()].reduce((a, c) => a + c.n, 0)
console.log(`会话        : ${target.id}`)
console.log(`tool/call   : ${callEvents} 条事件 / ${calls.size} 个唯一 callId`)
console.log(`tool/result : ${rows.filter((r) => r.type === 'tool/result').length} 条 / ${results.size} 个唯一 callId`)

const multi = [...results.entries()].filter(([, rs]) => rs.length > 1)
console.log(`同一 callId 有多个 result 的: ${multi.length}`)
for (const [id, rs] of multi.slice(0, 10)) {
  console.log(`  ${id}  ${rs.length} 个 result  ${rs.map((x) => new Date(x.t).toLocaleTimeString('zh-CN')).join(' , ')}`)
}

// 关键：resume 会把同一 callId 的 result 再补写一遍（时间戳全部相同），
// 用「最后一个 result」会把耗时算成几分钟。真实耗时取**第一个** result。
const paired = [...calls.entries()]
  .filter(([id]) => results.has(id))
  .map(([id, c]) => ({
    id,
    name: c.name,
    t0: c.t,
    dFirst: Math.min(...results.get(id).map((r) => r.t)) - c.t,
    dLast: Math.max(...results.get(id).map((r) => r.t)) - c.t,
    dup: results.get(id).length - 1,
  }))
paired.sort((a, b) => b.dFirst - a.dFirst)

const sumFirst = paired.reduce((a, x) => a + x.dFirst, 0)
const sumLast = paired.reduce((a, x) => a + x.dLast, 0)
console.log(`\n配对上的调用: ${paired.length}`)
console.log(`  用「首个 result」求和: ${(sumFirst / 60000).toFixed(1)} 分钟  ← 真实（并行仍可能超墙钟）`)
console.log(`  用「末个 result」求和: ${(sumLast / 60000).toFixed(1)} 分钟  ← 被 resume 重放污染`)
console.log('\n最慢 10 次（真实耗时 = 首个 result − call）:')
for (const x of paired.slice(0, 10)) {
  console.log(`  ${String(x.name).padEnd(12)} ${(x.dFirst / 1000).toFixed(1).padStart(8)}s  起 ${new Date(x.t0).toLocaleTimeString('zh-CN')}  ${x.dup ? `(重放 ${x.dup} 次)` : ''}  ${x.id}`)
}

const orphan = [...calls.entries()].filter(([id]) => !results.has(id))
console.log(`\n无配对 result 的 call: ${orphan.length}`)
for (const [id, c] of orphan.slice(0, 8)) {
  console.log(`  ${String(c.name).padEnd(12)} 起 ${new Date(c.t).toLocaleTimeString('zh-CN')}  ${id}`)
}
