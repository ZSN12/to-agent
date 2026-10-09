import { FormEvent, useEffect, useState } from 'react'
import { Check, Plus, Shield, ShieldCheck, Trash2 } from 'lucide-react'
import type { ApprovalAuditEntry, PermissionMode, PermissionRule } from '../../shared/app-api'

const PROMPT_INJECTION_LIMIT_MIN_KIB = 1
const PROMPT_INJECTION_LIMIT_MAX_KIB = 128
const PROMPT_INJECTION_LIMIT_DEFAULT_KIB = 32

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
      <form className="model-editor" onSubmit={handleSubmit} style={{ maxWidth: 540 }}>
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
  conversationId = null,
}: {
  currentMode?: PermissionMode
  onModeChange?: (mode: PermissionMode) => void
  onToast?: (msg: string) => void
  conversationId?: string | null
}) {
  const [mode, setMode] = useState<PermissionMode>(currentMode)
  const [rules, setRules] = useState<PermissionRule[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [autoReviewReads, setAutoReviewReads] = useState(true)
  const [autoVerifyAfterMutation, setAutoVerifyAfterMutation] = useState(false)
  const [promptInjectionLimitKiB, setPromptInjectionLimitKiB] = useState(String(PROMPT_INJECTION_LIMIT_DEFAULT_KIB))
  const [savedPromptInjectionLimitKiB, setSavedPromptInjectionLimitKiB] = useState(PROMPT_INJECTION_LIMIT_DEFAULT_KIB)
  const [adaptiveOrchestrationGate, setAdaptiveOrchestrationGate] = useState(true)
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
        setAutoVerifyAfterMutation(res.data.autoVerifyAfterMutation === true)
        const limitKiB = Number.isFinite(res.data.promptInjectionLimitBytes)
          ? Math.round((res.data.promptInjectionLimitBytes ?? PROMPT_INJECTION_LIMIT_DEFAULT_KIB * 1024) / 1024)
          : PROMPT_INJECTION_LIMIT_DEFAULT_KIB
        const boundedLimitKiB = Math.max(PROMPT_INJECTION_LIMIT_MIN_KIB, Math.min(PROMPT_INJECTION_LIMIT_MAX_KIB, limitKiB))
        setPromptInjectionLimitKiB(String(boundedLimitKiB))
        setSavedPromptInjectionLimitKiB(boundedLimitKiB)
        setAdaptiveOrchestrationGate(res.data.adaptiveOrchestrationGate !== false)
        setPreferMultiAgent(res.data.preferMultiAgent !== false)
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
    onToast?.(enabled ? '已开启：聊天列表以 DSH 会话为准' : '已关闭：仅使用本地线程消息（不推荐）')
  }

  const handleAdaptiveOrchestrationGate = async (enabled: boolean) => {
    setAdaptiveOrchestrationGate(enabled)
    const res = await window.taskweaver?.preferences?.set?.({ adaptiveOrchestrationGate: enabled })
    if (!res?.ok) {
      onToast?.(res?.error || '保存失败')
      return
    }
    onToast?.(enabled ? '已开启：灰区任务将询问是否启用多 Agent' : '已关闭：不再弹出多 Agent 确认')
  }

  const handlePreferMultiAgent = async (enabled: boolean) => {
    setPreferMultiAgent(enabled)
    const res = await window.taskweaver?.preferences?.set?.({ preferMultiAgent: enabled })
    if (!res?.ok) {
      onToast?.(res?.error || '保存失败')
      return
    }
    onToast?.(enabled ? '已开启：常规消息默认走多 Agent DAG' : '已恢复：常规消息默认单 Agent')
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
    onToast?.(enabled ? '已开启：改代码请求将追加验证指引' : '已关闭：改代码请求不再追加 Host 外验证指引')
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
      onToast?.('权限偏好已保存；下一条消息由 Host 确认应用。')
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
            onClick={() => handleModeSelect('readonly')}
            style={{
              padding: 14,
              borderRadius: 8,
              border: `1.5px solid ${mode === 'readonly' ? 'var(--accent-primary, #3b82f6)' : 'var(--border-color, #e5e7eb)'}`,
              background: mode === 'readonly' ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
                <Shield size={16} color="#64748b" />
                只读
              </div>
              {mode === 'readonly' && <Check size={16} color="#3b82f6" />}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '6px 0 0 0', lineHeight: 1.4 }}>
              Host read-only：文件写入工具不可用；适合计划审阅与纯理解任务。
            </p>
          </div>

          <div
            onClick={() => handleModeSelect('ask')}
            style={{
              padding: 14,
              borderRadius: 8,
              border: `1.5px solid ${mode === 'ask' || mode === 'on-risk' ? 'var(--accent-primary, #3b82f6)' : 'var(--border-color, #e5e7eb)'}`,
              background: mode === 'ask' || mode === 'on-risk' ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
                <Shield size={16} color="#3b82f6" />
                工作区可写 (默认)
              </div>
              {(mode === 'ask' || mode === 'on-risk') && <Check size={16} color="#3b82f6" />}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '6px 0 0 0', lineHeight: 1.4 }}>
              Host workspace-write：允许工作区内文件修改与命令；需要扩大沙箱范围时请求审批。
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
                完全访问
              </div>
              {mode === 'full' && <Check size={16} color="#3b82f6" />}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '6px 0 0 0', lineHeight: 1.4 }}>
              Host 使用 danger-full-access：关闭文件与命令沙箱约束，默认审批策略为 never。
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-secondary)', margin: '6px 0 0 0', lineHeight: 1.4, opacity: 0.9 }}>
              若 Host 仍发出审批请求，桌面端会显示给用户。设置在下一次发送消息时应用；成功回执前不代表 Host 已生效。
            </p>
          </div>
        </div>
        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <strong>安全边界说明：</strong>on-risk 为旧配置，与 ask 同为 workspace-write。细粒度规则属于应用层；Host 文件沙箱不等同于网络隔离。
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 14, fontSize: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoReviewReads}
            onChange={(e) => { void handleAutoReviewReads(e.target.checked) }}
            style={{ marginTop: 2 }}
          />
          <span>
            <strong>自动放行工作区内只读工具</strong>
            <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>
              应用层只读工具确认偏好；Z Host 使用其自身审批策略，此开关不改变 Host 的沙箱权限。
            </span>
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 10, fontSize: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoVerifyAfterMutation}
            onChange={(e) => { void handleAutoVerifyAfterMutation(e.target.checked) }}
            style={{ marginTop: 2 }}
          />
          <span>
            <strong>改代码后追加验证指引（Host 外）</strong>
            <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>
              默认关闭以对齐 DSH Web；开启后会在修改类请求上提示运行项目验证命令。
            </span>
          </span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, fontSize: 12 }}>
          <label htmlFor="prompt-injection-limit-kib" style={{ display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}>
            <strong>每轮系统上下文上限</strong>
            <span style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.45 }}>
              每轮发送前，Prompt Pipeline 注入的系统上下文总字节上限；默认 32 KiB，范围 1–128 KiB。
            </span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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
              style={{ width: 76, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12 }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>KiB</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {([16, 32, 48] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              className={savedPromptInjectionLimitKiB === preset ? 'settings-primary-button' : 'settings-secondary-button'}
              style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={() => { void applyInjectionPresetKiB(preset) }}
            >
              {preset} KiB{preset === 16 ? ' · 省钱' : preset === 32 ? ' · 默认' : ' · 宽裕'}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16, fontSize: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={preferMultiAgent}
            onChange={(e) => { void handlePreferMultiAgent(e.target.checked) }}
            style={{ marginTop: 2 }}
          />
          <span>
            <strong>默认启用多 Agent 编排</strong>
            <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>
              常规模式下每条消息走 DAG 规划与子任务；也可在输入框旁单独开关。目标模式 (/goal) 始终多 Agent。
            </span>
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 10, fontSize: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={preferDshTranscript}
            onChange={(e) => { void handlePreferDshTranscript(e.target.checked) }}
            style={{ marginTop: 2 }}
          />
          <span>
            <strong>聊天以 DSH 会话 transcript 为准（阶段 C）</strong>
            <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>
              开启后列表与 Host 投影对齐；线程库只保留多 Agent callout、错误等扩展行。
            </span>
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 10, fontSize: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={adaptiveOrchestrationGate}
            onChange={(e) => { void handleAdaptiveOrchestrationGate(e.target.checked) }}
            style={{ marginTop: 2 }}
          />
          <span>
            <strong>灰区询问多 Agent（规则门控）</strong>
            <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>
              多模块实现类请求弹出确认；不调用模型做门控，复杂任务也不会自动强开。
            </span>
          </span>
        </label>
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

      {conversationId && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px 0' }}>当前会话审批记录</h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
            最近 30 条应用层与 Host 审批事件（JSONL 落盘于会话目录）。
          </p>
          {approvalAudit.length === 0 ? (
            <p className="settings-list-empty" style={{ margin: 0 }}>暂无审批审计记录。</p>
          ) : (
            <ul className="provider-list model-catalog-list" style={{ margin: 0 }}>
              {approvalAudit.slice().reverse().map((row, index) => (
                <li key={`${row.time}-${row.id ?? index}`} className="provider-row" style={{ fontSize: 12 }}>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', flexShrink: 0 }}>
                    {row.time ? new Date(row.time).toLocaleString('zh-CN') : '—'}
                  </span>
                  <span style={{ fontWeight: 600 }}>{row.type}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>
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
