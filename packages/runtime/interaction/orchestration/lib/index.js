/** Host-owned seam for model-requested TaskWeaver DAG runs. */
import { Service } from '@taskweaver/cordis';
import { HarnessError } from '@taskweaver/dsh-llm';
export class OrchestrationToolError extends HarnessError {
    constructor(message, code, options) {
        super(message, code, options);
        this.name = 'OrchestrationToolError';
    }
}
/** Agent-facing capability whose sole provider lives in the desktop Host bridge. */
export class OrchestrationService extends Service {
    provider;
    constructor(ctx) {
        super(ctx, 'orchestration');
    }
    registerProvider(provider) {
        const dispose = this.ctx.effect(function* () {
            if (this.provider !== undefined) {
                throw new OrchestrationToolError('a DAG orchestration provider is already registered', 'DUPLICATE_PROVIDER');
            }
            this.provider = provider;
            yield () => { this.provider = undefined; };
        }.bind(this), 'orchestration.registerProvider()');
        return () => void dispose();
    }
    async run(request) {
        if (request.signal?.aborted) {
            throw new OrchestrationToolError('DAG orchestration was cancelled before dispatch', 'ORCHESTRATION_ABORTED');
        }
        if (typeof request.goal !== 'string') {
            throw new OrchestrationToolError('orchestrate requires a text goal', 'INVALID_GOAL');
        }
        const goal = request.goal.trim();
        if (!goal)
            throw new OrchestrationToolError('orchestrate requires a non-empty goal', 'EMPTY_GOAL');
        if (goal.length > 20_000)
            throw new OrchestrationToolError('orchestrate goal exceeds the 20,000-character limit', 'GOAL_TOO_LARGE');
        if (typeof request.callId !== 'string' || !request.callId.trim()) {
            throw new OrchestrationToolError('DAG orchestration requires a tool-call id', 'MISSING_CALLER');
        }
        const agent = request.agent;
        if (agent === undefined || typeof agent.id !== 'string') {
            throw new OrchestrationToolError('DAG orchestration requires a live calling agent', 'MISSING_CALLER');
        }
        const agents = this.ctx.get('agents');
        if (agents === undefined || agents.get(agent.id) !== agent) {
            throw new OrchestrationToolError('DAG orchestration requires the exact live calling agent', 'CALLER_NOT_LIVE');
        }
        if (!agents.roots().includes(agent)) {
            throw new OrchestrationToolError('nested DAG orchestration from a child agent is not supported', 'DELEGATED_CALLER');
        }
        if (!this.provider)
            throw new OrchestrationToolError('no DAG orchestration provider is registered', 'NO_PROVIDER');
        return this.provider.run({ ...request, goal });
    }
}
export default OrchestrationService;
//# sourceMappingURL=index.js.map