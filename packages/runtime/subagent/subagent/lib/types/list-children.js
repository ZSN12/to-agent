"use strict";
/**
 * Read-only enumeration of durable subagent children and descendant trees
 * straight from the live session store and optional session persistence — no
 * query service. Candidates come from one live-preferred corpus; each child's
 * mode/label is the registered `subagent` projection unit's value, resolved
 * down a three-rung ladder: the registry's watermark cache for a live child,
 * a durable projection-cache row when it serves an own-suffix identity (the
 * seq gate), and one persistence inspection folded through the registry
 * otherwise, validated against the enumerated lifecycle. The projection fold
 * is the single classification authority — this module parses no descriptor
 * itself. Absent persistence, enumeration is live-only: a cold child is
 * unreachable for resume anyway, so its absence is capability absence, not an
 * error. The module owns no catalog state and does not consult Activation,
 * Agent-registry, continuation-manager, or provider state.
 *
 * @module @z/dsh-subagent
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listChildren = listChildren;
exports.listDescendants = listDescendants;
var error_ts_1 = require("./error.ts");
/**
 * Concurrent cold inspections per listing; a constant because it bounds one
 * read-only scan of local media, not deployment behavior. Should a networked
 * persistence backend appear, promote it to a validated `Config` field.
 */
var COLD_READ_CONCURRENCY = 4;
/**
 * Enumerate one parent's origin-classified direct children from the
 * live-preferred merge of `ctx.sessions` and optional session persistence,
 * serving each identity from the `subagent` projection unit: the registry's
 * watermark snapshot for a live child; for a cold one, a durable
 * projection-cache row when it serves an own-suffix identity (the seq gate),
 * else one bounded-concurrency persistence inspection folded through the
 * registry.
 * @see SubagentRuntime.listChildren for the public cancellation and failure contract.
 * @param ctx - context carrying the session store, the projection registry,
 *   optional persistence, and the optional projection cache.
 * @param parentSessionId - parent session whose direct children are listed.
 * @param signal - caller-owned cancellation observed around every persistence read.
 * @returns children and per-child diagnostics ordered by `createdAt`, then id.
 * @throws {@link SubagentError} when the projection registry or the session
 *   store is not mounted, or the caller cancels the listing.
 */
function listChildren(ctx, parentSessionId, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var listing, candidates, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prepareListing(ctx, signal)];
                case 1:
                    listing = _a.sent();
                    candidates = __spreadArray([], listing.corpus.values(), true).filter(function (record) { return record.header.parentSession === parentSessionId
                        && record.header.origin === 'subagent'; })
                        .sort(compareCorpusRecords);
                    return [4 /*yield*/, resolveCandidateRows(candidates, listing, signal)];
                case 2:
                    rows = _a.sent();
                    return [2 /*return*/, rows.filter(function (row) { return row !== undefined; })];
            }
        });
    });
}
/**
 * Enumerate every session-backed subagent below one root in stable pre-order.
 * Ordinary sessions and one-shot children remain traversal nodes, so a
 * continuable child below either is still discovered. Classification uses the
 * same projection-backed runtime as {@link listChildren}; no Agent is loaded or
 * resumed.
 * @see SubagentRuntime.listDescendants for the public cancellation and failure contract.
 * @param ctx - context carrying the session store, projection registry, and optional persistence/cache.
 * @param rootSessionId - session whose complete descendant tree is listed.
 * @param signal - caller-owned cancellation observed around every persistence read.
 * @returns interpreted subagents with durable direct-parent and root-relative depth.
 * @throws {@link SubagentError} under the same conditions as {@link listChildren}.
 */
function listDescendants(ctx, rootSessionId, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var listing, positioned, rows, entries;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prepareListing(ctx, signal)];
                case 1:
                    listing = _a.sent();
                    positioned = descendantCandidates(listing.corpus, rootSessionId);
                    return [4 /*yield*/, resolveCandidateRows(positioned.map(function (candidate) { return candidate.record; }), listing, signal)];
                case 2:
                    rows = _a.sent();
                    entries = [];
                    positioned.forEach(function (position, index) {
                        var row = rows[index];
                        if (row !== undefined) {
                            entries.push(__assign(__assign({}, row), { parentId: position.parentId, depth: position.depth }));
                        }
                    });
                    return [2 /*return*/, entries];
            }
        });
    });
}
/** Resolve listing services once and build one live-preferred session corpus. */
function prepareListing(ctx, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var projections, sessions, persistence, cache, persistedHeaders, error_1, corpus, _i, persistedHeaders_1, header, _a, _b, session, subagentParents, _c, _d, record;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    projections = ctx.get('sessionProjections');
                    // Checked before any read, even with zero candidates: mode/label are the
                    // row's strong contract, so a missing fold capability is a deterministic
                    // deployment configuration error, never an empty success.
                    if (projections === undefined) {
                        throw new error_ts_1.SubagentError('listing subagents requires the sessionProjections registry (load @z/dsh-session-projection)', 'SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE');
                    }
                    sessions = ctx.get('sessions');
                    if (sessions === undefined) {
                        throw new error_ts_1.SubagentError('listing subagents requires the session store (load @z/dsh-session)', 'SUBAGENT_CONTROL_SESSION_STORE_UNAVAILABLE');
                    }
                    assertListingNotCancelled(signal);
                    persistence = ctx.get('sessionPersistence');
                    cache = ctx.get('sessionProjectionCache');
                    persistedHeaders = [];
                    if (!(persistence !== undefined)) return [3 /*break*/, 5];
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, persistence.list(signal)];
                case 2:
                    persistedHeaders = _e.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _e.sent();
                    // The backend may reject with its own abort failure after observing the
                    // forwarded signal; cancellation stays a stable subagent failure.
                    assertListingNotCancelled(signal);
                    throw error_1;
                case 4:
                    assertListingNotCancelled(signal);
                    _e.label = 5;
                case 5:
                    corpus = new Map();
                    for (_i = 0, persistedHeaders_1 = persistedHeaders; _i < persistedHeaders_1.length; _i++) {
                        header = persistedHeaders_1[_i];
                        corpus.set(header.id, { header: header, live: undefined });
                    }
                    for (_a = 0, _b = sessions.list(); _a < _b.length; _a++) {
                        session = _b[_a];
                        corpus.set(session.header.id, { header: session.header, live: session });
                    }
                    subagentParents = new Set();
                    for (_c = 0, _d = corpus.values(); _c < _d.length; _c++) {
                        record = _d[_c];
                        if (record.header.origin === 'subagent' && record.header.parentSession !== undefined) {
                            subagentParents.add(record.header.parentSession);
                        }
                    }
                    return [2 /*return*/, { projections: projections, persistence: persistence, cache: cache, corpus: corpus, subagentParents: subagentParents }];
            }
        });
    });
}
/** Resolve projection-backed rows for aligned candidates with bounded cold reads. */
function resolveCandidateRows(candidates, listing, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var projections, persistence, cache, subagentParents, rows, coldReads, queue_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    projections = listing.projections, persistence = listing.persistence, cache = listing.cache, subagentParents = listing.subagentParents;
                    rows = Array.from({ length: candidates.length });
                    coldReads = [];
                    candidates.forEach(function (candidate, index) {
                        var childId = candidate.header.id;
                        if (candidate.live === undefined) {
                            coldReads.push({ index: index, header: candidate.header });
                            return;
                        }
                        // The registry's watermark cache serves the live value with zero log
                        // reads; a live child without an identity yet is the creation window
                        // before the establishing provider appends its descriptor.
                        var identity;
                        try {
                            identity = projections.snapshot(candidate.live).values.subagent;
                        }
                        catch (_a) {
                            // The snapshot folds EVERY registered unit over this child's log, so
                            // any unit's fold or schema can reject damaged payloads. That is
                            // deterministic data damage in this one child; it degrades to one
                            // corrupt diagnostic instead of failing the whole listing.
                            rows[index] = { kind: 'diagnostic', id: childId, reason: 'corrupt' };
                            return;
                        }
                        // The unit's serializable no-value sentinel is `null`; `undefined` can
                        // only mean the key was dropped at a JSON boundary. Both are no value.
                        if (identity === undefined || identity === null)
                            return;
                        rows[index] = childRow(childId, identity, 'running', subagentParents.has(childId));
                    });
                    if (!(persistence !== undefined && coldReads.length > 0)) return [3 /*break*/, 2];
                    queue_1 = __spreadArray([], coldReads, true);
                    return [4 /*yield*/, Promise.all(Array.from({ length: Math.min(COLD_READ_CONCURRENCY, queue_1.length) }, function () { return __awaiter(_this, void 0, void 0, function () {
                            var job, _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        job = queue_1.shift();
                                        _c.label = 1;
                                    case 1:
                                        if (!(job !== undefined)) return [3 /*break*/, 4];
                                        _a = rows;
                                        _b = job.index;
                                        return [4 /*yield*/, resolveColdIdentity(persistence, projections, cache, job.header, subagentParents.has(job.header.id), signal)];
                                    case 2:
                                        _a[_b] = _c.sent();
                                        _c.label = 3;
                                    case 3:
                                        job = queue_1.shift();
                                        return [3 /*break*/, 1];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    assertListingNotCancelled(signal);
                    return [2 /*return*/, rows];
            }
        });
    });
}
/** Build origin-classified candidates from the complete tree without recursion. */
function descendantCandidates(corpus, rootSessionId) {
    var _a, _b;
    var children = new Map();
    for (var _i = 0, _c = corpus.values(); _i < _c.length; _i++) {
        var record = _c[_i];
        var parentId = record.header.parentSession;
        if (parentId === undefined)
            continue;
        var siblings = children.get(parentId);
        if (siblings === undefined)
            children.set(parentId, [record]);
        else
            siblings.push(record);
    }
    for (var _d = 0, _e = children.values(); _d < _e.length; _d++) {
        var siblings = _e[_d];
        siblings.sort(compareCorpusRecords);
    }
    var positioned = [];
    var stack = ((_a = children.get(rootSessionId)) !== null && _a !== void 0 ? _a : [])
        .map(function (record) { return ({ record: record, parentId: rootSessionId, depth: 1 }); })
        .reverse();
    var visited = new Set([rootSessionId]);
    while (stack.length > 0) {
        // The length guard proves one frame exists.
        // oxlint-disable-next-line typescript/no-non-null-assertion
        var position = stack.pop();
        var id = position.record.header.id;
        if (visited.has(id))
            continue;
        visited.add(id);
        if (position.record.header.origin === 'subagent')
            positioned.push(position);
        var descendants = (_b = children.get(id)) !== null && _b !== void 0 ? _b : [];
        for (var _f = 0, _g = __spreadArray([], descendants, true).reverse(); _f < _g.length; _f++) {
            var record = _g[_f];
            stack.push({ record: record, parentId: id, depth: position.depth + 1 });
        }
    }
    return positioned;
}
/** Compare siblings by durable creation time, then id. */
function compareCorpusRecords(a, b) {
    return a.header.createdAt - b.header.createdAt || a.header.id.localeCompare(b.header.id);
}
/**
 * Resolve one cold candidate down the remaining ladder: a durable
 * projection-cache row when it serves an own-suffix identity (the seq gate),
 * otherwise one persistence inspection folded through the projection
 * registry (the same detached recipe the API proxy uses for detached session
 * projections). A failed inspection is one transient `unavailable` row
 * retried on the next listing; an inspection naming another lifecycle, and a
 * settled log the fold cannot identify — or that makes any registered unit
 * throw — are final, so they report `corrupt`.
 */
function resolveColdIdentity(persistence, projections, cache, header, hasChildren, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var childId, cached, inspected, _a, identity;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    childId = header.id;
                    if (cache !== undefined) {
                        cached = void 0;
                        try {
                            cached = (_b = cache.cachedSnapshot(header)) === null || _b === void 0 ? void 0 : _b.values.subagent;
                        }
                        catch (_e) {
                            // Unlike the preparation fold below, a throwing cache read renders no
                            // verdict: the cache is derived data, so its damage (a poisoned stored
                            // row of ANY unit) silently falls through to the authoritative re-fold.
                            cached = undefined;
                        }
                        // A child's OWN descriptor is immutable once appended, so a cached
                        // identity is final only when the seq gate proves it was folded from the
                        // own suffix: a creation-window checkpoint may instead carry a fork
                        // seed's replayed ANCESTOR descriptor (seq below `seedLength`), which
                        // must not outrank the re-fold. Everything else also falls through to
                        // preparation: an absent key (a cut before any descriptor) and the
                        // `null` sentinel, whose verdict belongs to the authoritative re-fold,
                        // not to a derived row.
                        if (cached !== undefined && cached !== null && cached.seq >= ((_c = header.seedLength) !== null && _c !== void 0 ? _c : 0)) {
                            return [2 /*return*/, childRow(childId, cached, 'inactive', hasChildren)];
                        }
                    }
                    assertListingNotCancelled(signal);
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, persistence.inspect(childId, signal)];
                case 2:
                    inspected = _d.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _d.sent();
                    // Per-child isolation: the child vanished or its backend read failed —
                    // one diagnostic row, and the listing itself still succeeds.
                    assertListingNotCancelled(signal);
                    return [2 /*return*/, { kind: 'diagnostic', id: childId, reason: 'unavailable' }];
                case 4:
                    assertListingNotCancelled(signal);
                    // A session id names a slot, not a lifecycle: a child deleted and
                    // re-published under another owner between the enumeration and this read
                    // must not leak into the old parent's listing.
                    if (!sameLifecycle(inspected.meta, header)) {
                        return [2 /*return*/, { kind: 'diagnostic', id: childId, reason: 'corrupt' }];
                    }
                    try {
                        identity = projections.restore({}, inspected.events, 0).snapshot.values.subagent;
                    }
                    catch (_f) {
                        // The restore folds EVERY registered unit over this child's log, so any
                        // unit's fold or schema can reject damaged payloads — deterministic data
                        // damage in this one child, contained as its own corrupt diagnostic.
                        return [2 /*return*/, { kind: 'diagnostic', id: childId, reason: 'corrupt' }];
                    }
                    if (identity === undefined || identity === null) {
                        return [2 /*return*/, { kind: 'diagnostic', id: childId, reason: 'corrupt' }];
                    }
                    return [2 /*return*/, childRow(childId, identity, 'inactive', hasChildren)];
            }
        });
    });
}
/** Materialize one served identity as its child row. */
function childRow(id, identity, activity, hasChildren) {
    return identity.mode === 'one-shot'
        ? __assign(__assign({ kind: 'child', id: id, mode: 'one-shot' }, identity.label !== undefined ? { label: identity.label } : {}), { activity: activity, hasChildren: hasChildren }) : {
        kind: 'child',
        id: id,
        mode: 'continuable',
        label: identity.label,
        activity: activity,
        hasChildren: hasChildren,
    };
}
/** Immutable header fields that distinguish one session lifecycle from another under the same id. */
var LIFECYCLE_WITNESS_KEYS = [
    'version', 'id', 'createdAt', 'cwd', 'parentSession', 'seedLength', 'delegationDepth',
];
/** Whether an inspected log still belongs to the enumerated lifecycle. */
function sameLifecycle(meta, expected) {
    return LIFECYCLE_WITNESS_KEYS.every(function (key) { return meta[key] === expected[key]; });
}
/** Stop a listing at its next cancellation checkpoint. */
function assertListingNotCancelled(signal) {
    if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
        throw new error_ts_1.SubagentError('subagent listing was cancelled', 'CANCELLED');
    }
}
