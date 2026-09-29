#!/usr/bin/env node
import fs from 'node:fs'

const rows = fs.readFileSync('/tmp/tw-session.jsonl', 'utf8').split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

console.log('=== 所有 bash / 工具调用命令（按时间） ===')
const calls = new Map()
for (const r of rows) {
  if (r.type === 'tool/call') {
    let args = {}
    try { args = JSON.parse(r.data?.arguments || '{}') } catch {}
    calls.set(r.data?.callId, { name: r.data?.name, args, t: r.time })
    const cmd = args.command || args.cmd || args.code || ''
    console.log(`  [${new Date(r.time).toISOString().slice(11, 19)}] turn${r.data?.turn ?? '?'} step${r.data?.step ?? '?'} ${String(r.data?.name).padEnd(12)} ${String(cmd).slice(0, 150).replace(/\n/g, ' ⏎ ')}`)
  }
}

console.log('\n=== 命令里出现构建/测试关键字的次数 ===')
const pats = [/pnpm run build/, /npm run build/, /tsc -b/, /vite build/, /pnpm test/, /pnpm run test/, /test:all/]
for (const p of pats) {
  const n = rows.filter((r) => r.type === 'tool/call' && p.test(r.data?.arguments ?? '')).length
  if (n) console.log(`  ${String(p).padEnd(22)} ${n} 次`)
}

console.log('\n=== turn/start 与 step/start 的 data 结构 ===')
console.log('turn/start :', JSON.stringify(rows.find((r) => r.type === 'turn/start')?.data))
console.log('step/start :', JSON.stringify(rows.find((r) => r.type === 'step/start')?.data))
console.log('request/header.reason:', JSON.stringify(rows.filter((r) => r.type === 'request/header').map((r) => ({ seq: r.seq, reason: r.data?.reason, model: r.data?.header?.config?.model, provider: r.data?.header?.config?.provider }))))

console.log('\n=== 是否出现多智能体/DAG 事件 ===')
const orch = rows.filter((r) => /orchestrat|subagent|dag|planner/i.test(JSON.stringify(r).slice(0, 300)))
console.log('  匹配条数:', orch.length)

console.log('\n=== 首条超长用户消息（legacy history）尾部 ===')
const big = rows.find((r) => r.type === 'user/message' && JSON.stringify(r).length > 20000)
if (big) {
  const c = big.data?.message?.content ?? big.data?.content
  const text = Array.isArray(c) ? c.map((p) => p.text ?? '').join('') : String(c)
  console.log('  长度:', text.length)
  console.log('  开头:', text.slice(0, 200).replace(/\n/g, ' ⏎ '))
  console.log('  结尾:', text.slice(-400).replace(/\n/g, ' ⏎ '))
}

console.log('\n=== 会话内累计输入规模估算 ===')
let total = 0
for (const r of rows) {
  if (r.type === 'user/message' || r.type === 'assistant/message') {
    const c = r.data?.message?.content ?? r.data?.content
    const text = Array.isArray(c) ? c.map((p) => p.text ?? '').join('') : (typeof c === 'string' ? c : '')
    total += text.length
  }
}
console.log('  用户+助手消息累计字符:', total)
