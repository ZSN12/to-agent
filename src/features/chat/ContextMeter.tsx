import type { LiveContextUsage } from '../../shared/app-api'

export function ContextMeter({ usage }: { usage: LiveContextUsage | null }) {
  if (!usage || usage.contextPercent === null || usage.contextWindow === null) return null
  const pct = Math.min(100, Math.max(0, Math.round(usage.contextPercent)))
  const ringStyle = {
    background: `conic-gradient(#3b82f6 ${pct * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
  }

  return (
    <div className="context-meter" title={`上下文 ${pct}% · ${usage.contextTokens?.toLocaleString('zh-CN') ?? '?'} / ${usage.contextWindow.toLocaleString('zh-CN')} tok`}>
      <span className="context-meter-ring" style={ringStyle} aria-hidden />
      <span className="context-meter-label">{pct}%</span>
    </div>
  )
}
