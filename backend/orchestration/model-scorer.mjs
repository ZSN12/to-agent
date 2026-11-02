/**
 * 模型打分器 - 软约束评分
 * 负责根据多种因素为候选模型打分，选出最优模型
 */

import { ROUTING_CONFIG } from '../config/constants.mjs'

import {
  isFreeModel,
  checkSubscription,
  checkMeteredSurge,
  calculateQuotaAdjustment,
  calculateBalanceAdjustment,
  matchPattern,
} from '../routing-portfolio-service.mjs'

function compareScoredCandidates(a, b) {
  if (a.score !== b.score) {
    const scoreOrder = b.score - a.score
    // Array#sort treats NaN comparator results as equality. Keep that stable
    // behavior for malformed external portfolio data in the bounded selector.
    return Number.isNaN(scoreOrder) ? 0 : scoreOrder
  }
  return a.key.localeCompare(b.key)
}

function modelProvider(model) {
  if (typeof model?.provider === 'string' && model.provider) return model.provider
  const key = String(model?.key ?? '')
  const slash = key.indexOf('/')
  return slash > 0 ? key.slice(0, slash) : ''
}

function parseWorkBuddyMultiplier(model) {
  const value = model?.workBuddyMultiplier
  if (typeof value !== 'string' || !/^x(?:\d+(?:\.\d+)?|\.\d+)$/i.test(value.trim())) return null
  const multiplier = Number(value.trim().slice(1))
  return Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : null
}

function declaredCapabilityTier(model) {
  const override = model?.profile?.capabilityTierOverride
  if (['strong', 'medium', 'weak'].includes(override)) return override
  const tier = model?.capabilityTier?.tier
  return ['strong', 'medium', 'weak'].includes(tier) ? tier : null
}

function legacyRoutingTier(model) {
  return model?.profile?.tier ?? 'balanced'
}

function positiveContextLimit(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function closeWorkBuddyCapabilities(left, right) {
  const leftDeclaredTier = declaredCapabilityTier(left)
  const rightDeclaredTier = declaredCapabilityTier(right)
  if (leftDeclaredTier || rightDeclaredTier) {
    if (!leftDeclaredTier || !rightDeclaredTier || leftDeclaredTier !== rightDeclaredTier) return false
  } else if (legacyRoutingTier(left) !== legacyRoutingTier(right)) {
    return false
  }
  if (Boolean(left?.reasoning) !== Boolean(right?.reasoning)) return false
  if (Boolean(left?.vision) !== Boolean(right?.vision)) return false
  for (const field of ['contextWindow', 'maxTokens']) {
    const leftRaw = left?.[field]
    const rightRaw = right?.[field]
    const leftLimit = positiveContextLimit(leftRaw)
    const rightLimit = positiveContextLimit(rightRaw)
    if ((leftRaw != null && !leftLimit) || (rightRaw != null && !rightLimit)) return false
    if (leftLimit && rightLimit && Math.max(leftLimit, rightLimit) / Math.min(leftLimit, rightLimit) > 2) {
      return false
    }
  }
  return true
}

export class ModelScorer {
  constructor(options = {}) {
    this.taskType = options.taskType
    this.portfolio = options.portfolio
    this.quotaSnapshot = options.quotaSnapshot
    this.now = options.now || Date.now()
    this.allocationCounts = options.allocationCounts ?? {}
    this.preferTier = options.preferTier

    // 档位顺序
    this.tierOrder = ROUTING_CONFIG.TASK_TIER_ORDER[this.taskType] ||
                     ROUTING_CONFIG.TASK_TIER_ORDER.implementation

    // 打分权重
    this.weights = this.portfolio?.routing_weights ?? {}
  }

  /**
   * 获取权重值（带默认值）
   */
  getWeight(key, fallback) {
    const value = Number(this.weights[key])
    return Number.isFinite(value) && value >= 0 ? value : fallback
  }

  /**
   * 1. 失败重试优先档位
   */
  scorePreferTier(model) {
    const tier = model.profile?.tier ?? 'balanced'
    if (this.preferTier && tier === this.preferTier) {
      return {
        score: 100,
        reason: `失败重试优先升级至 ${tier} 档`,
      }
    }
    return { score: 0, reason: null }
  }

  /**
   * 2. 任务类型基准档位匹配
   */
  scoreTierMatch(model) {
    const tier = model.profile?.tier ?? 'balanced'
    const tierIdx = this.tierOrder.indexOf(tier)

    if (tierIdx === 0) return { score: 50, reason: null }
    if (tierIdx === 1) return { score: 20, reason: null }
    return { score: 0, reason: null }
  }

  /**
   * 3. 任务亲和 (task_affinity) 匹配
   */
  scoreTaskAffinity(model) {
    const affinity = this.portfolio?.task_affinity?.[this.taskType]
    if (!affinity) return { score: 0, reason: null }

    const key = model.key
    const preferTags = affinity.prefer || []
    const avoidTags = affinity.avoid || []

    // 检查偏好能力
    for (const capName of preferTags) {
      const cap = this.portfolio?.capabilities?.[capName]
      if (cap?.match_model_ids) {
        const matchId = cap.match_model_ids.some(pat => matchPattern(pat, key))
        if (matchId) {
          return {
            score: ROUTING_CONFIG.SCORE_WEIGHTS.TASK_AFFINITY_MAX,
            reason: affinity.reason || `任务亲和：优先匹配能力 [${capName}]`,
          }
        }
      }
    }

    // 检查规避能力
    for (const capName of avoidTags) {
      const cap = this.portfolio?.capabilities?.[capName]
      if (cap?.match_model_ids) {
        const matchId = cap.match_model_ids.some(pat => matchPattern(pat, key))
        if (matchId) {
          return {
            score: -30,
            reason: `规避偏好：降低能力 [${capName}] 权重`,
          }
        }
      }
    }

    return { score: 0, reason: null }
  }

  /**
   * 4. 订阅覆盖和成本评估
   */
  scoreCostAndSubscription(model) {
    const key = model.key
    const inputPrice = Number(model.costPerMillion?.input)
    const outputPrice = Number(model.costPerMillion?.output)
    const hasValidRates = Number.isFinite(inputPrice) && inputPrice >= 0 &&
                          Number.isFinite(outputPrice) && outputPrice >= 0

    const priceMeta = model.priceMeta
    const priceEvidence = priceMeta?.hasInputPrice === true && priceMeta?.hasOutputPrice === true ||
      ((Boolean(priceMeta?.adapter) || priceMeta?.source === 'taskweaver-remote-registry') &&
       priceMeta?.hasInputPrice !== false && priceMeta?.hasOutputPrice !== false)

    const freeModel = isFreeModel(key, this.portfolio, model)
    const pricingKnown = freeModel || (
      hasValidRates &&
      priceMeta?.stale !== true &&
      priceMeta?.confidence !== 'low' &&
      (priceEvidence || (!priceMeta && (inputPrice > 0 || outputPrice > 0)))
    )

    const costPerMillion = pricingKnown ? inputPrice + outputPrice : null
    const subInfo = checkSubscription(key, this.portfolio)

    let score = 0
    let marginalCost = costPerMillion
    const reasons = []

    // 订阅覆盖
    if (subInfo.inSubscription) {
      const subscriptionBonus = this.getWeight('subscription_bonus', 20)
      score += subscriptionBonus
      marginalCost = Number.isFinite(subInfo.marginalCost) ? Math.max(0, subInfo.marginalCost) : 0
      reasons.push(`${subInfo.label || '用户订阅'}：按个人配置优先级 +${subscriptionBonus}`)
    }
    // 免费模型
    else if (freeModel) {
      const freeBonus = this.getWeight('free_model_bonus', 20)
      score += freeBonus
      marginalCost = 0
      reasons.push(`当前用户标记的免费渠道：优先低成本路由 +${freeBonus}`)
    }
    // 按量计费
    else {
      if (pricingKnown) {
        const costPenalty = Math.min(
          this.getWeight('max_cost_penalty', 18),
          costPerMillion * this.getWeight('cost_penalty_per_usd_per_million', 0.8)
        )
        score -= costPenalty

        if (costPerMillion <= 1 && costPerMillion > 0) {
          reasons.push(`按量单价低廉 ($${costPerMillion.toFixed(2)}/M)`)
        }
      } else {
        score -= this.getWeight('unknown_price_penalty', 5)
        reasons.push('当前单价未知；未按免费模型处理，降低路由优先级')
      }

      // 时段加价惩罚
      const surge = checkMeteredSurge(key, this.portfolio, this.now)
      if (surge.inSurge) {
        score -= this.getWeight('surge_penalty', 25)
        reasons.push(`时段加价：${surge.reason}`)
      }
    }

    return {
      score,
      reasons,
      marginalCost,
      subInfo,
      freeModel,
      pricingKnown,
      inputPrice,
      outputPrice,
      costPerMillion,
    }
  }

  /**
   * Compare WorkBuddy's native multiplier only within the same provider and
   * a similar capability group. It is an ordinal preference, never USD cost.
   */
  scoreWorkBuddyMultiplier(model, comparisonModels = []) {
    if (modelProvider(model) !== 'workbuddy') return { score: 0, status: 'unknown', reason: null }

    const declaredStatus = model?.workBuddyMultiplierStatus
    const multiplier = parseWorkBuddyMultiplier(model)
    const status = declaredStatus === 'stale'
      ? 'stale'
      : declaredStatus === 'fresh' && multiplier !== null
        ? 'fresh'
        : 'unknown'
    if (status === 'stale') {
      return { score: 0, status, reason: 'WorkBuddy 倍率来源已过期，未用于同档比较' }
    }
    if (status !== 'fresh') {
      return { score: 0, status: 'unknown', reason: 'WorkBuddy 倍率未知；未按 USD 免费价处理' }
    }

    const comparable = comparisonModels.flatMap((candidate) => {
      if (candidate === model || modelProvider(candidate) !== 'workbuddy') return []
      if (!closeWorkBuddyCapabilities(model, candidate)) return []
      const candidateStatus = candidate?.workBuddyMultiplierStatus
      const candidateMultiplier = parseWorkBuddyMultiplier(candidate)
      return candidateStatus === 'fresh' && candidateMultiplier !== null
        ? [{ model: candidate, multiplier: candidateMultiplier }]
        : []
    })
    comparable.push({ model, multiplier })
    if (comparable.length < 2) return { score: 0, status, reason: null }

    const lowest = Math.min(...comparable.map((candidate) => candidate.multiplier))
    const highest = Math.max(...comparable.map((candidate) => candidate.multiplier))
    if (lowest === highest) return { score: 0, status, reason: null }
    if (multiplier !== lowest) return { score: 0, status, reason: null }
    const bonus = 4
    return {
      score: bonus,
      status,
      reason: `同提供方同档 WorkBuddy 倍率较低（x${multiplier}），相对优先 +${bonus}`,
    }
  }

  /**
   * 5. 配额调整
   */
  scoreQuota(model) {
    const quota = calculateQuotaAdjustment(
      model.key,
      this.portfolio,
      this.quotaSnapshot,
      this.now
    )

    let score = 0
    if (quota.penalty > 0) score -= quota.penalty
    if (quota.bonus > 0) score += quota.bonus

    return {
      score,
      reason: quota.reason || null,
      allocationProviders: quota.allocationProviders,
    }
  }

  /**
   * 6. 余额调整
   */
  scoreBalance(model) {
    const balance = calculateBalanceAdjustment(
      model.key,
      this.portfolio,
      this.quotaSnapshot,
      this.now
    )

    let score = 0
    if (balance.penalty > 0) score -= balance.penalty

    return {
      score,
      reason: balance.reason || null,
    }
  }

  /**
   * 7. DAG 内分配复用惩罚
   */
  scoreAllocationReuse(allocationProviders) {
    const reusePenaltyPerTask = Number(
      this.portfolio?.quota_cycles?.dag_allocation_penalty_points ?? 8
    )

    const priorAllocations = allocationProviders.reduce(
      (count, providerId) => count + Math.max(0, Number(this.allocationCounts[providerId]) || 0),
      0
    )

    const reusePenalty = Math.min(30, priorAllocations * Math.max(0, reusePenaltyPerTask))

    if (reusePenalty > 0) {
      return {
        score: -reusePenalty,
        reason: `本 DAG 已向同一额度渠道分配 ${priorAllocations} 个子任务，批内软降权 -${reusePenalty}（不代表实际 token 扣额）`,
      }
    }

    return { score: 0, reason: null }
  }

  /**
   * 综合打分 - 对单个模型评分
   */
  score(model, comparisonModels = []) {
    const reasons = []
    let totalScore = 50 // 基准分

    // 1. 优先档位
    const preferTier = this.scorePreferTier(model)
    totalScore += preferTier.score
    if (preferTier.reason) reasons.push(preferTier.reason)

    // 2. 档位匹配
    const tierMatch = this.scoreTierMatch(model)
    totalScore += tierMatch.score

    // 3. 任务亲和
    const affinity = this.scoreTaskAffinity(model)
    totalScore += affinity.score
    if (affinity.reason) reasons.push(affinity.reason)

    // 4. 成本和订阅
    const cost = this.scoreCostAndSubscription(model)
    totalScore += cost.score
    reasons.push(...cost.reasons)

    const workBuddyMultiplier = this.scoreWorkBuddyMultiplier(model, comparisonModels)
    totalScore += workBuddyMultiplier.score
    if (workBuddyMultiplier.reason) reasons.push(workBuddyMultiplier.reason)

    // 5. 配额
    const quota = this.scoreQuota(model)
    totalScore += quota.score
    if (quota.reason) reasons.push(quota.reason)

    // 6. 余额
    const balance = this.scoreBalance(model)
    totalScore += balance.score
    if (balance.reason) reasons.push(balance.reason)

    // 7. 分配复用
    const reuse = this.scoreAllocationReuse(quota.allocationProviders)
    totalScore += reuse.score
    if (reuse.reason) reasons.push(reuse.reason)

    // 保底原因
    if (reasons.length === 0) {
      const tier = model.profile?.tier ?? 'balanced'
      reasons.push(`任务类型 ${this.taskType} 匹配 ${tier} 档模型`)
    }

    return {
      model,
      key: model.key,
      tier: model.profile?.tier ?? 'balanced',
      score: totalScore,
      marginalCost: cost.marginalCost,
      subInfo: cost.subInfo,
      freeModel: cost.freeModel,
      pricingKnown: cost.pricingKnown,
      inputPrice: cost.inputPrice,
      outputPrice: cost.outputPrice,
      workBuddyMultiplierStatus: workBuddyMultiplier.status,
      allocationProviders: quota.allocationProviders,
      reasons,
    }
  }

  /**
   * 批量打分并排序
   */
  scoreAll(models) {
    const candidates = models.map(model => this.score(model, models))

    // 按得分从高到低排序，得分相同按 key 字典序
    candidates.sort(compareScoredCandidates)

    return candidates
  }

  /**
   * 只保留前 k 个候选，避免路由决策只需要最佳项和置信度比较项时
   * 仍为整个模型目录创建候选数组并完整排序。
   */
  scoreTopK(models, limit) {
    if (!Number.isInteger(limit) || limit <= 0) return []

    const candidates = []
    for (const model of models) {
      const candidate = this.score(model, models)
      let index = 0
      while (index < candidates.length && compareScoredCandidates(candidates[index], candidate) <= 0) {
        index += 1
      }
      if (index >= limit) continue
      candidates.splice(index, 0, candidate)
      if (candidates.length > limit) candidates.pop()
    }
    return candidates
  }

  /**
   * 计算置信度
   */
  calculateConfidence(best, second) {
    const scoreDiff = second ? Math.max(0, best.score - second.score) : 30
    return Math.min(1.0, Math.max(0.6, 0.6 + (scoreDiff / 100) * 0.4))
  }
}

/**
 * 工厂函数
 */
export function createModelScorer(options) {
  return new ModelScorer(options)
}
