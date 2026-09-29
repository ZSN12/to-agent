#!/usr/bin/env node
/**
 * 实测：TaskWeaver 每轮对话前，主进程对 DSH Host 发出的额外 RPC 往返开销。
 * 只读调用，不需要任何凭据。
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const PROJECT = '/Users/zsn/Documents/毕设'
const { createZHostManager } = await import(
  path.join(PROJECT, 'electron', 'agent', 'z-host', 'spawn-host.mjs')
)

const runtimeRoot = path.join(PROJECT, 'vendor', 'taskweaver-z-runtime')
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-bench-'))
console.log('runtimeRoot :', runtimeRoot)
console.log('DSH_HOME    :', path.join(userDataPath, 'dsh'))

const host = createZHostManager({
  runtimeRoot,
  userDataPath,
  executable: process.execPath,
  startTimeoutMs: 90_000,
})

const t0 = Date.now()
const { api, baseUrl } = await host.start()
console.log(`\nHost 启动耗时: ${Date.now() - t0} ms  (${baseUrl})\n`)

async function timeIt(label, fn, rounds = 6) {
  const samples = []
  let last
  for (let i = 0; i < rounds; i += 1) {
    const s = performance.now()
    last = await fn()
    samples.push(performance.now() - s)
  }
  samples.sort((a, b) => a - b)
  const median = samples[Math.floor(samples.length / 2)]
  const min = samples[0]
  const max = samples[samples.length - 1]
  console.log(
    `${label.padEnd(34)} 中位 ${median.toFixed(1).padStart(7)} ms   最小 ${min
      .toFixed(1)
      .padStart(7)} ms   最大 ${max.toFixed(1).padStart(7)} ms   (${rounds} 次)`,
  )
  return { label, median, min, max, last }
}

const results = []
results.push(await timeIt('host.describe', () => api.host.describe({})))
results.push(await timeIt('llm.providers', () => api.llm.providers({})))
results.push(await timeIt('llm.models', () => api.llm.models({})))
results.push(await timeIt('settings.describe', () => api.settings.describe({})))
results.push(
  await timeIt('一次“模型目录”三元组(providers+models+settings)', async () => {
    const [a, b, c] = await Promise.all([
      api.llm.providers({}),
      api.llm.models({}),
      api.settings.describe({}),
    ])
    return [a, b, c]
  }, 4),
)

// sessions.create 需要 cwd，用临时目录
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ws-'))
results.push(
  await timeIt(
    'sessions.create(新会话)',
    () => api.sessions.create({ sessionId: `bench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, cwd, agentPreset: 'code' }),
    4,
  ),
)

const sid = `bench-persist-${Date.now()}`
await api.sessions.create({ sessionId: sid, cwd, agentPreset: 'code' })
results.push(
  await timeIt('sessions.create(恢复已存在会话)', () => api.sessions.create({ sessionId: sid, cwd, agentPreset: 'code' }), 5),
)
results.push(await timeIt('sessions.models(读当前模型)', () => api.sessions.models({ sessionId: sid }), 5))

console.log('\n=== 汇总 ===')
const oneDirectory = results.find((r) => r.label.startsWith('一次')).median
const providers = results.find((r) => r.label === 'llm.providers').median
const models = results.find((r) => r.label === 'llm.models').median
const settings = results.find((r) => r.label === 'settings.describe').median
const resume = results.find((r) => r.label.startsWith('sessions.create(恢复')).median
const readModels = results.find((r) => r.label.startsWith('sessions.models')).median

console.log(`单次模型目录三元组(并行): ${oneDirectory.toFixed(1)} ms`)
console.log(`  串行等价(providers+models+settings): ${(providers + models + settings).toFixed(1)} ms`)
console.log('')
console.log('TaskWeaver chat:send 在真正 prompt 之前的固定往返（按代码路径串行累计）:')
const seq = [
  ['sessions.create（每轮都调，恢复路径）', resume],
  ['api.llm.providers（configureModel 内）', providers],
  ['getDshModelConfig → 目录三元组', providers + models + settings],
  ['listProvidersAuth → 目录三元组（再次）', providers + models + settings],
  ['sessions.models（ensureSessionModelSelection）', readModels],
]
let total = 0
for (const [label, ms] of seq) {
  total += ms
  console.log(`  ${label.padEnd(46)} ${ms.toFixed(1).padStart(8)} ms`)
}
console.log(`  ${'合计（不含 /permission prompt 与真实 prompt）'.padEnd(46)} ${total.toFixed(1).padStart(8)} ms`)
console.log(`\nDSH Web 客户端同等一步: session.prompt 1 次往返。`)
console.log(`额外固定开销倍数 ≈ ${(1 + total / 0).toFixed(0)} 次往返 vs 1 次往返`)

await host.stop()
fs.rmSync(userDataPath, { recursive: true, force: true })
fs.rmSync(cwd, { recursive: true, force: true })
process.exit(0)
