import { useState } from 'react'
import { ChevronDown, RefreshCw, Settings2 } from 'lucide-react'
import {
  formatFetchedAt,
  formatQuotaAmount,
  formatResetTime,
  openUsageSnapshotFetchedAt,
  summarizeOpenUsageLimits,
} from './openusage-limits-summary'
import type { OpenUsageResourceData, OpenUsageLimitsSnapshot } from '../../shared/app-api'

const RESOURCE_LABELS: Record<string, string> = {
  apiUsage: 'API 调用额度',
  autoUsage: 'Fast / Auto 额度',
  creditValue: 'creditValue',
  credits: 'credits',
  geminiSession: 'Gemini 会话窗口 (Session)',
  geminiWeekly: 'Gemini 每周额度 (Weekly)',
  grokBot: 'Grok 额度',
  nonGeminiSession: '其他模型会话额度',
  nonGeminiWeekly: '其他模型每周额度',
  rateLimitResets: 'rateLimitResets',
  session: '本轮会话额度 (Session)',
  totalUsage: '月度总额度 (Total)',
  weekly: '每周额度 (Weekly)',
}

function resourceLabel(id: string): string {
  return RESOURCE_LABELS[id]
    ?? id.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
}

function quotaTone(remainingPercent: number): string {
  if (remainingPercent <= 15) return 'openusage-quota-resource--danger'
  if (remainingPercent <= 40) return 'openusage-quota-resource--warn'
  return 'openusage-quota-resource--ok'
}

function resourceValue(resource: OpenUsageResourceData): string {
  const raw = resource.available ?? resource.remaining
  if (raw == null || (typeof raw === 'number' && !Number.isFinite(raw))) return '—'
  const amount = typeof raw === 'number' ? formatQuotaAmount(raw) : String(raw)
  return resource.unit ? `${amount} ${resource.unit}` : amount
}

function QuotaResource({
  id,
  resource,
  ratio,
}: {
  id: string
  resource: OpenUsageResourceData
  ratio: number | null
}) {
  const label = resourceLabel(id)
  const resetHint = formatResetTime(resource.resetsAt ?? resource.resetAt)

  if (ratio === null) {
    return (
      <li className="openusage-quota-resource openusage-quota-resource--scalar">
        <span className="openusage-quota-resource-name">{label}</span>
        <div className="openusage-quota-resource-scalar-value">
          <strong>{resourceValue(resource)}</strong>
          {resetHint ? <span>{resetHint}</span> : null}
        </div>
      </li>
    )
  }

  const remainingPercent = Math.round(ratio * 100)
  const consumedPercent = 100 - remainingPercent
  const limit = resource.limit ?? resource.max
  const amountDescription = limit == null
    ? ''
    : `，剩余 ${formatQuotaAmount(resource.remaining)}/${formatQuotaAmount(limit)}${resource.unit ? ` ${resource.unit}` : ''}`

  return (
    <li className={`openusage-quota-resource ${quotaTone(remainingPercent)}`}>
      <div className="openusage-quota-resource-head">
        <span className="openusage-quota-resource-name">{label}</span>
        <strong className="openusage-quota-remaining">剩余 {remainingPercent}%</strong>
      </div>
      <div
        className="openusage-quota-progress"
        role="progressbar"
        aria-label={`${label}，剩余 ${remainingPercent}%${amountDescription}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={remainingPercent}
      >
        <span style={{ width: `${remainingPercent}%` }} />
      </div>
      <div className="openusage-quota-resource-foot">
        <span>{resetHint || '重置时间未知'}</span>
        <span>已消耗 {consumedPercent}%</span>
      </div>
    </li>
  )
}

export function OpenUsageQuotaStrip({
  snapshot,
  loading,
  connected,
  hint,
  lastFetchedAt,
  collapsed,
  settingsOpen,
  onToggleCollapsed,
  onToggleSettings,
  onRefresh,
}: {
  snapshot: OpenUsageLimitsSnapshot | null
  loading: boolean
  connected: boolean
  hint: string | null
  lastFetchedAt: number | null
  collapsed: boolean
  settingsOpen: boolean
  onToggleCollapsed: () => void
  onToggleSettings: () => void
  onRefresh: () => void
}) {
  const summaries = summarizeOpenUsageLimits(snapshot)
  const [collapsedProviders, setCollapsedProviders] = useState<Record<string, boolean>>({})
  const dataFetchedAt = openUsageSnapshotFetchedAt(snapshot) ?? lastFetchedAt
  const hasStaleProviders = summaries.some((provider) => provider.stale)
  const statusLabel = connected
    ? `活跃 · ${summaries.length} 个服务通道${dataFetchedAt ? ` · 额度数据 ${formatFetchedAt(dataFetchedAt)}` : ''}${hasStaleProviders ? ' · 含缓存' : ''}`
    : '未连接 OpenUsage'

  return (
    <section className={`openusage-quota-strip${collapsed ? ' is-collapsed' : ''}`} aria-label="OpenUsage 订阅额度">
      <div className="openusage-quota-strip-head">
        <button
          type="button"
          className="openusage-quota-strip-title"
          aria-label={`${collapsed ? '展开' : '收起'} OpenUsage 配额监控`}
          aria-expanded={!collapsed}
          aria-controls="openusage-quota-content"
          onClick={onToggleCollapsed}
        >
          <ChevronDown size={14} className={collapsed ? 'is-closed' : ''} aria-hidden="true" />
          <span className={`openusage-quota-dot ${connected ? 'on' : 'off'}`} aria-hidden="true" />
          <strong>OpenUsage 配额监控</strong>
          <span className="openusage-quota-meta">{statusLabel}</span>
        </button>
        <div className="openusage-quota-strip-actions">
          <button
            type="button"
            className="settings-secondary-button openusage-quota-btn"
            onClick={onRefresh}
            disabled={loading}
            title="重新拉取 OpenUsage 额度"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? '刷新中…' : '刷新余额'}
          </button>
          <button
            type="button"
            className="settings-secondary-button openusage-quota-btn openusage-quota-settings-btn"
            onClick={onToggleSettings}
            aria-expanded={settingsOpen}
          >
            <Settings2 size={14} />
            <span>API 设置</span>
            <ChevronDown size={13} className={settingsOpen ? 'is-open' : ''} />
          </button>
        </div>
      </div>

      <div id="openusage-quota-content" className="openusage-quota-strip-body" hidden={collapsed}>
        {!connected && hint ? (
          <p className="openusage-quota-hint" role="status">{hint}</p>
        ) : null}

        {summaries.length > 0 ? (
          <div className="openusage-quota-cards">
            {summaries.map((provider) => {
              const providerCollapsed = Boolean(collapsedProviders[provider.key])
              return (
                <article className="openusage-quota-card" key={provider.key}>
                  <button
                    type="button"
                    className="openusage-quota-card-toggle"
                    aria-expanded={!providerCollapsed}
                    onClick={() => setCollapsedProviders((current) => ({
                      ...current,
                      [provider.key]: !current[provider.key],
                    }))}
                  >
                    <ChevronDown size={13} className={providerCollapsed ? 'is-closed' : ''} aria-hidden="true" />
                    <span className="openusage-quota-card-title">{provider.title}</span>
                    {provider.plan ? <span className="openusage-quota-card-plan">{provider.plan}</span> : null}
                    {provider.stale ? <span className="openusage-quota-card-stale">缓存</span> : null}
                    <span className="openusage-quota-card-count">{provider.resources.length} 项配额指标</span>
                  </button>

                  {!providerCollapsed ? (
                    provider.resources.length > 0 ? (
                      <ul className="openusage-quota-resource-list">
                        {provider.resources.map(({ id, resource, ratio }) => (
                          <QuotaResource key={id} id={id} resource={resource} ratio={ratio} />
                        ))}
                      </ul>
                    ) : (
                      <p className="openusage-quota-empty">该服务商暂未返回额度指标。</p>
                    )
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : connected ? (
          <p className="openusage-quota-hint">已连接 OpenUsage，但当前快照中没有服务商额度。</p>
        ) : null}
      </div>
    </section>
  )
}
