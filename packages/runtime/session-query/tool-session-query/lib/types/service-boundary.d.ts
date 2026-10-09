/**
 * Session-query service error containment and model-safe translation.
 *
 * @module @z/dsh-tool-session-query/service-boundary
 */
import type { Context } from '@z/cordis';
import { HarnessError } from '@z/dsh-llm';
declare function unauthorizedTarget(): HarnessError;
declare function call<Value>(ctx: Context, signal: AbortSignal, operation: string, invoke: () => Promise<Value>): Promise<Value>;
declare function sanitizeError(ctx: Context, operation: string, error: unknown): HarnessError;
/** Model-safe session-query invocation and error translation boundary. */
export declare const serviceBoundary: {
    unauthorizedTarget: typeof unauthorizedTarget;
    call: typeof call;
    sanitizeError: typeof sanitizeError;
};
export {};
//# sourceMappingURL=service-boundary.d.ts.map