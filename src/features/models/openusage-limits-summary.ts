import type { OpenUsageLimitsSnapshot, OpenUsageResourceData } from '../../shared/app-api'

export const DEFAULT_OPENUSAGE_URL = 'http://127.0.0.1:6736'

const PROVIDER_LABELS: Record<string, string> = {
  antigravity: 'Antigravity',
  codex: 'Codex',
  cursor: 'Cursor',
  claude: 'Claude',
  openrouter: 'OpenRouter',
}

const PROVIDER_RESOURCE_ORDER: Record<string, string[]> = {
  antigravity: ['geminiSession', 'geminiWeekly', 'nonGeminiSession', 'nonGeminiWeekly'],
  codex: ['creditValue', 'credits', 'rateLimitResets', 'session', 'weekly'],
  cursor: ['apiUsage', 'autoUsage', 'grokBot', 'totalUsage'],
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

export type OpenUsageProviderSummary = {
  key: string
  title: string
  plan?: string
  stale?: boolean
  resources: { id: string; resource: OpenUsageResourceData; ratio: number | null }[]
}

export function summarizeOpenUsageLimits(snapshot: OpenUsageLimitsSnapshot | null): OpenUsageProviderSummary[] {
  if (!snapshot?.providers) return []
  return Object.entries(snapshot.providers).map(([key, provider]) => {
    const title = provider.displayName || PROVIDER_LABELS[key] || key
    const resources = Object.entries(provider.resources ?? {}).map(([id, res]) => ({
      id,
      resource: res,
      ratio: consumptionRemainingRatio(res),
    }))
    const providerOrder = PROVIDER_RESOURCE_ORDER[key]
    resources.sort((a, b) => {
      if (providerOrder) {
        const aIndex = providerOrder.indexOf(a.id)
        const bIndex = providerOrder.indexOf(b.id)
        if (aIndex !== -1 || bIndex !== -1) {
          if (aIndex === -1) return 1
          if (bIndex === -1) return -1
          return aIndex - bIndex
        }
      }
      return (RESOURCE_PRIORITY[b.id] ?? 0) - (RESOURCE_PRIORITY[a.id] ?? 0)
    })
    return {
      key,
      title,
      plan: provider.plan,
      stale: provider.stale,
      resources: resources.map(({ id, resource, ratio }) => ({ id, resource, ratio })),
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
  if (diffSec < 60) return `${diffSec} 秒前更新`
  if (diffSec < 3600) return `${Math.max(1, Math.round(diffSec / 60))} 分钟前更新`
  return new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) + ' 更新'
}

/** Prefer the provider's collection timestamp over the time TaskWeaver read its cached API response. */
export function openUsageSnapshotFetchedAt(snapshot: OpenUsageLimitsSnapshot | null): number | null {
  const fetchedAt = Object.values(snapshot?.providers ?? {})
    .map((provider) => Date.parse(provider.fetchedAt ?? ''))
    .filter(Number.isFinite)
  return fetchedAt.length > 0 ? Math.min(...fetchedAt) : null
}
