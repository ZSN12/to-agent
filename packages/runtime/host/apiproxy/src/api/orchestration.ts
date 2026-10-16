import type { SessionId } from '@taskweaver/dsh-session/types'

/** Successful value returned by the desktop's DAG runner. */
export interface OrchestrationResponsePayload {
  sessionId: SessionId
  summary: string
  runId: string | null
  taskCount: number
  failedTaskCount: number
  cancelled: boolean
  taskStatuses: Array<{ id: string; title: string; status: string }>
  changedFiles: string[]
}
