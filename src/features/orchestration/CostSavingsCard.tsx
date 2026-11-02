import { useEffect, useState } from 'react'
import { ArrowDownRight, Clock, Coins, Cpu, Zap } from 'lucide-react'
import type { DagCostSavingsSummary, DagRunHistoryEntry } from '../../shared/app-api'
import { computeDagExecutionMetrics, formatDuration, formatSpeedup } from './dag-metrics'

function formatTokens(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function formatCost(value: number | null, currency: string | null) {
  if (value === null || !currency) return '暂不可完整估算'
  try {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 6,
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(6)} ${currency}`
  }
}

export { computeDagExecutionMetrics, formatDuration, formatSpeedup }

export function CostSavingsCard({
  conversationId,
  runId,
  active,
}: {
  conversationId: string | null
  runId: string | null
  active: boolean
}) {
  const [runEntry, setRunEntry] = useState<DagRunHistoryEntry | null>(null)

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    setRunEntry(null)
    if (!conversationId || !runId) return () => { disposed = true }

    const load = async () => {
      try {
        const response = await window.taskweaver?.tasks?.listRuns?.(conversationId)
        if (disposed || !response?.ok || !Array.isArray(response.data)) return
        const current = response.data.find((run) => run.runId === runId)
        if (current) setRunEntry(current)
      } catch {
        // 成本与结算展示为辅助诊断，读取历史失败不阻断主流程。
      }
      if (active && !disposed) timer = setTimeout(() => { void load() }, 2000)
    }

    void load()
    return () => {
      disposed = true
      if (timer !== null) clearTimeout(timer)
    }
  }, [active, conversationId, runId])

  const summary: DagCostSavingsSummary | null = runEntry?.costSavingsSummary ?? null
  if (!summary && !runEntry) return null

  const metrics = computeDagExecutionMetrics(runEntry?.tasks ?? [], runEntry?.createdAt, runEntry?.updatedAt)
  const savingsPercent = summary?.savings?.percent ?? null
  const routed = summary ? formatCost(summary.routedCost.amount, summary.routedCost.currency) : '暂不可完整估算'
  const baseline = summary ? formatCost(summary.flagshipBaseline.amount, summary.flagshipBaseline.currency) : '暂不可完整估算'
  const modelName = summary?.flagshipBaseline?.modelKey || '高能力参考模型'
  const savingsLabel = savingsPercent === null
    ? '价格覆盖不完整'
    : savingsPercent >= 0
      ? `预计节省 ${savingsPercent.toFixed(1)}%`
      : `预计成本增加 ${Math.abs(savingsPercent).toFixed(1)}%`

  return (
    <details className="dag-cost-card" open={!active}>
      <summary>
        <span className="dag-cost-icon" aria-hidden="true"><Coins size={15} /></span>
        <strong>多智能体执行结算与成本估算</strong>
        <div className="dag-cost-summary-badges">
          {metrics.speedup !== null && metrics.speedup >= 1.05 && (
            <span className="dag-cost-badge is-speedup">
              <Zap size={11} /> {metrics.speedup.toFixed(1)}x 加速
            </span>
          )}
          <span className="dag-cost-summary-value">{savingsLabel}</span>
        </div>
      </summary>

      <div className="dag-cost-content">
        {/* 多智能体并行与异构模型调度概览条 */}
        <div className="dag-cost-overview-grid">
          <div className="dag-cost-metric-card">
            <span className="dag-cost-metric-label"><Clock size={12} /> 执行总耗时</span>
            <strong>{formatDuration(metrics.wallClockMs)}</strong>
            <small>
              {metrics.totalTaskDurationMs !== null
                ? `任务累计耗时 ${formatDuration(metrics.totalTaskDurationMs)}`
                : '累计耗时待计算'}
            </small>
          </div>
          <div className="dag-cost-metric-card">
            <span className="dag-cost-metric-label"><Zap size={12} /> 并行加速比</span>
            <strong className={metrics.speedup && metrics.speedup >= 1.05 ? 'is-highlight' : ''}>
              {formatSpeedup(metrics.speedup, runEntry?.tasks?.length ?? 0)}
            </strong>
            <small>
              {metrics.speedup && metrics.speedup >= 1.05
                ? '多 Agent 并行缩短耗时'
                : '依赖链限制或单任务'}
            </small>
          </div>
          <div className="dag-cost-metric-card">
            <span className="dag-cost-metric-label"><Cpu size={12} /> 异构模型分布</span>
            <strong>
              {metrics.tierDistribution.lightweightRatio !== null
                ? `低成本率 ${metrics.tierDistribution.lightweightRatio.toFixed(0)}%`
                : '单模型调度'}
            </strong>
            <small>
              轻量 {metrics.tierDistribution.low} · 平衡 {metrics.tierDistribution.balanced} · 强模型 {metrics.tierDistribution.high}
            </small>
          </div>
        </div>

        {summary && (
          <>
            <div className="dag-cost-token-total">
              <span>总消耗</span>
              <strong>{formatTokens(summary.tokenTotals.totalTokens)} tokens</strong>
              <small>输入 {formatTokens(summary.tokenTotals.inputTokens)} · 输出 {formatTokens(summary.tokenTotals.outputTokens)} · 缓存读写 {formatTokens(summary.tokenTotals.cacheReadTokens + summary.tokenTotals.cacheWriteTokens)}</small>
            </div>
            <div className="dag-cost-comparison">
              <div><span>当前路由估算</span><strong>{routed}</strong></div>
              <div><span>{modelName} 全量参考</span><strong>{baseline}</strong></div>
              {savingsPercent !== null && summary.savings.amount !== null && (
                <div className={`dag-cost-saved${summary.savings.amount < 0 ? ' is-increase' : ''}`}>
                  <span>{summary.savings.amount < 0 ? '成本变化' : <><ArrowDownRight size={14} />预计节省</>}</span>
                  <strong>{formatCost(Math.abs(summary.savings.amount), summary.savings.currency)} · {summary.savings.amount < 0 ? `增加 ${Math.abs(savingsPercent).toFixed(1)}%` : `${savingsPercent.toFixed(1)}%`}</strong>
                </div>
              )}
            </div>
            {!summary.coverage.complete && (
              <div className="dag-cost-coverage" role="note">
                价格覆盖 {summary.coverage.routedPricedCalls}/{summary.coverage.totalCalls} 次路由调用，{summary.coverage.flagshipPricedCalls}/{summary.coverage.totalCalls} 次参考调用。金额不完整时不会把缺失价格当作免费。
              </div>
            )}
            {summary.warnings.length > 0 && (
              <ul className="dag-cost-warnings">
                {summary.warnings.slice(0, 3).map((warning, index) => <li key={`${warning.code}-${warning.modelKey ?? index}`}>{warning.message}</li>)}
              </ul>
            )}
            <small className="dag-cost-estimate-note">
              按 {summary.capturedAt ? new Date(summary.capturedAt).toLocaleString('zh-CN') : '运行时'} 的价格快照估算，实际账单可能不同。
            </small>
          </>
        )}
      </div>
    </details>
  )
}
