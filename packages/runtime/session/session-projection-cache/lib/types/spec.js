"use strict";
/**
 * The session-projcache domain declaration: one `sessions` table keyed by
 * {@link SessionId}, each record the full projection checkpoint for one
 * session (`key → {ver, seq, val}` rows). The spec object
 * is the single source of the domain's identity, version, and record schema;
 * the storage-domain routing decides the medium (the shipped composition's
 * json backend lands it at `<root>/session_projcache.json`, beside
 * `workspace.json`).
 * @module @z/dsh-session-projection-cache/src/spec
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectionCacheDomainSpec = exports.checkpointRecord = exports.checkpointIdentity = exports.checkpointRow = void 0;
var zod_1 = require("zod");
var dsh_storage_domain_1 = require("@z/dsh-storage-domain");
/**
 * One persisted checkpoint row (the RFC's `(sessionId, key, ver, seq, val)`
 * minus the two record keys). `val` is the unit's internal state — plain
 * JSON by the unit contract; `z.json()` enforces that at the durable
 * boundary. A row is never wrong, only possibly stale: `seq` says exactly
 * how stale, and a `ver` mismatch against the live unit's `stateVersion`
 * discards it at read time (never a migration).
 */
exports.checkpointRow = zod_1.z.object({
    ver: zod_1.z.number().int().nonnegative(),
    seq: zod_1.z.number().int().gte(-1),
    val: zod_1.z.json(),
});
/**
 * The stored-log identity a record is bound to: the immutable header fields
 * that distinguish one session lifecycle from another under the same id. A
 * session id names a slot, not a lifecycle — a deleted-then-recreated id, or
 * a persistence root swapped under a surviving cache, would otherwise let an
 * old row pass every watermark check and seed state folded from an unrelated
 * log. Reads validate this against the live header (listing) or the stored
 * header (cold read) before accepting any row.
 */
exports.checkpointIdentity = zod_1.z.object({
    createdAt: zod_1.z.number().int().nonnegative(),
    cwd: zod_1.z.string().optional(),
});
/**
 * One session's stored record: the log identity it was folded from plus its
 * checkpoint rows keyed by projection key. The whole record is replaced on
 * every write (whole-value discipline — the registry checkpoint is always
 * the complete per-session cut).
 */
exports.checkpointRecord = zod_1.z.object({
    identity: exports.checkpointIdentity,
    rows: zod_1.z.record(zod_1.z.string(), exports.checkpointRow),
});
/**
 * The session-projcache domain spec. Version bumps discard the whole medium
 * (cache semantics: a stale or unreadable cache costs a longer tail replay,
 * never a wrong value).
 */
exports.projectionCacheDomainSpec = (0, dsh_storage_domain_1.defineDomain)({
    name: 'session_projcache',
    version: 3,
    tables: { sessions: (0, dsh_storage_domain_1.domainTable)(exports.checkpointRecord) },
});
