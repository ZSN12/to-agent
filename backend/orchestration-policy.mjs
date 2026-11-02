import { applyPolicyToRoute, filterModelsForTaskType } from './policy-gate.mjs'
import {
  loadRoutingPortfolio,
  loadBundledRoutingPortfolio,
  resolveDisplayName,
} from './routing-portfolio-service.mjs'
import { createModelSelector } from './orchestration/model-selector.mjs'
import { LRUCache } from './orchestration/performance-utils.mjs'
import {
  CircuitState,
  RouteCircuitBreaker,
  defaultRouteCircuitBreaker,
} from './orchestration/circuit-breaker.mjs'

export { CircuitState, RouteCircuitBreaker, defaultRouteCircuitBreaker }

const TASK_TIER_ORDER = {
  research: ['cheap', 'balanced', 'strong'],
  test: ['cheap', 'balanced', 'strong'],
  implementation: ['balanced', 'strong', 'cheap'],
  review: ['strong', 'balanced', 'cheap'],
  hard_debug: ['strong', 'balanced', 'cheap'],
}

const TIER_RANK = Object.freeze({ cheap: 0, balanced: 1, strong: 2 })
const ROUTE_CACHE_OBJECT_IDS = new WeakMap()
let nextRouteCacheObjectId = 1

function routeCacheObjectId(value) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return String(value)
  let id = ROUTE_CACHE_OBJECT_IDS.get(value)
  if (!id) {
    id = nextRouteCacheObjectId++
    ROUTE_CACHE_OBJECT_IDS.set(value, id)
  }
  return id
}

function copyRouteDecision(decision) {
  return {
    ...decision,
    reasons: Array.isArray(decision.reasons) ? [...decision.reasons] : decision.reasons,
    allocationProviders: Array.isArray(decision.allocationProviders)
      ? [...decision.allocationProviders]
      : decision.allocationProviders,
    costEstimate: decision.costEstimate && typeof decision.costEstimate === 'object'
      ? { ...decision.costEstimate }
      : decision.costEstimate,
  }
}

function createRouteDecisionCacheKey(taskType, catalog, fallbackModelKey, portfolio, quotaSnapshot, options) {
  const allocationCounts = Object.entries(options.allocationCounts ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
  const now = options.now instanceof Date ? options.now.getTime() : Number(options.now)
  return JSON.stringify([
    routeCacheObjectId(catalog),
    routeCacheObjectId(portfolio),
    routeCacheObjectId(quotaSnapshot),
    taskType,
    fallbackModelKey ?? null,
    Number.isFinite(now) ? now : null,
    options.minTier ?? null,
    options.preferTier ?? null,
    options.needsVision === true,
    catalog?.taskRoleRoutingEnabled === true,
    [...(options.excludeModelKeys ?? [])].sort(),
    [...(options.excludeFailureDomains ?? [])].sort(),
    allocationCounts,
  ])
}

export function nextTaskTier(taskType, currentTier) {
  const order = TASK_TIER_ORDER[taskType] ?? TASK_TIER_ORDER.implementation
  const rank = TIER_RANK[currentTier]
  if (!Number.isFinite(rank)) return null
  return order.find((tier) => TIER_RANK[tier] === rank + 1) ?? null
}

/** Explicit work modes select direct DAG execution; ordinary requests stay model-decided. */
export function workModeExecutionOverride(workMode) {
  if (workMode === 'goal') return 'multi-agent'
  if (workMode === 'plan') return 'single-agent'
  return null
}

/** Resolve explicit user controls; request complexity is intentionally left to the model. */
export function resolveOrchestrationPolicy({
  modeOverrides = [],
  workMode,
  skillRequiresDag = false,
  preferMultiAgent = false,
} = {}) {
  const modes = [...modeOverrides, workModeExecutionOverride(workMode)]
    .filter((mode) => mode === 'single-agent' || mode === 'multi-agent')
  const explicitSingle = modes.includes('single-agent')
  const explicitMulti = modes.includes('multi-agent')
  const forced = explicitMulti || skillRequiresDag || preferMultiAgent
  const allowed = !explicitSingle
  const required = allowed && forced
  const direct = required && (explicitMulti || workMode === 'goal' || skillRequiresDag || preferMultiAgent)
  return {
    allowed,
    required,
    direct,
    mode: required ? 'multi-agent' : 'single-agent',
    reason: required ? '当前回合要求使用 DAG 编排'
      : allowed ? '由主 Agent 根据任务需要选择工具'
        : '当前回合已限制为单 Agent/计划模式',
  }
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
 * @param {'cheap'|'balanced'|'strong'} [options.minTier] 最低可选档位，用于失败后升级重试
 * @param {'cheap'|'balanced'|'strong'} [options.preferTier] 在满足最低档位后优先尝试的更高档位
 * @param {boolean} [options.needsVision] 是否必须支持图片输入
 */
export function selectModelForTask(taskType, catalog, fallbackModelKey, options = {}) {
  // 加载 portfolio
  const portfolio = options.portfolio || (options.userDataPath
    ? loadRoutingPortfolio({ userDataPath: options.userDataPath })
    : loadBundledRoutingPortfolio())
  const quotaSnapshot = options.quotaSnapshot || null
  const now = options.now || new Date()

  // 故障路由自动熔断器：排除 OPEN 及已用尽半开试探名额的 failure domains
  const circuitBreaker = options.circuitBreaker ?? defaultRouteCircuitBreaker
  const activeBreaks = circuitBreaker?.getActiveBreaks?.() ?? []
  const brokenDomains = new Set(activeBreaks.map((item) => item.domain).filter(Boolean))
  let hasNonClosedCircuit = brokenDomains.size > 0
  for (const model of catalog?.models ?? []) {
    const domain = modelFailureDomain(model)
    if (!domain) continue
    const state = circuitBreaker?.getState?.(domain)
    if (state && state !== CircuitState.CLOSED) hasNonClosedCircuit = true
    if (state === CircuitState.OPEN
      || (state === CircuitState.HALF_OPEN
        && (typeof circuitBreaker?.canAttempt !== 'function' || !circuitBreaker.canAttempt(domain)))) {
      brokenDomains.add(domain)
    }
  }
  const unavailableDomains = [...brokenDomains]
  const combinedExcludeDomains = Array.from(new Set([
    ...(options.excludeFailureDomains ?? []),
    ...unavailableDomains,
  ]))

  const routeDecisionCache = options.routeDecisionCache
  // Circuit state can change the eligible model without changing the other
  // cache inputs. Avoid serving or storing decisions while any catalog route
  // is OPEN/HALF_OPEN; candidate inspection above is deliberately non-consuming.
  const cacheEnabled = routeDecisionCache instanceof LRUCache && !hasNonClosedCircuit
  const cacheKey = cacheEnabled
    ? createRouteDecisionCacheKey(taskType, catalog, fallbackModelKey, portfolio, quotaSnapshot, {
      ...options,
      now,
      excludeFailureDomains: combinedExcludeDomains,
    })
    : null
  if (cacheEnabled) {
    const cachedDecision = routeDecisionCache.get(cacheKey)
    if (cachedDecision) return copyRouteDecision(cachedDecision)
  }

  // 创建模型选择器（集成过滤和打分逻辑）
  const selector = createModelSelector({
    taskType,
    portfolio,
    quotaSnapshot,
    now,
    excludeModelKeys: options.excludeModelKeys,
    excludeFailureDomains: combinedExcludeDomains,
    circuitBrokenDomains: unavailableDomains,
    minTier: options.minTier,
    preferTier: options.preferTier,
    needsVision: options.needsVision === true,
    allocationCounts: options.allocationCounts ?? {},
    taskRoleRoutingEnabled: catalog?.taskRoleRoutingEnabled === true,
  })

  // 执行选择
  const selection = selector.selectWithCandidates(catalog, fallbackModelKey)
  let routeDecision = selection.decision

  // 如果没有选中模型，直接返回失败决策
  if (!routeDecision.model) {
    if (cacheEnabled) routeDecisionCache.set(cacheKey, routeDecision)
    return copyRouteDecision(routeDecision)
  }

  // 应用任务类型过滤
  const allowedModels = filterModelsForTaskType(taskType, selection.availableModels)

  // 3. 全局安全门控校验
  // Keep quota- and balance-excluded routes out of the final policy fallback.
  const gated = applyPolicyToRoute(taskType, routeDecision, { ...catalog, models: allowedModels })

  if (gated.model && gated.model.key !== routeDecision.modelKey) {
    routeDecision = {
      ...routeDecision,
      model: gated.model,
      modelKey: gated.model.key,
      displayName: resolveDisplayName(gated.model.key, portfolio),
      reason: gated.reason ?? routeDecision.reason,
      reasons: [...(routeDecision.reasons ?? []), gated.reason].filter(Boolean),
    }
  } else if (!gated.model) {
    routeDecision = gated
  }

  // Candidate enumeration only peeks at half-open capacity. Reserve a trial
  // once, after all policy gates have produced the final route decision.
  if (routeDecision.model) {
    const selectedDomain = modelFailureDomain(routeDecision.model)
    const selectedState = selectedDomain ? circuitBreaker?.getState?.(selectedDomain) : null
    let trialToken = null
    let trialUnavailable = false
    if (selectedDomain && selectedState === CircuitState.HALF_OPEN) {
      if (typeof circuitBreaker?.acquireTrial === 'function') {
        const acquired = circuitBreaker.acquireTrial(selectedDomain)
        trialToken = typeof acquired === 'string' ? acquired : null
        trialUnavailable = trialToken === null
      } else if (typeof circuitBreaker?.tryAcquireTrial === 'function') {
        trialUnavailable = !circuitBreaker.tryAcquireTrial(selectedDomain)
      }
    }
    if (trialUnavailable) {
      const reason = `该提供方的半开探测名额已用完（${selectedDomain}）`
      routeDecision = {
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
    } else if (trialToken) {
      try {
        options.onTrialReserved?.(selectedDomain, circuitBreaker, trialToken)
      } catch (error) {
        circuitBreaker.releaseTrial?.(selectedDomain, trialToken)
        throw error
      }
    }
  }

  if (cacheEnabled) routeDecisionCache.set(cacheKey, routeDecision)
  return copyRouteDecision(routeDecision)
}

const UPGRADE_ON_FAILURE_TYPES = new Set(['implementation', 'test', 'review'])

export function shouldUpgradeFailedTask(taskType, failure = null) {
  if (taskType === 'research') {
    // Read-only research should not repeat the same failed work on a new model
    // for policy, evidence, or configuration errors. A provider transport
    // failure is different: one bounded route-domain failover can preserve the
    // task while keeping all file and tool scopes unchanged.
    return ['transport', 'transient', 'timeout'].includes(failure?.kind) && failure?.retryable === true
  }
  return UPGRADE_ON_FAILURE_TYPES.has(taskType)
}

/**
 * 判断错误是否属于网络、传输、服务暂时不可用或超时等路由层故障
 */
export function isRouteFailure(error) {
  if (!error) return false
  const code = typeof error?.code === 'string' ? error.code.toUpperCase() : ''
  const status = Number(error?.status ?? error?.statusCode)
  const message = String(error?.message || error || '').toLowerCase()
  if (['transport', 'transient', 'timeout'].includes(error?.kind)) return true
  if (error?.failoverScope === 'route-domain') return true
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'TRANSPORT', 'ETASK_TIMEOUT', 'ETASK_IDLE_TIMEOUT'].includes(code)) return true
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true
  if (/fetch failed|network error|socket hang up|connection reset|tls handshake|timed out|timeout|temporarily unavailable|service unavailable|bad gateway/.test(message)) return true
  return false
}

/**
 * 记录子任务路由调用成功，通知熔断器重置状态
 */
export function recordRouteSuccess(modelOrKey, options = {}) {
  const circuitBreaker = options.circuitBreaker ?? defaultRouteCircuitBreaker
  let domain = null
  if (typeof modelOrKey === 'string') {
    const catalog = options.catalog
    const model = catalog?.models?.find((m) => m.key === modelOrKey)
    domain = model ? modelFailureDomain(model) : (modelOrKey.includes('/') ? modelOrKey.split('/')[0] : modelOrKey)
  } else if (modelOrKey && typeof modelOrKey === 'object') {
    domain = modelFailureDomain(modelOrKey)
  }
  if (domain && typeof circuitBreaker?.recordSuccess === 'function') {
    circuitBreaker.recordSuccess(domain)
  }
}

/**
 * 记录子任务路由调用失败，在符合传输/服务故障条件时累加熔断器计数
 */
export function recordRouteFailure(modelOrKey, error, options = {}) {
  const circuitBreaker = options.circuitBreaker ?? defaultRouteCircuitBreaker
  if (options.force !== true && !isRouteFailure(error)) return

  let domain = null
  if (typeof modelOrKey === 'string') {
    const catalog = options.catalog
    const model = catalog?.models?.find((m) => m.key === modelOrKey)
    domain = model ? modelFailureDomain(model) : (modelOrKey.includes('/') ? modelOrKey.split('/')[0] : modelOrKey)
  } else if (modelOrKey && typeof modelOrKey === 'object') {
    domain = modelFailureDomain(modelOrKey)
  }
  if (domain && typeof circuitBreaker?.recordFailure === 'function') {
    circuitBreaker.recordFailure(domain, error)
  }
}
