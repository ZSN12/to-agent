import { FormEvent, useEffect, useState } from 'react'
import { Check, Plus, Shield, ShieldAlert, ShieldCheck, Trash2, X } from 'lucide-react'
import type { PermissionMode, PermissionRule } from '../../shared/app-api'

function AddRuleModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (rule: Omit<PermissionRule, 'id' | 'createdAt'>) => Promise<boolean>
}) {
  const [tool, setTool] = useState('bash')
  const [type, setType] = useState<'command' | 'path' | 'tool'>('command')
  const [pattern, setPattern] = useState('')
  const [decision, setDecision] = useState<'allow' | 'deny'>('allow')
  const [scope, setScope] = useState<'workspace' | 'global'>('workspace')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmedPattern = pattern.trim()
    if (!trimmedPattern && type !== 'tool') {
      setError('匹配模式不能为空 (支持 * 通配符)')
      return
    }

    setSaving(true)
    const success = await onSave({
      tool: tool.trim(),
      type,
      pattern: trimmedPattern || '*',
      decision,
      scope,
      description: description.trim(),
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
      <form className="model-editor" onSubmit={handleSubmit} style={{ maxWidth: 540 }}>
        <h2>添加细粒度权限规则</h2>
        <p>配置安全白名单或阻止名单。匹配到拒绝规则时将强制拦截，匹配到允许规则时将免确认执行。</p>

        {error && <div className="settings-error-banner">{error}</div>}

        <label>
          规则工具
          <select
            value={tool}
            onChange={(e) => {
              const val = e.target.value
              setTool(val)
              if (val === 'bash') setType('command')
              else if (['read', 'write', 'edit'].includes(val)) setType('path')
              else setType('tool')
            }}
          >
            <option value="bash">终端命令 (bash)</option>
            <option value="write">写入文件 (write)</option>
            <option value="edit">编辑文件 (edit)</option>
            <option value="read">读取文件 (read)</option>
            <option value="*">所有工具 (*)</option>
          </select>
        </label>

        <label>
          规则类型
          <select value={type} onChange={(e) => setType(e.target.value as any)}>
            <option value="command">命令行匹配 (支持通配符 *)</option>
            <option value="path">文件路径模式 (如 *.env*, dist/**)</option>
            <option value="tool">整个工具</option>
          </select>
        </label>

        {type !== 'tool' && (
          <label>
            匹配表达式
            <input
              type="text"
              placeholder={type === 'command' ? '例如: npm test*, git status, pytest*' : '例如: *.env*, .git/**, build/**'}
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              required
            />
          </label>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 6 }}>
          <label>
            执行决策
            <select value={decision} onChange={(e) => setDecision(e.target.value as any)}>
              <option value="allow">始终允许 (免确认放行)</option>
              <option value="deny">始终拒绝 (强制阻断)</option>
            </select>
          </label>

          <label>
            生效范围
            <select value={scope} onChange={(e) => setScope(e.target.value as any)}>
              <option value="workspace">当前工作区专属</option>
              <option value="global">全局生效</option>
            </select>
          </label>
        </div>

        <label style={{ marginTop: 6 }}>
          规则说明 / 备注 (可选)
          <input
            type="text"
            placeholder="例如: 允许执行自动化测试"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="model-editor-actions" style={{ marginTop: 18 }}>
          <button type="button" className="settings-secondary-button" onClick={onClose}>
            取消
          </button>
          <button className="settings-primary-button" disabled={saving}>
            {saving ? '正在添加…' : '添加规则'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function PermissionSettingsPanel({
  currentMode = 'ask',
  onModeChange,
  onToast,
}: {
  currentMode?: PermissionMode
  onModeChange?: (mode: PermissionMode) => void
  onToast?: (msg: string) => void
}) {
  const [mode, setMode] = useState<PermissionMode>(currentMode)
  const [rules, setRules] = useState<PermissionRule[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const loadRules = async () => {
    if (!window.taskweaver?.permission) {
      setLoading(false)
      return
    }
    const res = await window.taskweaver.permission.listRules()
    if (res.ok && res.data) {
      setRules(res.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadRules()
  }, [])

  const handleModeSelect = async (nextMode: PermissionMode) => {
    setMode(nextMode)
    onModeChange?.(nextMode)
    if (window.taskweaver?.app) {
      await window.taskweaver.app.setPermissionMode(nextMode)
      onToast?.(
        nextMode === 'ask'
          ? '已切换为严格询问模式 (默认)'
          : nextMode === 'on-risk'
            ? '已切换为高风险拦截模式'
            : '已切换为完全放行模式',
      )
    }
  }

  const handleAddRule = async (rule: Omit<PermissionRule, 'id' | 'createdAt'>): Promise<boolean> => {
    if (!window.taskweaver?.permission) return false
    const res = await window.taskweaver.permission.addRule(rule)
    if (res.ok) {
      await loadRules()
      onToast?.(`已添加规则 [${rule.pattern}]`)
      return true
    } else {
      onToast?.(`添加失败: ${res.error || '未知错误'}`)
      return false
    }
  }

  const handleRemoveRule = async (id: string, pattern: string) => {
    if (!window.taskweaver?.permission) return
    const res = await window.taskweaver.permission.removeRule(id)
    if (res.ok) {
      await loadRules()
      onToast?.(`已移除规则 [${pattern}]`)
    }
  }

  const handleClearWorkspaceRules = async () => {
    if (!window.taskweaver?.permission) return
    if (!window.confirm('确定要清空当前工作区的全部权限规则吗？')) return
    const res = await window.taskweaver.permission.clearRules({ workspaceOnly: true })
    if (res.ok) {
      await loadRules()
      onToast?.('当前工作区规则已清空。')
    }
  }

  return (
    <section className="model-settings">
      <div className="model-settings-header">
        <div>
          <h2>安全策略与权限控制</h2>
          <p>控制 TaskWeaver 在执行终端命令、文件改动与调用外部工具时的安全门禁与确认策略。</p>
        </div>
      </div>

      {/* 三档模式选择卡片 */}
      <div style={{ marginTop: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>全局权限模式</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div
            onClick={() => handleModeSelect('ask')}
            style={{
              padding: 14,
              borderRadius: 8,
              border: `1.5px solid ${mode === 'ask' ? 'var(--accent-primary, #3b82f6)' : 'var(--border-color, #e5e7eb)'}`,
              background: mode === 'ask' ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
                <Shield size={16} color="#3b82f6" />
                严格询问 (默认)
              </div>
              {mode === 'ask' && <Check size={16} color="#3b82f6" />}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '6px 0 0 0', lineHeight: 1.4 }}>
              运行任何终端命令、外部 MCP 工具或读写工作区以外的文件前，均弹窗征求用户同意。
            </p>
          </div>

          <div
            onClick={() => handleModeSelect('on-risk')}
            style={{
              padding: 14,
              borderRadius: 8,
              border: `1.5px solid ${mode === 'on-risk' ? 'var(--accent-primary, #3b82f6)' : 'var(--border-color, #e5e7eb)'}`,
              background: mode === 'on-risk' ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
                <ShieldAlert size={16} color="#f59e0b" />
                高风险拦截
              </div>
              {mode === 'on-risk' && <Check size={16} color="#3b82f6" />}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '6px 0 0 0', lineHeight: 1.4 }}>
              自动放行安全的编译、查询等只读与常规命令；仅对删除、特权提升、联网或工作区越界时弹窗确认。
            </p>
          </div>

          <div
            onClick={() => handleModeSelect('full')}
            style={{
              padding: 14,
              borderRadius: 8,
              border: `1.5px solid ${mode === 'full' ? 'var(--accent-primary, #3b82f6)' : 'var(--border-color, #e5e7eb)'}`,
              background: mode === 'full' ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
                <ShieldCheck size={16} color="#22c55e" />
                完全放行
              </div>
              {mode === 'full' && <Check size={16} color="#3b82f6" />}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '6px 0 0 0', lineHeight: 1.4 }}>
              不对常规工具调用弹窗。注：显式配置的 Deny 安全阻止规则仍将无条件严格拦截。
            </p>
          </div>
        </div>
      </div>

      {/* 细粒度规则列表 */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>细粒度规则列表</h3>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              已配置 {rules.length} 条规则 · 拒绝规则优先级最高
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {rules.some((r) => r.scope === 'workspace') && (
              <button
                type="button"
                className="settings-secondary-button"
                onClick={handleClearWorkspaceRules}
                style={{ fontSize: 12 }}
              >
                清空工作区规则
              </button>
            )}
            <button
              type="button"
              className="settings-primary-button"
              onClick={() => setModalOpen(true)}
            >
              <Plus size={14} />
              添加规则
            </button>
          </div>
        </div>

        <div className="provider-list model-catalog-list">
          {rules.length === 0 && !loading ? (
            <p className="settings-list-empty">
              尚未添加细粒度规则。点击右上角“添加规则”，或在操作确认弹窗中选择“总是允许”进行持久化。
            </p>
          ) : (
            rules.map((rule) => {
              const isAllow = rule.decision === 'allow'
              return (
                <article className="provider-row" key={rule.id}>
                  <div className="provider-identity" style={{ flex: 1 }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        backgroundColor: isAllow ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: isAllow ? '#22c55e' : '#ef4444',
                      }}
                    >
                      {isAllow ? 'ALLOW' : 'DENY'}
                    </span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{rule.pattern}</strong>
                        <span
                          style={{
                            fontSize: 10,
                            padding: '1px 5px',
                            borderRadius: 3,
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {rule.scope === 'workspace' ? '工作区专属' : '全局'}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, display: 'block' }}>
                        工具: {rule.tool} · 类型: {rule.type === 'command' ? '命令' : rule.type === 'path' ? '路径' : '工具'}
                        {rule.description ? ` · ${rule.description}` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="provider-actions">
                    <button
                      type="button"
                      className="settings-danger-button"
                      onClick={() => handleRemoveRule(rule.id, rule.pattern)}
                      title="移除此规则"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              )
            })
          )}
        </div>
      </div>

      <div className="settings-footnote" style={{ marginTop: 24 }}>
        <ShieldCheck size={15} />
        <span>
          规则优先级机制：Deny 拒绝规则优先于 Allow 允许规则；命中显式规则时跳过弹窗直接执行判定；未命中时回退到全局三档模式。
        </span>
      </div>

      {modalOpen && (
        <AddRuleModal
          onClose={() => setModalOpen(false)}
          onSave={handleAddRule}
        />
      )}
    </section>
  )
}
