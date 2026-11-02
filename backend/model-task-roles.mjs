export const MODEL_TASK_ROLES = Object.freeze(['review', 'writing', 'query'])

export const MODEL_TASK_ROLE_LABELS = Object.freeze({
  review: '审查',
  writing: '编写',
  query: '查询',
})

const TASK_ROLE_BY_TASK_TYPE = Object.freeze({
  review: 'review',
  implementation: 'writing',
  test: 'writing',
  research: 'query',
  planning: 'query',
})

export function modelTaskRoleForTaskType(taskType) {
  return TASK_ROLE_BY_TASK_TYPE[taskType] ?? null
}

export function normalizeModelTaskRoles(value) {
  if (!Array.isArray(value)) throw new TypeError('模型任务分档必须是数组')
  const roles = [...new Set(value)]
  if (roles.some((role) => !MODEL_TASK_ROLES.includes(role))) {
    throw new TypeError('模型任务分档只能是 review、writing 或 query')
  }
  return roles
}
