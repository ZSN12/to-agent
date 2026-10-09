import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

/** 将整数缩写为中文习惯 (3.7亿 / 4164.4万) */
function fc(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1e8) return trim(n / 1e8) + '亿'
  if (n >= 1e4) return trim(n / 1e4) + '万'
  return String(Math.round(n))
}

function trim(x: number): string {
  return (Math.round(x * 10) / 10).toString()
}

function fmtDT(ms: number | null): string {
  if (ms == null) return '—'
  const d = new Date(ms)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fdur(ms: number | null | undefined): string {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return s + ' 秒'
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return m + '分' + (r ? String(r).padStart(2, '0') + '秒' : '')
  const h = Math.floor(m / 60)
  return h + '小时' + (m % 60 ? (m % 60) + '分' : '')
}

function lvl(v: number, max: number): number {
  if (v <= 0) return 0
  const r = v / (max || 1)
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1
}

interface DshModelRow {
  provider: string
  model: string
  displayName?: string
  providerDisplayName?: string
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  firstAt: number
  lastAt: number
  peakTokens: number
  maxDur: number
  totalTokens: number
}

interface DshUsageReport {
  allModels: DshModelRow[]
  rows: DshModelRow[]
  totals: {
    calls: number
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    reasoningTokens: number
  }
  daily: Record<string, { tokens: number; calls: number }>
  overview: {
    totalTokens: number
    peakTokens: number
    maxDur: number
    currentStreak: number
    maxStreak: number
  }
  summary: {
    totalTokens: number
    peakTokens: number
    maxDur: number
    currentStreak: number
    maxStreak: number
    requests: number
    costUsd: number
    cacheHitRate: number
    cacheReadTokens: number
    reasoningTokens: number
  }
  debug?: { version: string }
}

function mergeRows(rows: DshModelRow[]): DshModelRow[] {
  const map = new Map<string, DshModelRow>()
  const order: string[] = []
  for (const r of rows) {
    const base = r.provider.split('-')[0] || r.provider
    let model = r.model
    if (base && model.startsWith(base + '/')) model = model.slice(base.length + 1)
    if (model.startsWith('google-antigravity/')) model = model.slice('google-antigravity/'.length)
    if (model.startsWith('workbuddy/')) model = model.slice('workbuddy/'.length)
    if (model.startsWith('cursor/')) model = model.slice('cursor/'.length)
    const key = r.provider + '\u0000' + model
    const existing = map.get(key)
    if (!existing) {
      order.push(key)
      map.set(key, { ...r, model })
    } else {
      existing.calls += r.calls
      existing.inputTokens += r.inputTokens
      existing.outputTokens += r.outputTokens
      existing.cacheReadTokens += r.cacheReadTokens
      existing.cacheWriteTokens += r.cacheWriteTokens
      existing.reasoningTokens += r.reasoningTokens
      existing.totalTokens += r.totalTokens
      existing.firstAt = Math.min(existing.firstAt, r.firstAt)
      existing.lastAt = Math.max(existing.lastAt, r.lastAt)
      existing.peakTokens = Math.max(existing.peakTokens, r.peakTokens)
      existing.maxDur = Math.max(existing.maxDur, r.maxDur)
      if (r.displayName) existing.displayName = r.displayName
      if (r.providerDisplayName) existing.providerDisplayName = r.providerDisplayName
    }
  }
  return order.map((k) => map.get(k)!)
}

interface DshTimeRange {
  start: number | null
  end: number | null
  label: string
  days: number
}

const DSH_DAY = 86_400_000

const DSH_PRESETS: { key: string; label: string; make: (now: number) => DshTimeRange }[] = [
  { key: 'all', label: '全部', make: () => ({ start: null, end: null, label: '全部', days: 365 }) },
  {
    key: 'today',
    label: '当天',
    make: (now) => {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return { start: d.getTime(), end: null, label: '当天', days: 7 }
    },
  },
  { key: '1d', label: '1d', make: (now) => ({ start: now - DSH_DAY, end: null, label: '近 1 天', days: 7 }) },
  { key: '7d', label: '7d', make: (now) => ({ start: now - 7 * DSH_DAY, end: null, label: '近 7 天', days: 7 }) },
  { key: '14d', label: '14d', make: (now) => ({ start: now - 14 * DSH_DAY, end: null, label: '近 14 天', days: 14 }) },
  { key: '30d', label: '30d', make: (now) => ({ start: now - 30 * DSH_DAY, end: null, label: '近 30 天', days: 30 }) },
  { key: '6m', label: '6 个月', make: (now) => ({ start: now - 182 * DSH_DAY, end: null, label: '近 6 个月', days: 182 }) },
]

function sameRange(a: DshTimeRange, b: DshTimeRange): boolean {
  return a.start === b.start && a.end === b.end
}

function customRange(startMs: number, endMs: number | null): DshTimeRange {
  const days = Math.max(7, Math.round(((endMs ?? Date.now()) - startMs) / DSH_DAY))
  return { start: startMs, end: endMs, label: '自定义', days }
}

function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function fromLocalInput(s: string): number | null {
  if (!s) return null
  const t = new Date(s).getTime()
  return Number.isFinite(t) ? t : null
}

function DshModelSelect(props: {
  value: string
  rows: ReadonlyArray<DshModelRow>
  onChange: (v: string) => void
}) {
  const { value, rows, onChange } = props
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectedRow = rows.find((r) => r.provider + '/' + r.model === value)
  const label =
    value === ''
      ? '全部模型'
      : selectedRow
      ? `${selectedRow.displayName || selectedRow.model}`
      : value.replace('/', ' · ')

  return (
    <div className="dsh-dropdown" ref={rootRef}>
      <button
        type="button"
        className={`dsh-drop-btn ${open ? 'open' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span>{label}</span>
        <span className="dsh-drop-chevron">▾</span>
      </button>
      {open && (
        <div className="dsh-drop-menu">
          <button
            type="button"
            className={`dsh-drop-item ${value === '' ? 'picked' : ''}`}
            onClick={() => { onChange(''); setOpen(false) }}
          >
            <span className="dsh-drop-text">全部模型</span>
            {value === '' && <span className="dsh-drop-check">✓</span>}
          </button>
          {rows.map((r) => {
            const v = r.provider + '/' + r.model
            return (
              <button
                type="button"
                key={v}
                className={`dsh-drop-item ${value === v ? 'picked' : ''}`}
                onClick={() => { onChange(v); setOpen(false) }}
              >
                <span className="dsh-drop-text">{r.displayName || r.model}</span>
                {value === v && <span className="dsh-drop-check">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DshTimeRangePicker(props: {
  value: DshTimeRange
  onChange: (r: DshTimeRange) => void
}) {
  const { value, onChange } = props
  const [open, setOpen] = useState(false)
  const [customStart, setCustomStart] = useState(() => toLocalInput(value.start ?? Date.now() - DSH_DAY))
  const [customEnd, setCustomEnd] = useState(() => toLocalInput(value.end ?? Date.now()))
  const [followNow, setFollowNow] = useState(value.end == null && value.start != null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const applyPreset = (p: (typeof DSH_PRESETS)[number]): void => {
    onChange(p.make(Date.now()))
    setOpen(false)
  }
  const applyCustom = (): void => {
    const start = fromLocalInput(customStart)
    if (start == null) return
    const end = followNow ? null : fromLocalInput(customEnd)
    onChange(customRange(start, end))
    setOpen(false)
  }

  return (
    <div className="dsh-dropdown" ref={rootRef}>
      <button
        type="button"
        title="选择时间范围，仅作用于用量明细 (展示该时间段内使用的模型与用量)"
        className={`dsh-drop-btn ${open ? 'open' : ''}`}
        onClick={() => {
          setCustomStart(toLocalInput(value.start ?? Date.now() - DSH_DAY))
          setCustomEnd(toLocalInput(value.end ?? Date.now()))
          setFollowNow(value.end == null && value.start != null)
          setOpen(!open)
        }}
      >
        {value.label}
        <span className="dsh-drop-chevron">▾</span>
      </button>
      {open && (
        <div className="dsh-range-menu">
          <div className="dsh-range-presets">
            {DSH_PRESETS.map((p) => {
              const r = p.make(Date.now())
              const picked = sameRange(value, r)
              return (
                <button
                  type="button"
                  key={p.key}
                  className={`dsh-chip ${picked ? 'dsh-chip-on' : ''}`}
                  onClick={() => applyPreset(p)}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
          <div className="dsh-range-divider" />
          <div className="dsh-range-custom">
            <div className="dsh-range-hint">支持日期与时间</div>
            <label className="dsh-range-field">
              <span>开始时间</span>
              <input
                className="dsh-sel"
                type="datetime-local"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </label>
            <label className="dsh-range-field">
              <span>结束时间</span>
              <input
                className="dsh-sel"
                type="datetime-local"
                value={customEnd}
                disabled={followNow}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </label>
            <label className="dsh-range-check">
              <input
                type="checkbox"
                checked={followNow}
                onChange={(e) => setFollowNow(e.target.checked)}
              />
              结束时间跟随当前时刻
            </label>
            <div className="dsh-range-actions">
              <button type="button" className="dsh-btn" onClick={() => setOpen(false)}>取消</button>
              <button type="button" className="dsh-btn-primary" onClick={applyCustom}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DshStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="dsh-stat">
      <div className="dsh-stat-val">{value}</div>
      <div className="dsh-stat-label">{label}</div>
    </div>
  )
}

function DshKpi({ l, v, d }: { l: string; v: string; d: string }) {
  return (
    <div className="dsh-kpi">
      <div className="dsh-kpi-l">{l}</div>
      <div className="dsh-kpi-v">{v}</div>
      <div className="dsh-kpi-d">{d}</div>
    </div>
  )
}

export function UsageSettings() {
  const [report, setReport] = useState<DshUsageReport | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pricingStatus, setPricingStatus] = useState<{
    synced_at?: string | null
    stale?: boolean
    model_count?: number
    last_run?: { at?: string; ok?: boolean; error?: string } | null
  } | null>(null)
  const [pricingBusy, setPricingBusy] = useState(false)
  const [pricingError, setPricingError] = useState<string | null>(null)
  const [model, setModel] = useState('')
  const [range, setRange] = useState<DshTimeRange>(() => DSH_PRESETS.find((p) => p.key === '7d')!.make(Date.now()))
  const [auto, setAuto] = useState(true)
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [heatZoom, setHeatZoom] = useState(182)

  const load = useCallback(async (): Promise<void> => {
    try {
      if (window.taskweaver?.usage?.getReport) {
        const res = await window.taskweaver.usage.getReport({
          model: model || undefined,
          start: range.start,
          end: range.end,
        })
        if (res && res.ok) {
          setReport(res.data as DshUsageReport)
          setErr(null)
          return
        }
      }
      // fallback to stats if getReport not available
      const statsRes = await window.taskweaver?.usage?.getStats?.()
      if (statsRes?.ok) {
        const totals = statsRes.data.totals
        const fallback: DshUsageReport = {
          allModels: statsRes.data.byModel.map((m) => ({
            provider: m.modelKey.split('/')[0] || 'default',
            model: m.modelKey.split('/')[1] || m.modelKey,
            displayName: m.modelName,
            calls: m.callCount,
            inputTokens: m.inputTokens,
            outputTokens: m.outputTokens,
            cacheReadTokens: m.cacheReadTokens,
            cacheWriteTokens: 0,
            reasoningTokens: 0,
            firstAt: Date.now(),
            lastAt: Date.now(),
            peakTokens: m.totalTokens,
            maxDur: 0,
            totalTokens: m.totalTokens,
          })),
          rows: statsRes.data.byModel.map((m) => ({
            provider: m.modelKey.split('/')[0] || 'default',
            model: m.modelKey.split('/')[1] || m.modelKey,
            displayName: m.modelName,
            calls: m.callCount,
            inputTokens: m.inputTokens,
            outputTokens: m.outputTokens,
            cacheReadTokens: m.cacheReadTokens,
            cacheWriteTokens: 0,
            reasoningTokens: 0,
            firstAt: Date.now(),
            lastAt: Date.now(),
            peakTokens: m.totalTokens,
            maxDur: 0,
            totalTokens: m.totalTokens,
          })),
          totals: {
            calls: totals.totalCalls,
            inputTokens: totals.inputTokens,
            outputTokens: totals.outputTokens,
            cacheReadTokens: totals.cacheReadTokens,
            cacheWriteTokens: totals.cacheWriteTokens,
            reasoningTokens: 0,
          },
          daily: {},
          overview: {
            totalTokens: totals.totalTokens,
            peakTokens: totals.totalTokens,
            maxDur: totals.totalDurationMs,
            currentStreak: 1,
            maxStreak: 1,
          },
          summary: {
            totalTokens: totals.totalTokens,
            peakTokens: totals.totalTokens,
            maxDur: totals.totalDurationMs,
            currentStreak: 1,
            maxStreak: 1,
            requests: totals.totalCalls,
            costUsd: totals.costUsd,
            cacheHitRate: totals.inputTokens + totals.cacheReadTokens > 0 ? totals.cacheReadTokens / (totals.inputTokens + totals.cacheReadTokens) : 0,
            cacheReadTokens: totals.cacheReadTokens,
            reasoningTokens: 0,
          },
        }
        setReport(fallback)
        setErr(null)
      }
    } catch (error) {
      setErr(String(error instanceof Error ? error.message : error))
    }
  }, [range, model])

  const loadPricingStatus = useCallback(async () => {
    const res = await window.taskweaver?.pricing?.getStatus?.()
    if (res?.ok && res.data) {
      setPricingStatus(res.data as typeof pricingStatus)
      setPricingError(null)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadPricingStatus() }, [loadPricingStatus])
  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => { void load() }, 5000)
    return () => clearInterval(id)
  }, [auto, load])

  const handlePricingSync = async () => {
    setPricingBusy(true)
    setPricingError(null)
    const res = await window.taskweaver?.pricing?.sync?.()
    setPricingBusy(false)
    if (!res?.ok) {
      setPricingError(res?.error ?? '价签同步失败')
      return
    }
    await loadPricingStatus()
    await window.taskweaver?.models?.refresh?.()
  }

  const handleClear = async () => {
    if (!window.confirm('确定清空所有模型用量记录吗？清空后将不可恢复。')) return
    try {
      await window.taskweaver?.usage?.clear?.()
      await load()
    } catch {
      // ignore
    }
  }

  if (err) {
    return (
      <div className="dsh-empty">
        <div>⚠️ 加载模型用量失败</div>
        <div className="dsh-err-sub">{err}</div>
      </div>
    )
  }
  if (!report) return <div className="dsh-empty">加载中…</div>

  const sum = report.summary
  const ov = report.overview ?? {
    totalTokens: sum.totalTokens,
    peakTokens: sum.peakTokens,
    maxDur: sum.maxDur,
    currentStreak: sum.currentStreak,
    maxStreak: sum.maxStreak,
  }

  const rows = mergeRows(report.rows).filter((r) => r.totalTokens > 0)
  const selectRows = report.allModels?.length
    ? mergeRows(report.allModels).filter((r) => r.totalTokens > 0)
    : rows
  const daily = report.daily

  // 热力图
  const heatDays = heatZoom
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weeks = Math.ceil((heatDays + today.getDay()) / 7)
  const start = new Date(today)
  start.setDate(start.getDate() - (weeks * 7 - 1 - today.getDay()))
  const cells: { key: string; t: number; future: boolean; label: string; col: number; row: number }[] = []
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    cells.push({
      key,
      t: daily[key]?.tokens ?? 0,
      future: d.getTime() > today.getTime(),
      label: `${d.getMonth() + 1}月${d.getDate()}日`,
      col: Math.floor(i / 7),
      row: i % 7,
    })
  }
  const maxDay = Math.max(1, ...cells.map((c) => (c.future ? 0 : c.t)))

  // 每个周列只归属一个月份（取周中日期），保证所有月份带宽度之和恰好等于列数。
  const monthBands: { label: string; startCol: number; span: number }[] = []
  for (let col = 0; col < weeks; col++) {
    const d = new Date(start)
    d.setDate(start.getDate() + col * 7 + 3)
    const label = `${d.getMonth() + 1}月`
    const last = monthBands[monthBands.length - 1]
    if (last?.label === label) {
      last.span += 1
    } else {
      monthBands.push({ label, startCol: col, span: 1 })
    }
  }

  const showTip = (text: string) => (e: React.MouseEvent): void => {
    setTip({ text, x: Math.max(12, Math.min(e.clientX, window.innerWidth - 332)), y: Math.max(12, Math.min(e.clientY, window.innerHeight - 52)) })
  }
  const moveTip = (e: React.MouseEvent): void => {
    setTip((t) => (t ? {
      ...t,
      x: Math.max(12, Math.min(e.clientX, window.innerWidth - 332)),
      y: Math.max(12, Math.min(e.clientY, window.innerHeight - 52)),
    } : t))
  }
  const hideTip = (): void => setTip(null)

  // 按 Provider 分组
  const groupMap = new Map<string, { provider: string; providerDisplayName?: string; rows: DshModelRow[]; totalTokens: number; calls: number }>()
  for (const r of rows) {
    let g = groupMap.get(r.provider)
    if (!g) {
      g = { provider: r.provider, providerDisplayName: r.providerDisplayName, rows: [], totalTokens: 0, calls: 0 }
      groupMap.set(r.provider, g)
    }
    g.rows.push(r)
    g.totalTokens += r.totalTokens
    g.calls += r.calls
  }
  const groups = [...groupMap.values()]
  const isCollapsed = (provider: string): boolean => collapsed[provider] === undefined ? true : collapsed[provider]
  const toggle = (provider: string): void =>
    setCollapsed((prev) => {
      const cur = prev[provider] === undefined ? true : prev[provider]
      return { ...prev, [provider]: !cur }
    })

  return (
    <div className="dsh-root">
      <div className="dsh-panel" style={{ marginBottom: 12 }}>
        <div className="dsh-panel-head">
          <h3><span className="dsh-dot-blue" />模型价签</h3>
          <div className="dsh-tools" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {pricingStatus?.synced_at
                ? `更新于 ${new Date(pricingStatus.synced_at).toLocaleString('zh-CN')}${pricingStatus.stale ? '（可能已过期）' : ''} · ${pricingStatus.model_count ?? '—'} 个模型`
                : '尚未同步价签'}
            </span>
            <button
              type="button"
              className="settings-secondary-button"
              disabled={pricingBusy}
              onClick={() => { void handlePricingSync() }}
            >
              {pricingBusy ? '同步中…' : '立即同步'}
            </button>
          </div>
        </div>
        {pricingError && <p className="dsh-err-sub" role="alert">{pricingError}</p>}
      </div>
      {/* 顶部统计栏: 5 个指标横向排列 (全量历史) */}
      <div className="dsh-stats">
        <DshStatCard label="累计 Token 数" value={fc(ov.totalTokens)} />
        <DshStatCard label="峰值 Token 数" value={fc(ov.peakTokens)} />
        <DshStatCard label="最长聊天时长" value={fdur(ov.maxDur)} />
        <DshStatCard label="当前连续天数" value={ov.currentStreak != null ? `${ov.currentStreak} 天` : '—'} />
        <DshStatCard label="最长连续天数" value={ov.maxStreak != null ? `${ov.maxStreak} 天` : '—'} />
      </div>

      {/* Token 活动 */}
      <div className="dsh-panel">
        <div className="dsh-panel-head">
          <h3><span className="dsh-dot-blue" />Token 活动</h3>
          <div className="dsh-tools">
            <select
              className="dsh-sel"
              value={heatZoom}
              onChange={(e) => setHeatZoom(Number(e.target.value))}
              title="热力图时间范围 (不影响用量明细)"
            >
              <option value={182}>近 6 个月</option>
              <option value={365}>近 1 年</option>
            </select>
          </div>
        </div>

        <div className="dsh-heat-wrap">
          <div className="dsh-heat" style={{ '--weeks': weeks } as CSSProperties}>
            {Array.from({ length: 7 }, (_, ri) => (
              <Fragment key={ri}>
                {Array.from({ length: weeks }, (_, c) => {
                  const cell = cells[c * 7 + ri]!
                  const cellLvl = lvl(cell.t, maxDay)
                  return (
                    <div
                      key={cell.key}
                      className={`dsh-cell ${cell.future ? 'dsh-cell-future' : `dsh-cell${cellLvl}`}`}
                      onMouseEnter={showTip(`${cell.label} 使用了 ${fc(cell.t)} 个 Token`)}
                      onMouseMove={moveTip}
                      onMouseLeave={hideTip}
                    />
                  )
                })}
              </Fragment>
            ))}
          </div>
          <div className="dsh-month-bar" style={{ '--weeks': weeks } as CSSProperties}>
            {monthBands.map((b, i) => (
              <div
                key={i}
                className="dsh-month-band"
                style={{ gridColumn: `${b.startCol + 1} / span ${b.span}` }}
              >
                {b.label}
              </div>
            ))}
          </div>
        </div>

        {tip && (
          <div className="dsh-tooltip" style={{ left: tip.x + 12, top: tip.y + 12 }}>
            {tip.text}
          </div>
        )}
      </div>

      {/* 用量明细 */}
      <div className="dsh-panel">
        <div className="dsh-panel-head">
          <h3><span className="dsh-dot-green" />用量明细</h3>
          <div className="dsh-tools">
            <DshTimeRangePicker value={range} onChange={setRange} />
            <DshModelSelect
              value={model}
              rows={selectRows}
              onChange={setModel}
            />
            <button className="dsh-btn" onClick={() => void load()}>⟳ 刷新</button>
            <button className={`dsh-btn ${auto ? 'dsh-btn-on' : ''}`} onClick={() => setAuto(!auto)}>
              {auto ? <span className="dsh-auto"><span className="dsh-pulse" />5s 自动刷新</span> : '自动刷新关闭'}
            </button>
            <button className="dsh-btn dsh-btn-subtle" onClick={() => void handleClear()} title="清空全部用量数据">
              清空记录
            </button>
          </div>
        </div>

        {/* 当前时间范围指示器 */}
        <div className="dsh-range-info">
          当前范围:<span className="dsh-range-info-strong">{range.label}</span>
          <span className="dsh-range-info-dim">
            {range.start != null ? fmtDT(range.start) : '全部时间'}
            {range.end != null ? ' ~ ' + fmtDT(range.end) : ''}
          </span>
          {report.debug?.version ? (
            <span className="dsh-range-info-dim">· host {report.debug.version}</span>
          ) : null}
        </div>

        {/* 4 张 KPI 卡 (无图标，简洁文字) */}
        <div className="dsh-kpis">
          <DshKpi l="真实消耗 Tokens" v={fc(sum.totalTokens)} d="输入+输出+缓存" />
          <DshKpi l="总请求数" v={sum.requests != null ? String(sum.requests) : '—'} d="所有模型调用" />
          <DshKpi l="总成本(估算)" v={sum.costUsd != null ? '¥' + Number(sum.costUsd).toFixed(2) : '—'} d="按官方公开价(¥/M)估算" />
          <DshKpi l="缓存命中" v={fc(sum.cacheReadTokens)} d="cache read tokens" />
        </div>

        {/* 缓存命中率 */}
        <div className="dsh-rate-wrap">
          <div className="dsh-rate-row">
            <span className="dsh-rate-l">缓存命中率</span>
            <span className="dsh-rate-v">{sum.cacheHitRate != null ? (sum.cacheHitRate * 100).toFixed(1) + '%' : '—'}</span>
          </div>
          <div className="dsh-rate-bar">
            <div className="dsh-rate-fill" style={{ width: Math.min(100, (sum.cacheHitRate ?? 0) * 100) + '%' }} />
          </div>
        </div>

        {/* 模型列表: 按来源 (provider) 分组，可收缩/展开 */}
        {rows.length === 0 ? (
          <div className="dsh-empty">暂无调用记录</div>
        ) : (
          <div className="dsh-list">
            {groups.map((g) => {
              const open = !isCollapsed(g.provider)
              return (
                <div key={g.provider} className="dsh-group">
                  <button
                    type="button"
                    className="dsh-group-head"
                    onClick={() => toggle(g.provider)}
                    aria-expanded={open}
                  >
                    <span className="dsh-group-chevron">{open ? '▾' : '▸'}</span>
                    <span className="dsh-group-name">{g.providerDisplayName || g.provider}</span>
                    <span className="dsh-group-meta">
                      {g.rows.length} 个模型 · 共 {fc(g.totalTokens)} · {g.calls} 次调用
                    </span>
                  </button>
                  {open && (
                    <div className="dsh-group-body">
                      {g.rows.map((r) => (
                        <div key={r.provider + '/' + r.model} className="dsh-row">
                          <div className="dsh-nm">
                            <div>{r.displayName || r.model}</div>
                            <div className="dsh-pv">{r.providerDisplayName || r.provider}</div>
                          </div>
                          <div className="dsh-nums">
                            <div className="dsh-num"><b>{fc(r.totalTokens)}</b><span>总 token</span></div>
                            <div className="dsh-num"><b>{r.calls}</b><span>调用</span></div>
                            <div className="dsh-num"><b>{fc(r.inputTokens)}</b><span>输入</span></div>
                            <div className="dsh-num"><b>{fc(r.outputTokens)}</b><span>输出</span></div>
                            <div className="dsh-num"><b>{fc(r.reasoningTokens)}</b><span>推理</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
