"use strict";
/**
 * workspace domain zod schemas (names derived from map keys). The
 * WorkspaceId brand cast lives in sessions.schema (see the note there) and
 * is re-exported here as the domain-local name.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceArchiveSessionValueSchema = exports.workspaceArchiveSessionRequestSchema = exports.workspaceInsertSessionBeforeValueSchema = exports.workspaceInsertSessionBeforeRequestSchema = exports.workspaceInsertBeforeValueSchema = exports.workspaceInsertBeforeRequestSchema = exports.workspaceDeleteValueSchema = exports.workspaceDeleteRequestSchema = exports.workspaceRenameValueSchema = exports.workspaceRenameRequestSchema = exports.workspaceCreateValueSchema = exports.workspaceCreateRequestSchema = exports.workspaceListValueSchema = exports.workspaceListRequestSchema = exports.workspaceViewSchema = exports.workspaceIdSchema = void 0;
var zod_1 = require("zod");
var sessions_schema_ts_1 = require("./sessions.schema.ts");
var sessions_schema_ts_2 = require("./sessions.schema.ts");
Object.defineProperty(exports, "workspaceIdSchema", { enumerable: true, get: function () { return sessions_schema_ts_2.workspaceIdSchema; } });
/** WorkspaceView row of every workspace.* response. */
exports.workspaceViewSchema = zod_1.z.object({
    workspaceId: sessions_schema_ts_1.workspaceIdSchema,
    path: zod_1.z.string(),
    title: zod_1.z.string(),
    sessionIds: zod_1.z.array(sessions_schema_ts_1.sessionIdSchema),
    createdAt: zod_1.z.string(),
    updatedAt: zod_1.z.string(),
});
/** workspace.list request payload (empty object literal). */
exports.workspaceListRequestSchema = zod_1.z.object({});
/** workspace.list response value. */
exports.workspaceListValueSchema = zod_1.z.object({
    items: zod_1.z.array(exports.workspaceViewSchema),
    archivedSessionIds: zod_1.z.array(sessions_schema_ts_1.sessionIdSchema),
});
/** workspace.create request payload: the existing directory to adopt. */
exports.workspaceCreateRequestSchema = zod_1.z.object({
    path: zod_1.z.string(),
});
/** workspace.create response value. */
exports.workspaceCreateValueSchema = zod_1.z.object({
    workspace: exports.workspaceViewSchema,
    created: zod_1.z.boolean(),
});
/** workspace.rename request payload: the new title must be non-blank. */
exports.workspaceRenameRequestSchema = zod_1.z.object({
    workspaceId: sessions_schema_ts_1.workspaceIdSchema,
    title: zod_1.z.string(),
}).refine(function (payload) { return payload.title.trim() !== ''; }, { message: 'workspace.rename requires a non-blank title' });
/** workspace.rename response value. */
exports.workspaceRenameValueSchema = zod_1.z.object({
    workspace: exports.workspaceViewSchema,
});
/** workspace.delete request payload. */
exports.workspaceDeleteRequestSchema = zod_1.z.object({
    workspaceId: sessions_schema_ts_1.workspaceIdSchema,
});
/** workspace.delete response value. */
exports.workspaceDeleteValueSchema = zod_1.z.object({
    deleted: zod_1.z.literal(true),
});
/** workspace.insertBefore request payload (anchor omitted = append to end). */
exports.workspaceInsertBeforeRequestSchema = zod_1.z.object({
    workspaceId: sessions_schema_ts_1.workspaceIdSchema,
    beforeWorkspaceId: sessions_schema_ts_1.workspaceIdSchema.optional(),
});
/** workspace.insertBefore response value: the complete durable display order. */
exports.workspaceInsertBeforeValueSchema = zod_1.z.object({
    workspaceIds: zod_1.z.array(sessions_schema_ts_1.workspaceIdSchema),
});
/** workspace.insertSessionBefore request payload (anchor omitted = append to end). */
exports.workspaceInsertSessionBeforeRequestSchema = zod_1.z.object({
    workspaceId: sessions_schema_ts_1.workspaceIdSchema,
    sessionId: sessions_schema_ts_1.sessionIdSchema,
    beforeSessionId: sessions_schema_ts_1.sessionIdSchema.optional(),
});
/** workspace.insertSessionBefore response value. */
exports.workspaceInsertSessionBeforeValueSchema = zod_1.z.object({
    workspace: exports.workspaceViewSchema,
});
/** workspace.archiveSession request payload. */
exports.workspaceArchiveSessionRequestSchema = zod_1.z.object({
    sessionId: sessions_schema_ts_1.sessionIdSchema,
});
/** workspace.archiveSession response value: the full updated archive set. */
exports.workspaceArchiveSessionValueSchema = zod_1.z.object({
    archivedSessionIds: zod_1.z.array(sessions_schema_ts_1.sessionIdSchema),
});
