#!/usr/bin/env node
/**
 * 只读：扫描会话里**所有** run_code 的 code 体，找可疑写法。
 *   - 未定义标识符（含 _placeholder 之类）
 *   - console( 当函数用
 *   - 超大输出的写法（glob **\/*、JSON.stringify 全量、find / ls -R）
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'

const SESSIONS_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'taskweaver-desktop', 'dsh', 'sessions')

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

const codes = []
for (const r of rows) {
  if (r.type !== 'tool/call' || r.data?.name !== 'run_code') continue
  let a = null
  try { a = JSON.parse(r.data.arguments) } catch { /* ignore */ }
  codes.push({ turn: r.data?.turn, step: r.data?.step, callId: r.data?.callId, code: a?.code ?? String(r.data?.arguments ?? ''), desc: a?.description })
}

console.log(`run_code 调用 ${codes.length} 次\n`)

const patterns = [
  ['未定义占位符', /_placeholder\b/],
  ['console 当函数调用', /(^|[^.\w])console\s*\(/m],
  ['glob **/* 全仓', /tools\.glob\(\{[^}]*\*\*\/\*/],
  ['JSON.stringify 全量打印', /JSON\.stringify\(\s*r\s*,\s*null\s*,\s*2\s*\)/],
  ['find 全盘', /find\s+\/\s/],
  ['ls -R', /ls\s+-[a-zA-Z]*R/],
]
for (const [label, re] of patterns) {
  const hits = codes.filter((c) => re.test(c.code))
  console.log(`${label.padEnd(22)} ${hits.length} 次  ${hits.slice(0, 4).map((h) => `T${h.turn}/S${h.step}`).join(' ')}`)
}

console.log('\n=== 代码长度分布 ===')
const lens = codes.map((c) => c.code.length).sort((a, b) => b - a)
console.log(`  最长 ${lens[0]}  中位 ${lens[Math.floor(lens.length / 2)]}  最短 ${lens.at(-1)}`)
console.log(`  top5: ${lens.slice(0, 5).join(', ')}`)

console.log('\n=== 疑似会产出超大输出的调用 ===')
for (const c of codes) {
  if (!/tools\.glob\(\{[^}]*\*\*\/\*/.test(c.code) && !/JSON\.stringify\(\s*r\s*,\s*null\s*,\s*2\s*\)/.test(c.code)) continue
  console.log(`  T${c.turn}/S${c.step}  ${c.desc}`)
  console.log(`    ${c.code.replace(/\s+/g, ' ').slice(0, 200)}`)
}
