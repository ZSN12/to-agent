export const DAG_NODE_LIMIT_DEFAULT = 6
export const DAG_NODE_LIMIT_MIN = 1
export const DAG_NODE_LIMIT_MAX = 12

export function normalizeDagNodeLimit(value, fallback = DAG_NODE_LIMIT_DEFAULT) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(DAG_NODE_LIMIT_MIN, Math.min(DAG_NODE_LIMIT_MAX, Math.round(parsed)))
}
