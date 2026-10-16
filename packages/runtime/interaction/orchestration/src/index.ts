/** Host-owned seam for model-requested TaskWeaver DAG runs. */

import { Context, Service } from '@taskweaver/cordis'
import { HarnessError } from '@taskweaver/dsh-llm'
import type { OrchestrationProvider, OrchestrationRequest, OrchestrationResult } from './types.ts'

declare module '@taskweaver/cordis' {
  interface Context {
    orchestration: OrchestrationService
  }
}

export type { OrchestrationProvider, OrchestrationRequest, OrchestrationResult, OrchestrationTaskStatus } from './types.ts'

export class OrchestrationToolError extends HarnessError {
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'OrchestrationToolError'
  }
}

/** Agent-facing capability whose sole provider lives in the desktop Host bridge. */
export class OrchestrationService extends Service {
  private provider: OrchestrationProvider | undefined

  constructor(ctx: Context) {
    super(ctx, 'orchestration')
  }

  registerProvider(provider: OrchestrationProvider): () => void {
    const dispose = this.ctx.effect(function* (this: OrchestrationService) {
      if (this.provider !== undefined) {
        throw new OrchestrationToolError('a DAG orchestration provider is already registered', 'DUPLICATE_PROVIDER')
      }
      this.provider = provider
      yield () => { this.provider = undefined }
    }.bind(this), 'orchestration.registerProvider()')
    return () => void dispose()
  }

  async run(request: OrchestrationRequest): Promise<OrchestrationResult> {
    if (request.signal?.aborted) {
      throw new OrchestrationToolError('DAG orchestration was cancelled before dispatch', 'ORCHESTRATION_ABORTED')
    }
    if (typeof request.goal !== 'string') {
      throw new OrchestrationToolError('orchestrate requires a text goal', 'INVALID_GOAL')
    }
    const goal = request.goal.trim()
    if (!goal) throw new OrchestrationToolError('orchestrate requires a non-empty goal', 'EMPTY_GOAL')
    if (goal.length > 20_000) throw new OrchestrationToolError('orchestrate goal exceeds the 20,000-character limit', 'GOAL_TOO_LARGE')
    if (request.context !== undefined && typeof request.context !== 'string') {
      throw new OrchestrationToolError('orchestrate context must be text', 'INVALID_CONTEXT')
    }
    if (request.context !== undefined && request.context.length > 20_000) {
      throw new OrchestrationToolError('orchestrate context exceeds the 20,000-character limit', 'CONTEXT_TOO_LARGE')
    }
    const context = request.context?.trim()
    if (request.readOnly !== undefined && typeof request.readOnly !== 'boolean') {
      throw new OrchestrationToolError('orchestrate readOnly must be a boolean', 'INVALID_READ_ONLY')
    }

    if (typeof request.callId !== 'string' || !request.callId.trim()) {
      throw new OrchestrationToolError('DAG orchestration requires a tool-call id', 'MISSING_CALLER')
    }
    const agent = request.agent
    if (agent === undefined || typeof agent.id !== 'string') {
      throw new OrchestrationToolError('DAG orchestration requires a live calling agent', 'MISSING_CALLER')
    }
    const agents = this.ctx.get('agents')
    if (agents === undefined || agents.get(agent.id) !== agent) {
      throw new OrchestrationToolError('DAG orchestration requires the exact live calling agent', 'CALLER_NOT_LIVE')
    }
    if (!agents.roots().includes(agent)) {
      throw new OrchestrationToolError('nested DAG orchestration from a child agent is not supported', 'DELEGATED_CALLER')
    }
    if (!this.provider) throw new OrchestrationToolError('no DAG orchestration provider is registered', 'NO_PROVIDER')
    const result = await this.provider.run({
      ...request,
      goal,
      ...(context ? { context } : {}),
      readOnly: request.readOnly === true,
    })
    return {
      ...result,
      taskStatuses: Array.isArray(result.taskStatuses) ? result.taskStatuses : [],
      changedFiles: Array.isArray(result.changedFiles) ? result.changedFiles : [],
    }
  }
}

export default OrchestrationService
