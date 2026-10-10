/**
 * Typed failures shared by subagent service and provider operations.
 *
 * @module @taskweaver/dsh-subagent
 */
import { HarnessError } from '@taskweaver/dsh-llm';
/** Typed failure for the subagent seam. */
export declare class SubagentError extends HarnessError {
    constructor(message: string, code: string, options?: ErrorOptions);
}
//# sourceMappingURL=error.d.ts.map