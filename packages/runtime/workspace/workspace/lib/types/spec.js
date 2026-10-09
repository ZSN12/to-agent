"use strict";
/**
 * The workspace domain declaration: record schema and the `defineDomain` spec
 * the registry opens. The zod schema is the durable-boundary validator today
 * and the direct source of the RPC wire projection in a later phase.
 * @module @z/dsh-workspace/src/spec
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceDomainSpec = exports.workspaceDomainState = exports.workspaceRecord = void 0;
var zod_1 = require("zod");
var dsh_session_1 = require("@z/dsh-session");
var dsh_storage_domain_1 = require("@z/dsh-storage-domain");
/** Workspace id schema at the durable boundary; branding has no runtime representation. */
var workspaceId = zod_1.z.string().transform(function (value) { return value; });
/**
 * Durable shape of one workspace record. `path` is the `fs.realpath` canon
 * stamped at create; `sessionIds` is the ordered ownership account (array
 * order is display order); timestamps are ISO-8601 strings.
 */
exports.workspaceRecord = zod_1.z.object({
    path: zod_1.z.string(),
    title: zod_1.z.string(),
    sessionIds: zod_1.z.array(zod_1.z.string().transform(dsh_session_1.SessionId)),
    createdAt: zod_1.z.string(),
    updatedAt: zod_1.z.string(),
});
/**
 * Recoverable two-write mutation marker. The marker is persisted before the
 * record/order pair can diverge, so startup can distinguish an interrupted
 * registry operation from unexplained medium corruption.
 */
var workspacePendingMutation = zod_1.z.discriminatedUnion('operation', [
    zod_1.z.object({ operation: zod_1.z.literal('create'), workspaceId: workspaceId }),
    zod_1.z.object({ operation: zod_1.z.literal('delete'), workspaceId: workspaceId }),
]);
/**
 * Durable registry state. `initialized` distinguishes a valid empty registry
 * from one that still needs the header-only history bootstrap;
 * `workspaceIds` is the authoritative display order. `archivedSessionIds` is
 * the registry-global archive set layered over workspace accounting: an
 * archived session keeps its `sessionIds` slot (unarchiving must restore the
 * position), so the set never participates in the one-owner accounting
 * invariant. Defaulted so records written before the field parse unchanged.
 */
exports.workspaceDomainState = zod_1.z.object({
    initialized: zod_1.z.boolean(),
    workspaceIds: zod_1.z.array(workspaceId),
    archivedSessionIds: zod_1.z.array(zod_1.z.string().transform(dsh_session_1.SessionId)).default([]),
    pendingMutation: workspacePendingMutation.optional(),
});
/**
 * The workspace domain spec: one `workspaces` table keyed by
 * {@link WorkspaceId} plus the bootstrap/order singleton. The registry opens
 * this through `ctx.storage.domain`; the spec object is the single source of
 * the domain's identity, version, and schemas.
 */
exports.workspaceDomainSpec = (0, dsh_storage_domain_1.defineDomain)({
    name: 'workspace',
    version: 2,
    global: {
        schema: exports.workspaceDomainState,
        initial: { initialized: false, workspaceIds: [], archivedSessionIds: [] },
    },
    tables: { workspaces: (0, dsh_storage_domain_1.domainTable)(exports.workspaceRecord) },
});
