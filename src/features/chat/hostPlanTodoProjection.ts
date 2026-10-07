import type { HostPlanProjection, HostTodoItem } from '../../shared/app-api'

export type { HostTodoItem } from '../../shared/app-api'

type HostProjections = Record<string, unknown> | null | undefined

/** Reads the effective target of Host plan mode; null means the Host supplied no usable projection. */
export function readHostPlanMode(projections: HostProjections): boolean | null {
  const value = projections?.plan
  if (!value || typeof value !== 'object') return null
  const plan = value as Partial<HostPlanProjection>
  if (typeof plan.active !== 'boolean' || typeof plan.pending !== 'boolean') return null
  return plan.pending ? !plan.active : plan.active
}

/** Reads only a complete, schema-valid Host todo snapshot; null means no current list. */
export function readHostTodos(projections: HostProjections): HostTodoItem[] | null {
  const value = projections?.todos
  if (!Array.isArray(value)) return null
  const isTodoItem = (item: unknown): item is HostTodoItem => item !== null
    && typeof item === 'object'
    && typeof (item as HostTodoItem).content === 'string'
    && ((item as HostTodoItem).status === 'pending'
      || (item as HostTodoItem).status === 'in_progress'
      || (item as HostTodoItem).status === 'completed')
  if (!value.every(isTodoItem)) return null
  return value.map((item) => ({ content: item.content, status: item.status }))
}

