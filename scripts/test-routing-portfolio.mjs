import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  loadRoutingPortfolio,
  saveRoutingPortfolio,
  resolveDisplayName,
  checkSubscription,
  checkMeteredSurge,
  calculateQuotaAdjustment,
  calculateQuotaBonus,
  matchPattern,
  fetchOpenUsageSnapshot,
} from '../electron/backend/routing-portfolio-service.mjs'
import { selectModelForTask } from '../electron/backend/orchestration-policy.mjs'

console.log('--- 开始测试能力作品集 (Routing Portfolio) 与成本感知模型路由 (RuleRouter v1) ---')

// 1. 测试通配符匹配
assert.equal(matchPattern('google-antigravity/*', 'google-antigravity/gemini-3.8-flash-medium'), true)
assert.equal(matchPattern('*composer*', 'opencodex/cursor/composer-2.5'), true)
assert.equal(matchPattern('*gpt-6*', 'cursor/gpt-6-codex'), true)
assert.equal(matchPattern('*gpt-6*', 'cursor/composer-2.5'), false)

// 2. 加载默认作品集与 displayName 解析
const defaultPortfolio = loadRoutingPortfolio()
assert.ok(defaultPortfolio.version >= 1)
assert.ok(defaultPortfolio.subscriptions.length >= 2)
assert.ok(defaultPortfolio.metered_surge.length >= 1)

assert.equal(resolveDisplayName('google-antigravity/gemini-3.8-flash-medium', defaultPortfolio), 'Gemini 3.8 Flash')
assert.equal(resolveDisplayName('cursor/composer-2.5', defaultPortfolio), 'Composer 2.5')
assert.equal(resolveDisplayName('opencodex/cursor/composer-2.5', defaultPortfolio), 'Composer 2.5')
assert.equal(resolveDisplayName('deepseek/deepseek-chat', defaultPortfolio), 'DeepSeek V3')
assert.equal(resolveDisplayName('deepseek/deepseek-reasoner', defaultPortfolio), 'DeepSeek R1')
assert.equal(resolveDisplayName('anthropic/claude-3-5-sonnet-20241022', defaultPortfolio), 'Claude 3 5 Sonnet 20241022')

// 3. 用户数据目录作品集保存与覆盖加载
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-portfolio-test-'))
try {
  const customPortfolio = {
    ...defaultPortfolio,
    display_names: {
      ...defaultPortfolio.display_names,
      'my-custom-model': '我的专属写代码小助手',
    },
  }
  const saveRes = await saveRoutingPortfolio(customPortfolio, { userDataPath: tmpDir })
  assert.equal(saveRes.ok, true)

  const loadedUserPortfolio = loadRoutingPortfolio({ userDataPath: tmpDir })
  assert.equal(resolveDisplayName('my-custom-model', loadedUserPortfolio), '我的专属写代码小助手')
  // 原有默认映射依然保留
  assert.equal(resolveDisplayName('cursor/composer-2.5', loadedUserPortfolio), 'Composer 2.5')

  // 4. 订阅覆盖与边际成本为 0 校验
  const subAntigravity = checkSubscription('google-antigravity/gemini-3.8-flash-medium', defaultPortfolio)
  assert.equal(subAntigravity.inSubscription, true)
  assert.equal(subAntigravity.marginalCost, 0)
  assert.equal(subAntigravity.label, '反重力订阅')

  const subCursor = checkSubscription('cursor/composer-2.5', defaultPortfolio)
  assert.equal(subCursor.inSubscription, true)
  assert.equal(subCursor.marginalCost, 0)

  // 明确被 deprioritize 的模型不应享受优先订阅
  const subGpt6 = checkSubscription('cursor/gpt-6-preview', defaultPortfolio)
  assert.equal(subGpt6.inSubscription, false)

  // 5. 时段加价 (metered_surge) 窗口测试
  // 5.1 构造中国时区 (Asia/Shanghai) 周一 14:00 (处于工作日 9:00-18:00 窗口内)
  const mondayWorkTime = new Date('2026-09-28T06:00:00.000Z') // UTC 06:00 即北京时间 14:00 周一
  const surgeMonday = checkMeteredSurge('deepseek/deepseek-chat', defaultPortfolio, mondayWorkTime)
  assert.equal(surgeMonday.inSurge, true)
  assert.equal(surgeMonday.surchargeFactor, 1.5)
  assert.match(surgeMonday.reason, /加价窗口/)

  // 5.2 构造周日 14:00 (周末非工作日)
  const sundayTime = new Date('2026-09-27T06:00:00.000Z') // 北京时间周日 14:00
  const surgeSunday = checkMeteredSurge('deepseek/deepseek-chat', defaultPortfolio, sundayTime)
  assert.equal(surgeSunday.inSurge, false)

  // 5.3 构造周一 21:00 (晚间非高峰)
  const mondayNight = new Date('2026-09-28T13:00:00.000Z') // 北京时间周一 21:00
  const surgeNight = checkMeteredSurge('deepseek/deepseek-chat', defaultPortfolio, mondayNight)
  assert.equal(surgeNight.inSurge, false)

  // 6. 配额周期软偏好 (quota_cycle_bonus)
  const now = Date.now()
  const mockSnapshot = {
    providers: {
      codex: {
        resources: {
          weekly: {
            remaining: 80,
            limit: 100,
            stale: false,
            fetchedAt: new Date(now).toISOString(),
            expiresAt: new Date(now + 3600000).toISOString(),
            resetsAt: new Date(now + 24 * 3600000).toISOString(),
          },
        },
      },
    },
  }
  const quotaBonus = calculateQuotaAdjustment('openai-codex/gpt-5.3-codex-spark', defaultPortfolio, mockSnapshot, now)
  assert.ok(quotaBonus.bonus > 0)
  assert.match(quotaBonus.reason, /刷新前利用/)

  const farResetSnapshot = {
    providers: {
      codex: {
        resources: {
          weekly: {
            remaining: 80,
            limit: 100,
            stale: false,
            fetchedAt: new Date(now).toISOString(),
            resetsAt: new Date(now + 10 * 24 * 3600000).toISOString(),
          },
        },
      },
    },
  }
  assert.equal(
    calculateQuotaAdjustment('openai-codex/gpt-5.3-codex-spark', defaultPortfolio, farResetSnapshot, now).bonus,
    0,
  )

  // 过期快照不加分
  const expiredSnapshot = {
    providers: {
      codex: {
        resources: {
          weekly: {
            remaining: 80,
            limit: 100,
            stale: true,
            expiresAt: new Date(Date.now() - 3600000).toISOString(),
          },
        },
      },
    },
  }
  const expiredBonus = calculateQuotaBonus('openai-codex/gpt-5.3-codex-spark', defaultPortfolio, expiredSnapshot)
  assert.equal(expiredBonus.bonus, 0)

  // 7. RuleRouter v1 多任务类型异构模型路由决策
  const realisticCatalog = {
    models: [
      {
        key: 'google-antigravity/gemini-3.8-flash-medium',
        name: 'Gemini 3.8 Flash',
        available: true,
        profile: { tier: 'cheap', enabledForAllocation: true },
        costPerMillion: { input: 0.1, output: 0.4 },
      },
      {
        key: 'cursor/composer-2.5',
        name: 'Composer 2.5',
        available: true,
        profile: { tier: 'balanced', enabledForAllocation: true },
        costPerMillion: { input: 1.0, output: 3.0 },
      },
      {
        key: 'deepseek/deepseek-chat',
        name: 'DeepSeek V3',
        available: true,
        profile: { tier: 'balanced', enabledForAllocation: true },
        costPerMillion: { input: 0.2, output: 0.8 },
      },
      {
        key: 'openai-codex/gpt-5.5',
        name: 'GPT-5.5 Codex',
        available: true,
        profile: { tier: 'strong', enabledForAllocation: true },
        costPerMillion: { input: 5.0, output: 15.0 },
      },
    ],
  }

  // 7.1 research 调研型子任务：优先选择低边际成本与 Flash/搜索亲和模型
  const researchDecision = selectModelForTask('research', realisticCatalog, 'cursor/composer-2.5', {
    portfolio: defaultPortfolio,
  })
  assert.equal(researchDecision.modelKey, 'google-antigravity/gemini-3.8-flash-medium')
  assert.equal(researchDecision.displayName, 'Gemini 3.8 Flash')
  assert.equal(researchDecision.strategy, 'portfolio-rule')
  assert.ok(researchDecision.reasons.some((r) => r.includes('边际成本为 0') || r.includes('检索型子任务')))

  // 7.2 implementation 核心实现子任务：优先选择编程专用订阅模型 (Composer 2.5)
  const implDecision = selectModelForTask('implementation', realisticCatalog, 'cursor/composer-2.5', {
    portfolio: defaultPortfolio,
  })
  assert.equal(implDecision.modelKey, 'cursor/composer-2.5')
  assert.equal(implDecision.displayName, 'Composer 2.5')
  assert.ok(implDecision.reasons.some((r) => r.includes('Cursor / Codex 订阅') || r.includes('核心代码实现')))

  // 7.3 review 代码审查子任务：必须抬升至强推理档 (GPT-5.5)
  const reviewDecision = selectModelForTask('review', realisticCatalog, 'cursor/composer-2.5', {
    portfolio: defaultPortfolio,
  })
  assert.equal(reviewDecision.modelKey, 'openai-codex/gpt-5.5')
  assert.equal(reviewDecision.displayName, 'GPT-5.5 Codex')
  assert.ok(reviewDecision.reasons.some((r) => r.includes('审查') || r.includes('推理')))

  // 7.4 工作日白天加价窗口对按量模型的降权验证
  const surgeCatalog = {
    models: [
      {
        key: 'deepseek/deepseek-chat',
        name: 'DeepSeek V3',
        available: true,
        profile: { tier: 'balanced', enabledForAllocation: true },
        costPerMillion: { input: 0.5, output: 1.0 },
      },
      {
        key: 'normal-metered-model',
        name: 'Normal Model',
        available: true,
        profile: { tier: 'balanced', enabledForAllocation: true },
        costPerMillion: { input: 0.6, output: 1.1 },
      },
    ],
  }
  const surgePortfolio = {
    ...defaultPortfolio,
    task_affinity: {}, // 排除特定模型名字的亲和加分干扰，精准验证时段加价对按量模型的降权
  }
  // 平常时段：DeepSeek 单价更便宜胜出
  const offPeakDecision = selectModelForTask('test', surgeCatalog, 'deepseek/deepseek-chat', {
    portfolio: surgePortfolio,
    now: sundayTime,
  })
  assert.equal(offPeakDecision.modelKey, 'deepseek/deepseek-chat')

  // 工作日高峰时段：DeepSeek 被加价降权，Normal Model 胜出
  const surgeDecision = selectModelForTask('test', surgeCatalog, 'deepseek/deepseek-chat', {
    portfolio: surgePortfolio,
    now: mondayWorkTime,
  })
  assert.equal(surgeDecision.modelKey, 'normal-metered-model')

  // 8. OpenUsage 本地客户端探测
  // 8.1 若本机运行了 OpenUsage 服务，验证 schema 规范性；若未运行则验证返回 null
  const liveOpenUsage = await fetchOpenUsageSnapshot({ timeoutMs: 300 })
  if (liveOpenUsage) {
    assert.equal(liveOpenUsage.schema, 'openusage.limits.v1')
    assert.ok(typeof liveOpenUsage.providers === 'object')
    console.log('  [OpenUsage] 检测到本地运行的 OpenUsage 服务，成功联动！')
  }

  // 8.2 模拟未开启服务的端口 (如 19999)，必须优雅降级返回 null，绝不报错
  const unreachableRes = await fetchOpenUsageSnapshot({ baseUrl: 'http://127.0.0.1:19999', timeoutMs: 100 })
  assert.equal(unreachableRes, null, '未运行端口必须优雅降级返回 null')

  console.log('✓ 能力作品集与成本感知路由 (RuleRouter v1) 单元与集成测试全部通过！')
} finally {
  await fs.rm(tmpDir, { recursive: true, force: true })
}
