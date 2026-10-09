"use strict";
/**
 * events domain zod schemas: MuxFrame / HostFrame unions (discriminatedUnion('type')).
 * A frame is the payload slot of the ServerRequest full form; the SessionEvent inside
 * a session/event frame reuses sessions.schema's strict-envelope + wide-data passthrough branch.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hostFrameSchema = exports.muxFrameSchema = exports.askUserQuestionItemSchema = void 0;
var zod_1 = require("zod");
var rpc_schema_ts_1 = require("./rpc.schema.ts");
var approvals_schema_ts_1 = require("./approvals.schema.ts");
var sessions_schema_ts_1 = require("./sessions.schema.ts");
var jobs_schema_ts_1 = require("./jobs.schema.ts");
var workspace_schema_ts_1 = require("./workspace.schema.ts");
/** Question fields validated strictly against core dsh-user-questions. */
exports.askUserQuestionItemSchema = zod_1.z.object({
    id: zod_1.z.string(),
    question: zod_1.z.string(),
    header: zod_1.z.string().optional(),
    detail: zod_1.z.string().optional(),
    options: zod_1.z.array(zod_1.z.object({ label: zod_1.z.string(), description: zod_1.z.string().optional() })).optional(),
    multiSelect: zod_1.z.boolean().optional(),
    // Presentation intent: a tagged union on the wire, so an unknown tag is a
    // rejected frame rather than a silently generic render.
    intent: zod_1.z.discriminatedUnion('kind', [
        zod_1.z.object({ kind: zod_1.z.literal('plan-review'), approve: zod_1.z.string() }),
    ]).optional(),
});
/** Unified message envelope carried by transient queue frames. */
var messageSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    role: zod_1.z.union([zod_1.z.literal('system'), zod_1.z.literal('user'), zod_1.z.literal('assistant')]),
    content: zod_1.z.array(sessions_schema_ts_1.contentBlockSchema),
    source: zod_1.z.looseObject({ kind: zod_1.z.string() }),
});
/** MuxFrame union (payload slot of a mux-stream ServerRequest). */
exports.muxFrameSchema = zod_1.z.discriminatedUnion('type', [
    zod_1.z.object({ type: zod_1.z.literal('session/event'), sessionId: sessions_schema_ts_1.sessionIdSchema, event: sessions_schema_ts_1.sessionEventSchema, view: sessions_schema_ts_1.toolEventViewSchema.optional() }),
    zod_1.z.object({ type: zod_1.z.literal('session/subscribed'), sessionId: sessions_schema_ts_1.sessionIdSchema, lastSeq: zod_1.z.number().int() }),
    zod_1.z.object({ type: zod_1.z.literal('approval/requested'), sessionId: sessions_schema_ts_1.sessionIdSchema, approvalId: approvals_schema_ts_1.approvalRequestIdSchema, toolName: zod_1.z.string(), callId: zod_1.z.string().optional(), reason: zod_1.z.string().optional() }),
    zod_1.z.object({ type: zod_1.z.literal('approval/resolved'), sessionId: sessions_schema_ts_1.sessionIdSchema, approvalId: approvals_schema_ts_1.approvalRequestIdSchema, outcome: zod_1.z.union([zod_1.z.literal('allowed-once'), zod_1.z.literal('rejected'), zod_1.z.literal('cancelled'), zod_1.z.literal('unavailable')]) }),
    // Non-empty by wire contract: the user-questions service rejects empty
    // batches at ask() (EMPTY_QUESTIONS), so an empty frame is host breakage
    // and must fail loud here, not reach the composer.
    zod_1.z.object({ type: zod_1.z.literal('question/requested'), sessionId: sessions_schema_ts_1.sessionIdSchema, questions: zod_1.z.array(exports.askUserQuestionItemSchema).min(1) }),
    zod_1.z.object({ type: zod_1.z.literal('question/resolved'), sessionId: sessions_schema_ts_1.sessionIdSchema, questionRpcId: rpc_schema_ts_1.rpcIdSchema, outcome: zod_1.z.union([zod_1.z.literal('answered'), zod_1.z.literal('cancelled')]) }),
    zod_1.z.object({
        type: zod_1.z.literal('session/queue'),
        sessionId: sessions_schema_ts_1.sessionIdSchema,
        items: zod_1.z.array(zod_1.z.object({
            id: sessions_schema_ts_1.messageIdSchema,
            placement: zod_1.z.union([zod_1.z.literal('queued'), zod_1.z.literal('steering'), zod_1.z.literal('context')]),
            message: messageSchema,
        })),
    }),
    zod_1.z.object({ type: zod_1.z.literal('session/jobs'), sessionId: sessions_schema_ts_1.sessionIdSchema, jobs: zod_1.z.array(jobs_schema_ts_1.taskViewSchema) }),
    // value stays wide: it already passed its unit's own schema on the host,
    // and deep-validating here would import every domain's schema into the carrier.
    zod_1.z.object({ type: zod_1.z.literal('session/projection'), sessionId: sessions_schema_ts_1.sessionIdSchema, key: zod_1.z.string().min(1), value: zod_1.z.unknown(), seq: zod_1.z.number().int().nonnegative() }),
    zod_1.z.object({ type: zod_1.z.literal('stream/error'), error: rpc_schema_ts_1.rpcErrorSchema }),
]);
/** HostFrame union (payload slot of a host-stream ServerRequest). */
exports.hostFrameSchema = zod_1.z.discriminatedUnion('type', [
    zod_1.z.object({
        type: zod_1.z.literal('host/session-added'),
        sessionId: sessions_schema_ts_1.sessionIdSchema,
        blank: zod_1.z.boolean(),
        parentSessionId: sessions_schema_ts_1.sessionIdSchema.optional(),
        origin: zod_1.z.literal('subagent').optional(),
        cwd: zod_1.z.string().optional(),
        agentPreset: zod_1.z.string().optional(),
    }),
    zod_1.z.object({ type: zod_1.z.literal('host/session-removed'), sessionId: sessions_schema_ts_1.sessionIdSchema }),
    zod_1.z.object({ type: zod_1.z.literal('host/session-status'), sessionId: sessions_schema_ts_1.sessionIdSchema, running: zod_1.z.boolean() }),
    zod_1.z.object({ type: zod_1.z.literal('host/agent-error'), sessionId: sessions_schema_ts_1.sessionIdSchema, message: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal('host/workspace-changed'), workspace: workspace_schema_ts_1.workspaceViewSchema }),
    zod_1.z.object({ type: zod_1.z.literal('host/workspace-removed'), workspaceId: workspace_schema_ts_1.workspaceIdSchema }),
    zod_1.z.object({ type: zod_1.z.literal('host/workspace-order-changed'), workspaceIds: zod_1.z.array(workspace_schema_ts_1.workspaceIdSchema) }),
    zod_1.z.object({ type: zod_1.z.literal('host/archived-sessions-changed'), archivedSessionIds: zod_1.z.array(sessions_schema_ts_1.sessionIdSchema) }),
    // args stays wide, the same posture as session/projection's value: the frame
    // arrives from JSON.parse, so every element is already a JSON value, and the
    // structural contract belongs to the owner package's cordis `Events`
    // declaration — the host validated JSON-safety before forwarding.
    zod_1.z.object({ type: zod_1.z.literal('host/remote-event'), event: zod_1.z.string().min(1), args: zod_1.z.array(zod_1.z.unknown()) }),
    zod_1.z.object({ type: zod_1.z.literal('stream/error'), error: rpc_schema_ts_1.rpcErrorSchema }),
]);
