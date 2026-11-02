import { FormEvent, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, Plus, Shield, ShieldCheck, Trash2 } from 'lucide-react'
import type { ApprovalAuditEntry, PermissionMode, PermissionRule } from '../../shared/app-api'
import { SettingsLayout } from '../settings/SettingsLayout'
import './permission-settings-panel.css'

const PROMPT_INJECTION_LIMIT_MIN_KIB = 1
const PROMPT_INJECTION_LIMIT_MAX_KIB = 128
const PROMPT_INJECTION_LIMIT_DEFAULT_KIB = 128

function PermissionModeCard({
  active,
  icon,
  label,
  description,
  onSelect,
}: {
  active: boolean
  icon: ReactNode
  label: string
  description: ReactNode
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={`permission-mode-card ${active ? 'is-active' : ''}`}
    >
      <span className="permission-mode-card-head">
        <span className="permission-mode-card-title">
          {icon}
          {label}
        </span>
        {active && <Check size={16} className="permission-mode-check" aria-hidden="true" />}
      </span>
      <span className="permission-mode-card-description">
        {description}
      </span>
    </button>
  )
}

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
  const [allowWildcards, setAllowWildcards] = useState(false)
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
      setError('匹配模式不能为空')
      return
    }

    setSaving(true)
    const success = await onSave({
      tool: tool.trim(),
      type,
      pattern: trimmedPattern || '*',
      ...(type === 'command' && allowWildcards ? { allowWildcards: true } : {}),
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
      <form className="model-editor permission-rule-editor" onSubmit={handleSubmit}>
        <h2>添加细粒度权限规则</h2>
        <p>配置安全白名单或阻止名单。命令默认按完整文本匹配；只有显式开启通配时，命令中的 * 才匹配任意字符。路径规则仍支持通配。</p>

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
            <option value="command">命令行匹配 (默认精确匹配)</option>
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

        {type === 'command' && (
          <label className="settings-checkbox-row">
            <input type="checkbox" checked={allowWildcards} onChange={(e) => setAllowWildcards(e.target.checked)} />
            允许命令中的 * 作为通配符
          </label>
        )}

        <div className="permission-rule-decision-grid">
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

        <label className="permission-rule-note">
          规则说明 / 备注 (可选)
          <input
            type="text"
            placeholder="例如: 允许执行自动化测试"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="model-editor-actions permission-rule-actions">
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
  onPreferMultiAgentChange,
  onToast,
  conversationId = null,
}: {
  currentMode?: PermissionMode
  onModeChange?: (mode: PermissionMode) => void
  onPreferMultiAgentChange?: (enabled: boolean) => void
  onToast?: (msg: string) => void
  conversationId?: string | null
}) {
  const [mode, setMode] = useState<PermissionMode>(currentMode)
  const [rules, setRules] = useState<PermissionRule[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [autoReviewReads, setAutoReviewReads] = useState(true)
  const [autoAllowUiVerify, setAutoAllowUiVerify] = useState(false)
  const [autoVerifyAfterMutation, setAutoVerifyAfterMutation] = useState(false)
  const [promptInjectionLimitKiB, setPromptInjectionLimitKiB] = useState(String(PROMPT_INJECTION_LIMIT_DEFAULT_KIB))
  const [savedPromptInjectionLimitKiB, setSavedPromptInjectionLimitKiB] = useState(PROMPT_INJECTION_LIMIT_DEFAULT_KIB)
  const [preferMultiAgent, setPreferMultiAgent] = useState(false)
  const [preferDshTranscript, setPreferDshTranscript] = useState(true)
  const [approvalAudit, setApprovalAudit] = useState<ApprovalAuditEntry[]>([])

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
    void window.taskweaver?.preferences?.get?.().then((res) => {
      if (res?.ok && res.data) {
        setAutoReviewReads(res.data.autoReviewReads !== false)
        setAutoAllowUiVerify(res.data.autoAllowUiVerify === true)
        setAutoVerifyAfterMutation(res.data.autoVerifyAfterMutation === true)
        const limitKiB = Number.isFinite(res.data.promptInjectionLimitBytes)
          ? Math.round((res.data.promptInjectionLimitBytes ?? PROMPT_INJECTION_LIMIT_DEFAULT_KIB * 1024) / 1024)
          : PROMPT_INJECTION_LIMIT_DEFAULT_KIB
        const boundedLimitKiB = Math.max(PROMPT_INJECTION_LIMIT_MIN_KIB, Math.min(PROMPT_INJECTION_LIMIT_MAX_KIB, limitKiB))
        setPromptInjectionLimitKiB(String(boundedLimitKiB))
        setSavedPromptInjectionLimitKiB(boundedLimitKiB)
        setPreferMultiAgent(res.data.preferMultiAgent === true)
        setPreferDshTranscript(res.data.preferDshTranscript !== false)
      }
    })
  }, [])

  useEffect(() => {
    if (!conversationId || !window.taskweaver?.permission?.listApprovalAudit) {
      setApprovalAudit([])
      return
    }
    void window.taskweaver.permission.listApprovalAudit(conversationId).then((res) => {
      if (res?.ok && res.data) setApprovalAudit(res.data)
      else setApprovalAudit([])
    })
  }, [conversationId])

  const handlePreferDshTranscript = async (enabled: boolean) => {
    setPreferDshTranscript(enabled)
    const res = await window.taskweaver?.preferences?.set?.({ preferDshTranscript: enabled })
    if (!res?.ok) {
      onToast?.(res?.error || '保存失败')
      return
    }
    onToast?.(enabled ? '已开启：聊天列表以本机运行时会话为准' : '已关闭：聊天列表使用本地线程记录')
  }

  const handlePreferMultiAgent = async (enabled: boolean) => {
    setPreferMultiAgent(enabled)
    const res = await window.taskweaver?.preferences?.set?.({ preferMultiAgent: enabled })
    if (!res?.ok) {
      setPreferMultiAgent(!enabled)
      onToast?.(res?.error || '保存失败')
      return
    }
    onPreferMultiAgentChange?.(enabled)
    onToast?.(enabled ? '已开启：新会话的每条任务都会进入多 Agent 编排' : '已关闭：由主 Agent 按任务需要选择是否调用编排')
  }

  const applyInjectionPresetKiB = async (presetKiB: number) => {
    setPromptInjectionLimitKiB(String(presetKiB))
    const res = await window.taskweaver?.preferences?.set?.({ promptInjectionLimitBytes: presetKiB * 1024 })
    if (!res?.ok) {
      onToast?.(res?.error || '保存失败')
      return
    }
    setSavedPromptInjectionLimitKiB(presetKiB)
    onToast?.(`每轮系统上下文上限已设为 ${presetKiB} KiB`)
  }

  const handleAutoVerifyAfterMutation = async (enabled: boolean) => {
    setAutoVerifyAfterMutation(enabled)
    const res = await window.taskweaver?.preferences?.set?.({ autoVerifyAfterMutation: enabled })
    if (!res?.ok) {
      onToast?.(res?.error || '保存失败')
      return
    }
    onToast?.(enabled ? '已开启：修改请求将附带验证提示' : '已关闭：修改请求不再附带验证提示')
  }

  const handleAutoReviewReads = async (enabled: boolean) => {
    setAutoReviewReads(enabled)
    const res = await window.taskweaver?.preferences?.set?.({ autoReviewReads: enabled })
    if (!res?.ok) {
      onToast?.(res?.error || '保存失败')
      return
    }
    onToast?.(enabled ? '已开启：工作区内只读工具免确认' : '已关闭：只读工具也将弹窗确认')
  }

  const handleAutoAllowUiVerify = async (enabled: boolean) => {
    setAutoAllowUiVerify(enabled)
    const res = await window.taskweaver?.preferences?.set?.({ autoAllowUiVerify: enabled })
    if (!res?.ok) {
      onToast?.(res?.error || '保存失败')
      return
    }
    onToast?.(enabled ? '已开启：受信任工作区可自动启动隔离 UI 验证' : '已关闭：UI 验证首次启动需要审批')
  }

  const handlePromptInjectionLimitCommit = async () => {
    const parsedLimitKiB = Number(promptInjectionLimitKiB)
    const nextLimitKiB = Number.isFinite(parsedLimitKiB)
      ? Math.max(PROMPT_INJECTION_LIMIT_MIN_KIB, Math.min(PROMPT_INJECTION_LIMIT_MAX_KIB, Math.round(parsedLimitKiB)))
      : savedPromptInjectionLimitKiB
    setPromptInjectionLimitKiB(String(nextLimitKiB))
    if (nextLimitKiB === savedPromptInjectionLimitKiB) return

    const res = await window.taskweaver?.preferences?.set?.({ promptInjectionLimitBytes: nextLimitKiB * 1024 })
    if (!res?.ok) {
      setPromptInjectionLimitKiB(String(savedPromptInjectionLimitKiB))
      onToast?.(res?.error || '保存失败')
      return
    }
    setSavedPromptInjectionLimitKiB(nextLimitKiB)
    onToast?.(`每轮系统上下文上限已保存为 ${nextLimitKiB} KiB`)
  }

  const handleModeSelect = async (nextMode: PermissionMode) => {
    if (!window.taskweaver?.app) return
    try {
      const result = await window.taskweaver.app.setPermissionMode(nextMode)
      if (!result.ok) {
        onToast?.('权限设置保存失败，请重试。')
        return
      }
      setMode(nextMode)
      onModeChange?.(nextMode)
      onToast?.('权限偏好已保存；将在下一条消息时生效。')
    } catch {
      onToast?.('权限设置保存失败，请重试。')
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
    <SettingsLayout
      title="安全策略与权限控制"
      description="控制 TaskWeaver 在运行终端命令、修改文件和调用外部工具时的权限与确认方式。"
      className="model-settings permission-settings-panel"
    >

      {/* 三档模式选择卡片 */}
      <div className="permission-settings-mode-section">
        <h3 className="permission-settings-section-title">全局权限模式</h3>
        <div className="permission-mode-grid" role="group" aria-label="全局权限模式">
          <PermissionModeCard
            active={mode === 'readonly'}
            icon={<Shield size={16} className="permission-mode-icon is-readonly" aria-hidden="true" />}
            label="只读"
            description="只读模式：不允许通过工具修改文件，适合计划审阅和理解代码。"
            onSelect={() => handleModeSelect('readonly')}
          />
          <PermissionModeCard
            active={mode === 'ask' || mode === 'on-risk'}
            icon={<Shield size={16} className="permission-mode-icon is-workspace" aria-hidden="true" />}
            label="工作区可写 (默认)"
            description="工作区可写：允许修改当前工作区并运行命令；超出沙箱范围时需要审批。"
            onSelect={() => handleModeSelect('ask')}
          />
          <PermissionModeCard
            active={mode === 'full'}
            icon={<ShieldCheck size={16} className="permission-mode-icon is-full" aria-hidden="true" />}
            label="完全访问"
            description={(
              <>
                <span className="permission-description-line">完全访问会关闭文件与命令沙箱约束。仅在信任当前工作区时使用。</span>
                <span className="permission-description-line permission-description-secondary">
                  其他权限规则仍可能要求确认。设置会在下一次发送消息时应用；收到成功回执后才算生效。
                </span>
              </>
            )}
            onSelect={() => handleModeSelect('full')}
          />
        </div>
        <div className="permission-safety-note">
          <strong>安全边界说明：</strong>on-risk 为旧配置，与 ask 同为 workspace-write。工作区可写模式下，macOS Seatbelt 与 Linux bwrap 会阻止命令联网并保留本地 Unix 套接字；只读模式、Linux Landlock、Windows ACL 或未启用沙箱时不限制网络，联网请求按审批策略处理。
        </div>
        <label className="permission-option permission-option-spaced">
          <input
            type="checkbox"
            checked={autoReviewReads}
            onChange={(e) => { void handleAutoReviewReads(e.target.checked) }}
            className="permission-option-checkbox"
          />
          <span>
            <strong>自动放行工作区内只读工具</strong>
            <span className="permission-option-description">
              仅影响应用内只读工具的确认偏好；终端与文件沙箱仍由运行时策略控制。
            </span>
          </span>
        </label>
        <label className="permission-option">
          <input
            type="checkbox"
            checked={autoAllowUiVerify}
            onChange={(e) => { void handleAutoAllowUiVerify(e.target.checked) }}
            className="permission-option-checkbox"
          />
          <span>
            <strong>受信任工作区自动允许 UI 自验证</strong>
            <span className="permission-option-description">
              只对已信任的 TaskWeaver 工作区生效；关闭时每个会话首次启动隔离验证实例都需要批准。默认关闭。
            </span>
          </span>
        </label>
        <label className="permission-option">
          <input
            type="checkbox"
            checked={autoVerifyAfterMutation}
            onChange={(e) => { void handleAutoVerifyAfterMutation(e.target.checked) }}
            className="permission-option-checkbox"
          />
          <span>
            <strong>修改代码后提示运行验证</strong>
            <span className="permission-option-description">
              开启后，修改代码的请求会附带项目验证命令提示。
            </span>
          </span>
        </label>
        <div className="permission-limit-row">
          <label htmlFor="prompt-injection-limit-kib" className="permission-limit-description">
            <strong>每轮系统上下文上限</strong>
            <span className="permission-option-description">
              作为系统上下文注入上限，实际预算会随模型上下文窗口按比例缩放；默认上限 128 KiB，范围 1–128 KiB。
            </span>
          </label>
          <div className="permission-limit-input-row">
            <input
              id="prompt-injection-limit-kib"
              type="number"
              min={PROMPT_INJECTION_LIMIT_MIN_KIB}
              max={PROMPT_INJECTION_LIMIT_MAX_KIB}
              step={1}
              value={promptInjectionLimitKiB}
              onChange={(e) => setPromptInjectionLimitKiB(e.target.value)}
              onBlur={() => { void handlePromptInjectionLimitCommit() }}
              aria-label="每轮系统上下文上限，单位 KiB"
              className="permission-limit-input"
            />
            <span className="permission-limit-unit">KiB</span>
          </div>
        </div>
        <div className="permission-limit-presets">
          {([16, 32, 48] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              className={`${savedPromptInjectionLimitKiB === preset ? 'settings-primary-button' : 'settings-secondary-button'} permission-limit-preset`}
              onClick={() => { void applyInjectionPresetKiB(preset) }}
            >
              {preset} KiB{preset === 16 ? ' · 省钱' : preset === 32 ? ' · 默认' : ' · 宽裕'}
            </button>
          ))}
        </div>
        <label className="permission-option permission-option-spaced">
          <input
            type="checkbox"
            checked={preferMultiAgent}
            onChange={(e) => { void handlePreferMultiAgent(e.target.checked) }}
            className="permission-option-checkbox"
          />
          <span>
            <strong>新会话默认把每条任务交给多 Agent 编排</strong>
            <span className="permission-option-description">
              未开启时，Agent 会在任务适合拆分或需要并行调研多个模块时自行调用编排。输入框开关、目标模式（/goal）和多 Agent Skill 仍可明确要求编排。
            </span>
          </span>
        </label>
        <label className="permission-option">
          <input
            type="checkbox"
            checked={preferDshTranscript}
            onChange={(e) => { void handlePreferDshTranscript(e.target.checked) }}
            className="permission-option-checkbox"
          />
          <span>
            <strong>聊天记录以本机运行时会话为准</strong>
            <span className="permission-option-description">
              开启后，聊天列表使用本机运行时的会话记录；应用扩展消息仍会保留。
            </span>
          </span>
        </label>
      </div>

      {/* 细粒度规则列表 */}
      <div className="permission-rules-section">
        <div className="permission-rules-head">
          <div>
            <h3 className="permission-rules-title">细粒度规则列表</h3>
            <span className="permission-rules-count">
              已配置 {rules.length} 条规则 · 拒绝规则优先级最高
            </span>
          </div>
          <div className="permission-rules-actions">
            {rules.some((r) => r.scope === 'workspace') && (
              <button
                type="button"
                onClick={handleClearWorkspaceRules}
                className="settings-secondary-button permission-rule-clear-button"
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
                  <div className="provider-identity permission-rule-identity">
                    <span className={`permission-rule-decision ${isAllow ? 'is-allow' : 'is-deny'}`}>
                      {isAllow ? 'ALLOW' : 'DENY'}
                    </span>
                    <div>
                      <div className="permission-rule-pattern-row">
                        <strong className="permission-rule-pattern">{rule.pattern}</strong>
                        <span className="permission-rule-scope">
                          {rule.scope === 'workspace' ? '工作区专属' : '全局'}
                        </span>
                      </div>
                      <span className="permission-rule-description">
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

      {conversationId && (
        <div className="permission-audit-section">
          <h3 className="permission-audit-title">当前会话审批记录</h3>
          <p className="permission-audit-description">
            最近 30 条应用与运行时审批记录。
          </p>
          {approvalAudit.length === 0 ? (
            <p className="settings-list-empty permission-audit-empty">暂无审批审计记录。</p>
          ) : (
            <ul className="provider-list model-catalog-list permission-audit-list">
              {approvalAudit.slice().reverse().map((row, index) => (
                <li key={`${row.time}-${row.id ?? index}`} className="provider-row permission-audit-row">
                  <span className="permission-audit-time">
                    {row.time ? new Date(row.time).toLocaleString('zh-CN') : '—'}
                  </span>
                  <span className="permission-audit-type">{row.type}</span>
                  <span className="permission-audit-details">
                    {row.toolName ? ` · ${row.toolName}` : ''}
                    {row.outcome ? ` · ${row.outcome}` : ''}
                    {row.reason ? ` · ${row.reason}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="settings-footnote permission-settings-footnote">
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
    </SettingsLayout>
  )
}
