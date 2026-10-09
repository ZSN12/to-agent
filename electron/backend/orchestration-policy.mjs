import { applyPolicyToRoute, filterModelsForTaskType } from './policy-gate.mjs'
import {
  loadRoutingPortfolio,
  loadBundledRoutingPortfolio,
  resolveDisplayName,
  checkSubscription,
  checkMeteredSurge,
  isFreeModel,
  calculateQuotaAdjustment,
  calculateBalanceAdjustment,
  isModelQuotaExcluded,
  isModelBalanceExcluded,
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
 * Identify the upstream route family shared by model IDs for retry exclusion.
 * OpenCodex model IDs carry their adapter as the first path segment (for example
 * `cursor/composer-2.5` and `google-antigravity/gemini-3.8-flash`), so a Cursor
 * transport failure must exclude the Cursor family without excluding the other
 * adapters behind the same `opencodex` provider entry.
 */
export function modelFailureDomain(model) {
  const provider = typeof model?.provider === 'string' ? model.provider : ''
  if (!provider) return null
  if (provider === 'opencodex') {
    const adapter = typeof model.id === 'string' ? model.id.split('/')[0] : ''
    if (adapter) return `${provider}/${adapter}`
  }
  return provider
}

/**
 * 基于能力作品集 (Routing Portfolio) 与成本感知的任务模型路由分配器 (RuleRouter v1)
 * 核心逻辑：
 * 1. 硬约束门控 (PolicyGate)：任务类型适配、权限、可用性及用户启用状态
 * 2. 软打分 (RuleRouter v1)：
 *    + task_affinity 任务亲和与能力标签匹配 (+35)
 *    + subscription_bonus / free_model_bonus 由当前用户作品集配置
 *    + 配额充足度与刷新窗口偏好；显式余额阈值按个人设置降权或排除
 *    - 同一 DAG 内已分配额度渠道的复用降权（不估算 token 扣额）
 *    - metered_surge 工作日高峰按量加价惩罚降权
 *    - metered_cost 按量单价扣分 (0 ~ 30)
 * 3. 产出可解释的决策证据 reasons[] 与标准化 RouteDecision
 *
 * @param {string} taskType
 * @param {object} catalog
 * @param {string} fallbackModelKey
 * @param {object} [options]
 * @param {object} [options.portfolio] 用户或默认能力作品集
 * @param {Date} [options.now] 当前时间 (支持 mock 测试高峰时段)
 * @param {object} [options.quotaSnapshot] 本机 OpenUsage 快照
 * @param {Record<string, number>} [options.allocationCounts] 当前 DAG 已分配到各配额渠道的任务数
 * @param {string} [options.userDataPath]
 * @param {string[]} [options.excludeModelKeys] 升级重试时排除已失败模型
 * @param {string[]} [options.excludeFailureDomains] 传输失败后排除已故障的上游路由域
 */
export function selectModelForTask(taskType, catalog, fallbackModelKey, options = {}) {
  const portfolio = options.portfolio || (options.userDataPath
    ? loadRoutingPortfolio({ userDataPath: options.userDataPath })
    : loadBundledRoutingPortfolio())
  const now = options.now || new Date()
  const quotaSnapshot = options.quotaSnapshot || null
  const excludeKeys = new Set(options.excludeModelKeys ?? [])
  const excludeFailureDomains = new Set(options.excludeFailureDomains ?? [])
  const isExcluded = (model) => excludeKeys.has(model.key)
    || excludeFailureDomains.has(modelFailureDomain(model))

  const order = TASK_TIER_ORDER[taskType] ?? TASK_TIER_ORDER.implementation
  const excludedByUsage = new Set((catalog?.models ?? [])
    .filter((model) => isModelQuotaExcluded(model.key, portfolio, quotaSnapshot, now.getTime())
      || isModelBalanceExcluded(model.key, portfolio, quotaSnapshot, now.getTime()))
    .map((model) => model.key))

  // 1. 硬约束过滤 (PolicyGate)
  const availableModels = (catalog?.models ?? []).filter(
    (model) => model.available
      && model.routeRegistered !== false
      && model.profile?.enabledForAllocation === true
      && !isExcluded(model)
      && !excludedByUsage.has(model.key),
  )
  const allowedModels = filterModelsForTaskType(taskType, availableModels)

  if (allowedModels.length === 0) {
    const fallbackCandidate = catalog?.models?.find(
      (model) => model.key === fallbackModelKey
        && model.available
        && model.routeRegistered !== false
        && model.profile?.enabledForAllocation === true
        && !isExcluded(model)
        && !excludedByUsage.has(model.key),
    )
    const fallback = fallbackCandidate
      ? filterModelsForTaskType(taskType, [fallbackCandidate])[0]
      : null
    if (fallback) {
      return {
        model: fallback,
        modelKey: fallback.key,
        displayName: resolveDisplayName(fallback.key, portfolio),
        strategy: 'fallback',
        reasons: ['没有符合门控条件的启用模型，回退到当前主模型'],
        reason: '没有符合门控条件的启用模型，回退到当前主模型',
        confidence: 0.5,
        estimatedCost: null,
        costEstimate: { status: 'unknown', currency: 'USD', unit: 'USD per million tokens' },
      }
    }
    const fallbackModel = catalog?.models?.find((model) => model.key === fallbackModelKey)
    const reason = excludedByUsage.has(fallbackModelKey)
      ? '当前匹配的额度或余额策略已耗尽，已停止路由到这些模型'
      : fallbackModel && excludeFailureDomains.has(modelFailureDomain(fallbackModel))
        ? '模型传输失败，已排除故障上游路由，当前没有其他可用模型'
        : '没有可用且已鉴权的模型'
    return {
      model: null,
      modelKey: null,
      displayName: '无可用模型',
      strategy: 'none',
      reasons: [reason],
      reason,
      confidence: 0,
      estimatedCost: null,
      costEstimate: { status: 'unknown', currency: 'USD', unit: 'USD per million tokens' },
      allocationProviders: [],
    }
  }

  // 2. 软打分评估 (RuleRouter v1)
  const candidates = allowedModels.map((model) => {
    const tier = model.profile?.tier ?? 'balanced'
    const key = model.key
    const inputPrice = Number(model.costPerMillion?.input)
    const outputPrice = Number(model.costPerMillion?.output)
    const hasValidRates = Number.isFinite(inputPrice) && inputPrice >= 0
      && Number.isFinite(outputPrice) && outputPrice >= 0
    const priceMeta = model.priceMeta
    const priceEvidence = priceMeta?.hasInputPrice === true && priceMeta?.hasOutputPrice === true
      || ((Boolean(priceMeta?.adapter) || priceMeta?.source === 'taskweaver-remote-registry')
        && priceMeta?.hasInputPrice !== false
        && priceMeta?.hasOutputPrice !== false)
    const freeModel = isFreeModel(key, portfolio, model)
    const pricingKnown = freeModel || (
      hasValidRates
      && priceMeta?.stale !== true
      && priceMeta?.confidence !== 'low'
      && (priceEvidence || (!priceMeta && (inputPrice > 0 || outputPrice > 0)))
    )
    const costPerMillion = pricingKnown ? inputPrice + outputPrice : null
    const reasons = []
    let score = 50 // 基准分
    const weights = portfolio?.routing_weights ?? {}
    const weight = (key, fallback) => {
      const value = Number(weights[key])
      return Number.isFinite(value) && value >= 0 ? value : fallback
    }

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
      const subscriptionBonus = weight('subscription_bonus', 20)
      score += subscriptionBonus
      marginalCost = Number.isFinite(subInfo.marginalCost) ? Math.max(0, subInfo.marginalCost) : 0
      reasons.push(`${subInfo.label || '用户订阅'}：按个人配置优先级 +${subscriptionBonus}`)
    } else if (freeModel) {
      const freeBonus = weight('free_model_bonus', 20)
      score += freeBonus
      marginalCost = 0
      reasons.push(`当前用户标记的免费渠道：优先低成本路由 +${freeBonus}`)
    } else {
      // Known billable routes receive a bounded price penalty. Missing pricing
      // remains unknown and must not be described as free.
      if (pricingKnown) {
        const costPenalty = Math.min(
          weight('max_cost_penalty', 18),
          costPerMillion * weight('cost_penalty_per_usd_per_million', 0.8),
        )
        score -= costPenalty
      } else {
        score -= weight('unknown_price_penalty', 5)
        reasons.push('当前单价未知；未按免费模型处理，降低路由优先级')
      }
      if (pricingKnown && costPerMillion <= 1 && costPerMillion > 0) {
        reasons.push(`按量单价低廉 ($${costPerMillion.toFixed(2)}/M)`)
      }

      // 2.5 按量时段加价惩罚 (metered_surge)
      const surge = checkMeteredSurge(key, portfolio, now)
      if (surge.inSurge) {
        score -= weight('surge_penalty', 25)
        reasons.push(`时段加价：${surge.reason}`)
      }
    }

    const quota = calculateQuotaAdjustment(key, portfolio, quotaSnapshot, now.getTime())
    if (quota.penalty > 0) score -= quota.penalty
    if (quota.bonus > 0) score += quota.bonus
    if (quota.reason) reasons.push(quota.reason)

    const balance = calculateBalanceAdjustment(key, portfolio, quotaSnapshot, now.getTime())
    if (balance.penalty > 0) score -= balance.penalty
    if (balance.reason) reasons.push(balance.reason)

    const allocationCounts = options.allocationCounts ?? {}
    const reusePenaltyPerTask = Number(portfolio?.quota_cycles?.dag_allocation_penalty_points ?? 8)
    const priorAllocations = quota.allocationProviders.reduce(
      (count, providerId) => count + Math.max(0, Number(allocationCounts[providerId]) || 0),
      0,
    )
    const reusePenalty = Math.min(30, priorAllocations * Math.max(0, reusePenaltyPerTask))
    if (reusePenalty > 0) {
      score -= reusePenalty
      reasons.push(`本 DAG 已向同一额度渠道分配 ${priorAllocations} 个子任务，批内软降权 -${reusePenalty}（不代表实际 token 扣额）`)
    }

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
      subInfo,
      freeModel,
      pricingKnown,
      inputPrice,
      outputPrice,
      allocationProviders: quota.allocationProviders,
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
    // Token volume and input/output mix are not known before execution. Keep
    // unit rates separately instead of mislabeling USD per million as this
    // task's estimated total cost.
    estimatedCost: null,
    costEstimate: {
      status: best.subInfo.inSubscription
        ? 'subscription-covered'
        : best.freeModel
          ? 'free'
          : best.pricingKnown
            ? 'unit-rate'
            : 'unknown',
      currency: best.model.priceMeta?.currency ?? 'USD',
      unit: 'USD per million tokens',
      inputPerMillion: best.pricingKnown ? best.inputPrice : null,
      outputPerMillion: best.pricingKnown ? best.outputPrice : null,
      marginalCostPerMillion: best.subInfo.inSubscription || best.freeModel
        ? best.marginalCost
        : best.pricingKnown
          ? best.marginalCost
          : null,
    },
    score: best.score,
    allocationProviders: best.allocationProviders,
  }

  // 3. 全局安全门控校验
  // Keep quota- and balance-excluded routes out of the final policy fallback.
  const gated = applyPolicyToRoute(taskType, routeDecision, { ...catalog, models: availableModels })
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

export function shouldUpgradeFailedTask(taskType, failure = null) {
  if (taskType === 'research') {
    // Read-only research should not repeat the same failed work on a new model
    // for policy, evidence, or configuration errors. A provider transport
    // failure is different: one bounded route-domain failover can preserve the
    // task while keeping all file and tool scopes unchanged.
    return ['transport', 'transient'].includes(failure?.kind) && failure?.retryable === true
  }
  return UPGRADE_ON_FAILURE_TYPES.has(taskType)
}
