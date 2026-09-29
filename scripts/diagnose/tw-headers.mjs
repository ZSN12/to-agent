#!/usr/bin/env node
/**
 * 从真实会话日志里抽出所有 `request/header`，看：
 *   - reason（initial / change / resume）
 *   - config.provider / model / reasoningEffort
 * 用来判断 TaskWeaver 是否每轮都在切模型（selectModel 抖动）。
 *
 * 用法:
 *   node scripts/diagnose/tw-headers.mjs [会话目录]
 * 不传参数则自动挑选最近修改过的会话。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'

const DSH_HOME = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'taskweaver-desktop',
  'dsh',
)

function decompressAll(file) {
  const buf = fs.readFileSync(file)
  const out = []
  let off = 0
  while (off < buf.length) {
    const slice = buf.subarray(off)
    let decoded
    try {
      decoded = zlib.zstdDecompressSync(slice)
    } catch {
      break
    }
    out.push(decoded)
    let next = -1
    for (let i = 4; i < slice.length - 3; i += 1) {
      if (slice[i] === 0x28 && slice[i + 1] === 0xb5 && slice[i + 2] === 0x2f && slice[i + 3] === 0xfd) {
        next = i
        break
      }
    }
    if (next < 0) break
    off += next
  }
  return Buffer.concat(out).toString('utf8')
}

function latestSessionDir() {
  const sessionsRoot = path.join(DSH_HOME, 'sessions')
  if (!fs.existsSync(sessionsRoot)) throw new Error(`找不到 sessions 目录: ${sessionsRoot}`)
  const candidates = []
  for (const slug of fs.readdirSync(sessionsRoot)) {
    const slugDir = path.join(sessionsRoot, slug)
    if (!fs.statSync(slugDir).isDirectory()) continue
    for (const sid of fs.readdirSync(slugDir)) {
      const file = path.join(slugDir, sid, 'session.jsonl.zstd')
      if (fs.existsSync(file)) candidates.push({ file, mtime: fs.statSync(file).mtimeMs, slug, sid })
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime)
  return candidates[0]
}

const arg = process.argv[2]
const target = arg
  ? { file: path.join(arg, 'session.jsonl.zstd'), slug: '(arg)', sid: path.basename(arg) }
  : latestSessionDir()

console.log('会话文件:', target.file)
console.log('修改时间:', new Date(fs.statSync(target.file).mtimeMs).toLocaleString())
console.log('')

const text = decompressAll(target.file)
const events = text
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => {
    try {
      return JSON.parse(line)
    } catch {
      return null
    }
  })
  .filter(Boolean)

console.log(`共 ${events.length} 条事件\n`)

const headers = events.filter((e) => e.type === 'request/header')
console.log(`=== request/header 共 ${headers.length} 条 ===`)
let prevKey = null
for (const [i, e] of headers.entries()) {
  const c = e.data?.header?.config ?? {}
  const reason = e.data?.reason ?? '(none)'
  const key = `${c.provider}/${c.model}/${c.reasoningEffort}`
  const changed = prevKey !== null && prevKey !== key ? '  ← 变了！' : ''
  const changedReason = reason !== 'initial' && reason !== 'resume' ? '  ← 非 initial/resume' : ''
  console.log(
    `  #${String(i + 1).padStart(3)}  ${String(reason).padEnd(9)} ` +
      `${String(c.provider ?? '?')}/${String(c.model ?? '?')}  effort=${String(c.reasoningEffort)}  ` +
      `maxTokens=${String(c.maxTokens)}${changed}${changedReason}`,
  )
  prevKey = key
}

console.log('\n=== 所有 /permission 命令 ===')
for (const e of events) {
  if (e.type !== 'command/run') continue
  const t = e.data?.command?.text ?? e.data?.text ?? ''
  if (String(t).includes('/permission')) console.log(`  ${t}`)
}

console.log('\n=== 用户消息长度（看是否被注入大段文本）===')
for (const e of events) {
  if (e.type !== 'user/message') continue
  const content = e.data?.message?.content ?? []
  const textPart = content.find?.((c) => c.type === 'text')?.text ?? ''
  console.log(`  ${String(textPart.length).padStart(7)} 字符   开头: ${JSON.stringify(textPart.slice(0, 70))}`)
}
