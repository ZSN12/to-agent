/**
 * 模型过滤器 - 硬约束门控
 * 负责根据任务需求和模型可用性过滤候选模型
 */

import { ROUTING_CONFIG } from '../config/constants.mjs'
import { isModelQuotaExcluded, isModelBalanceExcluded } from '../routing-portfolio-service.mjs'
import { modelTaskRoleForTaskType, MODEL_TASK_ROLE_LABELS } from '../model-task-roles.mjs'

export class ModelFilter {
  constructor(options = {}) {
    this.taskType = options.taskType
    this.portfolio = options.portfolio
    this.quotaSnapshot = options.quotaSnapshot
    this.now = options.now || Date.now()
    this.excludeKeys = new Set(options.excludeModelKeys ?? [])
    this.excludeFailureDomains = new Set(options.excludeFailureDomains ?? [])
    this.circuitBrokenDomains = new Set(options.circuitBrokenDomains ?? [])
    this.minTierRank = ROUTING_CONFIG.TIER_RANK[options.minTier]
    this.needsVision = options.needsVision === true
    this.taskRole = modelTaskRoleForTaskType(this.taskType)
    this.taskRoleRoutingConfigured = options.taskRoleRoutingEnabled === true
    this.assignedTaskRoleModelCount = 0
  }

  /**
   * 检查模型是否满足档位要求
   */
  meetsFloor(model) {
    if (!Number.isFinite(this.minTierRank)) return true
    const tier = model.profile?.tier ?? 'balanced'
    return ROUTING_CONFIG.TIER_RANK[tier] >= this.minTierRank
  }

  /**
   * 检查模型是否支持所需输入类型
   */
  supportsRequiredInput(model) {
    return !this.needsVision || model.vision === true
  }

  /**
   * 检查模型是否被排除
   */
  isExcluded(model) {
    const domain = this.getFailureDomain(model)
    return this.excludeKeys.has(model.key) ||
           this.excludeFailureDomains.has(domain) ||
           this.circuitBrokenDomains.has(domain)
  }

  /**
   * 检查模型是否处于熔断状态
   */
  isCircuitBroken(model) {
    const domain = this.getFailureDomain(model)
    return Boolean(domain && this.circuitBrokenDomains.has(domain))
  }

  /**
   * 获取模型的失败域
   */
  getFailureDomain(model) {
    const provider = typeof model?.provider === 'string' ? model.provider : ''
    if (!provider) return null

    if (provider === 'opencodex') {
      const adapter = typeof model.id === 'string' ? model.id.split('/')[0] : ''
      if (adapter) return `${provider}/${adapter}`
    }

    return provider
  }

  /**
   * 检查模型是否被配额/余额限制排除
   */
  isExcludedByUsage(model) {
    return isModelQuotaExcluded(model.key, this.portfolio, this.quotaSnapshot, this.now) ||
           isModelBalanceExcluded(model.key, this.portfolio, this.quotaSnapshot, this.now)
  }

  /**
   * 主过滤方法 - 应用所有硬约束
   */
  filter(model) {
    return model.available &&
           model.routeRegistered !== false &&
           this.matchesTaskRole(model) &&
           this.supportsRequiredInput(model) &&
           this.meetsFloor(model) &&
           !this.isExcluded(model) &&
           !this.isExcludedByUsage(model)
  }

  /**
   * 批量过滤
   */
  filterAll(models) {
    this.taskRoleRoutingConfigured ||= Boolean(this.taskRole) && models.some((model) =>
      Array.isArray(model?.profile?.taskRoles) && model.profile.taskRoles.length > 0,
    )
    this.assignedTaskRoleModelCount = this.taskRoleRoutingConfigured && this.taskRole
      ? models.filter((model) => this.matchesTaskRole(model)).length
      : 0
    return models.filter(model => this.filter(model))
  }

  matchesTaskRole(model) {
    if (this.taskRoleRoutingConfigured && this.taskRole) {
      if (Array.isArray(model.profile?.taskRoles)) {
        return model.profile.taskRoles.includes(this.taskRole)
      }
      // Models predating role assignments remain eligible for every task role
      // they were already enabled for; an explicit empty array opts out.
      return model.profile?.enabledForAllocation === true
    }
    return model.profile?.enabledForAllocation === true
  }

  /**
   * 生成排除原因说明
   */
  getExclusionReason(model, fallbackModelKey) {
    if (!model || typeof model !== 'object') {
      return '没有可用且已鉴权的模型'
    }

    if (this.needsVision && !model.vision) {
      return '没有可用且已鉴权的视觉模型'
    }

    if (this.isExcludedByUsage(model)) {
      return '当前匹配的额度或余额策略已耗尽，已停止路由到这些模型'
    }

    const domain = this.getFailureDomain(model)
    if (domain && this.circuitBrokenDomains.has(domain)) {
      return `该提供方近期多次故障已临时熔断（${domain}）`
    }

    if (model.key === fallbackModelKey && this.excludeFailureDomains.has(domain)) {
      return '模型传输失败，已排除故障上游路由，当前没有其他可用模型'
    }

    if (this.taskRoleRoutingConfigured && this.taskRole) {
      const label = MODEL_TASK_ROLE_LABELS[this.taskRole]
      return this.assignedTaskRoleModelCount === 0
        ? `尚未给“${label}”分配模型`
        : `“${label}”档位的模型当前不可用`
    }

    return '没有可用且已鉴权的模型'
  }
}

/**
 * 工厂函数
 */
export function createModelFilter(options) {
  return new ModelFilter(options)
}
