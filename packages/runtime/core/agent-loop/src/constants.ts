/** Shared agent-loop scheduler defaults.
 * @module dsh-agent-loop/constants
 */

/** Default maximum in-flight parallel-safe calls per agent step. */
export const DEFAULT_MAX_PARALLEL_TOOL_CALLS = 10

/** Per-turn ceiling prevents a cyclic tool/model route from running forever. */
export const DEFAULT_MAX_AGENT_STEPS = 128
