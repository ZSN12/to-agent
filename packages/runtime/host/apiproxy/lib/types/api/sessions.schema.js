"use strict";
/**
 * sessions domain zod schemas (names derived from map keys: sessionListRequestSchema /
 * sessionListValueSchema). SessionEvent passthrough = strict envelope (type/seq/time) + wide
 * data: the merge-extensible event API keeps an unknown-type branch at the union level,
 * with no field-level passthrough. SessionId brand cast point: sessionIdSchema, and only there.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionCancelValueSchema = exports.sessionCancelRequestSchema = exports.sessionUpdateQueueValueSchema = exports.sessionUpdateQueueRequestSchema = exports.sessionAttachmentValueSchema = exports.sessionAttachmentRequestSchema = exports.imageAttachmentRefSchema = exports.attachmentIdSchema = exports.sessionPromptValueSchema = exports.sessionPromptRequestSchema = exports.promptContentPartSchema = exports.imageMediaTypeSchema = exports.contentBlockSchema = exports.sessionSelectModelValueSchema = exports.sessionSelectModelRequestSchema = exports.sessionModelsValueSchema = exports.sessionModelsRequestSchema = exports.sessionHistoryValueSchema = exports.imageLimitsProjectionSchema = exports.sessionListMetadataProjectionSchema = exports.sessionProjectionsBlockSchema = exports.historyEntrySchema = exports.toolEventViewSchema = exports.modelCatalogFailureSchema = exports.modelProviderGroupSchema = exports.modelCatalogModelSchema = exports.modelReasoningSchema = exports.modelReasoningEffortSchema = exports.modelSelectionSchema = exports.sessionHistoryRequestSchema = exports.sessionForkValueSchema = exports.sessionForkRequestSchema = exports.sessionRenameValueSchema = exports.sessionRenameRequestSchema = exports.sessionCreateValueSchema = exports.sessionCreateRequestSchema = exports.sessionSearchValueSchema = exports.sessionSearchItemSchema = exports.sessionSearchRequestSchema = exports.sessionListValueSchema = exports.sessionListRequestSchema = exports.sessionSummarySchema = exports.sessionEventSchema = exports.workspaceIdSchema = exports.messageIdSchema = exports.sessionIdSchema = void 0;
var zod_1 = require("zod");
var session_search_ts_1 = require("./session-search.ts");
/** SessionId: one brand cast after schema validation (the only cast point in this domain). */
exports.sessionIdSchema = zod_1.z.string().min(1);
/** MessageId: one brand cast after non-empty string validation. */
exports.messageIdSchema = zod_1.z.string().min(1);
/**
 * WorkspaceId: the workspace domain's one brand cast. Hosted here rather
 * than in workspace.schema because session.create references it while
 * workspace.schema references sessionIdSchema — schema modules must stay a
 * DAG (both casts used at module top level; a cycle is a load-time TDZ).
 */
exports.workspaceIdSchema = zod_1.z.string().min(1);
/** SessionEvent passthrough: strict envelope, wide data (the client fold handles unknown types via its documented default). */
exports.sessionEventSchema = zod_1.z.object({
    type: zod_1.z.string(),
    seq: zod_1.z.number().int().nonnegative(),
    time: zod_1.z.number(),
    data: zod_1.z.unknown(),
    sourceEventSeqs: zod_1.z.array(zod_1.z.number()).optional(),
    surfaceOp: zod_1.z.unknown().optional(),
    ignorable: zod_1.z.literal(true).optional(),
});
/** SessionSummary row of session.list (`projections` reuses the history block's shape and schema). */
exports.sessionSummarySchema = zod_1.z.object({
    sessionId: exports.sessionIdSchema,
    updatedAt: zod_1.z.number(),
    running: zod_1.z.boolean(),
    blank: zod_1.z.boolean(),
    parentSessionId: exports.sessionIdSchema.optional(),
    origin: zod_1.z.literal('subagent').optional(),
    cwd: zod_1.z.string().optional(),
    agentPreset: zod_1.z.string().optional(),
    projections: zod_1.z.lazy(function () { return exports.sessionProjectionsBlockSchema; }).optional(),
});
/** session.list request payload (cursor is a reserved seat, unimplemented in v1). */
exports.sessionListRequestSchema = zod_1.z.object({
    cursor: zod_1.z.string().optional(),
});
/** session.list response value. */
exports.sessionListValueSchema = zod_1.z.object({
    items: zod_1.z.array(exports.sessionSummarySchema),
});
/** Fixed wire bound for one interactive sidebar query. */
var SESSION_SEARCH_QUERY_MAX_CHARS = 500;
/** session.search request payload. */
exports.sessionSearchRequestSchema = zod_1.z.object({
    query: zod_1.z.string().trim().min(1).max(SESSION_SEARCH_QUERY_MAX_CHARS)
        .refine(function (query) { return !query.includes('\0'); }, { message: 'search query must not contain NUL' }),
});
/** One session.search result. */
exports.sessionSearchItemSchema = zod_1.z.object({
    sessionId: exports.sessionIdSchema,
    snippet: zod_1.z.string().refine(function (snippet) { return (0, session_search_ts_1.truncateUnicodeCodePoints)(snippet, session_search_ts_1.SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS) === snippet; }, { message: "search snippet must contain at most ".concat(session_search_ts_1.SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS, " Unicode code points") }),
});
/** session.search response value. */
exports.sessionSearchValueSchema = zod_1.z.object({
    items: zod_1.z.array(exports.sessionSearchItemSchema).max(session_search_ts_1.SESSION_SEARCH_RESULT_LIMIT),
    hasMore: zod_1.z.boolean(),
});
/** session.create request payload (at most one of workspaceId / cwd). */
exports.sessionCreateRequestSchema = zod_1.z.object({
    workspaceId: exports.workspaceIdSchema.optional(),
    cwd: zod_1.z.string().optional(),
    sessionId: exports.sessionIdSchema.optional(),
    agentPreset: zod_1.z.string().optional(),
    /** Parent lineage for a newly created ordinary session. Existing sessions keep their recorded lineage. */
    parentSessionId: exports.sessionIdSchema.optional(),
}).refine(function (payload) { return payload.workspaceId === undefined || payload.cwd === undefined; }, { message: 'session.create accepts workspaceId or cwd, not both' });
/** session.create response value. */
exports.sessionCreateValueSchema = zod_1.z.object({
    sessionId: exports.sessionIdSchema,
    agentPreset: zod_1.z.string().optional(),
});
/** session.rename request payload (raw title; host-side normalization decides acceptance). */
exports.sessionRenameRequestSchema = zod_1.z.object({
    sessionId: exports.sessionIdSchema,
    title: zod_1.z.string(),
});
/** session.rename response value (the normalized accepted title and its event seq). */
exports.sessionRenameValueSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    seq: zod_1.z.number().int().nonnegative(),
});
/** session.fork request payload (atSeq anchors the completed-turn cut). */
exports.sessionForkRequestSchema = zod_1.z.object({
    sessionId: exports.sessionIdSchema,
    atSeq: zod_1.z.number().int().nonnegative().optional(),
});
/** session.fork response value (the child session id). */
exports.sessionForkValueSchema = zod_1.z.object({
    sessionId: exports.sessionIdSchema,
});
/** session.history request payload (beforeSeq/maxMessages page backwards from the window tail). */
exports.sessionHistoryRequestSchema = zod_1.z.object({
    sessionId: exports.sessionIdSchema,
    beforeSeq: zod_1.z.number().int().nonnegative().optional(),
    maxMessages: zod_1.z.number().int().positive().optional(),
});
/** Complete provider/model selection. */
exports.modelSelectionSchema = zod_1.z.object({
    provider: zod_1.z.string().min(1),
    model: zod_1.z.string().min(1),
    reasoningEffort: zod_1.z.string().min(1).optional(),
});
/** One adapter-owned reasoning effort. */
exports.modelReasoningEffortSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
});
/** Exact-model reasoning metadata. */
exports.modelReasoningSchema = zod_1.z.object({
    efforts: zod_1.z.array(exports.modelReasoningEffortSchema).min(1),
    defaultEffort: zod_1.z.string().min(1).optional(),
});
/** One advisory model entry inside a provider group. */
exports.modelCatalogModelSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    reasoning: exports.modelReasoningSchema.optional(),
});
/** One successfully loaded provider group. */
exports.modelProviderGroupSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    models: zod_1.z.array(exports.modelCatalogModelSchema),
});
/** One provider-local catalog failure. */
exports.modelCatalogFailureSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    message: zod_1.z.string(),
});
/**
 * ToolEventView passthrough: lock only the `for` discriminant and the presence
 * of a card-tagged `view` object. The view interior is a host-computed product
 * the client reads without echoing back; deep-validating it would hand-copy
 * the dsh-tools vocabulary into this schema and drift with it.
 */
exports.toolEventViewSchema = zod_1.z.discriminatedUnion('for', [
    zod_1.z.object({ for: zod_1.z.literal('call'), view: zod_1.z.looseObject({ card: zod_1.z.string() }) }),
    zod_1.z.object({ for: zod_1.z.literal('result'), view: zod_1.z.looseObject({ card: zod_1.z.string() }) }),
]);
/** One session.history item: the session event plus its optional host-computed tool view. */
exports.historyEntrySchema = zod_1.z.object({
    event: exports.sessionEventSchema,
    view: exports.toolEventViewSchema.optional(),
});
/**
 * Projection baseline passthrough: `values` stays a wide record — each value
 * was already parsed by its provider's own schema on the host side, and
 * deep-validating here would import every domain's schema into the carrier.
 */
exports.sessionProjectionsBlockSchema = zod_1.z.object({
    // -1 = empty log (the lastSeq convention of session/subscribed).
    asOfSeq: zod_1.z.number().int().min(-1),
    values: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
});
/** Host-side validation for the persisted Session-list projection. */
exports.sessionListMetadataProjectionSchema = zod_1.z.object({
    blank: zod_1.z.boolean(),
    lastPromptAt: zod_1.z.number().nullable(),
});
/**
 * imageLimits projection unit schema (host-side view validation). zod widens
 * `readonly ImageMediaType[]` to `string[]`; on the JSON wire the two
 * serialize identically, so the cast records exactly that widening.
 */
exports.imageLimitsProjectionSchema = zod_1.z.object({
    maxImageBytes: zod_1.z.number().int().positive(),
    maxImagesPerMessage: zod_1.z.number().int().positive(),
    maxMessageImageBytes: zod_1.z.number().int().positive(),
    maxImagePixels: zod_1.z.number().int().positive(),
    maxImageDimension: zod_1.z.number().int().positive(),
    mediaTypes: zod_1.z.array(zod_1.z.string()),
});
/** session.history response value (projections rides the tail page only). */
exports.sessionHistoryValueSchema = zod_1.z.object({
    events: zod_1.z.array(exports.historyEntrySchema),
    hasMore: zod_1.z.boolean(),
    projections: exports.sessionProjectionsBlockSchema.optional(),
});
/** session.models request payload. */
exports.sessionModelsRequestSchema = zod_1.z.object({
    sessionId: exports.sessionIdSchema,
});
/** session.models response value. */
exports.sessionModelsValueSchema = zod_1.z.object({
    current: exports.modelSelectionSchema,
    routable: zod_1.z.boolean(),
    groups: zod_1.z.array(exports.modelProviderGroupSchema),
    failures: zod_1.z.array(exports.modelCatalogFailureSchema),
});
/** session.selectModel request payload. */
exports.sessionSelectModelRequestSchema = zod_1.z.object({
    sessionId: exports.sessionIdSchema,
    provider: zod_1.z.string().min(1),
    model: zod_1.z.string().min(1),
    reasoningEffort: zod_1.z.string().min(1).optional(),
});
/** session.selectModel response value. */
exports.sessionSelectModelValueSchema = zod_1.z.object({
    selected: exports.modelSelectionSchema,
});
/** ContentBlock passthrough: core is merge-extensible — the type discriminant envelope is strict, the rest stays wide. */
exports.contentBlockSchema = zod_1.z.looseObject({ type: zod_1.z.string() });
/** Raster image media types accepted by the version-one browser wire. */
exports.imageMediaTypeSchema = zod_1.z.union([
    zod_1.z.literal('image/png'),
    zod_1.z.literal('image/jpeg'),
    zod_1.z.literal('image/webp'),
    zod_1.z.literal('image/gif'),
]);
/** Prompt wire content is intentionally narrower than merge-extensible durable core content. */
exports.promptContentPartSchema = zod_1.z.discriminatedUnion('type', [
    zod_1.z.object({ type: zod_1.z.literal('text'), text: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal('image'), mediaType: exports.imageMediaTypeSchema, data: zod_1.z.string(), name: zod_1.z.string().optional() }),
]);
/** session.prompt request payload, including optional browser-local request provenance. */
exports.sessionPromptRequestSchema = zod_1.z.object({
    sessionId: exports.sessionIdSchema,
    mode: zod_1.z.union([zod_1.z.literal('queue'), zod_1.z.literal('steer')]),
    content: zod_1.z.array(exports.promptContentPartSchema),
    clientTimeZone: zod_1.z.string().optional(),
    commandOnly: zod_1.z.boolean().optional(),
});
/** session.prompt response value (the command slot appears only when the prompt dispatched a slash command). */
exports.sessionPromptValueSchema = zod_1.z.object({
    accepted: zod_1.z.literal(true),
    command: zod_1.z.object({
        kind: zod_1.z.literal('success'),
        text: zod_1.z.string().optional(),
    }).optional(),
});
/** Opaque attachment id after string-shape validation. */
exports.attachmentIdSchema = zod_1.z.string().min(1);
/** Durable image reference returned from the authenticated session lookup. */
exports.imageAttachmentRefSchema = zod_1.z.object({
    attachmentId: exports.attachmentIdSchema,
    mediaType: exports.imageMediaTypeSchema,
    bytes: zod_1.z.number().int().positive(),
    width: zod_1.z.number().int().positive(),
    height: zod_1.z.number().int().positive(),
    name: zod_1.z.string().optional(),
});
/** session.attachment request payload. */
exports.sessionAttachmentRequestSchema = zod_1.z.object({
    sessionId: exports.sessionIdSchema,
    attachmentId: exports.attachmentIdSchema,
});
/** session.attachment response value. */
exports.sessionAttachmentValueSchema = zod_1.z.object({
    attachment: exports.imageAttachmentRefSchema,
    data: zod_1.z.string(),
});
/** session.updateQueue request payload. */
exports.sessionUpdateQueueRequestSchema = zod_1.z.object({
    sessionId: exports.sessionIdSchema,
    itemId: exports.messageIdSchema,
    action: zod_1.z.discriminatedUnion('kind', [
        zod_1.z.object({ kind: zod_1.z.literal('edit'), content: zod_1.z.array(exports.contentBlockSchema) }),
        zod_1.z.object({ kind: zod_1.z.literal('remove') }),
        zod_1.z.object({ kind: zod_1.z.literal('steer') }),
    ]),
});
/** session.updateQueue response value. */
exports.sessionUpdateQueueValueSchema = zod_1.z.object({
    accepted: zod_1.z.literal(true),
});
/** session.cancel request payload. */
exports.sessionCancelRequestSchema = zod_1.z.object({
    sessionId: exports.sessionIdSchema,
    /** Atomically discard queued user work before aborting the active activity. */
    clearPendingUserInput: zod_1.z.boolean().optional(),
});
/** session.cancel response value. */
exports.sessionCancelValueSchema = zod_1.z.object({
    accepted: zod_1.z.literal(true),
});
