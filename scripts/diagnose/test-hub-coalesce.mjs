#!/usr/bin/env node
/**
 * 验证 z-conversation-hub 的投影推送合并：
 * 连续投喂 N 个 mux 帧，统计 webContents.send('chat:dshView') 实际被调用多少次。
 * 期望：远小于 N（合并窗口内只推一次最新快照）。
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const PROJECT = '/Users/zsn/Documents/毕设'
const { createZHostManager } = await import(path.join(PROJECT, 'electron', 'agent', 'z-host', 'spawn-host.mjs'))
const { createZConversationHub } = await import(path.join(PROJECT, 'electron', 'backend', 'z-conversation-hub.mjs'))

const runtimeRoot = path.join(PROJECT, 'vendor', 'taskweaver-z-runtime')
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-hub-'))
const host = createZHostManager({ runtimeRoot, userDataPath, executable: process.execPath, startTimeoutMs: 90_000 })
const { api } = await host.start()

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ws-'))
const sessionId = `hub-test-${Date.now()}`
await api.sessions.create({ sessionId, cwd, agentPreset: 'code' })

function makeFakeWebContents() {
  const sent = []
  return {
    sent,
    isDestroyed: () => false,
    send: (channel, payload) => { if (channel === 'chat:dshView') sent.push(payload) },
    once: () => {},
    removeListener: () => {},
  }
}

async function runCase(label, coalesceMs) {
  const hub = createZConversationHub({ runtimeRoot, coalesceMs })
  hub.bindApi(api)
  const wc = makeFakeWebContents()
  const conversationId = `conv-${coalesceMs}-${Date.now()}`
  await hub.attachSession(conversationId, sessionId, wc)

  // 等首次 attach 的推送稳定
  await new Promise((r) => setTimeout(r, 80))
  const baseline = wc.sent.length

  const N = 400
  for (let i = 0; i < N; i += 1) {
    await hub.handleMuxEnvelope({
      rpcId: `rpc-${i}`,
      payload: {
        type: 'session/event',
        sessionId,
        event: {
          type: 'assistant/chunk',
          seq: i,
          time: Date.now(),
          data: { chunk: { type: 'text-delta', text: `片段${i} ` } },
        },
      },
    })
  }
  await new Promise((r) => setTimeout(r, 200))
  const pushes = wc.sent.length - baseline
  console.log(`\n[${label}] 投喂 ${N} 帧 → 实际推送 ${pushes} 次  (压缩比 ${(N / Math.max(1, pushes)).toFixed(1)}x)`)
  const last = wc.sent.at(-1)
  console.log(`  末次快照 streamingText 长度: ${last?.streamingText?.length ?? 'n/a'}`)
  hub.detachSession(conversationId)
  return { label, pushes, N }
}

const before = await runCase('未合并 (coalesceMs=0)', 0)
const after = await runCase('已合并 (coalesceMs=16)', 16)

console.log('\n=== 结论 ===')
console.log(`  合并前每帧一推: ${before.pushes} 次`)
console.log(`  合并后        : ${after.pushes} 次`)
console.log(`  减少          : ${(((before.pushes - after.pushes) / Math.max(1, before.pushes)) * 100).toFixed(1)}%`)

await host.stop()
fs.rmSync(userDataPath, { recursive: true, force: true })
fs.rmSync(cwd, { recursive: true, force: true })
process.exit(0)
