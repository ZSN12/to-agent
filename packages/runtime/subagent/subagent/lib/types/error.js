/**
 * Typed failures shared by subagent service and provider operations.
 *
 * @module @taskweaver/dsh-subagent
 */
import { HarnessError } from '@taskweaver/dsh-llm';
/** Typed failure for the subagent seam. */
export class SubagentError extends HarnessError {
    constructor(message, code, options) {
        super(message, code, options);
        this.name = 'SubagentError';
    }
}
//# sourceMappingURL=error.js.map