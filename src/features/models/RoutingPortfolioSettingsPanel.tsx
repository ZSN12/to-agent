import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, GitBranch, RefreshCw, RotateCcw, Save, Shield } from 'lucide-react'
import type { BashSandboxPreference, RoutingPortfolio, SandboxProbeResult } from '../../shared/app-api'
import { WorktreeMergeActions } from '../worktree/WorktreeMergeActions'
import { RoutingPortfolioForm } from './RoutingPortfolioForm'

function getPortfolioApi() {
  return window.taskweaver?.portfolio ?? null
}

function validatePortfolioFormShape(value: Record<string, unknown>): string | null {
  const checkObject = (candidate: unknown, field: string) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return `${field} 必须是对象。`
    return null
  }
  const checkArray = (candidate: unknown, field: string, items: 'strings' | 'objects') => {
    if (candidate === undefined) return null
    if (!Array.isArray(candidate)) return `${field} 必须是数组。`
    if (items === 'strings' && candidate.some((item) => typeof item !== 'string')) return `${field} 只能包含文本。`
    if (items === 'objects' && candidate.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) return `${field} 中的每一项都必须是对象。`
    return null
  }

  for (const [field, items] of [
    ['subscriptions', 'objects'],
    ['free_model_patterns', 'strings'],
    ['balance_policies', 'objects'],
  ] as const) {
    const error = checkArray(value[field], field, items)
    if (error) return error
  }
  if (value.usage_source !== undefined) {
    const error = checkObject(value.usage_source, 'usage_source')
    if (error) return error
  }
  if (value.quota_cycles !== undefined) {
    const error = checkObject(value.quota_cycles, 'quota_cycles')
    if (error) return error
    const policies = (value.quota_cycles as Record<string, unknown>).policies
    const policyError = checkArray(policies, 'quota_cycles.policies', 'objects')
    if (policyError) return policyError
  }
  return null
}

function SettingToggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="routing-setting-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="routing-setting-row-text">
        <span className="routing-setting-row-label">{label}</span>
        {hint ? <span className="routing-setting-row-hint">{hint}</span> : null}
      </span>
    </label>
  )
}

export function RoutingPortfolioSettingsPanel({ onToast }: { onToast: (message: string) => void }) {
  const [raw, setRaw] = useState('')
  const [portfolio, setPortfolio] = useState<RoutingPortfolio | null>(null)
  const [portfolioJsonError, setPortfolioJsonError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [worktreeIsolation, setWorktreeIsolation] = useState(false)
  const [bashSandbox, setBashSandbox] = useState<BashSandboxPreference>('auto')
  const [sandboxProbe, setSandboxProbe] = useState<SandboxProbeResult | null>(null)
  const [sessionSandboxMode, setSessionSandboxMode] = useState<string>('default')
  const [worktrees, setWorktrees] = useState<Array<{ taskId: string; path: string }>>([])
  const [autoSnapshotOnTurn, setAutoSnapshotOnTurn] = useState(false)
  const [subtaskUpgradeMax, setSubtaskUpgradeMax] = useState(1)
  const [memorySummary, setMemorySummary] = useState('')
  const [portfolioOpen, setPortfolioOpen] = useState(false)

  const loadFeatures = useCallback(async () => {
    const prefs = await window.taskweaver?.preferences?.get()
    if (prefs?.ok && prefs.data) {
      setWorktreeIsolation(prefs.data.worktreeIsolation)
      if (prefs.data.bashSandbox) setBashSandbox(prefs.data.bashSandbox)
      setAutoSnapshotOnTurn(prefs.data.autoSnapshotOnTurn === true)
      setSubtaskUpgradeMax(prefs.data.subtaskUpgradeMax ?? 1)
    }
    const mem = await window.taskweaver?.memory?.get()
    if (mem?.ok && mem.data) {
      const parts = [
        mem.data.user_goal ? `目标：${mem.data.user_goal.slice(0, 200)}` : '',
        mem.data.rolling_summary ? `摘要：${mem.data.rolling_summary.slice(0, 400)}` : '',
      ].filter(Boolean)
      setMemorySummary(parts.join('\n') || '')
    } else {
      setMemorySummary('')
    }
    const probe = await window.taskweaver?.sandbox?.probe()
    if (probe?.ok && probe.data) setSandboxProbe(probe.data)
    const effective = await window.taskweaver?.sandbox?.getEffective()
    if (effective?.ok && effective.data) {
      const row = effective.data as { sessionSandboxMode?: string | null }
      setSessionSandboxMode(row.sessionSandboxMode ? row.sessionSandboxMode : 'default')
    }
    const ws = await window.taskweaver?.webSearch?.getConfig()
    if (ws?.ok && ws.data) setWebSearchEnabled(ws.data.enabled)
    const list = await window.taskweaver?.worktree?.list()
    if (list?.ok && list.data) setWorktrees(list.data)
  }, [])

  const load = useCallback(async () => {
    const api = getPortfolioApi()
    if (!api) {
      setError('作品集 API 不可用（请使用 TaskWeaver 桌面应用）')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const res = await api.get()
    setLoading(false)
    if (!res.ok) {
      setError(!res.ok && 'message' in res ? String(res.message) : '加载失败')
      return
    }
    if (!res.data) {
      setError('加载失败')
      return
    }
    setPortfolio(res.data)
    setRaw(JSON.stringify(res.data, null, 2))
    setPortfolioJsonError(null)
    await loadFeatures()
  }, [loadFeatures])

  useEffect(() => {
    void load()
  }, [load])

  const persistPortfolio = async (candidate: RoutingPortfolio) => {
    const api = getPortfolioApi()
    if (!api) return
    setSaving(true)
    try {
      const res = await api.save(candidate)
      if (!res.ok) {
        onToast(res.error || ('message' in res ? String(res.message) : '保存失败'))
        return
      }
      setPortfolio(candidate)
      setRaw(JSON.stringify(candidate, null, 2))
      setPortfolioJsonError(null)
      onToast('路由作品集已保存')
    } catch (saveError) {
      onToast(saveError instanceof Error ? `保存失败：${saveError.message}` : '保存路由作品集失败')
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    if (portfolioJsonError) return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      onToast('JSON 格式无效，请检查后再保存')
      return
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setPortfolioJsonError('JSON 顶层必须是对象。')
      return
    }
    const shapeError = validatePortfolioFormShape(parsed as Record<string, unknown>)
    if (shapeError) {
      setPortfolioJsonError(shapeError)
      return
    }
    await persistPortfolio(parsed as RoutingPortfolio)
  }

  const resetToBundled = async () => {
    const api = getPortfolioApi()
    if (!api?.resetToBundled) return
    if (!window.confirm('将删除本机自定义作品集并恢复仓库默认模板，是否继续？')) return
    setLoading(true)
    const res = await api.resetToBundled()
    setLoading(false)
    if (!res.ok || !res.data?.portfolio) {
      onToast(!res.ok && 'message' in res ? String(res.message) : '恢复失败')
      return
    }
    setPortfolio(res.data.portfolio)
    setRaw(JSON.stringify(res.data.portfolio, null, 2))
    setPortfolioJsonError(null)
    onToast('已恢复默认路由作品集')
  }

  const toggleWebSearch = async (enabled: boolean) => {
    const res = await window.taskweaver?.webSearch?.setConfig({ enabled })
    if (!res?.ok) {
      onToast('保存 Web 搜索设置失败')
      return
    }
    setWebSearchEnabled(enabled)
    onToast(enabled ? '已启用 web_search（联网需权限批准）' : '已关闭 Web 搜索')
  }

  const setBashSandboxMode = async (mode: BashSandboxPreference) => {
    const res = await window.taskweaver?.preferences?.set({ bashSandbox: mode })
    if (!res?.ok) {
      onToast('保存 Bash 沙箱设置失败')
      return
    }
    setBashSandbox(mode)
    onToast('Bash 沙箱策略已更新')
  }

  const toggleWorktree = async (enabled: boolean) => {
    const res = await window.taskweaver?.preferences?.set({ worktreeIsolation: enabled })
    if (!res?.ok) {
      onToast('保存 worktree 设置失败')
      return
    }
    setWorktreeIsolation(enabled)
    onToast(enabled ? '实现/测试子任务将尝试使用 git worktree' : '已关闭 worktree 隔离')
  }

  const clearMemory = async () => {
    if (!window.confirm('清空当前会话的多智能体 L0–L2 记忆？')) return
    const res = await window.taskweaver?.memory?.clear()
    if (!res?.ok) {
      onToast(res?.error ?? '清空失败')
      return
    }
    onToast('已清空会话记忆')
    void loadFeatures()
  }

  const removeWorktree = async (taskId: string) => {
    if (!window.confirm(`删除子任务 ${taskId} 的 worktree？`)) return
    const res = await window.taskweaver?.worktree?.remove(taskId, true)
    if (!res?.ok) {
      onToast('删除 worktree 失败')
      return
    }
    onToast('worktree 已删除')
    void loadFeatures()
  }

  const hasMemory = memorySummary.trim().length > 0

  return (
    <section className="model-settings routing-portfolio-settings">
      <div className="model-settings-header">
        <div>
          <h2>路由与扩展</h2>
          <p className="mcp-settings-lead">
            主对话模型在 Composer 里由你选定。此处配置多智能体 DAG 的<strong>子任务路由</strong>（能力、订阅、配额）以及执行相关的扩展能力。
          </p>
        </div>
        <div className="model-settings-header-actions">
          <button type="button" className="settings-secondary-button" disabled={loading} onClick={() => { void load() }}>
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
            刷新
          </button>
        </div>
      </div>

      <div className="routing-settings-grid">
        <article className="routing-settings-card">
          <h3>执行与 Git</h3>
          <p className="routing-card-desc">多 Agent 编排运行时的检查点与子任务失败策略。</p>
          <SettingToggle
            checked={autoSnapshotOnTurn}
            label="每轮发送前创建 Git 检查点"
            hint="非 Git 仓库时自动跳过"
            onChange={(enabled) => {
              void window.taskweaver?.preferences?.set({ autoSnapshotOnTurn: enabled }).then((res) => {
                if (res?.ok) {
                  setAutoSnapshotOnTurn(enabled)
                  onToast(enabled ? '已开启自动检查点' : '已关闭自动检查点')
                }
              })
            }}
          />
          <div className="routing-field-inline">
            <label>
              <span>子任务失败升级重试</span>
              <input
                type="number"
                min={0}
                max={3}
                value={subtaskUpgradeMax}
                onChange={(e) => {
                  setSubtaskUpgradeMax(Math.max(0, Math.min(3, Number(e.target.value))))
                }}
                onBlur={() => {
                  void window.taskweaver?.preferences?.set({ subtaskUpgradeMax }).then((res) => {
                    if (res?.ok) onToast('已更新子任务升级策略')
                  })
                }}
              />
            </label>
            <span className="routing-field-hint">0–3 次，失败后可换更强模型重试</span>
          </div>
        </article>

        <article className="routing-settings-card">
          <h3>多智能体记忆</h3>
          <p className="routing-card-desc">当前会话的 L0–L2 外置记忆（编排注入用）。</p>
          {hasMemory ? (
            <pre className="routing-memory-preview">{memorySummary}</pre>
          ) : (
            <p className="settings-list-empty" style={{ margin: 0 }}>当前会话尚无多智能体记忆。</p>
          )}
          <button type="button" className="settings-secondary-button" onClick={() => { void clearMemory() }}>
            <RotateCcw size={14} />
            清空当前会话记忆
          </button>
        </article>

        <article className="routing-settings-card routing-settings-card-wide">
          <h3>工具与隔离</h3>
          <p className="routing-card-desc">影响 Agent 可用工具与文件/Bash 执行环境。</p>
          <div className="routing-toggles-stack">
            <SettingToggle
              checked={webSearchEnabled}
              label="Web 搜索（web_search）"
              hint="DuckDuckGo 摘要；默认关闭，启用后联网需批准"
              onChange={(v) => { void toggleWebSearch(v) }}
            />
            <SettingToggle
              checked={worktreeIsolation}
              label="Worktree 隔离（实现 / 测试子任务）"
              hint="启用且 Git 工作区干净时，写入范围互不重叠的实现任务可并行；各自改动需检查后手动合并"
              onChange={(v) => { void toggleWorktree(v) }}
            />
          </div>
        </article>

        <article className="routing-settings-card routing-settings-card-wide">
          <h3>
            <Shield size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
            沙箱
          </h3>
          <p className="routing-card-desc">
            文件写入围栏与 Bash 执行沙箱；「完全信任」权限模式下部分策略不生效。
          </p>
          <div className="routing-sandbox-fields">
            <label className="routing-select-field">
              <span>文件 + Bash 沙箱</span>
              {sandboxProbe && (
                <span className="routing-probe-badge">
                  {sandboxProbe.available ? 'OS bash 可用' : '仅文件围栏'}
                  {sandboxProbe.runner ? ` · ${sandboxProbe.runner}` : ''}
                </span>
              )}
              <select
                className="settings-text-input"
                value={bashSandbox}
                onChange={(e) => { void setBashSandboxMode(e.target.value as BashSandboxPreference) }}
              >
                <option value="auto">自动（支持时 workspace-write）</option>
                <option value="workspace-write">工作区可写</option>
                <option value="read-only">只读</option>
                <option value="off">关闭</option>
              </select>
            </label>
            <label className="routing-select-field">
              <span>当前会话覆盖</span>
              <span className="routing-field-hint">仅本对话，覆盖全局偏好</span>
              <select
                className="settings-text-input"
                value={sessionSandboxMode}
                onChange={(e) => {
                  const v = e.target.value
                  void (async () => {
                    const mode = v === 'default' ? null : v
                    const res = await window.taskweaver?.sandbox?.setSessionMode(
                      mode as 'read-only' | 'workspace-write' | 'danger-full-access' | null,
                    )
                    if (res?.ok) {
                      setSessionSandboxMode(v)
                      onToast('已更新本会话沙箱模式')
                    }
                  })()
                }}
              >
                <option value="default">跟随全局偏好</option>
                <option value="read-only">read-only</option>
                <option value="workspace-write">workspace-write</option>
                <option value="danger-full-access">danger-full-access</option>
              </select>
            </label>
          </div>
          {sandboxProbe?.note && (
            <p className="routing-field-hint" style={{ marginTop: 8 }}>{sandboxProbe.note}</p>
          )}
        </article>
      </div>

      {loading ? <p className="settings-list-empty">加载路由作品集…</p> : (
        <RoutingPortfolioForm
          portfolio={portfolio}
          saving={saving}
          disabled={Boolean(portfolioJsonError)}
          onChange={(next) => {
            setPortfolio(next)
            setRaw(JSON.stringify(next, null, 2))
            setPortfolioJsonError(null)
          }}
          onSave={persistPortfolio}
        />
      )}

      {worktrees.length > 0 && (
        <div className="mcp-section">
          <div className="mcp-section-header">
            <div>
              <h3>
                <GitBranch size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
                活动 worktree
              </h3>
              <p>{worktrees.length} 个子任务目录未合并到主工作区</p>
            </div>
          </div>
          <ul className="routing-worktree-cards">
            {worktrees.map((wt) => (
              <li key={wt.taskId} className="routing-worktree-card">
                <div className="routing-worktree-card-head">
                  <code>{wt.taskId}</code>
                  <span className="routing-worktree-path">{wt.path}</span>
                </div>
                <div className="routing-worktree-card-actions">
                  <WorktreeMergeActions taskId={wt.taskId} compact onDone={() => { void loadFeatures() }} />
                  <button
                    type="button"
                    className="settings-danger-button"
                    onClick={() => { void removeWorktree(wt.taskId) }}
                  >
                    删除 worktree
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mcp-section routing-portfolio-advanced">
        <div className="mcp-section-header">
          <div>
            <h3>能力作品集（高级）</h3>
            <p>路由配置按当前用户单独保存。可配置该用户的订阅模型与免费渠道；订阅余额与刷新周期请在上方「订阅额度」查看。默认模板不假定任何人的订阅。</p>
          </div>
          <button
            type="button"
            className={`mcp-collapse-toggle ${portfolioOpen ? 'is-open' : ''}`}
            onClick={() => setPortfolioOpen((v) => !v)}
            aria-expanded={portfolioOpen}
          >
            {portfolioOpen ? '收起 JSON' : '编辑 JSON'}
            <ChevronDown size={14} />
          </button>
        </div>

        {portfolioOpen && (
          <>
            {error && <p className="settings-inline-error">{error}</p>}
            {loading ? (
              <p className="settings-list-empty">加载作品集…</p>
            ) : (
              <>
                {portfolioJsonError && <p className="settings-inline-error">{portfolioJsonError}</p>}
                <textarea
                  className="routing-portfolio-editor"
                  value={raw}
                  onChange={(event) => {
                    const nextRaw = event.target.value
                    setRaw(nextRaw)
                    try {
                      const parsed = JSON.parse(nextRaw) as unknown
                      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                        setPortfolioJsonError('JSON 顶层必须是对象。')
                        return
                      }
                      const shapeError = validatePortfolioFormShape(parsed as Record<string, unknown>)
                      if (shapeError) {
                        setPortfolioJsonError(shapeError)
                        return
                      }
                      setPortfolio(parsed as RoutingPortfolio)
                      setPortfolioJsonError(null)
                    } catch {
                      setPortfolioJsonError('JSON 格式无效；修复 JSON 后才能编辑或保存结构化配置。')
                    }
                  }}
                  rows={16}
                  spellCheck={false}
                  aria-label="路由作品集 JSON"
                />
                <div className="model-editor-actions">
                  <button type="button" className="settings-secondary-button" onClick={() => { void load() }}>
                    <RefreshCw size={14} />
                    重新加载
                  </button>
                  <button type="button" className="settings-secondary-button" onClick={() => { void resetToBundled() }}>
                    <RotateCcw size={14} />
                    恢复默认
                  </button>
                  <button
                    type="button"
                    className="settings-primary-button"
                    disabled={saving || Boolean(portfolioJsonError)}
                    onClick={() => { void save() }}
                  >
                    <Save size={14} />
                    {saving ? '保存中…' : '保存作品集'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}
