import type { Agent } from '@taskweaver/dsh-agent';
/** A model-authored request to run the desktop's existing DAG planner. */
export interface OrchestrationRequest {
    goal: string;
    /** Optional facts or file references already gathered by the main agent. */
    context?: string;
    /** Require a read-only plan and execution even when the goal text is ambiguous. */
    readOnly?: boolean;
    callId: string;
    agent: Agent;
    signal?: AbortSignal;
}
export interface OrchestrationTaskStatus {
    id: string;
    title: string;
    status: string;
}
/** Compact result returned to the calling model after the DAG run settles. */
export interface OrchestrationResult {
    summary: string;
    runId: string | null;
    taskCount: number;
    failedTaskCount: number;
    cancelled: boolean;
    taskStatuses: OrchestrationTaskStatus[];
    changedFiles: string[];
}
export interface OrchestrationProvider {
    run(request: OrchestrationRequest): Promise<OrchestrationResult>;
}
//# sourceMappingURL=types.d.ts.map