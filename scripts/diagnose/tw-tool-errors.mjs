#!/usr/bin/env node
/**
 * 只读：把会话里所有 tool/result 的**失败原文**完整打印出来（不截断）。
 * 用于区分「模型自己写错代码」与「harness 链路缺陷」。
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

const calls = new Map()
for (const r of rows) {
  if (r.type === 'tool/call') calls.set(r.data?.callId, { name: r.data?.name, args: r.data?.arguments, turn: r.data?.turn, step: r.data?.step })
}

function textOf(r) {
  const c = r.data?.message?.content
  if (Array.isArray(c)) {
    return c.map((p) => (p?.type === 'text' ? p.text : `[${p?.type}]`)).join('\n')
  }
  return String(r.data?.error ?? '')
}

const seen = new Set()
let n = 0
for (const r of rows) {
  if (r.type !== 'tool/result') continue
  const id = r.data?.message?.source?.callId
  const isErr = Boolean(r.data?.error || r.data?.message?.isError)
  if (!isErr) continue
  if (seen.has(id)) continue
  seen.add(id)
  n += 1
  const call = calls.get(id)
  console.log(`\n──────── 失败 #${n} ────────`)
  console.log(`时间 ${new Date(r.time).toLocaleString('zh-CN')}   turn ${call?.turn} step ${call?.step}   ${call?.name}   ${id}`)
  console.log(`入参: ${String(call?.args).slice(0, 500)}`)
  const t = textOf(r)
  console.log(`结果全文 (${t.length} 字符):`)
  console.log(t.slice(0, 2500))
}
console.log(`\n合计失败 ${n} 处`)
