/**
 * Vocabulary for the subprocess Service Definition: fully-specified spawn requests with
 * Node-shaped per-stream stdio modes, bounded collected output with spill
 * recovery, raw piped streams, and tree-scoped termination. Command
 * defaulting, shell semantics, protocol framing, and presentation belong to
 * consumers such as the bash executor seam.
 * @module dsh-subprocess/types
 */
/** Namespace prefix reserved for TaskWeaver-managed child environment facts. */
export const TASKWEAVER_ENV_PREFIX = 'TASKWEAVER_';
/** Legacy prefixes are scrubbed so old identities and secrets never leak to child processes. */
export const LEGACY_TASKWEAVER_ENV_PREFIXES = ['DSH_', 'Z_'];
/** @deprecated Use {@link TASKWEAVER_ENV_PREFIX}. */
export const DSH_ENV_PREFIX = 'DSH_';
/** @deprecated Use {@link TASKWEAVER_ENV_PREFIX}. */
export const Z_ENV_PREFIX = 'Z_';
//# sourceMappingURL=types.js.map