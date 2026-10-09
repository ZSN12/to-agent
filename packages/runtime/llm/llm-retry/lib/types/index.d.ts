/**
 * Provider-routed model-request retry policy on the agent loop's request
 * recovery extension point. Each scheduled retry is durable before its cancellable wait.
 *
 * @module @z/dsh-llm-retry
 */
import type { Context } from '@z/cordis';
import z from '@z/schemastery';
export type { LlmRetryEventData, LlmRetryStartedEventData } from './types.ts';
export { RetryId } from './brand.ts';
export declare const name = "llm-retry";
export declare const inject: string[];
/** This policy executor has no config; providers own `retryPolicy`. */
export type Config = Readonly<Record<string, never>>;
/** Runtime schema for {@link Config}. */
export declare const Config: z<Config>;
/** Non-serializable hooks used to make timing policy deterministic in tests. */
export interface RetryInternals {
    /** Random sample in the inclusive zero-to-one range used for jitter. */
    random?: () => number;
    /** Test seam for TaskWeaver's finite provider retry ceiling. */
    taskweaverEmbedded?: boolean;
}
/**
 * Install provider-routed normal or unbounded request recovery.
 * @param ctx - plugin context that owns the listener and active waits.
 * @param config - empty executor config; provider registrations own policy.
 * @param internals - non-serializable deterministic hooks for tests.
 */
export declare function apply(ctx: Context, config?: Config, internals?: RetryInternals): void;
//# sourceMappingURL=index.d.ts.map