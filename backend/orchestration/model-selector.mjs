/**
 * 模型选择与路由决策工厂
 * 将过滤和打分逻辑组合起来，生成最终的路由决策
 */

import { createModelFilter } from './model-filter.mjs'
import { createModelScorer } from './model-scorer.mjs'
import { resolveDisplayName } from '../routing-portfolio-service.mjs'

/**
 * 构建路由决策对象
 */
export function buildRouteDecision(best, candidates, portfolio) {
  const second = candidates[1]
  const scorer = { calculateConfidence: (b, s) => {
    const scoreDiff = s ? Math.max(0, b.score - s.score) : 30
    return Math.min(1.0, Math.max(0.6, 0.6 + (scoreDiff / 100) * 0.4))
  }}

  const confidence = scorer.calculateConfidence(best, second)

  return {
    model: best.model,
    modelKey: best.key,
    displayName: resolveDisplayName(best.key, portfolio),
    strategy: 'portfolio-rule',
    reasons: best.reasons,
    reason: best.reasons.join('；'),
    confidence: Number(confidence.toFixed(2)),
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
      marginalCostPerMillion: best.subInfo.inSubscription || best.freeModel || best.pricingKnown
        ? best.marginalCost
        : null,
    },
    score: best.score,
    allocationProviders: best.allocationProviders,
  }
}

/**
 * 构建回退决策
 */
export function buildFallbackDecision(fallback, portfolio) {
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

/**
 * 构建失败决策
 */
export function buildFailureDecision(reason) {
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

/**
 * 工厂函数：创建完整的模型选择器
 */
export function createModelSelector(options) {
  const filter = createModelFilter(options)
  const scorer = createModelScorer(options)

  const selectWithCandidates = (catalog, fallbackModelKey) => {
    const models = catalog?.models ?? []

    // 1. 硬约束过滤
    const availableModels = filter.filterAll(models)

    // 如果没有可用模型，尝试回退
    if (availableModels.length === 0) {
      const fallbackCandidate = fallbackModelKey == null
        ? null
        : models.find(model => model?.key === fallbackModelKey)

      if (fallbackCandidate && filter.filter(fallbackCandidate)) {
        return {
          decision: buildFallbackDecision(fallbackCandidate, options.portfolio),
          availableModels,
        }
      }

      // 完全失败
      const reason = fallbackCandidate
        ? filter.getExclusionReason(fallbackCandidate, fallbackModelKey)
        : (filter.circuitBrokenDomains?.size > 0
          ? `该提供方近期多次故障已临时熔断（${[...filter.circuitBrokenDomains].join('、')}）`
          : '没有可用且已鉴权的模型')
      return { decision: buildFailureDecision(reason), availableModels }
    }

    // 2. 软打分评估
    const candidates = scorer.scoreTopK(availableModels, 2)

    // 3. 选择最佳候选
    const best = candidates[0]
    const decision = buildRouteDecision(best, candidates, options.portfolio)

    // 若有候选模型因所属提供方处于熔断状态而被排除，在决策理由中给出明确说明
    if (filter.circuitBrokenDomains?.size > 0) {
      const excludedBrokenDomains = [...new Set(
        models
          .filter((m) => filter.isCircuitBroken(m))
          .map((m) => filter.getFailureDomain(m))
          .filter(Boolean)
      )]
      if (excludedBrokenDomains.length > 0) {
        const brokenReason = `该提供方近期多次故障已临时熔断（${excludedBrokenDomains.join('、')}）`
        decision.reasons = [...(decision.reasons ?? []), brokenReason]
        decision.reason = decision.reasons.join('；')
      }
    }

    return { decision, availableModels }
  }

  return {
    filter,
    scorer,
    select(catalog, fallbackModelKey) {
      return selectWithCandidates(catalog, fallbackModelKey).decision
    },
    selectWithCandidates,
  }
}
