"use strict";
/**
 * dsh-llm's owned branded ids: tool-call correlation and provider request
 * diagnostics.
 *
 * The `Branded<B>` primitive itself lives in `@z/dsh-brand` (a
 * zero-dependency type-only package) so every owner of a cross-boundary id can
 * brand it without depending on dsh-llm; see that package's README for the
 * nominal-typing policy.
 *
 * @module @z/dsh-llm/brand
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageId = MessageId;
exports.CallId = CallId;
exports.ProviderRequestId = ProviderRequestId;
exports.ReasoningEffortId = ReasoningEffortId;
/**
 * Brand a message identifier.
 * @param id - the opaque message identifier.
 * @returns the same string, branded; no validation is performed.
 */
function MessageId(id) {
    return id;
}
/**
 * Brand a string as a {@link CallId}.
 * @param id - the provider-issued (or synthesized) call id.
 * @returns the same string, branded; no validation is performed.
 */
function CallId(id) {
    return id;
}
/**
 * Brand a provider-issued request identifier.
 * @param id - the opaque provider-issued string.
 * @returns the same string, branded; no validation is performed.
 */
function ProviderRequestId(id) {
    return id;
}
/**
 * Brand an adapter-owned reasoning-effort identifier.
 * @param id - the opaque identifier exposed by one model capability.
 * @returns the same string, branded; no validation is performed.
 */
function ReasoningEffortId(id) {
    return id;
}
