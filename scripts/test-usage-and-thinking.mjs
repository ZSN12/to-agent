import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createUsageStore } from '../desktop/backend/usage-store.mjs'
import { createProfileStore } from '../desktop/backend/profile-store.mjs'

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
    assert.equal(stats.totals.totalTokens, 5500, '缓存读取单列显示，不计入 Token 用量总和')
    assert.equal(stats.byModel.length, 2, '应统计出 2 个不同模型')
    assert.equal(stats.enabled, true, '用量统计默认开启')
    assert.equal(typeof stats.earliestDate, 'string', '公开最早统计日期')
    assert.equal(Object.hasOwn(stats, 'recent'), false, 'API 不暴露逐次调用明细')
    const usagePath = store.filePath
    let persisted = JSON.parse(await fs.readFile(usagePath, 'utf8'))
    assert.equal(persisted.version, 2)
    assert.equal(persisted.buckets.length, 2)
    assert.equal(Object.hasOwn(persisted, 'records'), false, '持久化格式不保留调用记录')
    assert.equal(Object.hasOwn(persisted.buckets[0], 'modelKey'), false, '桶按独立 provider/model 字段索引')
    for (const field of ['id', 'timestamp', 'conversationId', 'elapsedMs']) {
      assert.equal(Object.hasOwn(persisted.buckets[0], field), false, `日桶不持久化 ${field}`)
    }

    await store.setEnabled(false)
    await store.record({ id: 'disabled-call', modelKey: 'deepseek/deepseek-chat', inputTokens: 99 })
    assert.equal((await store.getStats()).totals.totalCalls, 2, '关闭后停止采集新用量')
    await store.setEnabled(true)
    await store.record({ id: 'after-enable', modelKey: 'deepseek/deepseek-chat', inputTokens: 1 })
    assert.equal((await store.getStats()).totals.totalCalls, 3, '重新开启后恢复日汇总')

    // 清空测试
    await store.clear()
    const emptyStats = await store.getStats()
    assert.equal(emptyStats.totals.totalCalls, 0, '清空后总调用数应为 0')
    assert.equal(emptyStats.earliestDate, null, '清空后统计起始日期为空')
    console.log('✓ usageStore 用量统计与清空验证通过')

    console.log('--- 测试 2: profileStore 思考等级 thinkingLevel ---')
    const profileStore = createProfileStore(tmpDir)
    const initialLevel = await profileStore.getThinkingLevel()
    assert.equal(initialLevel, null, '默认不覆盖 DSH 思考档（由 Host 目录 defaultEffort 决定）')

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
      reasoningTokens: 1400,
      costUsd: 0.05,
      elapsedMs: 3200,
    })
    const report = await dshStore.getReport()
    assert(report.overview, '应包含 overview 统计')
    assert.equal(report.overview.totalTokens, 12000, '总 token 不重复计入缓存读取')
    assert(report.summary, '应包含 summary 统计')
    assert.equal(report.summary.cacheReadTokens, 5000, '缓存命中 token 应为 5000')
    assert.equal(report.summary.reasoningTokens, 1400, 'reasoning tokens 单列统计，不重复加进总 token')
    assert(report.rows.length >= 1, 'rows 应至少有一行')
    assert.equal(report.rows[0].cacheReadTokens, 5000, '模型明细单列缓存读取')
    assert.equal(report.rows[0].costUsd, 0.05, '模型日汇总保留费用')
    assert(report.allModels.length >= 1, 'allModels 应至少有一项')
    assert(report.daily, '应包含 daily map')
    const localToday = new Date()
    const todayKey = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, '0')}-${String(localToday.getDate()).padStart(2, '0')}`
    assert(report.daily[todayKey], '今天的用量应按本地日期聚合，不能因为 UTC 时区偏移落到昨天')
    assert.equal(report.earliestDate, todayKey)
    assert.equal(report.overview.peakTokens, 12000, '展示日峰值，不再声称能还原单次调用峰值')
    console.log('✓ DSH getReport 报表结构验证通过')

    console.log('--- 测试 5: v1 明细升级后聚合并删除原始记录 ---')
    const migrationHome = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-test-usage-migration-'))
    try {
      const migrationPath = path.join(migrationHome, 'taskweaver-model-usage.json')
      const historicalDate = new Date(2026, 8, 20, 10).getTime()
      await fs.writeFile(migrationPath, JSON.stringify({ version: 1, records: [
        { id: 'private-call-id', conversationId: 'private-conversation', timestamp: historicalDate,
          modelKey: 'local/mock', inputTokens: 7, outputTokens: 3, cacheReadTokens: 2,
          cacheWriteTokens: 1, totalTokens: 13, costUsd: 0.25, elapsedMs: 123 },
        { id: 'second-call-id', conversationId: 'private-conversation', timestamp: historicalDate,
          modelKey: 'local/mock', inputTokens: 5, outputTokens: 4, cacheReadTokens: 1,
          cacheWriteTokens: 0, totalTokens: 10, costUsd: 0.5, elapsedMs: 456 },
      ] }))
      const migrated = createUsageStore(migrationHome)
      const migratedStats = await migrated.getStats()
      assert.equal(migratedStats.totals.totalCalls, 2)
      assert.equal(migratedStats.totals.totalTokens, 20, 'migration corrects legacy totals that counted cache reads')
      assert.equal(migratedStats.totals.costUsd, 0.75)
      assert.equal(migratedStats.earliestDate, '2026-09-20')
      persisted = JSON.parse(await fs.readFile(migrationPath, 'utf8'))
      assert.equal(persisted.version, 2)
      assert.equal(persisted.buckets.length, 1, 'same date, provider and model collapse into one bucket')
      assert.equal(persisted.buckets[0].calls, 2)
      assert.equal(Object.hasOwn(persisted, 'records'), false, 'legacy per-call data is deleted after successful write')
      assert.equal(JSON.stringify(persisted).includes('private-call-id'), false)
      assert.equal(JSON.stringify(persisted).includes('private-conversation'), false)
    } finally {
      await fs.rm(migrationHome, { recursive: true, force: true })
    }

    console.log('--- 测试 6: 1000 次以上调用不会丢总量 ---')
    const volumeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-test-usage-volume-'))
    try {
      const volume = createUsageStore(volumeHome)
      await Promise.all(Array.from({ length: 1005 }, (_, index) => volume.record({
        id: `volume-${index}`, modelKey: index % 2 ? 'local/mock-a' : 'local/mock-b',
        inputTokens: 1, outputTokens: 1, costUsd: 0.001,
      })))
      const volumeStats = await volume.getStats()
      assert.equal(volumeStats.totals.totalCalls, 1005)
      assert.equal(volumeStats.totals.totalTokens, 2010)
      assert.equal(volumeStats.byModel.length, 2)
    } finally {
      await fs.rm(volumeHome, { recursive: true, force: true })
    }

    console.log('--- 测试 7: 纠偏队列去重逻辑验证 ---')
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
