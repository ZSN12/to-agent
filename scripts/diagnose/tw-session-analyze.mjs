#!/usr/bin/env node
/**
 * 单个 DSH 会话日志的逐轮体检（只读）。
 *
 * 用法：
 *   node scripts/diagnose/tw-session-analyze.mjs                 # 最近修改的会话
 *   node scripts/diagnose/tw-session-analyze.mjs <sessionId>     # 指定 sessionId（子串匹配）
 *   node scripts/diagnose/tw-session-analyze.mjs --list          # 列出最近的会话
 *
 * 重点回答「这一轮是不是卡住了 / 卡在哪」：
 *   - 逐轮耗时、首块延迟、分片事件数
 *   - 推理分片 vs 正文分片（只推理不出字 = 正在空转）
 *   - 工具调用次数与**失败数**（工具连败通常是模型反复重试的直接原因）
 *   - 最后一个没有 turn/end 的轮次（= 仍在跑或已崩）
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'

const APP_DATA = path.join(os.homedir(), 'Library', 'Application Support', 'taskweaver-desktop')
const SESSIONS_DIR = path.join(APP_DATA, 'dsh', 'sessions')

/** session.jsonl.zstd 是**多帧拼接**的 zstd：`zstdDecompressSync` 只解第一帧，必须逐帧扫 magic。 */
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
    const slice = buf.subarray(starts[i], i + 1 < starts.length ? starts[i + 1] : buf.length)
    try { parts.push(zlib.zstdDecompressSync(slice)) } catch { /* 帧边界误判，跳过 */ }
  }
  return { text: Buffer.concat(parts).toString('utf8'), frames: starts.length, decoded: parts.length }
}

function listSessions() {
  const out = []
  if (!fs.existsSync(SESSIONS_DIR)) return out
  for (const slug of fs.readdirSync(SESSIONS_DIR)) {
    const slugDir = path.join(SESSIONS_DIR, slug)
    if (!fs.statSync(slugDir).isDirectory()) continue
    for (const sessionId of fs.readdirSync(slugDir)) {
      const log = path.join(slugDir, sessionId, 'session.jsonl.zstd')
      if (!fs.existsSync(log)) continue
      const st = fs.statSync(log)
      out.push({ sessionId, slug, log, bytes: st.size, mtime: st.mtimeMs })
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

const args = process.argv.slice(2)
const all = listSessions()

if (args.includes('--list') || all.length === 0) {
  console.log(`共 ${all.length} 个会话（按修改时间倒序，最多 25 个）\n`)
  for (const s of all.slice(0, 25)) {
    console.log(`${new Date(s.mtime).toLocaleString('zh-CN')}  ${(s.bytes / 1024).toFixed(1).padStart(8)} KB  ${s.sessionId}`)
    console.log(`      ${s.slug}`)
  }
  process.exit(0)
}

const wanted = args.find((a) => !a.startsWith('--'))
const target = wanted ? (all.find((s) => s.sessionId.includes(wanted)) ?? all[0]) : all[0]
if (wanted && !all.some((s) => s.sessionId.includes(wanted))) {
  console.error(`未找到包含 "${wanted}" 的会话，改用最近的 ${target.sessionId}`)
}

const buf = fs.readFileSync(target.log)
const { text, frames, decoded } = decompressMultiFrame(buf)
const rows = text.split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l) } catch { return null } })
  .filter(Boolean)

console.log(`会话   : ${target.sessionId}`)
console.log(`路径   : ${target.log}`)
console.log(`大小   : ${(buf.length / 1024).toFixed(1)} KB → ${frames} 帧（解出 ${decoded}）→ ${rows.length} 条事件`)
console.log(`修改于 : ${new Date(target.mtime).toLocaleString('zh-CN')}`)

const fmt = (ms) => `${(ms / 1000).toFixed(1)}s`
const fmtMin = (ms) => (ms >= 60_000 ? `${Math.floor(ms / 60000)}分${Math.round((ms % 60000) / 1000)}秒` : fmt(ms))

// ===== 逐轮统计 =====
const turns = []
let turn = null
for (const r of rows) {
  if (r.type === 'turn/start') {
    turn = {
      start: r.time, seq0: r.seq, steps: 0, tools: 0, toolErrors: 0,
      reasonDeltas: 0, textDeltas: 0, firstReasonAt: null, firstTextAt: null,
      firstChunkAt: null, retries: 0, toolNames: new Map(),
    }
    continue
  }
  if (!turn) continue
  if (r.type === 'step/start') turn.steps += 1
  if (r.type === 'assistant/chunk') {
    const c = r.data?.chunk
    if (turn.firstChunkAt === null) turn.firstChunkAt = r.time
    if (c?.type === 'reasoning-delta') {
      turn.reasonDeltas += 1
      if (turn.firstReasonAt === null) turn.firstReasonAt = r.time
    } else if (c?.type === 'text-delta') {
      turn.textDeltas += 1
      if (turn.firstTextAt === null) turn.firstTextAt = r.time
    }
  }
  if (r.type === 'tool/call') {
    turn.tools += 1
    const name = r.data?.name ?? 'unknown'
    turn.toolNames.set(name, (turn.toolNames.get(name) ?? 0) + 1)
  }
  if (r.type === 'tool/result') {
    if (r.data?.error || r.data?.message?.isError) turn.toolErrors += 1
  }
  if (/retry/.test(String(r.type))) turn.retries += 1
  if (r.type === 'turn/end') {
    turn.end = r.time
    turn.reason = r.data?.reason?.kind ?? JSON.stringify(r.data?.reason ?? null)
    turn.duration = turn.end - turn.start
    turns.push(turn)
    turn = null
  }
}
const unfinished = turn
if (unfinished) {
  unfinished.end = rows.at(-1)?.time ?? Date.now()
  unfinished.duration = unfinished.end - unfinished.start
  unfinished.unfinished = true
}

console.log('\n=== 逐轮 ===')
turns.forEach((t, i) => {
  console.log(
    `Turn ${String(i + 1).padStart(2)}  ${fmtMin(t.duration).padStart(9)}` +
    `  首块 ${t.firstChunkAt ? fmt(t.firstChunkAt - t.start) : 'n/a'}`.padEnd(18) +
    `  推理分片 ${String(t.reasonDeltas).padStart(5)}  正文分片 ${String(t.textDeltas).padStart(5)}` +
    `  step ${String(t.steps).padStart(2)}  工具 ${String(t.tools).padStart(3)}(失败 ${t.toolErrors})  重试 ${t.retries}  ${t.reason ?? ''}`,
  )
})

if (unfinished) {
  console.log(
    `\n⚠️  最后一轮没有 turn/end（仍在运行或异常中断）\n` +
    `    已持续 ${fmtMin(unfinished.duration)}   推理分片 ${unfinished.reasonDeltas}   正文分片 ${unfinished.textDeltas}\n` +
    `    step ${unfinished.steps}   工具调用 ${unfinished.tools}（失败 ${unfinished.toolErrors}）   重试 ${unfinished.retries}\n` +
    `    首块延迟 ${unfinished.firstChunkAt ? fmt(unfinished.firstChunkAt - unfinished.start) : 'n/a'}` +
    `   首个正文 ${unfinished.firstTextAt ? fmt(unfinished.firstTextAt - unfinished.start) : '尚未产生正文'}`,
  )
  if (unfinished.reasonDeltas > 0 && unfinished.textDeltas === 0) {
    console.log('    → 只在推理、没有正文：模型在空转（思考等级过高 / 反复重试）')
  }
}

const done = turns.filter((t) => !t.unfinished)
if (done.length) {
  console.log('\n=== 已完成轮次汇总 ===')
  console.log(`轮次数          : ${done.length}`)
  console.log(`累计耗时        : ${fmtMin(done.reduce((a, t) => a + t.duration, 0))}`)
  console.log(`单轮最长        : ${fmtMin(Math.max(...done.map((t) => t.duration)))}`)
  console.log(`累计推理分片    : ${done.reduce((a, t) => a + t.reasonDeltas, 0)}`)
  console.log(`累计正文分片    : ${done.reduce((a, t) => a + t.textDeltas, 0)}`)
  console.log(`累计工具调用    : ${done.reduce((a, t) => a + t.tools, 0)}（失败 ${done.reduce((a, t) => a + t.toolErrors, 0)}）`)
}

// ===== 工具使用与失败 =====
// 注意：同一 callId 可能有**多条** tool/result —— resume 之后 compaction 会以
// `surfaceOp: replace` 把旧结果重写成压缩版（时间戳集中在同一秒）。取「最后一个」
// 会把耗时算成几分钟。真实耗时必须取**第一个** result。
const toolAgg = new Map()
const callIndex = new Map()
const firstResult = new Map()
for (const r of rows) {
  if (r.type === 'tool/call') {
    const name = r.data?.name ?? 'unknown'
    if (!toolAgg.has(name)) toolAgg.set(name, { calls: 0, errors: 0, totalMs: 0, maxMs: 0, replayed: 0 })
    toolAgg.get(name).calls += 1
    callIndex.set(r.data?.callId, { name, t: r.time })
  }
  if (r.type === 'tool/result') {
    const callId = r.data?.message?.source?.callId
    const call = callIndex.get(callId)
    if (!call) continue
    const agg = toolAgg.get(call.name)
    if (!agg) continue
    const isError = Boolean(r.data?.error || r.data?.message?.isError)
    if (isError) agg.errors += 1
    if (firstResult.has(callId)) {
      agg.replayed += 1
      continue
    }
    firstResult.set(callId, true)
    const dur = r.time - call.t
    agg.totalMs += dur
    agg.maxMs = Math.max(agg.maxMs, dur)
  }
}
console.log('\n=== 工具使用（按调用次数；耗时为「首次 result − call」） ===')
;[...toolAgg.entries()].sort((a, b) => b[1].calls - a[1].calls)
  .forEach(([name, a]) => {
    const flag = a.errors > 0 ? `  ⚠️ 失败 ${a.errors}` : ''
    const rp = a.replayed > 0 ? `  重放 ${a.replayed}` : ''
    console.log(`  ${name.padEnd(16)} 调用 ${String(a.calls).padStart(3)}  累计 ${fmtMin(a.totalMs).padStart(9)}  最慢 ${fmtMin(a.maxMs).padStart(9)}${flag}${rp}`)
  })

// ===== 工具报错原文采样 =====
const errors = []
for (const r of rows) {
  if (r.type !== 'tool/result') continue
  if (!(r.data?.error || r.data?.message?.isError)) continue
  const content = r.data?.message?.content
  const textPart = Array.isArray(content)
    ? content.filter((p) => p?.type === 'text').map((p) => p.text).join('')
    : String(r.data?.error ?? '')
  errors.push({ time: r.time, callId: r.data?.message?.source?.callId, text: textPart.slice(0, 300) })
}
console.log(`\n=== 工具报错（${errors.length} 条，最多显示 8 条） ===`)
for (const e of errors.slice(0, 8)) {
  console.log(`  ${new Date(e.time).toLocaleTimeString('zh-CN')}  ${e.callId ?? ''}`)
  console.log(`    ${e.text.replace(/\s+/g, ' ').trim()}`)
}

// ===== 请求头（provider/model/effort 变化） =====
// 注意层级：request/header 的负载形状是 data.header.config（不是 data.config）。
// 只读 data.config 会全部打印 undefined，从而误判「没拿到模型信息」。
const headers = rows.filter((r) => r.type === 'request/header')
console.log(`\n=== request/header（${headers.length} 条） ===`)
headers.forEach((h) => {
  const cfg = h.data?.header?.config ?? h.data?.config ?? {}
  const tools = h.data?.header?.tools
  const toolNames = Array.isArray(tools) ? tools.map((t) => t?.name ?? t?.function?.name).filter(Boolean) : null
  console.log(`  seq ${String(h.seq).padStart(5)}  ${h.data?.reason ?? '?'}  ${cfg.provider}/${cfg.model}  effort=${cfg.reasoningEffort ?? '-'}  maxTokens=${cfg.maxTokens ?? '-'}`)
  if (toolNames) console.log(`        暴露工具 ${toolNames.length} 个: ${toolNames.join(', ')}`)
})
