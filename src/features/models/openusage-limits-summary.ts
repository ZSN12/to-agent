import type { OpenUsageLimitsSnapshot, OpenUsageResourceData } from '../../shared/app-api'

export const DEFAULT_OPENUSAGE_URL = 'http://127.0.0.1:6736'

const PROVIDER_LABELS: Record<string, string> = {
  antigravity: 'Google Antigravity',
  codex: 'OpenAI Codex',
  cursor: 'Cursor',
  claude: 'Anthropic Claude',
  openrouter: 'OpenRouter',
}

const RESOURCE_PRIORITY: Record<string, number> = {
  weekly: 10,
  totalUsage: 9,
  session: 8,
  geminiWeekly: 7,
  geminiSession: 6,
  apiUsage: 5,
  autoUsage: 4,
  credits: 3,
  creditValue: 2,
}

export function formatQuotaAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 10) / 10
  if (Math.abs(rounded - Math.round(rounded)) < 0.05) return String(Math.round(rounded))
  return rounded.toFixed(1)
}

export function formatResetTime(isoString?: string): string {
  if (!isoString) return ''
  const t = Date.parse(isoString)
  if (Number.isNaN(t)) return ''
  const diffMinutes = Math.round((t - Date.now()) / 60000)
  if (diffMinutes < 0) return '已刷新'
  if (diffMinutes < 60) return `${diffMinutes} 分钟后刷新`
  const hours = Math.floor(diffMinutes / 60)
  const mins = diffMinutes % 60
  if (hours < 24) return `${hours} 小时 ${mins} 分后刷新`
  const days = Math.floor(hours / 24)
  return `${days} 天后刷新`
}

export function consumptionRemainingRatio(resource: OpenUsageResourceData): number | null {
  if (resource.kind === 'balance') return null
  const limit = resource.limit ?? resource.max
  const remaining = resource.remaining
  if (
    limit == null
    || remaining == null
    || !Number.isFinite(limit)
    || !Number.isFinite(remaining)
    || limit <= 0
  ) return null
  return Math.max(0, Math.min(1, remaining / limit))
}

export function describeResource(resourceId: string, resource: OpenUsageResourceData): string {
  const resetHint = formatResetTime(resource.resetsAt ?? resource.resetAt)
  if (resource.kind === 'balance') {
    const raw = resource.available ?? resource.remaining
    const amount = typeof raw === 'number' ? formatQuotaAmount(raw) : raw
    const unit = resource.unit ? ` ${resource.unit}` : ''
    const base = `余额 ${amount ?? '—'}${unit}`
    return resetHint ? `${resourceId}: ${base}（${resetHint}）` : `${resourceId}: ${base}`
  }
  const ratio = consumptionRemainingRatio(resource)
  if (ratio !== null) {
    const limit = resource.limit ?? resource.max
    const remaining = resource.remaining
    const pct = Math.round(ratio * 100)
    const base = `${resourceId}: 剩余 ${formatQuotaAmount(remaining)}/${formatQuotaAmount(limit)}（${pct}%）`
    return resetHint ? `${base}，${resetHint}` : base
  }
  if (resetHint) return `${resourceId}: ${resetHint}`
  return `${resourceId}: —`
}

export type OpenUsageProviderSummary = {
  key: string
  title: string
  plan?: string
  stale?: boolean
  headline: string
  worstRatio: number | null
  resources: { id: string; line: string; ratio: number | null }[]
}

function pickHeadlineResource(
  entries: { id: string; line: string; ratio: number | null; priority: number }[],
): { headline: string; worstRatio: number | null } {
  if (entries.length === 0) return { headline: '无余额/配额指标', worstRatio: null }

  const consumption = entries.filter((e) => e.ratio !== null)
  if (consumption.length > 0) {
    const worst = consumption.reduce((a, b) => (a.ratio! <= b.ratio! ? a : b))
    const short = worst.line.replace(/^[^:]+:\s*/, '')
    return { headline: short, worstRatio: worst.ratio }
  }

  const balance = entries[0]
  return { headline: balance.line.replace(/^[^:]+:\s*/, ''), worstRatio: null }
}

export function summarizeOpenUsageLimits(snapshot: OpenUsageLimitsSnapshot | null): OpenUsageProviderSummary[] {
  if (!snapshot?.providers) return []
  return Object.entries(snapshot.providers).map(([key, provider]) => {
    const title = provider.displayName || PROVIDER_LABELS[key] || key
    const resources = Object.entries(provider.resources ?? {}).map(([id, res]) => ({
      id,
      line: describeResource(id, res),
      ratio: consumptionRemainingRatio(res),
      priority: RESOURCE_PRIORITY[id] ?? 0,
    }))
    resources.sort((a, b) => b.priority - a.priority)
    const { headline, worstRatio } = pickHeadlineResource(resources)
    return {
      key,
      title,
      plan: provider.plan,
      stale: provider.stale,
      headline,
      worstRatio,
      resources,
    }
  })
}

export function isLikelyLoopbackHttpUrl(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`)
    return url.protocol === 'http:'
      && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && !url.username
      && !url.password
  } catch {
    return false
  }
}

export function formatFetchedAt(ms: number | null): string {
  if (!ms) return ''
  const diffSec = Math.round((Date.now() - ms) / 1000)
  if (diffSec < 10) return '刚刚更新'
  if (diffSec < 3600) return `${Math.round(diffSec / 60)} 分钟前更新`
  return new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) + ' 更新'
}
