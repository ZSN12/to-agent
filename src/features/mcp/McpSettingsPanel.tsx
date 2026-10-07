import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  FolderOpen,
  Github,
  Globe,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import type { McpCatalogEntry, McpDshRuntimeBinding, McpServerConfig, McpServerStatus } from '../../shared/app-api'

interface EnvEntry {
  key: string
  value: string
}

const TEMPLATE_ICONS: Record<string, typeof Cpu> = {
  filesystem: FolderOpen,
  fetch: Globe,
  memory: Database,
  github: Github,
  'brave-search': Search,
  postgres: Database,
}

function templateLaunchLine(entry: McpCatalogEntry) {
  return `${entry.command} ${entry.args.join(' ')}`
}

function McpServerModal({
  editing,
  dshWired,
  onClose,
  onSave,
}: {
  editing: McpServerStatus | null
  dshWired: boolean
  onClose: () => void
  onSave: (config: McpServerConfig) => Promise<boolean>
}) {
  const [id, setId] = useState(editing?.id ?? '')
  const [command, setCommand] = useState(editing?.command ?? '')
  const [argsText, setArgsText] = useState(editing?.args?.join(' ') ?? '')
  const [enabled, setEnabled] = useState(editing ? editing.enabled : false)
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>(() => {
    if (!editing) return []
    return editing.envKeys.map((k) => ({ key: k, value: '' }))
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddEnv = () => {
    setEnvEntries((prev) => [...prev, { key: '', value: '' }])
  }

  const handleRemoveEnv = (index: number) => {
    setEnvEntries((prev) => prev.filter((_, i) => i !== index))
  }

  const handleEnvChange = (index: number, field: 'key' | 'value', val: string) => {
    setEnvEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: val } : entry)),
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmedId = id.trim()
    const trimmedCommand = command.trim()
    if (!trimmedId) {
      setError('服务 ID 不能为空')
      return
    }
    if (!/^[a-z][a-z0-9_-]{0,39}$/.test(trimmedId)) {
      setError('服务 ID 只能由小写字母、数字、短横杠和下划线组成，且以字母开头')
      return
    }
    if (!trimmedCommand) {
      setError('启动命令不能为空')
      return
    }

    const parsedArgs = argsText
      .trim()
      .split(/\s+/)
      .filter((s) => s.length > 0)

    const envMap: Record<string, string> = {}
    for (const entry of envEntries) {
      const k = entry.key.trim()
      if (k) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
          setError(`环境变量名 "${k}" 无效，只能包含字母、数字和下划线`)
          return
        }
        envMap[k] = entry.value
      }
    }

    setSaving(true)
    const success = await onSave({
      id: trimmedId,
      command: trimmedCommand,
      args: parsedArgs,
      env: envMap,
      enabled,
    })
    setSaving(false)
    if (success) {
      onClose()
    }
  }

  return (
    <div
      className="settings-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <form className="model-editor" onSubmit={handleSubmit} style={{ maxWidth: 580 }}>
        <h2>{editing ? '编辑 MCP 服务' : '添加 MCP 服务'}</h2>
        <p>通过 Stdio 连接 MCP 服务器；启用后 Agent 可调用其暴露的工具（需本机已安装 Node / npx）。</p>

        {error && <div className="settings-error-banner">{error}</div>}

        <label>
          服务 ID
          <input
            type="text"
            placeholder="例如: github, memory, fetch"
            value={id}
            disabled={!!editing}
            onChange={(e) => setId(e.target.value)}
            required
          />
        </label>

        <label>
          启动命令 (可执行程序)
          <input
            type="text"
            placeholder="例如: npx, uvx, node, python3"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            required
          />
        </label>

        <label>
          参数列表 (空格分隔)
          <input
            type="text"
            placeholder="例如: -y @modelcontextprotocol/server-github"
            value={argsText}
            onChange={(e) => setArgsText(e.target.value)}
          />
        </label>

        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>环境变量 (敏感 Token 经本地安全存储加密保护)</span>
            <button
              type="button"
              className="settings-secondary-button"
              style={{ padding: '3px 8px', fontSize: 12 }}
              onClick={handleAddEnv}
            >
              <Plus size={13} />
              添加变量
            </button>
          </div>
          {envEntries.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '6px 0' }}>无环境变量</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {envEntries.map((entry, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="KEY (如 GITHUB_TOKEN)"
                    value={entry.key}
                    onChange={(e) => handleEnvChange(idx, 'key', e.target.value)}
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <input
                    type="password"
                    placeholder="VALUE (留空保留原值)"
                    value={entry.value}
                    onChange={(e) => handleEnvChange(idx, 'value', e.target.value)}
                    style={{ flex: 1.5, fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <button
                    type="button"
                    className="settings-danger-button"
                    style={{ padding: 6 }}
                    onClick={() => handleRemoveEnv(idx)}
                    title="移除此项"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="mcp-enabled-checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={!dshWired}
            style={{ width: 'auto', cursor: 'pointer' }}
          />
          <label htmlFor="mcp-enabled-checkbox" style={{ margin: 0, cursor: 'pointer', fontSize: 13 }}>
            {dshWired ? '保存后重载 Z Host 并向 Agent 提供工具' : 'Agent 工具接入不可用'}
          </label>
        </div>

        <div className="model-editor-actions" style={{ marginTop: 18 }}>
          <button type="button" className="settings-secondary-button" onClick={onClose}>
            取消
          </button>
          <button className="settings-primary-button" disabled={saving}>
            {saving ? '正在保存…' : '保存配置'}
          </button>
        </div>
      </form>
    </div>
  )
}

function statusPillClass(status: McpServerStatus['status']) {
  if (status === 'connected') return 'mcp-status-pill connected'
  if (status === 'connecting') return 'mcp-status-pill connecting'
  if (status === 'error') return 'mcp-status-pill error'
  return 'mcp-status-pill idle'
}

function statusPillLabel(server: McpServerStatus, dshWired: boolean) {
  if (!dshWired && server.status === 'connected') return `已探测连接 · ${server.toolCount} 个工具暂不可供 Agent 使用`
  if (server.status === 'connected') return `设置探测成功 · ${server.toolCount} 个工具`
  if (server.status === 'connecting') return '正在探测…'
  if (server.status === 'error') return '探测失败'
  if (!dshWired) return server.enabled ? '已保存启用意向 · Agent 尚不可用' : '已保存 · Agent 尚不可用'
  return server.enabled ? '已启用 · 尚未探测' : '已停用'
}

export function McpSettingsPanel({ onToast }: { onToast?: (msg: string) => void }) {
  const [servers, setServers] = useState<McpServerStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServerStatus | null>(null)
  const [catalog, setCatalog] = useState<McpCatalogEntry[]>([])
  const [templateQuery, setTemplateQuery] = useState('')
  const [templatesOpen, setTemplatesOpen] = useState(true)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [runtimeBinding, setRuntimeBinding] = useState<McpDshRuntimeBinding | null>(null)

  const installedIds = useMemo(() => new Set(servers.map((s) => s.id)), [servers])
  const dshWired = runtimeBinding?.dshWired === true
  const probeConnectedCount = useMemo(() => servers.filter((s) => s.status === 'connected').length, [servers])

  const filteredCatalog = useMemo(() => {
    const q = templateQuery.trim().toLowerCase()
    if (!q) return catalog
    return catalog.filter(
      (e) =>
        e.id.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q),
    )
  }, [catalog, templateQuery])

  const loadServers = async () => {
    if (!window.taskweaver?.mcp) {
      setLoading(false)
      return
    }
    const res = await window.taskweaver.mcp.list()
    if (res.ok && res.data) {
      setServers(res.data)
      if (res.data.length === 0 || res.data.every((s) => s.status !== 'connected')) {
        setTemplatesOpen(true)
      } else {
        setTemplatesOpen(false)
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadServers()
    void window.taskweaver?.mcp?.getRuntimeBinding?.().then((res) => {
      if (res?.ok && res.data) setRuntimeBinding(res.data)
    })
    void window.taskweaver?.mcp?.marketplace?.().then((res) => {
      if (res?.ok && res.data) {
        if (res.data.entries?.length) setCatalog(res.data.entries.filter((entry) => entry.id !== 'github'))
      }
    })
  }, [])

  const openNewFromTemplate = (entry: McpCatalogEntry) => {
    setEditingServer({
      id: entry.id,
      transport: 'stdio',
      command: entry.command,
      args: entry.args,
      enabled: true,
      envKeys: entry.envKeys ?? [],
      status: 'disconnected',
      toolCount: 0,
      error: null,
    })
    setModalOpen(true)
  }

  const handleInstallCatalog = async (id: string) => {
    if (!window.taskweaver?.mcp?.installCatalog) return
    if (installedIds.has(id)) {
      const existing = servers.find((s) => s.id === id)
      if (existing) {
        setEditingServer(existing)
        setModalOpen(true)
      }
      return
    }
    setInstallingId(id)
    const res = await window.taskweaver.mcp.installCatalog(id)
    setInstallingId(null)
    if (res.ok) {
      await loadServers()
      onToast?.(`已添加 MCP：${id}，可在下方编辑路径或环境变量后重新探测。`)
    } else {
      onToast?.(`安装失败: ${res.error || '未知错误'}`)
    }
  }

  const copyLaunchLine = async (entry: McpCatalogEntry) => {
    const line = templateLaunchLine(entry)
    try {
      await navigator.clipboard.writeText(line)
      setCopiedId(entry.id)
      setTimeout(() => setCopiedId(null), 2000)
      onToast?.('已复制启动命令')
    } catch {
      onToast?.('复制失败')
    }
  }

  const handleRefresh = async () => {
    if (!window.taskweaver?.mcp) return
    setRefreshing(true)
    const res = await window.taskweaver.mcp.refresh()
    if (res.ok && res.data) {
      setServers(res.data)
      onToast?.('设置页 MCP 探测结果已更新。')
    } else {
      await loadServers()
      onToast?.('MCP 状态已更新。')
    }
    setRefreshing(false)
  }

  const handleSave = async (config: McpServerConfig): Promise<boolean> => {
    if (!window.taskweaver?.mcp) return false
    const res = await window.taskweaver.mcp.save(config)
    if (res.ok) {
      await loadServers()
      onToast?.(`MCP 服务 ${config.id} 已保存。`)
      return true
    }
    onToast?.(`保存失败: ${res.error || '未知错误'}`)
    return false
  }

  const handleToggleEnable = async (server: McpServerStatus) => {
    if (!window.taskweaver?.mcp) return
    const nextEnabled = !server.enabled
    const res = await window.taskweaver.mcp.setEnabled(server.id, nextEnabled)
    if (res.ok) {
      await loadServers()
      onToast?.(nextEnabled ? `已启用 ${server.id}` : `已停用 ${server.id}`)
    }
  }

  const handleDisconnect = async (id: string) => {
    if (!window.taskweaver?.mcp?.disconnect) return
    const res = await window.taskweaver.mcp.disconnect(id)
    if (res.ok) {
      await loadServers()
      onToast?.(`已断开 ${id}（配置保留）。`)
    } else {
      onToast?.(res.error ?? '断开失败')
    }
  }

  const handleRemove = async (id: string) => {
    if (!window.taskweaver?.mcp) return
    if (!window.confirm(`确定要移除 MCP 服务 "${id}" 吗？`)) return
    const res = await window.taskweaver.mcp.remove(id)
    if (res.ok) {
      await loadServers()
      onToast?.(`已移除 MCP 服务 ${id}。`)
    }
  }

  return (
    <section className="model-settings mcp-settings">
      <div className="model-settings-header">
        <div>
          <h2>MCP 服务</h2>
          <p className="mcp-settings-lead">
            管理外部 MCP 服务。设置页状态只表示这里探测到的服务与工具，不代表当前对话的 Z Host 已加载或模型已调用；请以对话中的实际工具调用记录为准。配置变更会重载运行时，运行中的任务无法变更。
          </p>
          {runtimeBinding && !runtimeBinding.dshWired && (
            <p className="settings-inline-error" style={{ marginTop: 8 }}>
              {runtimeBinding.executionNote}
            </p>
          )}
        </div>
        <div className="model-settings-header-actions">
          {dshWired && (
            <button
              type="button"
              className="settings-secondary-button"
              onClick={handleRefresh}
              disabled={loading || refreshing}
            >
              <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
              {refreshing ? '探测中…' : '重新探测'}
            </button>
          )}
          <button
            type="button"
            className="settings-primary-button"
            onClick={() => {
              setEditingServer(null)
              setModalOpen(true)
            }}
          >
            <Plus size={14} />
            添加 MCP 服务
          </button>
        </div>
      </div>

      <div className="mcp-section">
        <div className="mcp-section-header">
          <div>
            <h3>已配置的服务</h3>
            <p>
              {loading
                ? '正在加载…'
                : dshWired
                  ? `${servers.length} 个配置 · ${probeConnectedCount} 个设置探测可用`
                  : `${servers.length} 个配置（Agent 工具接入不可用）`}
            </p>
          </div>
        </div>

        <div className="provider-list model-catalog-list">
          {loading ? (
            <p className="settings-list-empty">加载 MCP 配置…</p>
          ) : servers.length === 0 ? (
            <p className="settings-list-empty">
              尚未添加 MCP 服务。你可以从下方模板开始，或添加自定义服务配置。
            </p>
          ) : (
            servers.map((server) => (
              <article className="provider-row" key={server.id} style={{ alignItems: 'flex-start' }}>
                <div className="provider-identity" style={{ flex: 1 }}>
                  <span className="provider-logo">
                    <Cpu size={18} />
                  </span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong>{server.id}</strong>
                      <span className={statusPillClass(server.status)}>
                        {statusPillLabel(server, dshWired)}
                      </span>
                    </div>
                    <code className="mcp-server-command">
                      {server.transport === 'http' ? server.url : `${server.command} ${server.args.join(' ')}`}
                    </code>
                    {server.envKeys.length > 0 && (
                      <div className="mcp-template-tags" style={{ marginTop: 8 }}>
                        {server.envKeys.map((k) => (
                          <span key={k} className="mcp-template-tag">
                            <KeyRound size={9} style={{ display: 'inline', marginRight: 3, verticalAlign: -1 }} />
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                    {server.status === 'error' && server.error && (
                      <div className="mcp-server-error">{server.error}</div>
                    )}
                  </div>
                </div>

                <div className="provider-actions" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="settings-secondary-button"
                    onClick={() => handleToggleEnable(server)}
                    disabled={!dshWired}
                    title={!dshWired ? 'MCP Agent 工具接入不可用' : '变更会重载 Z Host；运行中的任务期间不可操作'}
                    style={{ minWidth: 64 }}
                  >
                    {dshWired ? (server.enabled ? '停用' : '启用') : '不可用'}
                  </button>
                  {server.status === 'connected' && (
                    <button
                      type="button"
                      className="settings-secondary-button"
                      onClick={() => { void handleDisconnect(server.id) }}
                      title="断开连接但保留配置"
                    >
                      断开
                    </button>
                  )}
                  {server.transport !== 'http' && (
                    <button
                      type="button"
                      className="settings-secondary-button"
                      onClick={() => {
                        setEditingServer(server)
                        setModalOpen(true)
                      }}
                      title="编辑配置"
                    >
                      <Pencil size={14} />
                      编辑
                    </button>
                  )}
                  <button
                    type="button"
                    className="settings-danger-button"
                    onClick={() => handleRemove(server.id)}
                    title="移除服务"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      {dshWired && catalog.length > 0 && (
        <div className="mcp-section">
          <div className="mcp-section-header">
            <div>
              <h3>推荐模板</h3>
              <p>来自应用内置目录（非在线市场），基于 @modelcontextprotocol 官方服务器包。</p>
            </div>
            <button
              type="button"
              className={`mcp-collapse-toggle ${templatesOpen ? 'is-open' : ''}`}
              onClick={() => setTemplatesOpen((v) => !v)}
              aria-expanded={templatesOpen}
            >
              {templatesOpen ? '收起' : '展开'}
              <ChevronDown size={14} />
            </button>
          </div>

          {templatesOpen && (
            <>
              <div className="model-settings-toolbar">
                <input
                  type="search"
                  placeholder="筛选模板（名称、说明）…"
                  value={templateQuery}
                  onChange={(e) => setTemplateQuery(e.target.value)}
                  aria-label="筛选 MCP 模板"
                />
                <span className="model-list-count">{filteredCatalog.length} / {catalog.length}</span>
              </div>

              <ul className="mcp-template-grid">
                {filteredCatalog.map((entry) => {
                  const Icon = TEMPLATE_ICONS[entry.id] ?? Cpu
                  const installed = installedIds.has(entry.id)
                  const busy = installingId === entry.id
                  return (
                    <li
                      key={entry.id}
                      className={`mcp-template-card ${installed ? 'is-installed' : ''}`}
                    >
                      <div className="mcp-template-card-top">
                        <span className="mcp-template-icon" aria-hidden>
                          <Icon size={17} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <h4>{entry.title}</h4>
                          <p>{entry.description}</p>
                        </div>
                      </div>
                      {entry.envKeys && entry.envKeys.length > 0 && (
                        <div className="mcp-template-tags">
                          {entry.envKeys.map((k) => (
                            <span key={k} className="mcp-template-tag">需要 {k}</span>
                          ))}
                        </div>
                      )}
                      <code className="mcp-template-command">{templateLaunchLine(entry)}</code>
                      <div className="mcp-template-actions">
                        <button
                          type="button"
                          className={installed ? 'settings-secondary-button' : 'settings-primary-button'}
                          disabled={busy}
                          onClick={() => { void handleInstallCatalog(entry.id) }}
                        >
                          {busy ? '添加中…' : installed ? (
                            <>
                              <Check size={13} /> 已添加 · 配置
                            </>
                          ) : (
                            '一键添加'
                          )}
                        </button>
                        <button
                          type="button"
                          className="settings-secondary-button"
                          onClick={() => openNewFromTemplate(entry)}
                        >
                          自定义
                        </button>
                        <button
                          type="button"
                          className="settings-secondary-button"
                          title="复制启动命令"
                          onClick={() => { void copyLaunchLine(entry) }}
                        >
                          {copiedId === entry.id ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                        {entry.docsUrl && (
                          <a
                            className="settings-secondary-button"
                            href={entry.docsUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="打开文档"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {filteredCatalog.length === 0 && (
                <p className="settings-list-empty">没有匹配的模板。</p>
              )}
            </>
          )}
        </div>
      )}

      <div className="settings-footnote">
        <ShieldCheck size={15} />
        <span>
          Stdio 桥接 MCP；环境变量经系统 safeStorage 加密存储。调用外部工具时仍受全局权限与批准策略约束。
        </span>
      </div>

      {modalOpen && (
        <McpServerModal
          editing={editingServer}
          dshWired={dshWired}
          onClose={() => {
            setModalOpen(false)
            setEditingServer(null)
          }}
          onSave={handleSave}
        />
      )}
    </section>
  )
}
