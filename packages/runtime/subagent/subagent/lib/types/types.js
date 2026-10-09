"use strict";
/**
 * The seam's consumer-facing contracts: request, result, and capability types
 * for {@link SubagentProvider}, plus the `subagent/start` and `subagent/end`
 * payloads that plugins and hosts observe. Internal control interfaces belong
 * with their implementation — the lifecycle observer in `./lifecycle.ts`, the
 * continuation host in `./continuation.ts` — so this module stays the published
 * surface rather than a bag of everything type-shaped.
 *
 * @module @z/dsh-subagent/types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubagentRunId = SubagentRunId;
/**
 * Brand a string as a {@link SubagentRunId}.
 * @param id - the raw run id.
 * @returns the same string, branded.
 */
function SubagentRunId(id) {
    return id;
}
