import { useEffect, useState } from 'react'
import { DEFAULT_OPENUSAGE_URL } from './openusage-limits-summary'
import { useOpenUsageLimits } from './useOpenUsageLimits'
import { OpenUsageQuotaStrip } from './OpenUsageQuotaStrip'

const COLLAPSED_STORAGE_KEY = 'taskweaver.openusage.collapsed'

function readCollapsedPreference(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function OpenUsageSection() {
  const [collapsed, setCollapsed] = useState(readCollapsedPreference)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const limits = useOpenUsageLimits({ autoFetch: true })

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      // Keep the disclosure usable when browser storage is unavailable.
    }
  }, [collapsed])

  const toggleCollapsed = () => {
    const nextCollapsed = !collapsed
    setCollapsed(nextCollapsed)
    if (nextCollapsed) setSettingsOpen(false)
  }

  return (
    <div className="openusage-section">
      <OpenUsageQuotaStrip
        snapshot={limits.snapshot}
        loading={limits.loading}
        connected={limits.connected}
        hint={limits.hint}
        lastFetchedAt={limits.lastFetchedAt}
        collapsed={collapsed}
        settingsOpen={settingsOpen}
        onToggleCollapsed={toggleCollapsed}
        onToggleSettings={() => {
          if (collapsed) setCollapsed(false)
          setSettingsOpen((open) => !open)
        }}
        onRefresh={() => void limits.refresh(true)}
      />

      {!collapsed && settingsOpen && (
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
        </div>
      )}
    </div>
  )
}
