import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DEFAULT_PORTFOLIO_PATH = path.join(REPO_ROOT, 'pricing', 'routing-portfolio.json')

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
  const filePath = resolvePortfolioPath(userDataPath)
  let defaultPortfolio = {
    version: 1,
    display_names: {},
    subscriptions: [],
    metered_surge: [],
    task_affinity: {},
    capabilities: {},
    quota_cycles: { enabled: false },
  }

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
          task_affinity: { ...defaultPortfolio.task_affinity, ...userOverrides.task_affinity },
          capabilities: { ...defaultPortfolio.capabilities, ...userOverrides.capabilities },
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
    return loadRoutingPortfolio()
  }
  try {
    return JSON.parse(fs.readFileSync(DEFAULT_PORTFOLIO_PATH, 'utf8'))
  } catch {
    return loadRoutingPortfolio()
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

export async function saveRoutingPortfolio(portfolio, { userDataPath } = {}) {
  if (!userDataPath) throw new Error('缺少 userDataPath，无法保存用户作品集')
  const dir = path.join(userDataPath, 'taskweaver')
  await fsp.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, 'routing-portfolio.json')
  await fsp.writeFile(filePath, JSON.stringify(portfolio, null, 2), 'utf8')
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
    'gpt-5.5': 'GPT-5.5',
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
      const dayMatches = (win.days || []).includes(currentDay)
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

/**
 * 适配 OpenUsage 本地 HTTP API (GET http://127.0.0.1:6736/v1/limits)
 * 仅由主进程访问 loopback 地址，超时静默失败，过期数据安全降级
 */
export async function fetchOpenUsageSnapshot({ baseUrl = 'http://127.0.0.1:6736', timeoutMs = 400 } = {}) {
  return new Promise((resolve) => {
    let resolved = false
    const done = (val) => {
      if (!resolved) {
        resolved = true
        resolve(val)
      }
    }

    try {
      const url = new URL('/v1/limits', baseUrl)
      const req = http.get(url, { timeout: timeoutMs }, (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          return done(null)
        }
        let raw = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          raw += chunk
          if (raw.length > 256 * 1024) {
            req.destroy()
            done(null)
          }
        })
        res.on('end', () => {
          try {
            const data = JSON.parse(raw)
            done(data)
          } catch {
            done(null)
          }
        })
      })

      req.on('timeout', () => {
        req.destroy()
        done(null)
      })

      req.on('error', () => {
        done(null)
      })
    } catch {
      done(null)
    }
  })
}

function quotaCycleDefaults(portfolio) {
  const cycles = portfolio?.quota_cycles ?? {}
  return {
    reset_within_ms: cycles.reset_within_ms ?? 72 * 3600 * 1000,
    min_remaining_ratio_for_bonus: cycles.min_remaining_ratio_for_bonus ?? 0.4,
    scarce_remaining_ratio: cycles.scarce_remaining_ratio ?? 0.12,
    bonus_points: cycles.bonus_points ?? 15,
    scarce_penalty_points: cycles.scarce_penalty_points ?? 20,
    max_snapshot_age_ms: cycles.max_snapshot_age_ms ?? 3600000,
  }
}

function getResetsAtMs(resourceData) {
  const raw = resourceData?.resetsAt ?? resourceData?.resetAt
  if (!raw) return null
  const t = Date.parse(raw)
  return Number.isNaN(t) ? null : t
}

export function isQuotaResourceFresh(resourceData, defaults, now = Date.now()) {
  if (!resourceData || resourceData.stale) return false
  if (resourceData.expiresAt) {
    const exp = Date.parse(resourceData.expiresAt)
    if (!Number.isNaN(exp) && exp < now) return false
  }
  if (defaults.max_snapshot_age_ms && resourceData.fetchedAt) {
    const fetched = Date.parse(resourceData.fetchedAt)
    if (!Number.isNaN(fetched) && now - fetched > defaults.max_snapshot_age_ms) return false
  }
  return true
}

export function modelMatchesQuotaPolicy(modelKey, policy) {
  if (!modelKey || !policy) return false
  const patterns = policy.match_model_keys
  if (Array.isArray(patterns) && patterns.length > 0) {
    return patterns.some((pat) => matchPattern(pat, modelKey))
  }
  const providerId = policy.provider_id
  if (!providerId) return false
  if (modelKey.includes(providerId)) return true
  const prefixAliases = {
    codex: ['openai-codex/', 'opencodex/'],
    cursor: ['cursor/', 'opencodex/cursor/'],
  }
  const prefixes = prefixAliases[providerId] ?? [`${providerId}/`]
  return prefixes.some((prefix) => modelKey.startsWith(prefix))
}

/**
 * 配额周期软调整：刷新前利用加分 + 即将耗尽降权。
 * 仅新鲜快照；可结转 (rollover===true) 不参与刷新前加分；rollover 未知时不做刷新前加分。
 */
export function calculateQuotaAdjustment(modelKey, portfolio, quotaSnapshot, now = Date.now()) {
  if (!portfolio?.quota_cycles?.enabled || !quotaSnapshot) {
    return { bonus: 0, penalty: 0, reason: null, reasons: [] }
  }

  const defaults = quotaCycleDefaults(portfolio)
  const policies = portfolio.quota_cycles.policies || []
  let bonus = 0
  let penalty = 0
  const reasons = []

  for (const policy of policies) {
    if (!modelMatchesQuotaPolicy(modelKey, policy)) continue

    const providerData = quotaSnapshot.providers?.[policy.provider_id]
    const resourceData = providerData?.resources?.[policy.resource_id]
    if (!isQuotaResourceFresh(resourceData, defaults, now)) continue

    const remaining = Number(resourceData.remaining)
    const limit = Number(resourceData.limit ?? resourceData.max)
    if (Number.isNaN(remaining) || Number.isNaN(limit) || limit <= 0) continue

    const remainingRatio = remaining / limit
    const scarceThreshold = policy.scarce_remaining_ratio ?? defaults.scarce_remaining_ratio
    if (remainingRatio <= scarceThreshold) {
      const p = policy.scarce_penalty_points ?? defaults.scarce_penalty_points
      if (p > penalty) {
        penalty = p
        reasons.push(
          `${policy.provider_id} 配额即将耗尽 (${Math.round(remainingRatio * 100)}%)，降低路由权重`,
        )
      }
    }

    if (!policy.use_before_reset) continue
    if (policy.rollover === true) continue
    if (policy.rollover !== false && policy.rollover !== 'false') continue

    const resetsAtMs = getResetsAtMs(resourceData)
    if (!resetsAtMs) continue

    const msToReset = resetsAtMs - now
    const resetWithin = policy.reset_within_ms ?? defaults.reset_within_ms
    if (msToReset <= 0 || msToReset > resetWithin) continue

    const minRatio = policy.min_remaining_ratio_for_bonus ?? defaults.min_remaining_ratio_for_bonus
    if (remainingRatio < minRatio) continue

    const urgency = 1 - msToReset / resetWithin
    const maxPoints = policy.bonus_points ?? defaults.bonus_points
    const candidateBonus = Math.round(maxPoints * urgency * Math.min(1, remainingRatio / minRatio))
    if (candidateBonus > bonus) {
      bonus = candidateBonus
      const hours = Math.max(1, Math.round(msToReset / 3600000))
      reasons.push(
        `${policy.provider_id} 配额约 ${hours}h 内刷新且剩余 ${Math.round(remainingRatio * 100)}%（不可结转），刷新前利用 +${candidateBonus}`,
      )
    }
  }

  return {
    bonus,
    penalty,
    reason: reasons.length ? reasons.join('；') : null,
    reasons,
  }
}

/** @deprecated 使用 calculateQuotaAdjustment；保留兼容导出 */
export function calculateQuotaBonus(modelKey, portfolio, quotaSnapshot, now = Date.now()) {
  const adj = calculateQuotaAdjustment(modelKey, portfolio, quotaSnapshot, now)
  return { bonus: adj.bonus, reason: adj.reason }
}

/**
 * 加载作品集并（若启用）拉取 OpenUsage 配额快照，供 selectModelForTask 使用。
 */
export async function buildRoutingOptions({ userDataPath, portfolio } = {}) {
  const loaded = portfolio || loadRoutingPortfolio({ userDataPath })
  let quotaSnapshot = null
  if (loaded?.quota_cycles?.enabled) {
    const baseUrl = loaded.quota_cycles.base_url || 'http://127.0.0.1:6736'
    quotaSnapshot = await fetchOpenUsageSnapshot({ baseUrl, timeoutMs: 500 })
  }
  return {
    portfolio: loaded,
    quotaSnapshot,
    userDataPath,
  }
}
