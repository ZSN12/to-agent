"use strict";
/** Zod schemas for the browser-safe subagent domain. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.subagentPromptValueSchema = exports.subagentInterruptValueSchema = exports.subagentInterruptRequestSchema = exports.subagentPromptRequestSchema = exports.subagentHistoryValueSchema = exports.subagentHistoryRequestSchema = exports.subagentListValueSchema = exports.subagentListRequestSchema = exports.subagentListEntrySchema = void 0;
var zod_1 = require("zod");
var sessions_schema_ts_1 = require("./sessions.schema.ts");
/** Healthy and diagnostic durable catalog rows. */
exports.subagentListEntrySchema = zod_1.z.union([
    zod_1.z.object({
        kind: zod_1.z.literal('child'),
        id: sessions_schema_ts_1.sessionIdSchema,
        mode: zod_1.z.literal('one-shot'),
        activity: zod_1.z.union([zod_1.z.literal('running'), zod_1.z.literal('inactive')]),
        hasChildren: zod_1.z.boolean(),
        label: zod_1.z.string().optional(),
    }),
    zod_1.z.object({
        kind: zod_1.z.literal('child'),
        id: sessions_schema_ts_1.sessionIdSchema,
        mode: zod_1.z.literal('continuable'),
        activity: zod_1.z.union([zod_1.z.literal('running'), zod_1.z.literal('inactive')]),
        hasChildren: zod_1.z.boolean(),
        label: zod_1.z.string(),
    }),
    zod_1.z.object({
        kind: zod_1.z.literal('diagnostic'),
        id: sessions_schema_ts_1.sessionIdSchema,
        reason: zod_1.z.union([zod_1.z.literal('corrupt'), zod_1.z.literal('unsupported'), zod_1.z.literal('unavailable')]),
    }),
]);
/** subagent.list request payload. */
exports.subagentListRequestSchema = zod_1.z.object({
    parentSessionId: sessions_schema_ts_1.sessionIdSchema,
});
/** subagent.list response value. */
exports.subagentListValueSchema = zod_1.z.object({
    entries: zod_1.z.array(exports.subagentListEntrySchema),
    parentAvailable: zod_1.z.boolean(),
});
/** subagent.history request payload. */
exports.subagentHistoryRequestSchema = zod_1.z.object({
    parentSessionId: sessions_schema_ts_1.sessionIdSchema,
    childSessionId: sessions_schema_ts_1.sessionIdSchema,
    mode: zod_1.z.union([zod_1.z.literal('one-shot'), zod_1.z.literal('continuable')]),
    beforeSeq: zod_1.z.number().int().nonnegative().optional(),
    maxMessages: zod_1.z.number().int().positive().optional(),
});
/** subagent.history response value. */
exports.subagentHistoryValueSchema = zod_1.z.object({
    events: zod_1.z.array(sessions_schema_ts_1.historyEntrySchema),
    hasMore: zod_1.z.boolean(),
    projections: sessions_schema_ts_1.sessionProjectionsBlockSchema.optional(),
});
/** subagent.prompt request payload. */
exports.subagentPromptRequestSchema = zod_1.z.object({
    parentSessionId: sessions_schema_ts_1.sessionIdSchema,
    childSessionId: sessions_schema_ts_1.sessionIdSchema,
    mode: zod_1.z.literal('continuable'),
    content: zod_1.z.array(sessions_schema_ts_1.contentBlockSchema),
    clientTimeZone: zod_1.z.string().optional(),
});
/** subagent.interrupt request payload. */
exports.subagentInterruptRequestSchema = zod_1.z.object({
    parentSessionId: sessions_schema_ts_1.sessionIdSchema,
    childSessionId: sessions_schema_ts_1.sessionIdSchema,
    mode: zod_1.z.literal('continuable'),
});
/** subagent.interrupt response value. */
exports.subagentInterruptValueSchema = zod_1.z.object({
    accepted: zod_1.z.literal(true),
});
var messageIdSchema = zod_1.z.string();
/** subagent.prompt response value. */
exports.subagentPromptValueSchema = zod_1.z.object({
    messageId: messageIdSchema,
});
