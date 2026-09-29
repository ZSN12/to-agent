#!/usr/bin/env node
/**
 * 只读：找出「一轮到底卡在哪」——把一轮内的空档（gap）排序，并标注空档两端的事件类型。
 *
 * 用法：
 *   node scripts/diagnose/tw-turn-gaps.mjs <sessionId 子串> [turnIndex]
 *
 * 同时核对：resume 时被重放的 tool/result 内容是否与首次一致（判断是「补写」还是「重跑」）。
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
const wantTurn = process.argv[3] ? Number(process.argv[3]) : null
const rows = decompressMultiFrame(fs.readFileSync(target.log))
  .split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l) } catch { return null } })
  .filter(Boolean)

const fmt = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)}分${Math.round((ms % 60000) / 1000)}秒` : `${(ms / 1000).toFixed(1)}s`)

/** 给事件一个短标签，便于读空档两端在干什么。 */
function label(r) {
  if (!r) return 'EOF'
  const c = r.data?.chunk?.type
  if (r.type === 'assistant/chunk') return `chunk:${c}`
  if (r.type === 'tool/call') return `tool/call:${r.data?.name}`
  if (r.type === 'tool/result') return `tool/result:${r.data?.name ?? r.data?.message?.source?.name ?? ''}`
  return r.type
}

// ===== 切轮：只在 turn/start … turn/end 之间收集，前后噪声不进任何一轮 =====
const turns = []
let cur = null
for (const r of rows) {
  if (r.type === 'turn/start') { cur = { rows: [r] }; turns.push(cur); continue }
  if (r.type === 'turn/end') { if (cur) { cur.rows.push(r); cur = null } continue }
  if (cur) cur.rows.push(r)
}

const targets = wantTurn ? [turns[wantTurn - 1]] : turns
targets.forEach((t, ti) => {
  if (!t) return
  const idx = wantTurn ? wantTurn : ti + 1
  const rs = t.rows
  const start = rs[0]?.time
  const end = rs.find((r) => r.type === 'turn/end')?.time ?? rs.at(-1)?.time
  const gaps = []
  let lastT = null
  let lastL = null
  let prevRow = null
  for (const r of rs) {
    // 注意：assistant/chunk 里的 text-chunks / reasoning-chunks 是**批量事件，没有 time**。
    // 直接相减会得到 NaN，NaN > 1500 为 false，会把跨过这些事件的长空档整段吞掉。
    // 因此只在上一个事件有有效 time 时才计算空档。
    if (typeof r.time === 'number') {
      if (lastT !== null) {
        const d = r.time - lastT
        if (d > 1500) gaps.push({ d, a: lastL, b: label(r), t: lastT })
      }
      lastT = r.time
      lastL = label(r)
    }
    prevRow = r
  }
  void prevRow
  gaps.sort((x, y) => y.d - x.d)
  const totalGap = gaps.reduce((a, g) => a + g.d, 0)
  console.log(`\n=== Turn ${idx}  墙钟 ${fmt(end - start)}  事件 ${rs.length}  >1.5s 空档 ${gaps.length} 个  合计 ${fmt(totalGap)} ===`)
  for (const g of gaps.slice(0, 12)) {
    console.log(`  ${fmt(g.d).padStart(8)}  ${new Date(g.t).toLocaleTimeString('zh-CN')}  ${g.a}  →  ${g.b}`)
  }
})

// ===== resume 重放的 result 内容是否一致 =====
const byCall = new Map()
for (const r of rows) {
  if (r.type !== 'tool/result') continue
  const id = r.data?.message?.source?.callId
  if (!byCall.has(id)) byCall.set(id, [])
  byCall.get(id).push(r)
}
const dups = [...byCall.entries()].filter(([, v]) => v.length > 1)
console.log(`\n=== resume 重放核对（${dups.length} 个 callId 有多个 result） ===`)
let same = 0
let diff = 0
for (const [id, v] of dups) {
  const sig = v.map((r) => JSON.stringify(r.data?.message?.content ?? r.data?.error ?? null))
  const isSame = sig.every((s) => s === sig[0])
  if (isSame) same += 1
  else diff += 1
}
console.log(`  内容完全相同的: ${same}   内容不同的: ${diff}`)
const sample = dups[0]
if (sample) {
  const [id, v] = sample
  console.log(`\n  样例 ${id}:`)
  v.forEach((r, i) => {
    const txt = JSON.stringify(r.data?.message?.content ?? r.data?.error ?? null)
    console.log(`    #${i + 1} ${new Date(r.time).toLocaleTimeString('zh-CN')} seq=${r.seq} len=${txt.length}`)
    console.log(`       ${txt.slice(0, 200)}`)
  })
}
