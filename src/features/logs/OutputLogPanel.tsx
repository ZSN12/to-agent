import { useMemo, useState } from 'react'
import { Check, Copy, Filter, Search, Terminal, X, AlertCircle, CheckCircle2, Clock, Ban } from 'lucide-react'
import type { ToolTraceItem } from '../../shared/app-api'
import { ToolTraceCard } from '../chat/ToolTraceCard'

export function OutputLogPanel({
  logs,
  onClose,
  onShowToolDetails,
  onOpenWorkspacePath,
}: {
  logs: ToolTraceItem[]
  onClose: () => void
  onShowToolDetails?: (item: ToolTraceItem) => void
  onOpenWorkspacePath?: (relativePath: string) => void
}) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'done' | 'error' | 'blocked' | 'running'>('all')
  const [query, setQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase()
    return logs
      .filter((log) => {
        if (filterStatus !== 'all' && log.status !== filterStatus) return false
        if (!q) return true
        const text = `${log.toolName} ${log.inputSummary ?? ''} ${log.resultSummary ?? ''}`.toLowerCase()
        return text.includes(q)
      })
      .slice(-150)
      .reverse() // 最新的在前面
  }, [logs, filterStatus, query])

  const copyLogText = (log: ToolTraceItem) => {
    const content = `[${log.status.toUpperCase()}] ${log.toolName} (${log.durationMs ? `${log.durationMs}ms` : '未知耗时'})
输入: ${log.inputSummary ?? ''}
结果: ${log.resultSummary ?? ''}`
    void navigator.clipboard.writeText(content)
    setCopiedId(log.id)
    setTimeout(() => setCopiedId(null), 1800)
  }

  const getStatusBadge = (status: ToolTraceItem['status']) => {
    switch (status) {
      case 'done':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#22c55e', fontSize: 11, fontWeight: 500 }}>
            <CheckCircle2 size={13} />
            完成
          </span>
        )
      case 'error':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#ef4444', fontSize: 11, fontWeight: 500 }}>
            <AlertCircle size={13} />
            错误
          </span>
        )
      case 'blocked':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#f59e0b', fontSize: 11, fontWeight: 500 }}>
            <Ban size={13} />
            拦截
          </span>
        )
      case 'running':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#3b82f6', fontSize: 11, fontWeight: 500 }}>
            <Clock size={13} />
            执行中
          </span>
        )
      default:
        return null
    }
  }

  return (
    <aside className="side-panel dag-panel trajectory-panel" aria-label="Trajectory 工具轨迹" style={{ width: 440 }}>
      <div className="panel-header">
        <div className="panel-header-title">
          <Terminal size={17} style={{ marginRight: 6 }} />
          <strong>Trajectory</strong>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 6 }}>
            最近 {filteredLogs.length} 条
          </span>
        </div>
        <button className="panel-close-btn" onClick={onClose} aria-label="关闭日志面板">
          <X size={15} />
        </button>
      </div>

      {/* 搜索与过滤工具栏 */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-color, #e5e7eb)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: 'var(--text-tertiary)' }} />
          <input
            type="search"
            placeholder="搜索工具名、命令或结果…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '5px 8px 5px 26px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid var(--border-color, #e5e7eb)',
              background: 'var(--bg-secondary)',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
          {(['all', 'done', 'error', 'blocked', 'running'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(s)}
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                border: 'none',
                background: filterStatus === s ? 'var(--accent-primary, #3b82f6)' : 'var(--bg-secondary)',
                color: filterStatus === s ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: filterStatus === s ? 600 : 400,
              }}
            >
              {s === 'all' ? '全部' : s === 'done' ? '成功' : s === 'error' ? '错误' : s === 'blocked' ? '已拦截' : '运行中'}
            </button>
          ))}
        </div>
      </div>

      {/* 日志条目列表 */}
      <div className="dag-scroll" style={{ padding: 12 }}>
        {filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)', fontSize: 13 }}>
            暂无匹配的工具执行日志
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredLogs.map((log) => {
              const isExpanded = expandedId === log.id
              const isCopied = copiedId === log.id

              return (
                <div
                  key={log.id}
                  style={{
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    border: '1px solid var(--border-color, #e5e7eb)',
                    padding: '10px 12px',
                    fontSize: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{log.toolName}</strong>
                      {getStatusBadge(log.status)}
                      {log.durationMs != null && (
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                          {log.durationMs}ms
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => copyLogText(log)}
                      title="复制完整日志"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 3,
                        color: isCopied ? '#22c55e' : 'var(--text-secondary)',
                      }}
                    >
                      {isCopied ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>

                  {isExpanded ? (
                    <ToolTraceCard
                      item={log}
                      onShowDetails={onShowToolDetails}
                      onOpenPath={onOpenWorkspacePath}
                    />
                  ) : (
                    log.resultSummary && (
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 11,
                          color: log.status === 'error' ? '#ef4444' : log.status === 'blocked' ? '#f59e0b' : 'var(--text-secondary)',
                          wordBreak: 'break-word',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {log.inputSummary ? `${log.inputSummary} → ` : ''}
                        {log.resultSummary}
                      </div>
                    )
                  )}

                  {onShowToolDetails && (
                    <button
                      type="button"
                      className="trajectory-details-link"
                      onClick={() => onShowToolDetails(log)}
                    >
                      在 Details 中查看
                    </button>
                  )}
                  {log.resultSummary && log.resultSummary.length > 100 && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-primary, #3b82f6)',
                        fontSize: 11,
                        padding: 0,
                        cursor: 'pointer',
                        textAlign: 'left',
                        alignSelf: 'flex-start',
                      }}
                    >
                      {isExpanded ? '收起详情' : '展开详情'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
