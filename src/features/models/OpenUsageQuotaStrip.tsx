import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { formatFetchedAt, summarizeOpenUsageLimits } from './openusage-limits-summary'
import type { OpenUsageLimitsSnapshot } from '../../shared/app-api'

function chipClass(worstRatio: number | null): string {
  if (worstRatio === null) return 'openusage-quota-chip'
  if (worstRatio <= 0.15) return 'openusage-quota-chip openusage-quota-chip--danger'
  if (worstRatio <= 0.4) return 'openusage-quota-chip openusage-quota-chip--warn'
  return 'openusage-quota-chip openusage-quota-chip--ok'
}

export function OpenUsageQuotaStrip({
  snapshot,
  loading,
  connected,
  hint,
  lastFetchedAt,
  detailsOpen,
  onToggleDetails,
  onRefresh,
}: {
  snapshot: OpenUsageLimitsSnapshot | null
  loading: boolean
  connected: boolean
  hint: string | null
  lastFetchedAt: number | null
  detailsOpen: boolean
  onToggleDetails: () => void
  onRefresh: () => void
}) {
  const summaries = summarizeOpenUsageLimits(snapshot)
  const statusLabel = connected
    ? `${summaries.length} 个渠道${lastFetchedAt ? ` · ${formatFetchedAt(lastFetchedAt)}` : ''}`
    : '未连接 OpenUsage'

  return (
    <div className="openusage-quota-strip" role="region" aria-label="订阅额度摘要">
      <div className="openusage-quota-strip-head">
        <div className="openusage-quota-strip-title">
          <span className={`openusage-quota-dot ${connected ? 'on' : 'off'}`} aria-hidden />
          <strong>订阅额度</strong>
          <span className="openusage-quota-meta">{statusLabel}</span>
        </div>
        <div className="openusage-quota-strip-actions">
          <button
            type="button"
            className="settings-secondary-button openusage-quota-btn"
            onClick={() => onRefresh()}
            disabled={loading}
            title="重新拉取 OpenUsage /v1/limits"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            className="settings-secondary-button openusage-quota-btn"
            onClick={onToggleDetails}
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {detailsOpen ? '收起明细' : '地址与明细'}
          </button>
        </div>
      </div>

      {!connected && hint ? (
        <p className="openusage-quota-hint">{hint}</p>
      ) : null}

      {summaries.length > 0 ? (
        <div className="openusage-quota-chips">
          {summaries.map((item) => (
            <div
              key={item.key}
              className={chipClass(item.worstRatio)}
              title={item.resources.map((r) => r.line).join('\n')}
            >
              <span className="openusage-quota-chip-name">{item.title}</span>
              <span className="openusage-quota-chip-value">{item.headline}</span>
              {item.stale ? <span className="openusage-quota-chip-tag">缓存</span> : null}
            </div>
          ))}
        </div>
      ) : connected ? (
        <p className="openusage-quota-hint">已连接，但快照中没有渠道指标。</p>
      ) : null}
    </div>
  )
}
