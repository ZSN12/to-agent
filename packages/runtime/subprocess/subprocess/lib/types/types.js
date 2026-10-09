"use strict";
/**
 * Vocabulary for the subprocess Service Definition: fully-specified spawn requests with
 * Node-shaped per-stream stdio modes, bounded collected output with spill
 * recovery, raw piped streams, and tree-scoped termination. Command
 * defaulting, shell semantics, protocol framing, and presentation belong to
 * consumers such as the bash executor seam.
 * @module dsh-subprocess/types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Z_ENV_PREFIX = exports.DSH_ENV_PREFIX = void 0;
/** Namespace prefix reserved for DeepSeek Harness-managed child environment facts. */
exports.DSH_ENV_PREFIX = 'DSH_';
/** TaskWeaver / Z runtime managed child environment facts (`Z_HOME`, `Z_SESSION_ID`, …). */
exports.Z_ENV_PREFIX = 'Z_';
