import type { Agent } from '@taskweaver/dsh-agent'

/** A model-authored request to run the desktop's existing DAG planner. */
export interface OrchestrationRequest {
  goal: string
  callId: string
  agent: Agent
  signal?: AbortSignal
}

/** Compact result returned to the calling model after the DAG run settles. */
export interface OrchestrationResult {
  summary: string
  runId: string | null
  taskCount: number
  failedTaskCount: number
  cancelled: boolean
}

export interface OrchestrationProvider {
  run(request: OrchestrationRequest): Promise<OrchestrationResult>
}
