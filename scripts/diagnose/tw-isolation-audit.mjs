#!/usr/bin/env node
/**
 * 多会话隔离审计：把 UI 线程表、DSH 会话映射表、DSH 会话目录三方对账。
 *
 * 检查四类问题：
 *   1. 孤儿映射   —— thread 已删除，但 dsh-session-map.json 仍留着条目
 *   2. 孤儿日志   —— dsh/sessions/** 下有会话目录，但映射表里没有
 *   3. 根目录绑定 —— 会话的 cwd 是文件系统根（未选工作区就发消息的后果）
 *   4. 失忆会话   —— thread 有消息，但从未建立 DSH 会话（模型看不到历史）
 *
 * 只读，不修改任何文件。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const APP_DATA = path.join(os.homedir(), 'Library', 'Application Support', 'taskweaver-desktop')
const THREADS_FILE = path.join(APP_DATA, 'taskweaver-threads.json')
const MAP_FILE = path.join(APP_DATA, 'taskweaver', 'dsh-session-map.json')
const SESSIONS_DIR = path.join(APP_DATA, 'dsh', 'sessions')

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    console.error(`读取失败 ${file}: ${error.message}`)
    return null
  }
}

const threadsRaw = readJson(THREADS_FILE)
const mapRaw = readJson(MAP_FILE)
if (!threadsRaw || !mapRaw) process.exit(1)

const threads = Object.values(threadsRaw.threads ?? {})
const mapEntries = mapRaw.sessions ?? {}

const byConversation = new Map()
for (const thread of threads) {
  if (thread.conversationId) byConversation.set(thread.conversationId, thread)
}

/** 扫描 dsh/sessions/<slug>/<sessionId>/ 收集磁盘上的会话目录。 */
const onDisk = new Map()
if (fs.existsSync(SESSIONS_DIR)) {
  for (const slug of fs.readdirSync(SESSIONS_DIR)) {
    const slugDir = path.join(SESSIONS_DIR, slug)
    if (!fs.statSync(slugDir).isDirectory()) continue
    for (const sessionId of fs.readdirSync(slugDir)) {
      const log = path.join(slugDir, sessionId, 'session.jsonl.zstd')
      if (!fs.existsSync(log)) continue
      onDisk.set(sessionId, { slug, log, bytes: fs.statSync(log).size })
    }
  }
}

const isFsRoot = (p) => p === '/' || /^[A-Za-z]:[\\/]$/.test(p)

console.log(`线程表      : ${threads.length} 个线程`)
console.log(`映射表      : ${Object.keys(mapEntries).length} 条`)
console.log(`磁盘会话目录: ${onDisk.size} 个`)
console.log('')

let problems = 0

const orphanMap = Object.entries(mapEntries).filter(([conversationId]) => !byConversation.has(conversationId))
console.log(`【1】孤儿映射（thread 已删除，映射仍残留）: ${orphanMap.length} 条`)
for (const [conversationId, entry] of orphanMap) {
  const disk = onDisk.get(entry.sessionId)
  const size = disk ? `，磁盘日志 ${(disk.bytes / 1024).toFixed(1)} KB 仍在` : ''
  console.log(`    ${conversationId} → ${entry.sessionId}${size}`)
  problems += 1
}

const mapSessionIds = new Set(Object.values(mapEntries).map((e) => e.sessionId))
const orphanDisk = [...onDisk.entries()].filter(([sessionId]) => !mapSessionIds.has(sessionId))
console.log(`\n【2】孤儿日志（磁盘有会话，映射表里没有）: ${orphanDisk.length} 个`)
for (const [sessionId, info] of orphanDisk) {
  const kind = sessionId.startsWith('tw-skills-catalog') ? '技能目录会话（工具会话）' : '未知来源'
  console.log(`    ${sessionId}  [${info.slug}]  ${(info.bytes / 1024).toFixed(1)} KB  (${kind})`)
}

const rootBound = Object.entries(mapEntries).filter(([, entry]) => isFsRoot(entry.cwd))
console.log(`\n【3】根目录绑定（cwd 是文件系统根，沙箱边界失效）: ${rootBound.length} 条`)
for (const [conversationId, entry] of rootBound) {
  const thread = byConversation.get(conversationId)
  const msgs = thread ? (thread.messages ?? []).length : '线程已删除'
  console.log(`    ${conversationId}  cwd=${entry.cwd}  消息数=${msgs}`)
  console.log(`      → DSH 沙箱边界 = 会话 cwd（sandbox-policy: workspaceRoot = session.header.cwd）`)
  problems += 1
}

const amnesiac = threads.filter((thread) => {
  if (!thread.conversationId) return false
  if (!(thread.messages ?? []).length) return false
  return !mapEntries[thread.conversationId]
})
console.log(`\n【4】失忆会话（有 UI 消息但无 DSH 会话，模型看不到历史）: ${amnesiac.length} 个`)
for (const thread of amnesiac) {
  console.log(`    conv=${thread.conversationId}  消息数=${(thread.messages ?? []).length}  ws=${thread.workspacePath ?? '(未设置)'}`)
  problems += 1
}

console.log('\n=== 汇总 ===')
console.log(`  发现问题 ${problems} 项（孤儿日志不计入，技能目录会话属正常）`)
console.log('  说明：仓库里没有对话历史注入逻辑，模型上下文完全依赖 DSH 会话日志，')
console.log('        所以「失忆会话」一旦发消息，模型会从零开始。')
