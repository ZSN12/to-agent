#!/usr/bin/env node
/**
 * 只读：Code Mode 会话的细粒度取证。
 *   - permission / sandbox / approval 预设实际值
 *   - run_code 提交的 code 参数（看模型到底在写什么）
 *   - tool/code-dispatch（run_code 内部派发的子工具）
 *   - compaction/prune 每次抹掉多少 token
 *   - spill（超大工具输出被截断）规模
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

const j = (v, n = 220) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v ?? null)
  return s.length > n ? `${s.slice(0, n)}…` : s
}

console.log(`会话: ${target.id}\n`)

console.log('=== 权限 / 沙箱 / 审批 ===')
for (const r of rows) {
  if (!['permission/preset', 'sandbox/mode', 'approval/policy', 'command/run', 'command/done'].includes(r.type)) continue
  console.log(`  ${r.type.padEnd(20)} ${j(r.data, 200)}`)
}

console.log('\n=== session 头（首条） ===')
const head = rows.find((r) => r.type === 'session')
if (head) console.log('  ' + j(head, 600))

console.log('\n=== run_code 提交的 code 参数（前 8 条） ===')
const calls = rows.filter((r) => r.type === 'tool/call')
console.log(`  共 ${calls.length} 条 tool/call；data keys = ${Object.keys(calls[0]?.data ?? {}).join(',')}`)
for (const c of calls.slice(0, 8)) {
  const a = c.data?.arguments ?? c.data?.input ?? c.data?.args ?? c.data?.params
  console.log(`  --- ${c.data?.name}  ${c.data?.callId}`)
  if (a && typeof a === 'object') {
    for (const [k, v] of Object.entries(a)) {
      console.log(`      ${k}: ${j(v, 300)}`)
    }
  } else {
    console.log(`      (无参数对象) ${j(c.data, 300)}`)
  }
}

console.log('\n=== tool/code-dispatch（run_code 内部派发的子工具） ===')
const disp = rows.filter((r) => r.type === 'tool/code-dispatch')
const counter = new Map()
for (const d of disp) {
  const name = d.data?.tool ?? d.data?.name ?? d.data?.toolName ?? JSON.stringify(d.data).slice(0, 40)
  counter.set(name, (counter.get(name) ?? 0) + 1)
}
console.log(`  共 ${disp.length} 条；样例: ${j(disp[0]?.data, 240)}`)
;[...counter.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`    ${String(k).padEnd(28)} ${v}`))

console.log('\n=== compaction/prune ===')
const pr = rows.filter((r) => r.type === 'compaction/prune')
const toks = pr.map((r) => r.data?.shadowedTokenCount ?? 0)
console.log(`  ${pr.length} 次；每次抹掉 tokens: ${toks.join(', ')}；合计 ${toks.reduce((a, b) => a + b, 0)}`)

console.log('\n=== spill（超大工具输出被截断） ===')
const spillSizes = []
for (const r of rows) {
  const s = JSON.stringify(r.data ?? '')
  const m = /Omitted (\d+) bytes/.exec(s)
  if (m) spillSizes.push({ seq: r.seq, bytes: Number(m[1]) })
}
console.log(`  ${spillSizes.length} 处；合计 ${(spillSizes.reduce((a, b) => a + b.bytes, 0) / 1048576).toFixed(1)} MB`)
for (const s of spillSizes.slice(0, 6)) console.log(`    seq ${s.seq}  ${(s.bytes / 1048576).toFixed(1)} MB`)

console.log('\n=== step 数 / assistant 消息数 ===')
console.log(`  step/start ${rows.filter((r) => r.type === 'step/start').length}   assistant/message ${rows.filter((r) => r.type === 'assistant/message').length}`)
