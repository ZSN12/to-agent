import type { DshProjectedToolCall, ToolTraceItem } from '../../shared/app-api'

export type DshAssistantToolGroupFilter = {
  step?: number
  steps?: readonly number[]
}

type ToolCallLike = Pick<DshProjectedToolCall | ToolTraceItem, 'toolName' | 'step'>

export function filterDshAssistantToolCalls<T extends ToolCallLike>(
  calls: readonly T[] | undefined,
  filter: DshAssistantToolGroupFilter = {},
): T[] {
  return (calls ?? []).filter((call) => {
    const step = call.step || 1
    if (filter.step !== undefined && step !== filter.step) return false
    if (filter.steps !== undefined && !filter.steps.includes(step)) return false
    return true
  })
}
