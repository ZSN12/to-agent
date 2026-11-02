import { DAG_CONFIG } from '../config/constants.mjs'

export const DAG_NODE_LIMIT_DEFAULT = DAG_CONFIG.NODE_LIMIT_DEFAULT
export const DAG_NODE_LIMIT_MIN = DAG_CONFIG.NODE_LIMIT_MIN
export const DAG_NODE_LIMIT_MAX = DAG_CONFIG.NODE_LIMIT_MAX

export function normalizeDagNodeLimit(value, fallback = DAG_NODE_LIMIT_DEFAULT) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(DAG_NODE_LIMIT_MIN, Math.min(DAG_NODE_LIMIT_MAX, Math.round(parsed)))
}
