/** Host-owned seam for model-requested TaskWeaver DAG runs. */
import { Context, Service } from '@taskweaver/cordis';
import { HarnessError } from '@taskweaver/dsh-llm';
import type { OrchestrationProvider, OrchestrationRequest, OrchestrationResult } from './types.ts';
declare module '@taskweaver/cordis' {
    interface Context {
        orchestration: OrchestrationService;
    }
}
export type { OrchestrationProvider, OrchestrationRequest, OrchestrationResult, OrchestrationTaskStatus } from './types.ts';
export declare class OrchestrationToolError extends HarnessError {
    constructor(message: string, code: string, options?: ErrorOptions);
}
/** Agent-facing capability whose sole provider lives in the desktop Host bridge. */
export declare class OrchestrationService extends Service {
    private provider;
    constructor(ctx: Context);
    registerProvider(provider: OrchestrationProvider): () => void;
    run(request: OrchestrationRequest): Promise<OrchestrationResult>;
}
export default OrchestrationService;
//# sourceMappingURL=index.d.ts.map