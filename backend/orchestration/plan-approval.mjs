const MAX_DESCRIPTION_LENGTH = 4_000
const MAX_ACCEPTANCE_ITEMS = 5
const MAX_ACCEPTANCE_LENGTH = 500

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Apply the narrow set of edits exposed in the pre-run approval card. */
export function applyPlanApprovalChanges(tasks, changes, { catalog } = {}) {
  if (!Array.isArray(tasks) || !isRecord(changes)) throw new Error('DAG 计划修改格式无效')

  const deletedTaskIds = changes.deletedTaskIds ?? []
  const edits = changes.edits ?? []
  if (!Array.isArray(deletedTaskIds) || deletedTaskIds.some((id) => typeof id !== 'string')) {
    throw new Error('待删除节点列表无效')
  }
  if (!Array.isArray(edits) || edits.some((edit) => !isRecord(edit) || typeof edit.id !== 'string')) {
    throw new Error('节点修改列表无效')
  }

  const taskIds = new Set(tasks.map((task) => task.id))
  const deleted = new Set(deletedTaskIds)
  if (deleted.size !== deletedTaskIds.length || [...deleted].some((id) => !taskIds.has(id))) {
    throw new Error('待删除节点不存在或重复')
  }
  const editById = new Map()
  for (const edit of edits) {
    if (!taskIds.has(edit.id) || deleted.has(edit.id) || editById.has(edit.id)) {
      throw new Error(`节点修改目标无效：${edit.id}`)
    }
    const allowed = new Set(['id', 'description', 'acceptance', 'modelKey', 'dependsOn'])
    if (Object.keys(edit).some((key) => !allowed.has(key))) throw new Error(`不允许修改节点字段：${edit.id}`)
    editById.set(edit.id, edit)
  }

  const modelsByKey = new Map((Array.isArray(catalog?.models) ? catalog.models : []).map((model) => [model.key, model]))
  return tasks.filter((task) => !deleted.has(task.id)).map((task) => {
    const edit = editById.get(task.id)
    if (!edit) return task
    const updated = { ...task }

    if (edit.description !== undefined) {
      if (typeof edit.description !== 'string' || !edit.description.trim() || edit.description.trim().length > MAX_DESCRIPTION_LENGTH) {
        throw new Error(`${task.id} 的任务描述必须为 1–${MAX_DESCRIPTION_LENGTH} 个字符`)
      }
      updated.description = edit.description.trim()
      updated.detail = updated.description
    }

    if (edit.acceptance !== undefined) {
      if (!Array.isArray(edit.acceptance)
        || edit.acceptance.length < 1
        || edit.acceptance.length > MAX_ACCEPTANCE_ITEMS
        || edit.acceptance.some((item) => typeof item !== 'string' || !item.trim() || item.trim().length > MAX_ACCEPTANCE_LENGTH)) {
        throw new Error(`${task.id} 的验收点必须是 1 到 ${MAX_ACCEPTANCE_ITEMS} 条、每条不超过 ${MAX_ACCEPTANCE_LENGTH} 个字符的非空文本`)
      }
      updated.acceptance = edit.acceptance.map((item) => item.trim())
    }

    if (edit.dependsOn !== undefined) {
      if (!Array.isArray(edit.dependsOn)
        || edit.dependsOn.length > tasks.length - 1
        || edit.dependsOn.some((id) => typeof id !== 'string' || !id.trim())
        || new Set(edit.dependsOn).size !== edit.dependsOn.length) {
        throw new Error(`${task.id} 的前置依赖必须是无重复的有效节点 ID 列表`)
      }
      updated.dependsOn = edit.dependsOn.map((id) => id.trim())
    }

    if (edit.modelKey !== undefined) {
      if (typeof edit.modelKey !== 'string' || !edit.modelKey) throw new Error(`${task.id} 的模型选择无效`)
      const model = modelsByKey.get(edit.modelKey)
      if (!model || model.available !== true || model.routeRegistered === false) {
        throw new Error(`${task.id} 选择的模型不可用：${edit.modelKey}`)
      }
      if (edit.modelKey === task.modelKey) return updated
      const tier = model.profile?.tier ?? 'balanced'
      updated.modelKey = model.key
      updated.model = model.name || model.key
      updated.tier = tier === 'cheap' ? 'low' : tier === 'strong' ? 'high' : 'balanced'
      updated.routeReason = '用户在计划审批中手动选择'
      updated.reasons = [...(Array.isArray(task.reasons) ? task.reasons : []), updated.routeReason]
      updated.routeDecision = {
        ...(isRecord(task.routeDecision) ? task.routeDecision : {}),
        strategy: 'user-override',
        displayName: updated.model,
        reasons: [updated.routeReason],
        confidence: 1,
      }
    }
    return updated
  })
}
