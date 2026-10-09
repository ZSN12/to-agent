"use strict";
/**
 * Message-layer zod schemas: the four wire full forms + error body +
 * carrier receipt. The payload slot is unknown in the full-form schemas — business payloads
 * get a second parse dispatched by method (two-level parse discipline).
 * Brand cast point: rpcIdSchema, and only there.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rpcReceiptSchema = exports.rpcMessageSchema = exports.clientResponseSchema = exports.serverRequestSchema = exports.serverResponseSchema = exports.clientRequestSchema = exports.rpcErrorSchema = exports.rpcIdSchema = void 0;
exports.rpcResultSchema = rpcResultSchema;
var zod_1 = require("zod");
/**
 * RpcId: one brand cast after schema validation (the only cast point in this
 * file). No min-length: the id is an opaque echo token, and rejecting values
 * here would only turn a correlatable error report into a client-side parse
 * failure (the handler substitutes a sentinel when a request's id is unreadable).
 */
exports.rpcIdSchema = zod_1.z.string();
/** Error body: discriminated by code, per-branch details aligned to RpcErrorDetailsMap; details is required. */
exports.rpcErrorSchema = zod_1.z.discriminatedUnion('code', [
    zod_1.z.object({ code: zod_1.z.literal('bad-request'), message: zod_1.z.string(), details: zod_1.z.object({ issues: zod_1.z.array(zod_1.z.custom()) }) }),
    zod_1.z.object({ code: zod_1.z.literal('cancelled'), message: zod_1.z.string(), details: zod_1.z.object({}) }),
    zod_1.z.object({ code: zod_1.z.literal('session-not-found'), message: zod_1.z.string(), details: zod_1.z.object({ sessionId: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('model-unavailable'), message: zod_1.z.string(), details: zod_1.z.object({ provider: zod_1.z.string(), model: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('session-conflict'), message: zod_1.z.string(), details: zod_1.z.object({ sessionId: zod_1.z.string(), requestedCwd: zod_1.z.string(), existingCwd: zod_1.z.string().optional() }) }),
    zod_1.z.object({ code: zod_1.z.literal('invalid-time-zone'), message: zod_1.z.string(), details: zod_1.z.object({ value: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('workspace-attach-failed'), message: zod_1.z.string(), details: zod_1.z.object({ sessionId: zod_1.z.string(), workspaceId: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('workspace-not-found'), message: zod_1.z.string(), details: zod_1.z.object({ workspaceId: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('workspace-invalid-path'), message: zod_1.z.string(), details: zod_1.z.object({ path: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('workspace-name-conflict'), message: zod_1.z.string(), details: zod_1.z.object({ name: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('workspace-move-invalid'), message: zod_1.z.string(), details: zod_1.z.object({ workspaceId: zod_1.z.string(), sessionId: zod_1.z.string(), beforeSessionId: zod_1.z.string().optional() }) }),
    zod_1.z.object({ code: zod_1.z.literal('directory-unreadable'), message: zod_1.z.string(), details: zod_1.z.object({ path: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('directory-exists'), message: zod_1.z.string(), details: zod_1.z.object({ path: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('directory-create-failed'), message: zod_1.z.string(), details: zod_1.z.object({ path: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('directory-picker-unavailable'), message: zod_1.z.string(), details: zod_1.z.object({ capability: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('agent-preset-read-only'), message: zod_1.z.string(), details: zod_1.z.object({ agentPreset: zod_1.z.string(), reason: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('agent-preset-locked'), message: zod_1.z.string(), details: zod_1.z.object({ sessionId: zod_1.z.string(), agentPreset: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('agent-preset-conflict'), message: zod_1.z.string(), details: zod_1.z.object({ sessionId: zod_1.z.string(), requestedPreset: zod_1.z.string(), existingPreset: zod_1.z.string().optional() }) }),
    zod_1.z.object({ code: zod_1.z.literal('agent-preset-not-found'), message: zod_1.z.string(), details: zod_1.z.object({ agentPreset: zod_1.z.string(), available: zod_1.z.array(zod_1.z.string()) }) }),
    zod_1.z.object({ code: zod_1.z.literal('agent-preset-invalid'), message: zod_1.z.string(), details: zod_1.z.object({ agentPreset: zod_1.z.string(), reason: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('agent-busy'), message: zod_1.z.string(), details: zod_1.z.object({ reason: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('attachment-error'), message: zod_1.z.string(), details: zod_1.z.object({ reason: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('queue-item-not-found'), message: zod_1.z.string(), details: zod_1.z.object({ itemId: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('steer-unavailable'), message: zod_1.z.string(), details: zod_1.z.object({ itemId: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('command-error'), message: zod_1.z.string(), details: zod_1.z.object({}) }),
    zod_1.z.object({ code: zod_1.z.literal('unknown-command'), message: zod_1.z.string(), details: zod_1.z.object({}) }),
    zod_1.z.object({ code: zod_1.z.literal('settings-rejected'), message: zod_1.z.string(), details: zod_1.z.object({ ns: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('settings-conflict'), message: zod_1.z.string(), details: zod_1.z.object({ ns: zod_1.z.string(), expected: zod_1.z.number(), actual: zod_1.z.number() }) }),
    zod_1.z.object({ code: zod_1.z.literal('credential-rejected'), message: zod_1.z.string(), details: zod_1.z.object({ ref: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('model-discovery-failed'), message: zod_1.z.string(), details: zod_1.z.object({ settingsNs: zod_1.z.string(), baseURL: zod_1.z.string().optional() }) }),
    zod_1.z.object({ code: zod_1.z.literal('title-invalid'), message: zod_1.z.string(), details: zod_1.z.object({ sessionId: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('fork-unavailable'), message: zod_1.z.string(), details: zod_1.z.object({ sessionId: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('subagent-parent-unavailable'), message: zod_1.z.string(), details: zod_1.z.object({ parentSessionId: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('subagent-not-found'), message: zod_1.z.string(), details: zod_1.z.object({ parentSessionId: zod_1.z.string(), childSessionId: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('subagent-catalog-diagnostic'), message: zod_1.z.string(), details: zod_1.z.object({
            parentSessionId: zod_1.z.string(),
            childSessionId: zod_1.z.string(),
            reason: zod_1.z.union([zod_1.z.literal('corrupt'), zod_1.z.literal('unsupported'), zod_1.z.literal('unavailable')]),
        }) }),
    zod_1.z.object({ code: zod_1.z.literal('subagent-not-resumable'), message: zod_1.z.string(), details: zod_1.z.object({ childSessionId: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('subagent-unauthorized'), message: zod_1.z.string(), details: zod_1.z.object({ childSessionId: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('subagent-delivery-unavailable'), message: zod_1.z.string(), details: zod_1.z.object({ childSessionId: zod_1.z.string() }) }),
    zod_1.z.object({ code: zod_1.z.literal('internal'), message: zod_1.z.string(), details: zod_1.z.object({}) }),
]);
/**
 * Business success/failure result schema (generic, reusable).
 * @param value - Schema for the business value.
 * @returns Schema for RpcResult<T>.
 */
function rpcResultSchema(value) {
    return zod_1.z.union([
        zod_1.z.object({ ok: zod_1.z.literal(true), value: value }),
        zod_1.z.object({ ok: zod_1.z.literal(false), error: exports.rpcErrorSchema }),
    ]);
}
// ---- The four wire full-form schemas (payload/result.value slots stay wide — business layer does the second parse) ----
// The wide value slot is optional: a void business result serializes with no
// `value` field at all. Each endpoint's own second parse still requires its
// declared value, so absence never passes for a method that returns data.
/** ClientRequest full form (payload stays wide — the business layer runs the second parse). */
exports.clientRequestSchema = zod_1.z.object({
    type: zod_1.z.literal('client-request'),
    rpcId: exports.rpcIdSchema,
    method: zod_1.z.string(),
    payload: zod_1.z.unknown(),
});
/** ServerResponse full form (result.value stays wide). */
exports.serverResponseSchema = zod_1.z.object({
    type: zod_1.z.literal('server-response'),
    rpcId: exports.rpcIdSchema,
    result: rpcResultSchema(zod_1.z.unknown().optional()),
});
/** ServerRequest full form (payload stays wide). */
exports.serverRequestSchema = zod_1.z.object({
    type: zod_1.z.literal('server-request'),
    rpcId: exports.rpcIdSchema,
    method: zod_1.z.string(),
    payload: zod_1.z.unknown(),
});
/** ClientResponse full form (result.value stays wide). */
exports.clientResponseSchema = zod_1.z.object({
    type: zod_1.z.literal('client-response'),
    rpcId: exports.rpcIdSchema,
    result: rpcResultSchema(zod_1.z.unknown().optional()),
});
/** Wire full-form union (discriminated by type). */
exports.rpcMessageSchema = zod_1.z.discriminatedUnion('type', [
    exports.clientRequestSchema,
    exports.serverResponseSchema,
    exports.serverRequestSchema,
    exports.clientResponseSchema,
]);
/** Carrier receipt schema. */
exports.rpcReceiptSchema = zod_1.z.union([
    zod_1.z.object({ accepted: zod_1.z.literal(true) }),
    zod_1.z.object({ accepted: zod_1.z.literal(false), reason: zod_1.z.union([zod_1.z.literal('not-pending'), zod_1.z.literal('bad-response')]) }),
]);
