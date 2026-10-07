import { applyPolicyToRoute, filterModelsForTaskType } from './policy-gate.mjs'
import {
  loadRoutingPortfolio,
  resolveDisplayName,
  checkSubscription,
  checkMeteredSurge,
  calculateQuotaAdjustment,
  matchPattern,
} from './routing-portfolio-service.mjs'

const TASK_TIER_ORDER = {
  research: ['cheap', 'balanced', 'strong'],
  test: ['cheap', 'balanced', 'strong'],
  implementation: ['balanced', 'strong', 'cheap'],
  review: ['strong', 'balanced', 'cheap'],
  hard_debug: ['strong', 'balanced', 'cheap'],
}

/** Single-agent is the default. DAG execution requires an explicit user choice. */
export function decideExecutionMode(text, selectedSkill = null) {
  if (selectedSkill?.multiAgent) {
    return { mode: 'multi-agent', reason: `已选择多 Agent Skill：${selectedSkill.name}` }
  }
  const target = '(?:多智能体|多\\s*agent|multi[-\\s]?agent|agent[-\\s]?team|任务\\s*DAG)'
  const denied = new RegExp(`(?:不要|不需要|无需|禁止|别用|不要再用|不启用|禁用|关闭|不是|并非)\\s*(?:使用|启用|调用)?\\s*${target}`, 'i')
  if (denied.test(text)) return { mode: 'single-agent', reason: '用户明确要求不启用多 Agent' }
  const explicit = new RegExp(`(?:使用|启用|开启|调用|采用)\\s*${target}|${target}\\s*(?:skill|技能)|(?:任务|请求)\\s*.*${target}`, 'i').test(text)
  if (explicit) return { mode: 'multi-agent', reason: '用户明确要求多 Agent 编排' }
  return { mode: 'single-agent', reason: '未显式选择多 Agent，保持单 Agent 执行' }
}

export function resolveExecutionMode(decision, override) {
  if (override === 'single-agent' || override === 'multi-agent') {
    return { mode: override, reason: override === 'multi-agent' ? '用户确认启用多 Agent' : '用户选择单 Agent 执行' }
  }
  if (decision.mode === 'ask-user') return decision
  return decision
}

/** Explicit composer modes override task heuristics; ordinary code mode has no override. */
export function workModeExecutionOverride(workMode) {
  if (workMode === 'goal') return 'multi-agent'
  if (workMode === 'plan') return 'single-agent'
  return null
}

/**
 * 基于能力作品集 (Routing Portfolio) 与成本感知的任务模型路由分配器 (RuleRouter v1)
 * 核心逻辑：
 * 1. 硬约束门控 (PolicyGate)：任务类型适配、权限、可用性及用户启用状态
 * 2. 软打分 (RuleRouter v1)：
 *    + task_affinity 任务亲和与能力标签匹配 (+35)
 *    + subscription_bonus 订阅覆盖边际成本为 0 (+40)
 *    + quota_cycle_bonus 临近刷新且不可结转配额软偏好；耗尽时降权 (-scarce_penalty)
 *    - metered_surge 工作日高峰按量加价惩罚降权 (-25)
 *    - metered_cost 按量单价扣分 (0 ~ 30)
 * 3. 产出可解释的决策证据 reasons[] 与标准化 RouteDecision
 *
 * @param {string} taskType
 * @param {object} catalog
 * @param {string} fallbackModelKey
 * @param {object} [options]
 * @param {object} [options.portfolio] 用户或默认能力作品集
 * @param {Date} [options.now] 当前时间 (支持 mock 测试高峰时段)
 * @param {object} [options.quotaSnapshot] 本地 OpenUsage 配额快照
 * @param {string} [options.userDataPath]
 * @param {string[]} [options.excludeModelKeys] 升级重试时排除已失败模型
 */
export function selectModelForTask(taskType, catalog, fallbackModelKey, options = {}) {
  const portfolio = options.portfolio || loadRoutingPortfolio({ userDataPath: options.userDataPath })
  const now = options.now || new Date()
  const quotaSnapshot = options.quotaSnapshot || null
  const excludeKeys = new Set(options.excludeModelKeys ?? [])

  const order = TASK_TIER_ORDER[taskType] ?? TASK_TIER_ORDER.implementation

  // 1. 硬约束过滤 (PolicyGate)
  const availableModels = (catalog?.models ?? []).filter(
    (model) => model.available && model.routeRegistered !== false && model.profile?.enabledForAllocation === true && !excludeKeys.has(model.key),
  )
  const allowedModels = filterModelsForTaskType(taskType, availableModels)

  if (allowedModels.length === 0) {
    const fallback = catalog?.models?.find(
      (model) => model.key === fallbackModelKey && model.available && model.routeRegistered !== false && model.profile?.enabledForAllocation === true,
    )
    if (fallback) {
      return {
        model: fallback,
        modelKey: fallback.key,
        displayName: resolveDisplayName(fallback.key, portfolio),
        strategy: 'fallback',
        reasons: ['没有符合门控条件的启用模型，回退到当前主模型'],
        reason: '没有符合门控条件的启用模型，回退到当前主模型',
        confidence: 0.5,
        estimatedCost: 0,
      }
    }
    return {
      model: null,
      modelKey: null,
      displayName: '无可用模型',
      strategy: 'none',
      reasons: ['没有可用且已鉴权的模型'],
      reason: '没有可用且已鉴权的模型',
      confidence: 0,
      estimatedCost: 0,
    }
  }

  // 2. 软打分评估 (RuleRouter v1)
  const candidates = allowedModels.map((model) => {
    const tier = model.profile?.tier ?? 'balanced'
    const key = model.key
    const costPerMillion = (model.costPerMillion?.input ?? 0) + (model.costPerMillion?.output ?? 0)
    const reasons = []
    let score = 50 // 基准分

    // 2.1 任务类型基准档位匹配 (首选 50 分，次选 20 分，末选 0 分)
    const tierIdx = order.indexOf(tier)
    if (tierIdx === 0) {
      score += 50
    } else if (tierIdx === 1) {
      score += 20
    } else {
      score += 0
    }

    // 2.2 任务亲和 (task_affinity) 匹配
    const affinity = portfolio?.task_affinity?.[taskType]
    if (affinity) {
      const preferTags = affinity.prefer || []
      const avoidTags = affinity.avoid || []
      let matchedPrefer = false

      for (const capName of preferTags) {
        const cap = portfolio?.capabilities?.[capName]
        if (cap?.match_model_ids) {
          const matchId = cap.match_model_ids.some((pat) => matchPattern(pat, key))
          if (matchId) {
            score += 35
            matchedPrefer = true
            reasons.push(affinity.reason || `任务亲和：优先匹配能力 [${capName}]`)
            break
          }
        }
      }

      for (const capName of avoidTags) {
        const cap = portfolio?.capabilities?.[capName]
        if (cap?.match_model_ids) {
          const matchId = cap.match_model_ids.some((pat) => matchPattern(pat, key))
          if (matchId) {
            score -= 30
            reasons.push(`规避偏好：降低能力 [${capName}] 权重`)
            break
          }
        }
      }
    }

    // 2.3 订阅覆盖加分 (边际成本为 0)
    const subInfo = checkSubscription(key, portfolio)
    let marginalCost = costPerMillion
    if (subInfo.inSubscription) {
      score += 40
      marginalCost = 0
      reasons.push(`${subInfo.label || '用户订阅'}：边际成本为 0`)
    } else {
      // 2.4 按量模型单价惩罚 (单价越高扣分越多，上限 18 分以保证质量约束优先)
      const costPenalty = Math.min(18, costPerMillion * 0.8)
      score -= costPenalty
      if (costPerMillion <= 1 && costPerMillion > 0) {
        reasons.push(`按量单价低廉 ($${costPerMillion.toFixed(2)}/M)`)
      }

      // 2.5 按量时段加价惩罚 (metered_surge)
      const surge = checkMeteredSurge(key, portfolio, now)
      if (surge.inSurge) {
        score -= 25
        reasons.push(`时段加价：${surge.reason}`)
      }
    }

    // 2.6 配额周期软调整 (OpenUsage)
    const quota = calculateQuotaAdjustment(key, portfolio, quotaSnapshot, now.getTime())
    if (quota.penalty > 0) {
      score -= quota.penalty
    }
    if (quota.bonus > 0) {
      score += quota.bonus
    }
    if (quota.reason) reasons.push(quota.reason)

    // 保底原因
    if (reasons.length === 0) {
      reasons.push(`任务类型 ${taskType} 匹配 ${tier} 档模型`)
    }

    return {
      model,
      key,
      tier,
      score,
      marginalCost,
      reasons,
    }
  })

  // 按得分从高到低排序，得分相同按 key 字典序以保证绝对确定性
  candidates.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score
    return left.key.localeCompare(right.key)
  })

  const best = candidates[0]
  const second = candidates[1]
  const scoreDiff = second ? Math.max(0, best.score - second.score) : 30
  const confidence = Math.min(1.0, Math.max(0.6, 0.6 + (scoreDiff / 100) * 0.4))

  const routeDecision = {
    model: best.model,
    modelKey: best.key,
    displayName: resolveDisplayName(best.key, portfolio),
    strategy: 'portfolio-rule',
    reasons: best.reasons,
    reason: best.reasons.join('；'),
    confidence: Number(confidence.toFixed(2)),
    estimatedCost: best.marginalCost,
    score: best.score,
  }

  // 3. 全局安全门控校验
  const gated = applyPolicyToRoute(taskType, routeDecision, catalog)
  if (gated.model && gated.model.key !== routeDecision.modelKey) {
    return {
      ...routeDecision,
      model: gated.model,
      modelKey: gated.model.key,
      displayName: resolveDisplayName(gated.model.key, portfolio),
      reason: gated.reason ?? routeDecision.reason,
      reasons: [...(routeDecision.reasons ?? []), gated.reason].filter(Boolean),
    }
  }
  return gated.model ? routeDecision : gated
}

const UPGRADE_ON_FAILURE_TYPES = new Set(['implementation', 'test', 'review'])

export function shouldUpgradeFailedTask(taskType) {
  return UPGRADE_ON_FAILURE_TYPES.has(taskType)
}
