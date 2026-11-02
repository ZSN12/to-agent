import { useId, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Check, Search, X } from 'lucide-react'
import type { CatalogModel, ModelProfilePatch, ModelTaskRole } from '../../../shared/model-api'
import { useModalFocusTrap } from '../../../shared/useModalFocusTrap'
import { getCleanModelName } from '../format'

const ROLE_COLUMNS: Array<{ id: ModelTaskRole; label: string; description: string }> = [
  { id: 'review', label: '审查', description: '代码审查、结果复核与风险检查' },
  { id: 'writing', label: '编写', description: '代码实施与测试任务' },
  { id: 'query', label: '查询', description: '只读调研、检索与资料整理' },
]

type RoleAssignments = Record<ModelTaskRole, string[]>

function assignmentsFromModels(models: CatalogModel[]): RoleAssignments {
  return {
    review: models.filter((model) => model.profile?.taskRoles?.includes('review')).map((model) => model.key),
    writing: models.filter((model) => model.profile?.taskRoles?.includes('writing')).map((model) => model.key),
    query: models.filter((model) => model.profile?.taskRoles?.includes('query')).map((model) => model.key),
  }
}

function sameKeys(left: string[] | undefined, right: string[]) {
  if (!Array.isArray(left) || left.length !== right.length) return false
  const values = new Set(left)
  return values.size === right.length && right.every((key) => values.has(key))
}

export function ModelRoleAssignmentModal({
  models,
  onClose,
  onSaveProfile,
  onToast,
}: {
  models: CatalogModel[]
  onClose: () => void
  onSaveProfile: (modelKey: string, patch: ModelProfilePatch) => Promise<boolean>
  onToast?: (message: string) => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const searchRef = useRef<HTMLInputElement>(null)
  const originalAssignments = useRef(assignmentsFromModels(models))
  const [assignments, setAssignments] = useState<RoleAssignments>(originalAssignments.current)
  const [roleModeEnabled, setRoleModeEnabled] = useState(
    () => models.some((model) => Array.isArray(model.profile?.taskRoles)),
  )
  const [search, setSearch] = useState('')
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<ModelTaskRole | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const dialogRef = useModalFocusTrap<HTMLElement>({
    open: true,
    onEscape: !saving ? onClose : undefined,
    getInitialFocus: () => searchRef.current,
  })

  const modelByKey = useMemo(() => new Map(models.map((model) => [model.key, model])), [models])
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visibleModels = useMemo(() => models.filter((model) => {
    if (!normalizedSearch) return true
    return [model.name, model.id, model.key, model.provider]
      .some((value) => String(value ?? '').toLocaleLowerCase().includes(normalizedSearch))
  }), [models, normalizedSearch])
  const assignedCount = ROLE_COLUMNS.reduce((total, role) => total + assignments[role.id].length, 0)
  const hasChanges = ROLE_COLUMNS.some(({ id }) =>
    !sameKeys(originalAssignments.current[id], assignments[id]),
  )

  const assignModel = (role: ModelTaskRole, modelKey: string) => {
    if (!modelByKey.has(modelKey)) return
    setAssignments((current) => current[role].includes(modelKey)
      ? current
      : { ...current, [role]: [...current[role], modelKey] })
    setSelectedModelKey(modelKey)
  }

  const removeModel = (role: ModelTaskRole, modelKey: string) => {
    setAssignments((current) => ({
      ...current,
      [role]: current[role].filter((key) => key !== modelKey),
    }))
  }

  const handleDrop = (event: DragEvent<HTMLElement>, role: ModelTaskRole) => {
    event.preventDefault()
    setDropTarget(null)
    const key = event.dataTransfer.getData('text/taskweaver-model-key')
      || event.dataTransfer.getData('text/plain')
    assignModel(role, key)
  }

  const save = async () => {
    if (saving || !hasChanges) return
    setSaving(true)
    setSaveError('')
    const nextRoleModeEnabled = roleModeEnabled || assignedCount > 0
    const failures: string[] = []

    try {
      for (const model of models) {
        const taskRoles = ROLE_COLUMNS
          .filter(({ id }) => assignments[id].includes(model.key))
          .map(({ id }) => id)
        const needsWrite = nextRoleModeEnabled && (
          !sameKeys(model.profile?.taskRoles, taskRoles)
          || model.profile?.enabledForAllocation !== (taskRoles.length > 0)
        )
        if (!needsWrite) continue
        const ok = await onSaveProfile(model.key, {
          taskRoles,
          enabledForAllocation: taskRoles.length > 0,
        })
        if (!ok) failures.push(getCleanModelName(model.key, model.name))
      }

      if (failures.length) {
        setSaveError(`有 ${failures.length} 个模型保存失败：${failures.slice(0, 3).join('、')}${failures.length > 3 ? '…' : ''}`)
        return
      }

      if (nextRoleModeEnabled) {
        originalAssignments.current = {
          review: [...assignments.review],
          writing: [...assignments.writing],
          query: [...assignments.query],
        }
        setRoleModeEnabled(true)
      }
      onToast?.('模型分档已保存，自动任务会按对应分组选择模型。')
      onClose()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存模型分档失败，请重试。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="settings-modal-backdrop model-role-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className="model-role-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header className="model-role-dialog-header">
          <div>
            <h2 id={titleId}>模型分档设计</h2>
            <p id={descriptionId}>把模型拖到右侧分组；保存后，多 Agent 任务会按对应分组选择模型。</p>
          </div>
          <button
            type="button"
            className="settings-icon-button"
            onClick={onClose}
            disabled={saving}
            aria-label="关闭模型分档设计"
          >
            <X size={18} />
          </button>
        </header>

        <div className="model-role-dialog-body">
          <section className="model-role-palette" aria-label="已添加模型">
            <div className="model-role-section-heading">
              <div>
                <h3>全部模型</h3>
                <span>{models.length} 个已添加</span>
              </div>
              <span className="model-role-selection-hint">
                {selectedModelKey ? '已选中，可点右侧分组添加' : '拖动模型，或点选后添加'}
              </span>
            </div>
            <label className="model-role-search">
              <Search size={15} aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索已添加模型…"
                aria-label="搜索已添加模型"
              />
            </label>
            <div className="model-role-model-list">
              {visibleModels.map((model) => {
                const roleLabels = ROLE_COLUMNS
                  .filter(({ id }) => assignments[id].includes(model.key))
                  .map(({ label }) => label)
                return (
                  <button
                    key={model.key}
                    type="button"
                    className={`model-role-model-option${selectedModelKey === model.key ? ' is-selected' : ''}`}
                    draggable={!saving}
                    aria-pressed={selectedModelKey === model.key}
                    onClick={() => setSelectedModelKey(model.key)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/taskweaver-model-key', model.key)
                      event.dataTransfer.setData('text/plain', model.key)
                      event.dataTransfer.effectAllowed = 'copy'
                    }}
                  >
                    <span className="model-role-model-copy">
                      <strong>{getCleanModelName(model.key, model.name)}</strong>
                      <small>{model.provider} · {model.id}</small>
                    </span>
                    {roleLabels.length ? (
                      <span className="model-role-assignment-labels">{roleLabels.join(' · ')}</span>
                    ) : (
                      <span className="model-role-unassigned">未分档</span>
                    )}
                  </button>
                )
              })}
              {visibleModels.length === 0 && (
                <p className="model-role-empty">没有匹配的模型。</p>
              )}
            </div>
          </section>

          <div className="model-role-lanes" aria-label="任务模型分组">
            {ROLE_COLUMNS.map((role) => (
              <section
                key={role.id}
                className={`model-role-lane${dropTarget === role.id ? ' is-drop-target' : ''}`}
                aria-label={`${role.label}模型组`}
                onDragEnter={() => setDropTarget(role.id)}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'copy'
                  setDropTarget(role.id)
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null)
                }}
                onDrop={(event) => handleDrop(event, role.id)}
              >
                <div className="model-role-lane-heading">
                  <div>
                    <h3>{role.label}</h3>
                    <p>{role.description}</p>
                  </div>
                  <span className="model-role-lane-count">{assignments[role.id].length}</span>
                </div>
                <div className="model-role-dropzone">
                  {assignments[role.id].length ? (
                    assignments[role.id].map((modelKey) => {
                      const model = modelByKey.get(modelKey)
                      if (!model) return null
                      return (
                        <div className="model-role-assigned-model" key={model.key}>
                          <span>{getCleanModelName(model.key, model.name)}</span>
                          <button
                            type="button"
                            onClick={() => removeModel(role.id, model.key)}
                            disabled={saving}
                            aria-label={`从${role.label}组移除${getCleanModelName(model.key, model.name)}`}
                            title="从此分组移除"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )
                    })
                  ) : (
                    <span className="model-role-drop-hint">拖到这里</span>
                  )}
                </div>
                <button
                  type="button"
                  className="model-role-add-selected"
                  disabled={!selectedModelKey || saving || assignments[role.id].includes(selectedModelKey)}
                  onClick={() => selectedModelKey && assignModel(role.id, selectedModelKey)}
                >
                  {assignments[role.id].includes(selectedModelKey ?? '') ? <Check size={14} /> : null}
                  {assignments[role.id].includes(selectedModelKey ?? '') ? '已在此分组' : '添加已选模型'}
                </button>
              </section>
            ))}
          </div>
        </div>

        {saveError && <p className="model-role-save-error" role="alert">{saveError}</p>}
        <footer className="model-role-dialog-footer">
          <span>{assignedCount} 个分组关联 · 编写对应实施 / 测试，查询对应调研</span>
          <div>
            <button type="button" className="settings-secondary-button" onClick={onClose} disabled={saving}>取消</button>
            <button
              type="button"
              className="settings-primary-button"
              onClick={() => void save()}
              disabled={saving || !hasChanges}
              aria-busy={saving}
            >
              {saving ? '正在保存…' : '保存分档'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
