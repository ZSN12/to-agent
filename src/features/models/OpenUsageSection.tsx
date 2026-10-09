import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { DEFAULT_OPENUSAGE_URL, describeResource } from './openusage-limits-summary'
import { useOpenUsageLimits } from './useOpenUsageLimits'
import { OpenUsageQuotaStrip } from './OpenUsageQuotaStrip'

export function OpenUsageSection() {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const limits = useOpenUsageLimits({ autoFetch: true })
  const providers = limits.snapshot?.providers ? Object.entries(limits.snapshot.providers) : []

  return (
    <div className="openusage-section">
      <OpenUsageQuotaStrip
        snapshot={limits.snapshot}
        loading={limits.loading}
        connected={limits.connected}
        hint={limits.hint}
        lastFetchedAt={limits.lastFetchedAt}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((open) => !open)}
        onRefresh={() => void limits.refresh(true)}
      />

      {detailsOpen && (
        <div className="openusage-panel settings-subsection">
          <label className="portfolio-form-field">
            <span>OpenUsage API 地址</span>
            <input
              className="settings-text-input"
              type="url"
              value={limits.baseUrlDraft}
              placeholder={DEFAULT_OPENUSAGE_URL}
              onChange={(event) => {
                limits.setBaseUrlDraft(event.target.value)
              }}
              onBlur={() => { void limits.commitBaseUrl() }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void limits.commitBaseUrl()
                }
              }}
            />
            <small className="settings-hint">保存在 taskweaver-preferences.json；仅本机 HTTP。</small>
            {limits.baseUrlError ? (
              <small className="settings-callout warn" role="alert">{limits.baseUrlError}</small>
            ) : null}
            {limits.activeBaseUrl ? (
              <small className="settings-hint">当前请求：{limits.activeBaseUrl}/v1/limits</small>
            ) : null}
          </label>

          {limits.hint && !providers.length ? (
            <p className="settings-callout warn" role="status">
              <AlertCircle size={14} />
              {limits.hint}
            </p>
          ) : null}

          {providers.length > 0 && (
            <ul className="openusage-compact-list">
              {providers.map(([providerKey, provider]) => {
                const title = provider.displayName || providerKey
                const lines = provider.resources
                  ? Object.entries(provider.resources).map(([key, res]) => describeResource(key, res))
                  : []
                return (
                  <li key={providerKey}>
                    <strong>{title}</strong>
                    {provider.plan ? ` · ${provider.plan}` : ''}
                    {provider.stale ? ' · 缓存' : ''}
                    <span className="openusage-compact-metrics">{lines.join(' · ') || '无指标'}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
