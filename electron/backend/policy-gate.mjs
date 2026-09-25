/** Hard rules on top of tier-based routing (设计方案 §7). */

const TASK_TYPES_REQUIRING_STRONG_REVIEW = new Set(['review'])

export function filterModelsForTaskType(taskType, models) {
  const list = models ?? []
  if (!TASK_TYPES_REQUIRING_STRONG_REVIEW.has(taskType)) return list
  const withoutCheap = list.filter((model) => (model.profile?.tier ?? 'balanced') !== 'cheap')
  return withoutCheap.length ? withoutCheap : list
}

export function applyPolicyToRoute(taskType, routing, catalog) {
  if (!routing?.model) return routing
  const tier = routing.model.profile?.tier ?? 'balanced'
  if (taskType === 'review' && tier === 'cheap') {
    const order = ['strong', 'balanced', 'cheap']
    const candidates = filterModelsForTaskType(
      taskType,
      (catalog?.models ?? []).filter((m) => m.available && m.profile?.enabledForAllocation !== false),
    )
    candidates.sort((a, b) => order.indexOf(a.profile?.tier ?? 'balanced') - order.indexOf(b.profile?.tier ?? 'balanced'))
    const upgraded = candidates[0]
    if (upgraded && upgraded.key !== routing.model.key) {
      return {
        model: upgraded,
        reason: `${routing.reason}；审查任务禁止 cheap 档，已升级为 ${upgraded.profile?.tier ?? 'balanced'}`,
      }
    }
  }
  return routing
}
