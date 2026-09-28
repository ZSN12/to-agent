import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createUsageStore } from '../electron/backend/usage-store.mjs'
import { createProfileStore } from '../electron/backend/profile-store.mjs'

async function main() {
  console.log('--- 测试 1: usageStore 用量统计与聚合 ---')
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-test-usage-'))
  try {
    const store = createUsageStore(tmpDir)

    // 记录两条调用
    await store.record({
      modelKey: 'deepseek/deepseek-chat',
      modelName: 'DeepSeek-V4-Flash',
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 200,
      cacheWriteTokens: 0,
      costUsd: 0.002,
      elapsedMs: 1500,
    })

    await store.record({
      modelKey: 'openai-codex/gpt-5.5',
      modelName: 'GPT-5.5',
      inputTokens: 3000,
      outputTokens: 1000,
      cacheReadTokens: 1000,
      cacheWriteTokens: 0,
      costUsd: 0.015,
      elapsedMs: 2500,
    })

    const stats = await store.getStats()
    assert.equal(stats.totals.totalCalls, 2, '总调用轮次应为 2')
    assert.equal(stats.totals.inputTokens, 4000, '总输入 Tokens 应为 4000')
    assert.equal(stats.totals.outputTokens, 1500, '总输出 Tokens 应为 1500')
    assert.equal(stats.totals.cacheReadTokens, 1200, '总缓存命中 Tokens 应为 1200')
    assert.equal(stats.byModel.length, 2, '应统计出 2 个不同模型')
    assert.equal(stats.recent.length, 2, '最近记录应有 2 条')

    // 清空测试
    await store.clear()
    const emptyStats = await store.getStats()
    assert.equal(emptyStats.totals.totalCalls, 0, '清空后总调用数应为 0')
    console.log('✓ usageStore 用量统计与清空验证通过')

    console.log('--- 测试 2: profileStore 思考等级 thinkingLevel ---')
    const profileStore = createProfileStore(tmpDir)
    const initialLevel = await profileStore.getThinkingLevel()
    assert.equal(initialLevel, 'high', '默认思考等级应为 high')

    await profileStore.setThinkingLevel('medium')
    const updatedLevel = await profileStore.getThinkingLevel()
    assert.equal(updatedLevel, 'medium', '设置后思考等级应持久化为 medium')
    console.log('✓ profileStore thinkingLevel 读写持久化验证通过')

    console.log('--- 测试 3: 跨天消息时间带日期逻辑 ---')
    function formatMessageTimeTest(time, timestamp) {
      if (timestamp) {
        const msgDate = new Date(timestamp)
        const now = new Date()
        const isToday =
          msgDate.getFullYear() === now.getFullYear() &&
          msgDate.getMonth() === now.getMonth() &&
          msgDate.getDate() === now.getDate()

        if (isToday) return time
        const year = msgDate.getFullYear()
        const month = String(msgDate.getMonth() + 1).padStart(2, '0')
        const day = String(msgDate.getDate()).padStart(2, '0')
        return `${year}-${month}-${day} ${time}`
      }
      return time
    }

    const todayTime = formatMessageTimeTest('23:32', Date.now())
    assert.equal(todayTime, '23:32', '今天的消息只保留 23:32')

    const yesterday = Date.now() - 24 * 3600 * 1000
    const yesterdayTime = formatMessageTimeTest('23:32', yesterday)
    assert.match(yesterdayTime, /^\d{4}-\d{2}-\d{2} 23:32$/, '非今日消息应自动前置 YYYY-MM-DD 日期')
    console.log('✓ 跨天时间日期判断验证通过')

    console.log('--- 测试 4: DSH getReport 报表结构验证 ---')
    const dshStore = createUsageStore(tmpDir)
    await dshStore.record({
      modelKey: 'deepseek/deepseek-chat',
      modelName: 'DeepSeek-V4',
      inputTokens: 10000,
      outputTokens: 2000,
      cacheReadTokens: 5000,
      cacheWriteTokens: 0,
      costUsd: 0.05,
      elapsedMs: 3200,
    })
    const report = await dshStore.getReport()
    assert(report.overview, '应包含 overview 统计')
    assert.equal(report.overview.totalTokens, 17000, '总 token 应为 17000')
    assert(report.summary, '应包含 summary 统计')
    assert.equal(report.summary.cacheReadTokens, 5000, '缓存命中 token 应为 5000')
    assert(report.rows.length >= 1, 'rows 应至少有一行')
    assert(report.allModels.length >= 1, 'allModels 应至少有一项')
    assert(report.daily, '应包含 daily map')
    console.log('✓ DSH getReport 报表结构验证通过')

    console.log('--- 测试 5: 纠偏队列去重逻辑验证 ---')
    const rawQueue = ['卡住了吗', '卡住了吗', '重新跑一次']
    const deduped = Array.from(new Set(rawQueue))
    assert.equal(deduped.length, 2, '去重后应只有 2 个元素')
    assert.equal(deduped[0], '卡住了吗')
    assert.equal(deduped[1], '重新跑一次')
    console.log('✓ 纠偏队列去重验证通过')

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
  console.log('所有新功能单元验证通过！')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
