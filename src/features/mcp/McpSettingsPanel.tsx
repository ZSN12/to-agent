import { FormEvent, useEffect, useState } from 'react'
import { Check, Cpu, ExternalLink, KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react'
import type { McpServerConfig, McpServerStatus } from '../../shared/app-api'

interface EnvEntry {
  key: string
  value: string
}

function McpServerModal({
  editing,
  onClose,
  onSave,
}: {
  editing: McpServerStatus | null
  onClose: () => void
  onSave: (config: McpServerConfig) => Promise<boolean>
}) {
  const [id, setId] = useState(editing?.id ?? '')
  const [command, setCommand] = useState(editing?.command ?? '')
  const [argsText, setArgsText] = useState(editing?.args?.join(' ') ?? '')
  const [enabled, setEnabled] = useState(editing ? editing.enabled : true)
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

    // 解析 args，支持以空格分割，同时保留字符串
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
        <p>通过 Stdio 协议连接标准 MCP 工具服务器，赋能 TaskWeaver 动态工具调用。</p>

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
            style={{ width: 'auto', cursor: 'pointer' }}
          />
          <label htmlFor="mcp-enabled-checkbox" style={{ margin: 0, cursor: 'pointer', fontSize: 13 }}>
            配置完成后立即启用该服务
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

export function McpSettingsPanel({ onToast }: { onToast?: (msg: string) => void }) {
  const [servers, setServers] = useState<McpServerStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServerStatus | null>(null)

  const loadServers = async () => {
    if (!window.taskweaver?.mcp) {
      setLoading(false)
      return
    }
    const res = await window.taskweaver.mcp.list()
    if (res.ok && res.data) {
      setServers(res.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadServers()
  }, [])

  const handleRefresh = async () => {
    if (!window.taskweaver?.mcp) return
    setRefreshing(true)
    const res = await window.taskweaver.mcp.refresh()
    if (res.ok && res.data) {
      setServers(res.data)
      onToast?.('MCP 工具列表与状态已刷新。')
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
    } else {
      onToast?.(`保存失败: ${res.error || '未知错误'}`)
      return false
    }
  }

  const handleToggleEnable = async (server: McpServerStatus) => {
    if (!window.taskweaver?.mcp) return
    const nextEnabled = !server.enabled
    const res = await window.taskweaver.mcp.save({
      id: server.id,
      command: server.command,
      args: server.args,
      enabled: nextEnabled,
    })
    if (res.ok) {
      await loadServers()
      onToast?.(nextEnabled ? `已启用 ${server.id}` : `已停用 ${server.id}`)
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
    <section className="model-settings">
      <div className="model-settings-header">
        <div>
          <h2>Model Context Protocol (MCP) 服务</h2>
          <p>接入外部工具生态。开启的服务将在 Agent 编排与对话时自动桥接可用工具。</p>
        </div>
        <div className="model-settings-header-actions">
          <button
            type="button"
            className="settings-secondary-button"
            onClick={handleRefresh}
            disabled={loading || refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
            {refreshing ? '正在连接…' : '刷新连接'}
          </button>
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

      <div className="model-settings-toolbar">
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          已配置 {servers.length} 个服务 ·{' '}
          {servers.filter((s) => s.status === 'connected').length} 个已连接
        </span>
      </div>

      <div className="provider-list model-catalog-list">
        {servers.length === 0 && !loading ? (
          <p className="settings-list-empty">
            尚未配置任何 MCP 服务。点击右上角“添加 MCP 服务”接入 Stdio 工具总线。
          </p>
        ) : (
          servers.map((server) => {
            const isConnected = server.status === 'connected'
            const isConnecting = server.status === 'connecting'
            const isError = server.status === 'error'

            return (
              <article className="provider-row" key={server.id} style={{ alignItems: 'flex-start' }}>
                <div className="provider-identity" style={{ flex: 1 }}>
                  <span className="provider-logo">
                    <Cpu size={18} />
                  </span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong>{server.id}</strong>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 6px',
                          borderRadius: 4,
                          backgroundColor: isConnected
                            ? 'rgba(34, 197, 94, 0.15)'
                            : isError
                              ? 'rgba(239, 68, 68, 0.15)'
                              : isConnecting
                                ? 'rgba(59, 130, 246, 0.15)'
                                : 'var(--bg-secondary)',
                          color: isConnected
                            ? '#22c55e'
                            : isError
                              ? '#ef4444'
                              : isConnecting
                                ? '#3b82f6'
                                : 'var(--text-tertiary)',
                          fontWeight: 500,
                        }}
                      >
                        {isConnected
                          ? `已连接 · ${server.toolCount} 个工具`
                          : isConnecting
                            ? '正在连接…'
                            : isError
                              ? '连接异常'
                              : server.enabled
                                ? '等待触发'
                                : '未启用'}
                      </span>
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 4, display: 'block' }}>
                      {server.command} {server.args.join(' ')}
                    </span>
                    {server.envKeys.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                        {server.envKeys.map((k) => (
                          <span
                            key={k}
                            style={{
                              fontSize: 10,
                              background: 'var(--bg-secondary)',
                              padding: '1px 5px',
                              borderRadius: 3,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <KeyRound size={9} style={{ display: 'inline', marginRight: 3 }} />
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                    {isError && server.error && (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 11,
                          color: '#ef4444',
                          background: 'rgba(239, 68, 68, 0.08)',
                          padding: '4px 8px',
                          borderRadius: 4,
                        }}
                      >
                        {server.error}
                      </div>
                    )}
                  </div>
                </div>

                <div className="provider-actions" style={{ alignItems: 'center' }}>
                  <button
                    type="button"
                    className="settings-secondary-button"
                    onClick={() => handleToggleEnable(server)}
                    style={{ minWidth: 64 }}
                  >
                    {server.enabled ? '停用' : '启用'}
                  </button>
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
            )
          })
        )}
      </div>

      <div className="settings-footnote">
        <ShieldCheck size={15} />
        <span>
          TaskWeaver 基于 Stdio 协议原生桥接 MCP。敏感环境变量均使用系统 safeStorage 加密持久化；调用 MCP 工具遵循全局与细粒度权限策略。
        </span>
      </div>

      {modalOpen && (
        <McpServerModal
          editing={editingServer}
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
