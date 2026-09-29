#!/usr/bin/env node
import fs from 'node:fs'

const rows = fs.readFileSync('/tmp/tw-session.jsonl', 'utf8').split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

const fmt = (ms) => `${(ms / 1000).toFixed(2)}s`
const CHUNK_TYPES = new Set(['assistant/chunk', 'reasoning-chunks', 'text-chunks', 'tool-call-chunks'])

console.log('=== 逐轮时间线 ===')
let turn = null
const turns = []
for (const r of rows) {
  if (r.type === 'turn/start') { turn = { start: r.time, chunks: 0, steps: 0, tools: 0, firstChunkAt: null, firstTextAt: null, reason: null, seq0: r.seq } }
  if (!turn) continue
  if (CHUNK_TYPES.has(r.type)) {
    turn.chunks += 1
    if (turn.firstChunkAt === null) turn.firstChunkAt = r.time
  }
  if (r.type === 'assistant/chunk') {
    const c = r.data?.chunk
    if (c?.type === 'text-delta' && turn.firstTextAt === null) turn.firstTextAt = r.time
  }
  if (r.type === 'step/start') turn.steps += 1
  if (r.type === 'tool/call') turn.tools += 1
  if (r.type === 'turn/end') {
    turn.end = r.time
    turn.reason = r.data?.reason?.kind ?? JSON.stringify(r.data?.reason ?? null)
    turn.duration = turn.end - turn.start
    turn.ttfc = turn.firstChunkAt ? turn.firstChunkAt - turn.start : null
    turns.push(turn); turn = null
  }
}
if (turn) { turn.end = rows.at(-1).time; turn.duration = turn.end - turn.start; turns.push(turn) }

turns.forEach((t, i) => {
  console.log(
    `Turn ${String(i + 1).padStart(2)}  总耗时 ${fmt(t.duration).padStart(8)}` +
    `   首块延迟 ${t.ttfc != null ? fmt(t.ttfc).padStart(8) : '     n/a'}` +
    `   分片事件 ${String(t.chunks).padStart(5)}   step ${String(t.steps).padStart(2)}   工具调用 ${String(t.tools).padStart(2)}   ${t.reason ?? ''}`,
  )
})

console.log('\n=== 汇总 ===')
const totalChunks = turns.reduce((a, t) => a + t.chunks, 0)
console.log(`轮次数            : ${turns.length}`)
console.log(`分片事件总数      : ${totalChunks}`)
console.log(`每轮平均分片事件  : ${(totalChunks / turns.length).toFixed(0)}`)
console.log(`全部轮次累计耗时  : ${fmt(turns.reduce((a, t) => a + t.duration, 0))}`)
console.log(`单轮最长耗时      : ${fmt(Math.max(...turns.map((t) => t.duration)))}`)
console.log(`\n→ 主进程需要为上述 ${totalChunks} 个分片事件各做一次「整份快照序列化 + IPC 推送」`)

console.log('\n=== LLM 重试事件 ===')
for (const r of rows.filter((x) => /llm\/retry/.test(x.type))) {
  console.log(`  seq ${r.seq}  ${new Date(r.time).toISOString()}  ${r.type}  ${JSON.stringify(r.data).slice(0, 220)}`)
}

console.log('\n=== 用户消息 → 首块 延迟（按 user/message 计） ===')
const userMsgs = rows.filter((r) => r.type === 'user/message')
userMsgs.forEach((u, i) => {
  const next = rows.find((r) => r.time > u.time && CHUNK_TYPES.has(r.type))
  console.log(`  #${i + 1} ${new Date(u.time).toISOString()}  → 首块 ${next ? fmt(next.time - u.time) : 'n/a'}`)
})

console.log('\n=== 工具调用耗时 Top 10 ===')
const calls = new Map()
for (const r of rows) {
  if (r.type === 'tool/call') calls.set(r.data?.callId, { name: r.data?.name, t: r.time })
  if (r.type === 'tool/result') {
    const c = calls.get(r.data?.message?.source?.callId)
    if (c) c.dur = r.time - c.t
  }
}
;[...calls.values()].filter((c) => c.dur != null).sort((a, b) => b.dur - a.dur).slice(0, 10)
  .forEach((c) => console.log(`  ${String(c.name).padEnd(14)} ${fmt(c.dur)}`))
