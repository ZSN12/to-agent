import { Plus, Settings2, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { RolePortrait } from './RolePortrait'
import { RoleModelPicker } from './RoleModelPicker'
import { InlineSelect } from '../../shared/InlineSelect'
import type { RoleProfile, RoleProfileDraft, RoleDuty } from '../../shared/app-api'
import type { ModelOption } from '../../types'

const DUTY_LABELS: Record<RoleDuty, string> = {
  planner: '规划者',
  implementer: '实施者',
  reviewer: '审查员',
  researcher: '研究员',
  specialist: '专长专家',
  generalist: '通用助手',
}

const DUTY_OPTIONS = [
  { value: 'planner', label: '方案规划者', description: '拆解目标、设计方案与验收标准；侧重只读规划。' },
  { value: 'implementer', label: '代码实施者', description: '编写或修改代码，并运行针对性验证。' },
  { value: 'reviewer', label: '审查员', description: '复核实现，检查质量、漏洞与回归风险。' },
  { value: 'researcher', label: '研究员', description: '检索资料、核验事实并开展调研。' },
  { value: 'specialist', label: '领域专家', description: '在指定技术或垂直领域提供专长。' },
  { value: 'generalist', label: '通用助手', description: '按任务需要灵活协作。' },
] as const

const STYLE_OPTIONS = [
  { value: 'custom', label: '自定义', description: '只遵循“工作方式”中的表达要求。' },
  { value: 'precise', label: '严谨工程', description: '结构清晰，重视证据、边界和验证。' },
  { value: 'concise', label: '极简直接', description: '优先给结论，只保留必要步骤。' },
  { value: 'playful', label: '轻松机敏', description: '使用更自然、轻松的表达。' },
] as const

export type RoleProgressEntry = {
  roleId: string
  roleName: string
  status: 'started' | 'completed' | 'failed' | 'cancelled'
  message?: string
}

export function RoleModeToolbar({
  profiles,
  models,
  selectedRoleIds,
  progress,
  loadError,
  loading = false,
  onChangeSelection,
  onManage,
}: {
  profiles: RoleProfile[]
  models: ModelOption[]
  selectedRoleIds: string[]
  progress: RoleProgressEntry[]
  loadError?: string | null
  loading?: boolean
  onChangeSelection: (ids: string[]) => void
  onManage: () => void
}) {
  const modelName = (key: string) => models.find((model) => model.id === key)?.displayName
    ?? models.find((model) => model.id === key)?.name
    ?? key
  const activeProgressList = progress.filter((item) => item.status === 'started')
  const activeProgress = activeProgressList[0]
  const lastFailure = [...progress].reverse().find((item) => item.status === 'failed')
  const allSettled = progress.length > 0 && progress.every((item) => item.status !== 'started')
  const wasCancelled = progress.some((item) => item.status === 'cancelled')
  const activeProfiles = selectedRoleIds
    .map((id) => profiles.find((profile) => profile.id === id))
    .filter((profile): profile is RoleProfile => Boolean(profile))

  return (
    <section className="role-mode-toolbar" aria-label="本轮参与工作的 Bots">
      <div className="role-mode-toolbar-heading">
        <div className="role-mode-toolbar-title">
          <span className="role-mode-icon"><Users size={15} /></span>
          <span className="role-mode-heading-copy">
            <strong>Bot 群聊成员</strong>
            <small>主 Bot 默认接话，@成员可邀请协作</small>
          </span>
          <span className="role-mode-count">{selectedRoleIds.length} / 5</span>
        </div>
        <button type="button" className="role-manage-button" onClick={onManage} aria-label="管理 Bots">
          <Settings2 size={14} />管理 Bots
        </button>
      </div>
      {activeProfiles.length > 0 ? (
        <div className="role-cast-list">
          {activeProfiles.map((profile) => {
            const index = profiles.findIndex((item) => item.id === profile.id)
            const toneIndex = (index >= 0 ? index : 0) % 6
            const isWorking = progress.some((item) => item.roleId === profile.id && item.status === 'started')
            return (
              <div key={profile.id} className={`role-cast-member role-avatar-tone-${toneIndex} ${isWorking ? 'is-working' : ''}`}>
                <RolePortrait name={profile.name} variant={toneIndex} size="small" status={isWorking ? 'working' : 'idle'} />
                <span className="role-cast-copy">
                <strong>{profile.name}{index === 0 && <em className="role-cast-lead">主 Bot</em>}</strong>
                  <small>{modelName(profile.modelKey)}</small>
                </span>
                <button
                  type="button"
                  className="role-cast-remove"
                  aria-label={`将 ${profile.name} 移出本轮`}
                  title={`将 ${profile.name} 移出本轮`}
                  onClick={() => onChangeSelection(selectedRoleIds.filter((id) => id !== profile.id))}
                >
                  <X size={13} />
                </button>
              </div>
            )
          })}
          <button type="button" className="role-cast-invite" onClick={onManage}>
            <span><Plus size={16} /></span>管理登场角色
          </button>
        </div>
      ) : (
        <div className={`role-cast-empty${loading ? ' is-loading' : ''}`}>
          <span className="role-cast-empty-mark"><Users size={17} /></span>
          <span>{loading ? '正在加载 Bot 名册…' : profiles.length ? '本轮还没有 Bot。请从左侧名册选择协作成员。' : '先创建一位 Bot，为它设定职责并绑定模型。'}</span>
          {!loading && profiles.length === 0 && <button type="button" onClick={onManage}><Plus size={14} />创建 Bot</button>}
        </div>
      )}
      {loadError && <div className="role-progress-status is-failed" role="alert">角色列表加载失败：{loadError}</div>}
      {(activeProgress || lastFailure || allSettled) && (
        <div className={`role-progress-status${lastFailure && !activeProgress ? ' is-failed' : ''}`} role="status" aria-live="polite">
          <span className={`role-progress-dot${activeProgress ? ' is-active' : lastFailure ? ' is-failed' : ''}`} />
          {activeProgressList.length > 1
            ? `${activeProgressList.map((item) => item.roleName).join('、')} 正在并行工作…`
            : activeProgress
              ? `${activeProgress.roleName} 正在工作…`
              : lastFailure
                ? `${lastFailure.roleName} 遇到问题：${lastFailure.message ?? '模型请求失败'}`
                : wasCancelled ? '本轮工作已停止' : '本轮工作已完成'}
        </div>
      )}
    </section>
  )
}

export function RoleProfilesDialog({
  open,
  profiles,
  models,
  saving = false,
  onClose,
  onSave,
  onRemove,
}: {
  open: boolean
  profiles: RoleProfile[]
  models: ModelOption[]
  saving?: boolean
  onClose: () => void
  onSave: (draft: RoleProfileDraft) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [modelKey, setModelKey] = useState('')
  const [persona, setPersona] = useState('')
  const [stylePreset, setStylePreset] = useState<RoleProfileDraft['stylePreset']>('custom')
  const [duty, setDuty] = useState<RoleDuty>('generalist')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const initial = profiles[0]
    if (initial) {
      setEditingId(initial.id)
      setIsNew(false)
      setName(initial.name)
      setDescription(initial.description)
      setModelKey(initial.modelKey)
      setPersona(initial.persona)
      setStylePreset(initial.stylePreset ?? 'custom')
      setDuty(initial.duty ?? 'generalist')
    } else {
      startNew()
    }
    setError(null)
  // Opening should initialize the editor from the latest saved profiles.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose, saving])

  function startNew() {
    setEditingId(null)
    setIsNew(true)
    setName('')
    setDescription('')
    setModelKey(models[0]?.id ?? '')
    setPersona('')
    setStylePreset('custom')
    setDuty('generalist')
    setError(null)
  }

  function selectProfile(profile: RoleProfile) {
    setEditingId(profile.id)
    setIsNew(false)
    setName(profile.name)
    setDescription(profile.description)
    setModelKey(profile.modelKey)
    setPersona(profile.persona)
    setStylePreset(profile.stylePreset ?? 'custom')
    setDuty(profile.duty ?? 'generalist')
    setError(null)
  }

  async function save() {
    if (!name.trim() || !persona.trim() || !modelKey) {
      setError('请填写 Bot 名称、工作方式，并选择一个模型。')
      return
    }
    try {
      setError(null)
      await onSave({
        ...(editingId ? { id: editingId } : {}),
        name: name.trim(),
        description: description.trim(),
        modelKey,
        persona: persona.trim(),
        stylePreset,
        duty,
      })
      setIsNew(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存角色失败')
    }
  }

  async function remove() {
    if (!editingId) return
    if (!window.confirm(`确定删除 Bot“${name || '未命名 Bot'}”吗？此操作不可撤销。`)) return
    try {
      setError(null)
      await onRemove(editingId)
      const remaining = profiles.filter((profile) => profile.id !== editingId)
      if (remaining[0]) selectProfile(remaining[0])
      else startNew()
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : '删除角色失败')
    }
  }

  if (!open) return null

  const currentModel = models.find((model) => model.id === modelKey)
  const currentProfileIndex = profiles.findIndex((profile) => profile.id === editingId)
  return (
    <div className="role-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <section className="role-dialog" role="dialog" aria-modal="true" aria-labelledby="role-dialog-title">
        <header className="role-dialog-header">
          <div>
            <span className="role-dialog-eyebrow">BOT STUDIO</span>
            <h2 id="role-dialog-title">管理你的 Bots</h2>
            <p>为每位 Bot 设定职责、工作方式和固定模型；然后单独交代任务，或邀请多人协作。</p>
          </div>
          <button type="button" className="role-dialog-close" onClick={onClose} aria-label="关闭角色管理" disabled={saving}><X size={18} /></button>
        </header>
        <div className="role-dialog-body">
          <aside className="role-dialog-list" aria-label="Bot 列表">
            <div className="role-dialog-list-heading"><span>我的 Bots</span><span>{profiles.length}</span></div>
            {profiles.map((profile) => (
              <button key={profile.id} type="button" className={`role-dialog-list-item${editingId === profile.id ? ' is-active' : ''}`} onClick={() => selectProfile(profile)}>
                <RolePortrait name={profile.name} variant={profiles.indexOf(profile)} size="small" />
                <span><strong>{profile.name}</strong><small>{profile.duty ? DUTY_LABELS[profile.duty] : '通用'} · {models.find((model) => model.id === profile.modelKey)?.name ?? profile.modelKey}</small></span>
              </button>
            ))}
            <button type="button" className="role-dialog-add" onClick={startNew}><Plus size={15} />新建 Bot</button>
          </aside>
          <div className="role-dialog-form">
            <div className="role-dialog-form-heading">
              {name.trim() ? <RolePortrait name={name} variant={currentProfileIndex >= 0 ? currentProfileIndex : profiles.length} size="medium" /> : <span className="role-profile-avatar is-large"><Users size={18} /></span>}
              <div><strong>{isNew ? '创建新 Bot' : (name || 'Bot 设定')}</strong><small>模型会遵循这里设定的职责与工作方式</small></div>
            </div>
            <label className="role-field">
              <span>Bot 名称</span>
              <input maxLength={48} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：产品顾问、代码审查员" autoFocus />
            </label>
            <label className="role-field">
              <span>职责简介 <small>可选</small></span>
              <input maxLength={400} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="说明这个 Bot 适合负责什么工作" />
            </label>
            <div className="role-field" role="group" aria-labelledby="role-duty-label">
              <span id="role-duty-label">协作职责 <small>自动分工</small></span>
              <InlineSelect
                className="role-choice-picker"
                value={duty}
                options={DUTY_OPTIONS}
                onChange={(value) => setDuty(value as RoleDuty)}
                ariaLabel="协作职责"
              />
              <small className="role-field-hint">接力模式会参考任务内容和已选 Bot 的职责安排协作顺序。</small>
            </div>
            <label className="role-field">
              <span>绑定模型</span>
              <RoleModelPicker models={models} value={modelKey} onChange={setModelKey} />
              {currentModel && <small className="role-field-hint">每次邀请此角色时，都由 {currentModel.displayName ?? currentModel.name} 回复。</small>}
            </label>
            <div className="role-field" role="group" aria-labelledby="role-style-label">
              <span id="role-style-label">表达风格</span>
              <InlineSelect
                className="role-choice-picker"
                value={stylePreset ?? 'custom'}
                options={STYLE_OPTIONS}
                onChange={(value) => setStylePreset(value as NonNullable<RoleProfileDraft['stylePreset']>)}
                ariaLabel="表达风格"
              />
              <small className="role-field-hint">风格只影响表达方式，不改变模型能力、工具权限或联网能力。</small>
            </div>
            <label className="role-field role-persona-field">
              <span>工作方式</span>
              <textarea maxLength={12000} value={persona} onChange={(event) => setPersona(event.target.value)} placeholder={'描述这个 Bot 的专业范围、工作步骤、表达方式和交付标准。\n\n例如：先读相关需求和代码，再列出风险与验证办法。只提交有证据支持的结论，发现不确定的内容要明确说明。'} />
              <small className="role-field-hint">工作方式定义模型的职责与回答风格；Host 的权限和工作区安全设置仍由应用控制。</small>
            </label>
            {error && <div className="role-form-error" role="alert">{error}</div>}
            <footer className="role-dialog-actions">
              {!isNew && <button type="button" className="role-delete-button" onClick={() => void remove()} disabled={saving}>删除 Bot</button>}
              <span className="role-dialog-action-spacer" />
              <button type="button" className="role-cancel-button" onClick={onClose} disabled={saving}>关闭</button>
              <button type="button" className="role-save-button" onClick={() => void save()} disabled={saving || models.length === 0}>{saving ? '保存中…' : '保存 Bot'}</button>
            </footer>
          </div>
        </div>
      </section>
    </div>
  )
}
