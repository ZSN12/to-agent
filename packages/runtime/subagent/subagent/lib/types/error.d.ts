/**
 * Typed failures shared by subagent service and provider operations.
 *
 * @module @z/dsh-subagent
 */
import { HarnessError } from '@z/dsh-llm';
/** Typed failure for the subagent seam. */
export declare class SubagentError extends HarnessError {
    constructor(message: string, code: string, options?: ErrorOptions);
}
//# sourceMappingURL=error.d.ts.map