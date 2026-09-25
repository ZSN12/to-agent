import { applyPolicyToRoute, filterModelsForTaskType } from './policy-gate.mjs'

const TASK_TIER_ORDER = {
  research: ['cheap', 'balanced', 'strong'],
  test: ['cheap', 'balanced', 'strong'],
  implementation: ['balanced', 'strong', 'cheap'],
  review: ['strong', 'balanced', 'cheap'],
}

/** Single-agent remains the default. Auto mode only activates for cross-cutting requests. */
export function decideExecutionMode(text, selectedSkill = null) {
  if (selectedSkill?.multiAgent) {
    return { mode: 'multi-agent', reason: `已选择多 Agent Skill：${selectedSkill.name}` }
  }
  const target = '(?:多智能体|多\\s*agent|multi[-\\s]?agent|agent[-\\s]?team|任务\\s*DAG)'
  const denied = new RegExp(`(?:不要|不需要|无需|禁止|别用|不要再用|不启用|禁用|关闭|不是|并非)\\s*(?:使用|启用|调用)?\\s*${target}`, 'i')
  if (denied.test(text)) return { mode: 'single-agent', reason: '用户明确要求不启用多 Agent' }
  const explicit = new RegExp(`(?:使用|启用|开启|调用|采用)\\s*${target}|${target}\\s*(?:skill|技能)|(?:任务|请求)\\s*.*${target}`, 'i').test(text)
  if (explicit) return { mode: 'multi-agent', reason: '用户明确要求多 Agent 编排' }

  const categories = [
    /前端|界面|页面|组件/.test(text),
    /后端|服务端|接口|API|数据库|存储/.test(text),
    /测试|验证|回归/.test(text),
    /安全|权限|鉴权/.test(text),
    /文档|迁移|部署|构建/.test(text),
  ].filter(Boolean).length
  const isAction = /实现|开发|添加|修改|重构|接入|支持|构建|修复/.test(text)
  const isBroadProject = /系统|平台|完整功能|端到端/.test(text)
  const parallelCue = /同时|并且|以及|并完成/.test(text)
  if (isAction && categories >= 3 && (isBroadProject || parallelCue)) {
    return { mode: 'multi-agent', reason: '跨多个工程领域的复杂任务' }
  }
  if (isAction && categories === 2 && isBroadProject && !parallelCue) {
    return {
      mode: 'ask-user',
      reason: '任务横跨多个领域但复杂度处于灰区，建议确认是否启用多 Agent 编排',
      suggestedMode: 'multi-agent',
    }
  }
  return { mode: 'single-agent', reason: '常规任务，保持单 Agent 执行' }
}

export function resolveExecutionMode(decision, override) {
  if (override === 'single-agent' || override === 'multi-agent') {
    return { mode: override, reason: override === 'multi-agent' ? '用户确认启用多 Agent' : '用户选择单 Agent 执行' }
  }
  if (decision.mode === 'ask-user') return decision
  return decision
}

/** Route each task independently; never silently use the parent's model when a profile can route it. */
export function selectModelForTask(taskType, catalog, fallbackModelKey) {
  const order = TASK_TIER_ORDER[taskType] ?? TASK_TIER_ORDER.implementation
  const candidates = filterModelsForTaskType(
    taskType,
    (catalog?.models ?? []).filter((model) => model.available && model.profile?.enabledForAllocation !== false),
  )
    .map((model) => ({
      model,
      tier: model.profile?.tier ?? 'balanced',
      cost: (model.costPerMillion?.input ?? 0) + (model.costPerMillion?.output ?? 0),
    }))

  candidates.sort((left, right) => {
    const tierOrder = order.indexOf(left.tier) - order.indexOf(right.tier)
    if (tierOrder !== 0) return tierOrder
    if (left.cost !== right.cost) return left.cost - right.cost
    return left.model.key.localeCompare(right.model.key)
  })

  const selected = candidates[0]?.model
  if (selected) {
    return applyPolicyToRoute(taskType, {
      model: selected,
      reason: `任务类型 ${taskType} 优先使用 ${selected.profile?.tier ?? 'balanced'} 档模型`,
    }, catalog)
  }

  const fallback = catalog?.models?.find((model) => model.key === fallbackModelKey && model.available && model.profile?.enabledForAllocation !== false)
  if (fallback) return { model: fallback, reason: '没有已启用路由档位的模型，回退到当前可用模型' }
  return { model: null, reason: '没有可用且已鉴权的模型' }
}
