import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchOpenUsageSnapshot } from './openusage-service.mjs'
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DEFAULT_PORTFOLIO_PATH = path.join(REPO_ROOT, 'pricing', 'routing-portfolio.json')

function createEmptyRoutingPortfolio() {
  return {
    version: 2,
    display_names: {},
    subscriptions: [],
    free_model_patterns: [],
    metered_surge: [],
    routing_weights: {},
    task_affinity: {},
    capabilities: {},
  }
}

/**
 * 模式通配符匹配 (如 "google-antigravity/*", "*gemini*flash*")
 */
export function matchPattern(pattern, str) {
  if (!pattern || !str) return false
  if (pattern === str || pattern === '*') return true
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  const regex = new RegExp(`^${escaped}$`, 'i')
  return regex.test(str)
}

/**
 * 获取作品集配置文件路径 (用户数据目录优先，回退到仓库默认)
 */
export function resolvePortfolioPath(userDataPath) {
  if (userDataPath) {
    const userPortfolio = path.join(userDataPath, 'taskweaver', 'routing-portfolio.json')
    if (fs.existsSync(userPortfolio)) {
      return userPortfolio
    }
  }
  return DEFAULT_PORTFOLIO_PATH
}

/**
 * 加载能力作品集配置
 */
export function loadRoutingPortfolio({ userDataPath } = {}) {
  let defaultPortfolio = createEmptyRoutingPortfolio()

  // The bundled portfolio is always neutral. Model and account preferences
  // belong in the current user's data directory, never in a shared example.
  if (fs.existsSync(DEFAULT_PORTFOLIO_PATH)) {
    try {
      defaultPortfolio = JSON.parse(fs.readFileSync(DEFAULT_PORTFOLIO_PATH, 'utf8'))
    } catch {
      // ignore
    }
  }

  if (userDataPath) {
    const userFile = path.join(userDataPath, 'taskweaver', 'routing-portfolio.json')
    if (fs.existsSync(userFile)) {
      try {
        const userOverrides = JSON.parse(fs.readFileSync(userFile, 'utf8'))
        return {
          ...defaultPortfolio,
          ...userOverrides,
          display_names: { ...defaultPortfolio.display_names, ...userOverrides.display_names },
          routing_weights: { ...defaultPortfolio.routing_weights, ...userOverrides.routing_weights },
          task_affinity: { ...defaultPortfolio.task_affinity, ...userOverrides.task_affinity },
          capabilities: { ...defaultPortfolio.capabilities, ...userOverrides.capabilities },
          usage_source: { ...defaultPortfolio.usage_source, ...userOverrides.usage_source },
          quota_cycles: { ...defaultPortfolio.quota_cycles, ...userOverrides.quota_cycles },
        }
      } catch {
        // ignore
      }
    }
  }

  return defaultPortfolio
}

/**
 * 保存用户自定义能力作品集
 */
/**
 * 读取仓库内置默认作品集（不合并用户覆盖）。
 */
export function loadBundledRoutingPortfolio() {
  if (!fs.existsSync(DEFAULT_PORTFOLIO_PATH)) {
    return createEmptyRoutingPortfolio()
  }
  try {
    return JSON.parse(fs.readFileSync(DEFAULT_PORTFOLIO_PATH, 'utf8'))
  } catch {
    return createEmptyRoutingPortfolio()
  }
}

/**
 * 删除用户覆盖文件，使配置回退到仓库默认合并逻辑。
 */
export async function resetRoutingPortfolioToBundled({ userDataPath } = {}) {
  if (!userDataPath) throw new Error('缺少 userDataPath')
  const userFile = path.join(userDataPath, 'taskweaver', 'routing-portfolio.json')
  try {
    await fsp.unlink(userFile)
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error
  }
  return { ok: true, portfolio: loadRoutingPortfolio({ userDataPath }) }
}

function portfolioObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`路由配置 ${field} 必须是对象`)
  }
}

function portfolioString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`路由配置 ${field} 必须填写`)
  }
}

function portfolioStringList(value, field, { optional = true, minLength = 0 } = {}) {
  if (value === undefined && optional) return
  if (!Array.isArray(value) || value.length < minLength
    || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`路由配置 ${field} 必须是至少 ${minLength} 项的非空字符串数组`)
  }
}

function portfolioNumber(value, field, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  if (value === undefined) return
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`路由配置 ${field} 必须在 ${min} 到 ${max} 之间`)
  }
}

/** Validate user-authored route settings before persisting them. */
export function validateRoutingPortfolio(portfolio) {
  portfolioObject(portfolio, '根节点')
  if (!Number.isInteger(portfolio.version) || portfolio.version < 1) {
    throw new Error('路由配置 version 必须是正整数')
  }

  portfolioStringList(portfolio.free_model_patterns, 'free_model_patterns')
  if (portfolio.subscriptions !== undefined) {
    if (!Array.isArray(portfolio.subscriptions)) throw new Error('路由配置 subscriptions 必须是数组')
    const ids = new Set()
    portfolio.subscriptions.forEach((subscription, index) => {
      const field = `subscriptions[${index}]`
      portfolioObject(subscription, field)
      portfolioString(subscription.id, `${field}.id`)
      portfolioString(subscription.label, `${field}.label`)
      if (ids.has(subscription.id.trim())) throw new Error(`路由配置 ${field}.id 不能重复`)
      ids.add(subscription.id.trim())
      portfolioStringList(subscription.prefer_models, `${field}.prefer_models`, { optional: false, minLength: 1 })
      portfolioStringList(subscription.deprioritize_models, `${field}.deprioritize_models`)
      portfolioNumber(subscription.marginal_cost, `${field}.marginal_cost`)
      if (subscription.note !== undefined && typeof subscription.note !== 'string') {
        throw new Error(`路由配置 ${field}.note 必须是文本`)
      }
    })
  }

  if (portfolio.display_names !== undefined) {
    portfolioObject(portfolio.display_names, 'display_names')
    for (const [key, name] of Object.entries(portfolio.display_names)) {
      portfolioString(key, 'display_names 模型键')
      portfolioString(name, `display_names.${key}`)
    }
  }
  if (portfolio.routing_weights !== undefined) {
    portfolioObject(portfolio.routing_weights, 'routing_weights')
    for (const [key, value] of Object.entries(portfolio.routing_weights)) {
      portfolioNumber(value, `routing_weights.${key}`)
    }
  }

  if (portfolio.usage_source !== undefined) {
    portfolioObject(portfolio.usage_source, 'usage_source')
    if (portfolio.usage_source.provider !== undefined) portfolioString(portfolio.usage_source.provider, 'usage_source.provider')
    if (portfolio.usage_source.enabled !== undefined && typeof portfolio.usage_source.enabled !== 'boolean') {
      throw new Error('路由配置 usage_source.enabled 必须是布尔值')
    }
    if (portfolio.usage_source.base_url !== undefined) {
      portfolioString(portfolio.usage_source.base_url, 'usage_source.base_url')
      let url
      try { url = new URL(portfolio.usage_source.base_url) } catch { throw new Error('路由配置 usage_source.base_url 不是有效 URL') }
      if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        || url.username || url.password) {
        throw new Error('路由配置 usage_source.base_url 只能使用本机 OpenUsage HTTP 地址')
      }
    }
    portfolioNumber(portfolio.usage_source.timeout_ms, 'usage_source.timeout_ms', { min: 50, max: 2000 })
  }

  if (portfolio.quota_cycles !== undefined) {
    portfolioObject(portfolio.quota_cycles, 'quota_cycles')
    for (const key of ['enabled', 'auto_discover']) {
      if (portfolio.quota_cycles[key] !== undefined && typeof portfolio.quota_cycles[key] !== 'boolean') {
        throw new Error(`路由配置 quota_cycles.${key} 必须是布尔值`)
      }
    }
    for (const key of ['max_snapshot_age_ms', 'reset_within_ms', 'scarce_penalty_points', 'abundance_bonus_points', 'bonus_points', 'scarce_remaining_ratio', 'min_remaining_ratio_for_bonus', 'dag_allocation_penalty_points']) {
      portfolioNumber(portfolio.quota_cycles[key], `quota_cycles.${key}`, {
        max: key.includes('ratio') ? 1 : Number.POSITIVE_INFINITY,
      })
    }
    if (portfolio.quota_cycles.policies !== undefined) {
      if (!Array.isArray(portfolio.quota_cycles.policies)) throw new Error('路由配置 quota_cycles.policies 必须是数组')
      portfolio.quota_cycles.policies.forEach((policy, index) => {
        const field = `quota_cycles.policies[${index}]`
        portfolioObject(policy, field)
        portfolioString(policy.provider_id, `${field}.provider_id`)
        portfolioString(policy.resource_id, `${field}.resource_id`)
        portfolioStringList(policy.match_model_keys, `${field}.match_model_keys`)
        for (const key of ['enabled', 'use_before_reset']) {
          if (policy[key] !== undefined && typeof policy[key] !== 'boolean') throw new Error(`路由配置 ${field}.${key} 必须是布尔值`)
        }
        if (policy.rollover !== undefined && ![true, false, 'unknown', 'true', 'false'].includes(policy.rollover)) {
          throw new Error(`路由配置 ${field}.rollover 必须是 true、false 或 unknown`)
        }
        if (policy.exhausted_action !== undefined && !['exclude', 'penalize'].includes(policy.exhausted_action)) {
          throw new Error(`路由配置 ${field}.exhausted_action 必须是 exclude 或 penalize`)
        }
        for (const key of ['reset_within_ms', 'scarce_penalty_points', 'bonus_points']) {
          portfolioNumber(policy[key], `${field}.${key}`)
        }
        for (const key of ['min_remaining_ratio_for_bonus', 'scarce_remaining_ratio']) {
          portfolioNumber(policy[key], `${field}.${key}`, { max: 1 })
        }
      })
    }
  }

  if (portfolio.balance_policies !== undefined) {
    if (!Array.isArray(portfolio.balance_policies)) throw new Error('路由配置 balance_policies 必须是数组')
    portfolio.balance_policies.forEach((policy, index) => {
      const field = `balance_policies[${index}]`
      portfolioObject(policy, field)
      portfolioString(policy.provider_id, `${field}.provider_id`)
      portfolioString(policy.resource_id, `${field}.resource_id`)
      portfolioStringList(policy.match_model_keys, `${field}.match_model_keys`, { optional: false, minLength: 1 })
      portfolioString(policy.unit, `${field}.unit`)
      for (const key of ['low_balance_threshold', 'low_balance_penalty_points', 'exhausted_penalty_points']) {
        portfolioNumber(policy[key], `${field}.${key}`)
      }
      if (policy.enabled !== undefined && typeof policy.enabled !== 'boolean') throw new Error(`路由配置 ${field}.enabled 必须是布尔值`)
      if (policy.exhausted_action !== undefined && !['exclude', 'penalize'].includes(policy.exhausted_action)) {
        throw new Error(`路由配置 ${field}.exhausted_action 必须是 exclude 或 penalize`)
      }
    })
  }

  if (portfolio.metered_surge !== undefined) {
    if (!Array.isArray(portfolio.metered_surge)) throw new Error('路由配置 metered_surge 必须是数组')
    for (const [index, rule] of portfolio.metered_surge.entries()) {
      const field = `metered_surge[${index}]`
      portfolioObject(rule, field)
      if (!rule.provider && (!Array.isArray(rule.match_model_keys) || rule.match_model_keys.length === 0)) {
        throw new Error(`路由配置 ${field} 需要 provider 或 match_model_keys`)
      }
      if (rule.provider !== undefined) portfolioString(rule.provider, `${field}.provider`)
      portfolioStringList(rule.match_model_keys, `${field}.match_model_keys`)
      if (!Array.isArray(rule.windows) || rule.windows.length === 0) throw new Error(`路由配置 ${field}.windows 不能为空`)
      if (rule.timezone !== undefined) {
        portfolioString(rule.timezone, `${field}.timezone`)
        try { new Intl.DateTimeFormat('en-US', { timeZone: rule.timezone }) } catch { throw new Error(`路由配置 ${field}.timezone 不是有效时区`) }
      }
      for (const [windowIndex, window] of rule.windows.entries()) {
        const windowField = `${field}.windows[${windowIndex}]`
        portfolioObject(window, windowField)
        portfolioStringList(window.days, `${windowField}.days`, { optional: false, minLength: 1 })
        if (window.days.some((day) => !['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].includes(day.toLowerCase()))) {
          throw new Error(`路由配置 ${windowField}.days 只能使用 sun 到 sat`)
        }
        if (!Array.isArray(window.hours) || window.hours.length !== 2
          || !window.hours.every((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 24)
          || window.hours[0] >= window.hours[1]) {
          throw new Error(`路由配置 ${windowField}.hours 必须是递增的 [开始小时, 结束小时]，范围 0–24`)
        }
        portfolioNumber(window.surcharge_factor, `${windowField}.surcharge_factor`, { min: Number.EPSILON })
      }
    }
  }

  for (const field of ['task_affinity', 'capabilities']) {
    if (portfolio[field] === undefined) continue
    portfolioObject(portfolio[field], field)
    for (const [name, entry] of Object.entries(portfolio[field])) {
      const entryField = `${field}.${name}`
      portfolioObject(entry, entryField)
      for (const key of field === 'task_affinity' ? ['prefer', 'avoid'] : ['match_model_ids', 'tags']) {
        portfolioStringList(entry[key], `${entryField}.${key}`)
      }
      for (const key of field === 'task_affinity' ? ['reason', 'min_capability'] : []) {
        if (entry[key] !== undefined && typeof entry[key] !== 'string') throw new Error(`路由配置 ${entryField}.${key} 必须是文本`)
      }
    }
  }

  return portfolio
}

export async function saveRoutingPortfolio(portfolio, { userDataPath } = {}) {
  if (!userDataPath) throw new Error('缺少 userDataPath，无法保存用户作品集')
  const validated = validateRoutingPortfolio(portfolio)
  const dir = path.join(userDataPath, 'taskweaver')
  await fsp.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, 'routing-portfolio.json')
  await fsp.writeFile(filePath, JSON.stringify(validated, null, 2), 'utf8')
  return { ok: true, path: filePath }
}

/**
 * 将底层 modelKey 转为干净易读的 displayName（如 "Gemini 3.8 Flash", "Composer 2.5"）
 * 彻底消除前端显示的渠道经济学（如 "google-antigravity/", "opencodex/cursor/"）
 */
export function resolveDisplayName(modelKey, portfolio) {
  if (!modelKey || typeof modelKey !== 'string') return '默认模型'

  // 1. 优先从作品集的显式 display_names 映射匹配
  if (portfolio?.display_names?.[modelKey]) {
    return portfolio.display_names[modelKey]
  }

  // 2. 检查模式通配匹配
  if (portfolio?.display_names) {
    for (const [pattern, name] of Object.entries(portfolio.display_names)) {
      if (matchPattern(pattern, modelKey)) {
        return name
      }
    }
  }

  // 3. 剥离已知的渠道和前缀
  let name = modelKey
  const prefixes = [
    'opencodex/cursor/',
    'opencodex/',
    'google-antigravity/',
    'antigravity/',
    'openai-codex/',
    'openai/',
    'cursor/',
    'anthropic/',
    'deepseek/',
  ]

  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length)
      break
    }
  }

  // 4. 美化常见模型代号
  const prettyMap = {
    'composer-2.5': 'Composer 2.5',
    'grok-4.6': 'Grok 4.6',
    'gpt-5.5': modelKey.includes('codex') ? 'GPT-5.5 Codex' : 'GPT-5.5',
    'gpt-5.3-codex-spark': 'Codex Spark',
    'gemini-3.8-flash-medium': 'Gemini 3.8 Flash',
    'gemini-3.8-pro': 'Gemini 3.8 Pro',
    'deepseek-chat': 'DeepSeek V3',
    'deepseek-reasoner': 'DeepSeek R1',
  }

  return prettyMap[name] || name.split(/[-_/]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/**
 * 检查模型是否属于用户的活跃订阅套餐
 * 返回订阅信息，订阅覆盖下边际成本为 0
 */
export function checkSubscription(modelKey, portfolio) {
  if (!portfolio?.subscriptions || !Array.isArray(portfolio.subscriptions)) {
    return { inSubscription: false, label: null, marginalCost: null }
  }

  for (const sub of portfolio.subscriptions) {
    const prefer = sub.prefer_models || []
    const deprioritize = sub.deprioritize_models || []

    // 检查是否被明确降权
    const isDeprioritized = deprioritize.some((pat) => matchPattern(pat, modelKey))
    if (isDeprioritized) {
      continue
    }

    const isMatch = prefer.some((pat) => matchPattern(pat, modelKey))
    if (isMatch) {
      return {
        inSubscription: true,
        label: sub.label || sub.id,
        note: sub.note,
        marginalCost: Number(sub.marginal_cost ?? 0),
      }
    }
  }

  return { inSubscription: false, label: null, marginalCost: null }
}

/**
 * 检查按量模型是否处于时段加价/高峰期 (如 DeepSeek 工作日 9:00-18:00 加价)
 */
export function checkMeteredSurge(modelKey, portfolio, now = new Date()) {
  if (!portfolio?.metered_surge || !Array.isArray(portfolio.metered_surge)) {
    return { inSurge: false, surchargeFactor: 1.0, reason: null }
  }

  for (const rule of portfolio.metered_surge) {
    const matchKeys = rule.match_model_keys || [rule.provider ? `${rule.provider}/*` : '*']
    const isMatch = matchKeys.some((pat) => matchPattern(pat, modelKey))
    if (!isMatch) continue

    // 计算指定时区下的日期与小时 (默认 Asia/Shanghai)
    const tz = rule.timezone || 'Asia/Shanghai'
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    })

    const parts = formatter.formatToParts(now)
    const dayStr = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase() || ''
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? now.getHours())

    const daysMap = {
      sun: 'sun',
      mon: 'mon',
      tue: 'tue',
      wed: 'wed',
      thu: 'thu',
      fri: 'fri',
      sat: 'sat',
    }
    const currentDay = daysMap[dayStr.slice(0, 3)] || 'mon'

    for (const win of rule.windows || []) {
      const normalizedDays = (win.days || []).map((d) => String(d).toLowerCase())
      const dayMatches = normalizedDays.includes(currentDay)
      const [startHour, endHour] = win.hours || [0, 24]
      const hourMatches = hour >= startHour && hour < endHour

      if (dayMatches && hourMatches) {
        return {
          inSurge: true,
          surchargeFactor: win.surcharge_factor || 1.5,
          action: rule.action || 'deprioritize',
          reason: `处于加价窗口 (${tz} 工作日 ${startHour}:00-${endHour}:00，加价 ${win.surcharge_factor}x)，已降权`,
        }
      }
    }
  }

  return { inSurge: false, surchargeFactor: 1.0, reason: null }
}

function quotaDefaults(portfolio) {
  const cycles = portfolio?.quota_cycles ?? {}
  return {
    max_snapshot_age_ms: cycles.max_snapshot_age_ms ?? 60 * 60 * 1000,
    reset_within_ms: cycles.reset_within_ms ?? 72 * 60 * 60 * 1000,
    scarce_remaining_ratio: cycles.scarce_remaining_ratio ?? 0.12,
    min_remaining_ratio_for_bonus: cycles.min_remaining_ratio_for_bonus ?? 0.4,
    scarce_penalty_points: cycles.scarce_penalty_points ?? 20,
    abundance_bonus_points: cycles.abundance_bonus_points ?? 0,
    bonus_points: cycles.bonus_points ?? 15,
  }
}

function resourceResetMs(resource) {
  const value = Date.parse(resource?.resetsAt ?? resource?.resetAt ?? '')
  return Number.isFinite(value) ? value : null
}

function resourceRemainingRatio(resource) {
  const remaining = Number(resource?.remaining)
  const limit = Number(resource?.limit ?? resource?.max)
  if (Number.isFinite(remaining) && Number.isFinite(limit) && limit > 0) {
    return Math.max(0, Math.min(1, remaining / limit))
  }
  const utilization = Number(resource?.utilization)
  if (Number.isFinite(utilization)) {
    const normalized = utilization > 1 ? utilization / 100 : utilization
    return Math.max(0, Math.min(1, 1 - normalized))
  }
  return null
}

export function isQuotaResourceFresh(resource, defaults = {}, now = Date.now(), provider = null) {
  if (!resource || resource.stale === true || provider?.stale === true) return false
  const expiresAt = Date.parse(resource.expiresAt ?? provider?.expiresAt ?? '')
  if (Number.isFinite(expiresAt) && expiresAt < now) return false
  const fetchedAt = Date.parse(resource.fetchedAt ?? provider?.fetchedAt ?? '')
  const maxAge = Number(defaults.max_snapshot_age_ms)
  if (!Number.isFinite(fetchedAt)) return false
  if (Number.isFinite(maxAge) && maxAge > 0 && now - fetchedAt > maxAge) return false
  return true
}

const AUTO_PROVIDER_PREFIXES = {
  antigravity: ['google-antigravity/', 'antigravity/', 'opencodex/google-antigravity/', 'opencodex/antigravity/'],
  codex: ['openai-codex/', 'opencodex/openai-codex/', 'openai/', 'opencodex/openai/'],
  cursor: ['cursor/', 'opencodex/cursor/'],
}

function modelMatchesOpenUsageProvider(modelKey, providerId) {
  const normalizedModel = String(modelKey ?? '').toLowerCase()
  const normalizedProvider = String(providerId ?? '').toLowerCase()
  if (!normalizedModel || !normalizedProvider) return false
  const prefixes = AUTO_PROVIDER_PREFIXES[normalizedProvider] ?? [`${normalizedProvider}/`, `opencodex/${normalizedProvider}/`]
  return prefixes.some((prefix) => normalizedModel.startsWith(prefix))
}

function autoResourceFamily(resourceId) {
  const normalizedResource = String(resourceId ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (normalizedResource.includes('nongemini')) return 'non-gemini'
  if (normalizedResource.includes('gemini')) return 'gemini'
  if (normalizedResource.includes('grok')) return 'grok'
  return null
}

function autoModelFamily(modelKey, resourceEntries) {
  const normalizedModel = String(modelKey ?? '').toLowerCase()
  const resourceFamilies = resourceEntries.map(([resourceId]) => autoResourceFamily(resourceId)).filter(Boolean)
  if (normalizedModel.includes('gemini') && resourceFamilies.includes('gemini')) return 'gemini'
  if (normalizedModel.includes('grok') && resourceFamilies.includes('grok')) return 'grok'
  if (!normalizedModel.includes('gemini') && !normalizedModel.includes('grok')
    && resourceFamilies.includes('non-gemini')) return 'non-gemini'
  return null
}

function matchedQuotaResources(modelKey, portfolio, quotaSnapshot, now = Date.now()) {
  if (!portfolio?.quota_cycles?.enabled || !quotaSnapshot?.providers) return []
  const defaults = quotaDefaults(portfolio)
  const policies = (portfolio.quota_cycles.policies ?? []).filter((policy) => policy?.enabled !== false)
  const explicitResourceKeys = new Set(policies.map((policy) => `${policy.provider_id}/${policy.resource_id}`))
  const matched = []

  for (const policy of policies) {
    if (!modelMatchesQuotaPolicy(modelKey, policy)) continue
    const provider = quotaSnapshot.providers[policy.provider_id]
    const resource = provider?.resources?.[policy.resource_id]
    if (resource?.kind !== 'consumption' || !isQuotaResourceFresh(resource, defaults, now, provider)) continue
    const ratio = resourceRemainingRatio(resource)
    if (ratio === null) continue
    matched.push({ providerId: policy.provider_id, resourceId: policy.resource_id, resource, policy, ratio })
  }

  if (portfolio.quota_cycles.auto_discover === true) {
    for (const [providerId, provider] of Object.entries(quotaSnapshot.providers)) {
      if (!modelMatchesOpenUsageProvider(modelKey, providerId)) continue
      const resourceEntries = Object.entries(provider?.resources ?? {})
      const targetFamily = autoModelFamily(modelKey, resourceEntries)
      const hasFamilyResources = resourceEntries.some(([resourceId]) => autoResourceFamily(resourceId) !== null)
      for (const [resourceId, resource] of resourceEntries) {
        if (explicitResourceKeys.has(`${providerId}/${resourceId}`)) continue
        if (resource?.kind !== 'consumption') continue
        const family = autoResourceFamily(resourceId)
        if (hasFamilyResources && (targetFamily ? family !== targetFamily : family !== null)) continue
        if (!isQuotaResourceFresh(resource, defaults, now, provider)) continue
        const ratio = resourceRemainingRatio(resource)
        if (ratio === null) continue
        matched.push({ providerId, resourceId, resource, policy: null, ratio, automatic: true })
      }
    }
  }

  return matched
}

export function modelMatchesQuotaPolicy(modelKey, policy) {
  if (!modelKey || !policy) return false
  const patterns = policy.match_model_keys
  if (Array.isArray(patterns) && patterns.length > 0) {
    return patterns.some((pattern) => matchPattern(pattern, modelKey))
  }
  return modelMatchesOpenUsageProvider(modelKey, policy.provider_id)
}

export function quotaAllocationProviders(modelKey, portfolio, quotaSnapshot, now = Date.now()) {
  return [...new Set(matchedQuotaResources(modelKey, portfolio, quotaSnapshot, now).map((item) => item.providerId))]
}

export function calculateQuotaAdjustment(modelKey, portfolio, quotaSnapshot, now = Date.now()) {
  const matched = matchedQuotaResources(modelKey, portfolio, quotaSnapshot, now)
  const defaults = quotaDefaults(portfolio)
  let bonus = 0
  let penalty = 0
  const reasons = []

  for (const item of matched) {
    const { providerId, resourceId, resource, policy, ratio } = item
    const scarceThreshold = policy?.scarce_remaining_ratio ?? defaults.scarce_remaining_ratio
    if (ratio <= scarceThreshold) {
      const points = policy?.scarce_penalty_points ?? defaults.scarce_penalty_points
      if (points > penalty) {
        penalty = points
        reasons.push(`${providerId}/${resourceId} 配额剩余 ${Math.round(ratio * 100)}%，降低路由权重`)
      }
    }

    const minRatio = policy?.min_remaining_ratio_for_bonus ?? defaults.min_remaining_ratio_for_bonus
    const abundanceBonus = defaults.abundance_bonus_points
    if (abundanceBonus > bonus && ratio >= minRatio) {
      bonus = abundanceBonus
      reasons.push(`${providerId}/${resourceId} 配额充足（剩余 ${Math.round(ratio * 100)}%），优先使用 +${abundanceBonus}`)
    }

    const rollover = policy?.rollover
    const useBeforeReset = policy?.use_before_reset === true
    const nonRollover = rollover === false || rollover === 'false'
    if (!item.automatic && useBeforeReset && nonRollover && ratio >= minRatio) {
      const resetAt = resourceResetMs(resource)
      const untilReset = resetAt === null ? null : resetAt - now
      const resetWithin = policy?.reset_within_ms ?? defaults.reset_within_ms
      if (untilReset !== null && untilReset > 0 && untilReset <= resetWithin) {
        const urgency = 1 - untilReset / resetWithin
        const points = Math.round((policy?.bonus_points ?? defaults.bonus_points) * urgency * Math.min(1, ratio / minRatio))
        if (points > bonus) {
          bonus = points
          const hours = Math.max(1, Math.round(untilReset / 3_600_000))
          reasons.push(`${providerId}/${resourceId} 约 ${hours} 小时后刷新且不可结转，刷新前利用 +${points}`)
        }
      }
    }
  }

  const allocationProviders = [...new Set(matched.map((item) => item.providerId))]
  return {
    bonus,
    penalty,
    excluded: isModelQuotaExcluded(modelKey, portfolio, quotaSnapshot, now),
    allocationProviders,
    reason: reasons.length ? reasons.join('；') : null,
    reasons,
  }
}

export function isModelQuotaExcluded(modelKey, portfolio, quotaSnapshot, now = Date.now()) {
  const matched = matchedQuotaResources(modelKey, portfolio, quotaSnapshot, now)
  for (const item of matched) {
    if (!item.automatic && item.ratio <= 0 && (item.policy?.exhausted_action ?? 'exclude') === 'exclude') return true
  }

  const automaticByProvider = new Map()
  for (const item of matched) {
    if (!item.automatic) continue
    const ratios = automaticByProvider.get(item.providerId) ?? []
    ratios.push(item.ratio)
    automaticByProvider.set(item.providerId, ratios)
  }
  return [...automaticByProvider.values()].some((ratios) => ratios.length > 0 && ratios.every((ratio) => ratio <= 0))
}

export function calculateBalanceAdjustment(modelKey, portfolio, quotaSnapshot, now = Date.now()) {
  const policies = (portfolio?.balance_policies ?? []).filter((policy) => policy?.enabled !== false
    && Array.isArray(policy.match_model_keys)
    && policy.match_model_keys.some((pattern) => matchPattern(pattern, modelKey)))
  let penalty = 0
  let excluded = false
  const reasons = []

  for (const policy of policies) {
    const provider = quotaSnapshot?.providers?.[policy.provider_id]
    const resource = provider?.resources?.[policy.resource_id]
    if (!resource || resource.kind !== 'balance' || !isQuotaResourceFresh(resource, quotaDefaults(portfolio), now, provider)) continue
    if (!resource.unit || String(resource.unit).trim().toLowerCase() !== String(policy.unit).trim().toLowerCase()) continue
    const amount = Number(resource.available ?? resource.remaining)
    if (!Number.isFinite(amount)) continue

    if (amount <= 0) {
      const action = policy.exhausted_action ?? 'penalize'
      if (action === 'exclude') excluded = true
      else penalty = Math.max(penalty, policy.exhausted_penalty_points ?? 25)
      reasons.push(`${policy.provider_id}/${policy.resource_id} 余额已耗尽${action === 'exclude' ? '，停止路由' : '，降低路由优先级'}`)
    } else if (Number.isFinite(policy.low_balance_threshold) && amount <= policy.low_balance_threshold) {
      const points = policy.low_balance_penalty_points ?? 10
      penalty = Math.max(penalty, points)
      reasons.push(`${policy.provider_id}/${policy.resource_id} 余额低于阈值，降低路由优先级 -${points}`)
    }
  }

  return { penalty, excluded, reason: reasons.length ? reasons.join('；') : null, reasons }
}

export function isModelBalanceExcluded(modelKey, portfolio, quotaSnapshot, now = Date.now()) {
  return calculateBalanceAdjustment(modelKey, portfolio, quotaSnapshot, now).excluded
}

export function isFreeModel(modelKey, portfolio, model = null) {
  const configuredPatterns = Array.isArray(portfolio?.free_model_patterns)
    ? portfolio.free_model_patterns
    : []
  if (configuredPatterns.some((pattern) => matchPattern(pattern, modelKey))) return true

  // Only trust a zero price when it came from a per-model price entry with
  // usable confidence. Missing catalog prices are represented as zero too.
  const priceMeta = model?.priceMeta
  if (!priceMeta || priceMeta.stale === true || priceMeta.confidence === 'low') return false
  if (priceMeta.hasInputPrice === false || priceMeta.hasOutputPrice === false) return false
  const hasPerModelEvidence = Boolean(priceMeta.adapter)
    || priceMeta.source === 'taskweaver-remote-registry'
  if (!hasPerModelEvidence) return false
  const input = Number(model?.costPerMillion?.input)
  const output = Number(model?.costPerMillion?.output)
  return Number.isFinite(input) && Number.isFinite(output) && input === 0 && output === 0
}

/** 加载当前用户作品集，并按需读取本机 OpenUsage 快照供路由评估。 */
export async function buildRoutingOptions({ userDataPath, portfolio, openUsageBaseUrl } = {}) {
  const loaded = portfolio || (userDataPath
    ? loadRoutingPortfolio({ userDataPath })
    : loadBundledRoutingPortfolio())
  const usageEnabled = loaded?.usage_source?.enabled === true
  const routingEnabled = loaded?.quota_cycles?.enabled === true
    || (loaded?.balance_policies ?? []).some((policy) => policy?.enabled !== false)
  let quotaSnapshot = null
  if (usageEnabled && routingEnabled) {
    quotaSnapshot = await fetchOpenUsageSnapshot({
      baseUrl: openUsageBaseUrl || loaded.usage_source.base_url || loaded.quota_cycles?.base_url || 'http://127.0.0.1:6736',
      timeoutMs: loaded.usage_source.timeout_ms ?? 500,
    })
  }
  return {
    portfolio: loaded,
    quotaSnapshot,
    userDataPath,
  }
}
