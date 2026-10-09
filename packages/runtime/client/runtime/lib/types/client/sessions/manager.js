"use strict";
// SessionManager: the instance cluster Map<SessionId, Session> (lazy-built, resident) + the frame
// dispatch entry + list state, constructed and held by SessionRuntime (one per client runtime).
// List data never enters zustand; React connects via subscribe/getListSnapshot.
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
exports.SessionManager = void 0;
// Value import from the inline-safe wire layer (not the connection plugin):
// plugin-to-plugin value imports are a bundle purity error.
var api_1 = require("@z/dsh-host-apiproxy/api");
var ordered_baseline_ts_1 = require("../ordered-baseline.ts");
var lineage_ts_1 = require("./lineage.ts");
var notifier_ts_1 = require("./notifier.ts");
var projection_store_ts_1 = require("./projection-store.ts");
var session_ts_1 = require("./session.ts");
/** Stable identity of a frame retained until an uninstantiated Session can consume it. */
function bufferedRequestKey(envelope) {
    var frame = envelope.payload;
    switch (frame.type) {
        case 'approval/requested': return "a:".concat(frame.approvalId);
        case 'question/requested': return "q:".concat(envelope.rpcId);
        case 'session/queue': return 'queue';
        /* v8 ignore next -- pendingBuffers contains only the three frame types above. */
        default: return undefined;
    }
}
/** Match ui-user-questions's binary plan-review routing at the wire boundary. */
function questionInteractionStatus(questions) {
    var _a;
    if (questions.length !== 1)
        return 'question';
    var question = questions[0];
    var intent = question.intent;
    if ((intent === null || intent === void 0 ? void 0 : intent.kind) !== 'plan-review' || question.detail === undefined)
        return 'question';
    if (question.multiSelect === true)
        return 'question';
    var options = (_a = question.options) !== null && _a !== void 0 ? _a : [];
    if (options.length > 2)
        return 'question';
    return options.some(function (option) { return option.label === intent.approve; }) ? 'plan-review' : 'question';
}
/** Instance cluster + frame entry + the session list. */
var SessionManager = /** @class */ (function () {
    /**
     * @param api - shared wire client.
     * @param restoredSelection - persisted real-Session selection candidate.
     */
    function SessionManager(api, remote, restoredSelection, restoredAddress, conversation) {
        var _this = this;
        this.api = api;
        this.remote = remote;
        this.conversation = conversation;
        this.sessions = new Map();
        /** Pre-instantiation buffer for answerable requests and the queued-turn snapshot, which history
         *  cannot reconstruct on open. Live requests remain until resolution; queue and replay duplicates
         *  compact by identity. Instantiation replays and clears it, while removal drops it. */
        this.pendingBuffers = new Map();
        /** Outstanding answerable interactions per session, keyed by their stable request identity.
         *  Manager-owned rather than read off Session instances because the sidebar must light up for
         *  sessions never instantiated. Cleared per connection generation — the reopen replay re-adds
         *  still-pending requests — and on session-removed. */
        this.pendingInteractions = new Map();
        /**
         * Sessions that finished running while not selected — the sidebar's green
         * "done" reminder (manager-owned, survives connection generations; cleared
         * on select and session-removed, re-armed by the next completion).
         */
        this.completedNotifications = new Set();
        /** Last-observed running bits per session; the true→false edge here arms {@link completedNotifications}. */
        this.prevRunning = new Map();
        /** Per-session projection value stores, retained independently of instance arrival (the
         *  title-snapshot precedent, generalized): push frames land here whether or not the Session
         *  is instantiated (list rows read the 'title' key), and an instantiated Session adopts the
         *  same store so history-baseline seeding and frames converge on one row set. */
        this.projectionStores = new Map();
        this.summaries = [];
        this.listState = 'idle';
        /** Arrival phase; the pending → ready edge fires on the first successful pull (see SessionListPhase). */
        this.listPhase = 'pending';
        this.listError = null;
        this.listInflight = null;
        /** Mutations arriving after a list request starts are replayed over its response. */
        this.listMutations = null;
        this.addresses = new Map();
        this.catalogs = new Map();
        this.catalogInflight = new Map();
        /** Catalog owners whose membership changed while a pull was in flight: one trailing refresh after it settles. */
        this.catalogStale = new Set();
        this.openCatalogs = new Set();
        this.catalogDebounce = new Map();
        /**
         * Background jobs per session, last-wins from `session/jobs`. An empty set
         * is stored as an absent key, so absence and `[]` are one representation.
         */
        this.jobsBySession = new Map();
        /** Entry-identity cache (reference stability): list rebuilds reuse the previous entry
         *  object when every field matches — wire refreshes mint all-new summary objects, so identity
         *  must be recovered by value or every SessionListItem memo misses on every refresh. */
        this.entryCache = new Map();
        this.itemsCache = [];
        this.notifier = new notifier_ts_1.Notifier(function () {
            _this.listSnapshotCache = _this.buildListSnapshot();
        });
        this.selected = restoredSelection;
        if (restoredAddress !== undefined)
            this.addresses.set(restoredAddress.childSessionId, restoredAddress);
        this.listSnapshotCache = this.buildListSnapshot();
    }
    // ---- Selection ----
    /**
     * Select a listed Session or a retained catalog-addressed child.
     * @param sessionId - listed or catalog-addressed Session id.
     */
    SessionManager.prototype.select = function (sessionId) {
        var _a, _b, _c;
        var address = this.navigationAddress(sessionId);
        if (!this.summaries.some(function (summary) { return summary.sessionId === sessionId; }) && address === undefined) {
            throw new Error("sessions.select: unknown session ".concat(sessionId));
        }
        if (address !== undefined)
            this.addresses.set(sessionId, address);
        (_a = this.sessions.get(sessionId)) === null || _a === void 0 ? void 0 : _a.configureSubagent(address, address === undefined
            ? false
            : (_c = (_b = this.catalogs.get(address.parentSessionId)) === null || _b === void 0 ? void 0 : _b.parentAvailable) !== null && _c !== void 0 ? _c : false);
        this.selected = sessionId;
        // Looking at the session consumes its completion reminder (dot clears).
        this.completedNotifications.delete(sessionId);
        void this.refreshSubagents(sessionId);
        this.notifier.notifyNow();
    };
    /**
     * Select a healthy child through its durable direct-parent address.
     * @param address - catalog-derived parent and child ids.
     */
    SessionManager.prototype.selectSubagent = function (address) {
        var _a, _b;
        var catalog = this.catalogs.get(address.parentSessionId);
        var entry = catalog === null || catalog === void 0 ? void 0 : catalog.entries.find(function (candidate) { return candidate.id === address.childSessionId; });
        if (entry === undefined || entry.kind !== 'child' || entry.mode !== address.mode) {
            throw new Error("sessions.selectSubagent: ".concat(address.childSessionId, " is not a healthy catalog child"));
        }
        this.addresses.set(address.childSessionId, address);
        (_a = this.sessions.get(address.childSessionId)) === null || _a === void 0 ? void 0 : _a.configureSubagent(address, (_b = catalog === null || catalog === void 0 ? void 0 : catalog.parentAvailable) !== null && _b !== void 0 ? _b : false);
        this.selected = address.childSessionId;
        this.completedNotifications.delete(address.childSessionId);
        void this.refreshSubagents(address.childSessionId);
        this.notifier.notifyNow();
    };
    /** Clear the selection (the layout falls to the no-session view state). */
    SessionManager.prototype.clearSelection = function () {
        this.selected = undefined;
        this.notifier.notifyNow();
    };
    /**
     * Return the durable catalog address retained for one child.
     * @param sessionId - possible addressed child id.
     * @returns The direct-parent address, when navigation discovered one.
     */
    SessionManager.prototype.subagentAddress = function (sessionId) {
        return this.addresses.get(sessionId);
    };
    /**
     * Resolve an address for breadcrumb navigation without retaining transport authority.
     * @param sessionId - possible child id in an already-loaded catalog.
     * @returns A retained or catalog-derived direct-parent address.
     */
    SessionManager.prototype.navigationAddress = function (sessionId) {
        var retained = this.addresses.get(sessionId);
        if (retained !== undefined)
            return retained;
        for (var _i = 0, _a = this.catalogs; _i < _a.length; _i++) {
            var _b = _a[_i], parentSessionId = _b[0], catalog = _b[1];
            var child = catalog.entries.find(function (entry) { return entry.kind === 'child' && entry.id === sessionId; });
            if ((child === null || child === void 0 ? void 0 : child.kind) === 'child') {
                return { parentSessionId: parentSessionId, childSessionId: sessionId, mode: child.mode };
            }
        }
        return undefined;
    };
    // ---- Instance management ----
    /**
     * Drop a session instance (scope-prune companion: instance
     * and scope share one lifecycle). The host session log is the durable
     * truth — a later get() lazily rebuilds and open() backfills history.
     * @param sessionId - the session to drop.
     */
    SessionManager.prototype.drop = function (sessionId) {
        this.sessions.delete(sessionId);
    };
    /**
     * Lazy build: return the existing instance or construct one (no auto-open —
     * open is triggered by the container's select callback).
     * @param sessionId - the session to get.
     * @returns the resident instance.
     */
    SessionManager.prototype.get = function (sessionId) {
        var _a;
        var session = this.sessions.get(sessionId);
        if (session === undefined) {
            session = this.createSession(sessionId);
            this.sessions.set(sessionId, session);
            // Replay approval/question/queued frames buffered before instantiation (rpcId
            // verbatim, same semantics as the subscribed baseline replay). Replay happens
            // BEFORE the running-bit sync: a not-running summary must sweep replayed queue
            // rows the same way a live status flip would (their retirement events dropped
            // while the session was uninstantiated).
            var buffered = this.pendingBuffers.get(sessionId);
            if (buffered !== undefined) {
                this.pendingBuffers.delete(sessionId);
                for (var _i = 0, buffered_1 = buffered; _i < buffered_1.length; _i++) {
                    var envelope = buffered_1[_i];
                    session.handleMuxEnvelope(envelope.rpcId, envelope.payload);
                }
            }
            // Sync the running and blank bits from the list snapshot into the new
            // instance (consistency when the list precedes open).
            var summary = this.summaries.find(function (s) { return s.sessionId === sessionId; });
            if (summary !== undefined) {
                session.handleBlank(summary.blank);
                session.handleRunning(summary.running);
            }
            else {
                var address = this.addresses.get(sessionId);
                var child = address === undefined ? undefined : (_a = this.catalogs.get(address.parentSessionId)) === null || _a === void 0 ? void 0 : _a.entries.find(function (entry) { return entry.kind === 'child' && entry.id === sessionId; });
                if ((child === null || child === void 0 ? void 0 : child.kind) === 'child') {
                    // A catalogued child exists only after its delegated session has
                    // durable history, even though child rows do not carry `blank`.
                    session.handleBlank(false);
                    session.handleRunning(child.activity === 'running');
                }
            }
        }
        return session;
    };
    SessionManager.prototype.createSession = function (sessionId) {
        var _this = this;
        var _a, _b;
        var address = this.addresses.get(sessionId);
        return new session_ts_1.Session(sessionId, this.api, this.remote, __assign(__assign(__assign({}, (address === undefined ? {} : {
            address: address,
            parentAvailable: (_b = (_a = this.catalogs.get(address.parentSessionId)) === null || _a === void 0 ? void 0 : _a.parentAvailable) !== null && _b !== void 0 ? _b : false,
        })), { 
            // The sender's local first-send flip mirrors into the list row so the
            // session surfaces (lists filter on blank) before any host frame lands.
            onEngaged: function (engaged) {
                _this.recordMutation({ kind: 'engaged', sessionId: engaged.sessionId });
            }, projections: this.projectionStore(sessionId) }), this.conversation === undefined ? {} : { conversation: this.conversation }));
    };
    /** Rebuild every resident Session after one coalesced registry transaction. */
    SessionManager.prototype.rebuildConversationRegistry = function () {
        for (var _i = 0, _a = this.sessions.values(); _i < _a.length; _i++) {
            var session = _a[_i];
            session.rebuildConversationRegistry();
        }
    };
    /** Resident per-session projection store (create-on-demand; outlives instantiation). */
    SessionManager.prototype.projectionStore = function (sessionId) {
        var _this = this;
        var store = this.projectionStores.get(sessionId);
        if (store === undefined) {
            store = new projection_store_ts_1.ProjectionValueStore();
            // List rows project off store keys (title); any-key changes re-enter
            // the manager's own batched rebuild channel.
            store.subscribeAny(function () { _this.notifier.markDirty(); });
            this.projectionStores.set(sessionId, store);
        }
        return store;
    };
    /**
     * Refresh one direct-child catalog, reusing its in-flight request.
     * @param parentSessionId - catalog owner.
     */
    SessionManager.prototype.refreshSubagents = function (parentSessionId) {
        var _this = this;
        var _a, _b;
        var existing = this.catalogInflight.get(parentSessionId);
        if (existing !== undefined)
            return existing.promise;
        var previous = this.catalogs.get(parentSessionId);
        var expandableRows = new Set();
        var activityRows = new Map();
        this.catalogs.set(parentSessionId, {
            entries: (_a = previous === null || previous === void 0 ? void 0 : previous.entries) !== null && _a !== void 0 ? _a : [],
            parentAvailable: (_b = previous === null || previous === void 0 ? void 0 : previous.parentAvailable) !== null && _b !== void 0 ? _b : false,
            state: 'loading',
            error: null,
        });
        this.notifier.markDirty();
        var operation = (function () { return __awaiter(_this, void 0, void 0, function () {
            var result, parentAvailable, _i, _a, _b, childId, address, error_1, folded;
            var _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
            return __generator(this, function (_p) {
                switch (_p.label) {
                    case 0:
                        _p.trys.push([0, 2, 3, 4]);
                        return [4 /*yield*/, this.api.subagents.list({ parentSessionId: parentSessionId })];
                    case 1:
                        result = (_p.sent()).result;
                        if (result.ok) {
                            parentAvailable = (_d = (_c = this.catalogInflight.get(parentSessionId)) === null || _c === void 0 ? void 0 : _c.parentAvailableOverride) !== null && _d !== void 0 ? _d : result.value.parentAvailable;
                            this.catalogs.set(parentSessionId, __assign(__assign({}, result.value), { entries: this.withCatalogMutations(result.value.entries, expandableRows, activityRows), parentAvailable: parentAvailable, state: 'ready', error: null }));
                            for (_i = 0, _a = this.addresses; _i < _a.length; _i++) {
                                _b = _a[_i], childId = _b[0], address = _b[1];
                                if (address.parentSessionId !== parentSessionId)
                                    continue;
                                (_e = this.sessions.get(childId)) === null || _e === void 0 ? void 0 : _e.handleSubagentParentAvailable(parentAvailable);
                            }
                        }
                        else {
                            this.catalogs.set(parentSessionId, {
                                entries: this.withCatalogMutations((_f = previous === null || previous === void 0 ? void 0 : previous.entries) !== null && _f !== void 0 ? _f : [], expandableRows, activityRows),
                                parentAvailable: (_j = (_h = (_g = this.catalogInflight.get(parentSessionId)) === null || _g === void 0 ? void 0 : _g.parentAvailableOverride) !== null && _h !== void 0 ? _h : previous === null || previous === void 0 ? void 0 : previous.parentAvailable) !== null && _j !== void 0 ? _j : false,
                                state: 'error',
                                error: result.error,
                            });
                        }
                        return [3 /*break*/, 4];
                    case 2:
                        error_1 = _p.sent();
                        folded = (0, api_1.transportError)(error_1);
                        this.catalogs.set(parentSessionId, {
                            entries: this.withCatalogMutations((_k = previous === null || previous === void 0 ? void 0 : previous.entries) !== null && _k !== void 0 ? _k : [], expandableRows, activityRows),
                            parentAvailable: (_o = (_m = (_l = this.catalogInflight.get(parentSessionId)) === null || _l === void 0 ? void 0 : _l.parentAvailableOverride) !== null && _m !== void 0 ? _m : previous === null || previous === void 0 ? void 0 : previous.parentAvailable) !== null && _o !== void 0 ? _o : false,
                            state: 'error',
                            error: folded.ok ? null : folded.error,
                        });
                        return [3 /*break*/, 4];
                    case 3:
                        this.catalogInflight.delete(parentSessionId);
                        // Re-arm the trailing pull before the dirty notify: the response the
                        // caller observed predates the stale-marking change, so the follow-up
                        // refresh is the only carrier of that change.
                        if (this.catalogStale.delete(parentSessionId))
                            void this.refreshSubagents(parentSessionId);
                        this.notifier.markDirty();
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        }); })();
        this.catalogInflight.set(parentSessionId, {
            promise: operation,
            expandableRows: expandableRows,
            activityRows: activityRows,
            parentAvailableOverride: undefined,
        });
        return operation;
    };
    /**
     * Mark whether a catalog menu is consuming live membership updates.
     * @param parentSessionId - catalog owner.
     * @param open - current menu state.
     */
    SessionManager.prototype.setSubagentCatalogOpen = function (parentSessionId, open) {
        if (open) {
            this.openCatalogs.add(parentSessionId);
            void this.refreshSubagents(parentSessionId);
        }
        else {
            this.openCatalogs.delete(parentSessionId);
            var timer = this.catalogDebounce.get(parentSessionId);
            if (timer !== undefined) {
                clearTimeout(timer);
                this.catalogDebounce.delete(parentSessionId);
            }
        }
    };
    // ---- List API ----
    /** Full refresh via session.list (single-flight: an in-flight call is reused). */
    SessionManager.prototype.refreshList = function () {
        var _this = this;
        if (this.listInflight !== null)
            return this.listInflight;
        this.listState = 'loading';
        this.listError = null;
        var established = this.summaries;
        var mutations = [];
        this.listMutations = mutations;
        this.notifier.markDirty();
        this.listInflight = (function () { return __awaiter(_this, void 0, void 0, function () {
            var result, baseline, _i, baseline_1, s, summaries, _a, mutations_1, mutation, _b, _c, s, session, _d, _e, s, block, store, values, _f, _g, key, error_2, folded;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        _h.trys.push([0, 2, 3, 4]);
                        return [4 /*yield*/, this.api.sessions.list({})];
                    case 1:
                        result = (_h.sent()).result;
                        if (result.ok) {
                            baseline = this.listPhase === 'pending'
                                ? result.value.items
                                : (0, ordered_baseline_ts_1.mergeOrderedBaseline)(established, result.value.items, function (summary) { return summary.sessionId; });
                            // Seed first observations from the pull-time baseline BEFORE replaying
                            // in-flight mutations, then reconcile the reminders after EVERY
                            // replayed mutation: an edge that happens entirely between mutations
                            // (baseline idle → running → idle) must still arm, which a single
                            // sync on the folded result would collapse away.
                            for (_i = 0, baseline_1 = baseline; _i < baseline_1.length; _i++) {
                                s = baseline_1[_i];
                                if (!this.prevRunning.has(s.sessionId))
                                    this.prevRunning.set(s.sessionId, s.running);
                            }
                            summaries = baseline;
                            for (_a = 0, mutations_1 = mutations; _a < mutations_1.length; _a++) {
                                mutation = mutations_1[_a];
                                summaries = applyMutation(summaries, mutation);
                                this.summaries = summaries;
                                this.syncCompletedNotifications();
                            }
                            this.summaries = summaries;
                            this.listState = 'idle';
                            this.listPhase = 'ready';
                            // Covers the empty-mutations pull (a plain baseline carries no edge).
                            this.syncCompletedNotifications();
                            // Push running/blank bits down to instantiated Sessions (the list is the authoritative summary source).
                            for (_b = 0, _c = this.summaries; _b < _c.length; _b++) {
                                s = _c[_b];
                                session = this.sessions.get(s.sessionId);
                                if (session === undefined)
                                    continue;
                                session.handleBlank(s.blank);
                                session.handleRunning(s.running);
                            }
                            // Seed each row's projection baseline into the per-session value
                            // store (cold titles surface without opening the session). Per-key
                            // apply, not seed(): the list block is a partial baseline — the
                            // cold cache serves only version-matching keys — so an absent key
                            // must not clear; higher-seq-wins still keeps a stale list block
                            // from overwriting a newer push frame or tail baseline.
                            for (_d = 0, _e = result.value.items; _d < _e.length; _d++) {
                                s = _e[_d];
                                block = s.projections;
                                if (block === undefined)
                                    continue;
                                store = this.projectionStore(s.sessionId);
                                values = block.values;
                                for (_f = 0, _g = Object.keys(values); _f < _g.length; _f++) {
                                    key = _g[_f];
                                    store.apply(key, values[key], block.asOfSeq);
                                }
                            }
                        }
                        else {
                            this.listState = 'error';
                            this.listError = result.error;
                        }
                        return [3 /*break*/, 4];
                    case 2:
                        error_2 = _h.sent();
                        this.listState = 'error';
                        folded = (0, api_1.transportError)(error_2);
                        /* v8 ignore next -- the `? null` arm is unreachable: transportError always returns ok:false. */
                        this.listError = folded.ok ? null : folded.error;
                        return [3 /*break*/, 4];
                    case 3:
                        this.listMutations = null;
                        this.listInflight = null;
                        this.notifier.markDirty();
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        }); })();
        return this.listInflight;
    };
    /**
     * Search visible session message content without adding transient query
     * state to the list snapshot.
     * @param query - non-blank literal phrase.
     * @param signal - cancellation for superseded UI queries.
     * @returns the Host result or a folded transport error.
     */
    SessionManager.prototype.search = function (query, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.api.sessions.search({ query: query }, signal)];
                    case 1: return [2 /*return*/, (_a.sent()).result];
                    case 2:
                        error_3 = _a.sent();
                        return [2 /*return*/, (0, api_1.transportError)(error_3)];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Contract session.create; on success merge into summaries immediately (no
     * wait for the next refresh). A created session is blank by definition
     * (entity birth precedes the first message).
     * @param opts - target workspace or working directory, plus an optional caller-owned id.
     * @returns the create result.
     */
    SessionManager.prototype.create = function () {
        return __awaiter(this, arguments, void 0, function (opts) {
            var shared, payload, result, publishedSessionId, error_4;
            if (opts === void 0) { opts = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        shared = opts.sessionId === undefined ? {} : { sessionId: opts.sessionId };
                        payload = opts.workspaceId !== undefined
                            ? __assign({ workspaceId: opts.workspaceId }, shared) : __assign(__assign({}, (opts.cwd === undefined ? {} : { cwd: opts.cwd })), shared);
                        return [4 /*yield*/, this.api.sessions.create(payload)];
                    case 1:
                        result = (_a.sent()).result;
                        if (result.ok) {
                            this.recordMutation({ kind: 'upsert', summary: __assign(__assign({ sessionId: result.value.sessionId, updatedAt: Date.now(), running: false, blank: true }, (opts.cwd !== undefined ? { cwd: opts.cwd } : {})), (result.value.agentPreset !== undefined ? { agentPreset: result.value.agentPreset } : {})) });
                        }
                        else {
                            publishedSessionId = workspaceAttachSessionId(result.error);
                            // Publication precedes attachment. The error's id is a real Session,
                            // so expose it immediately as Ungrouped while the caller keeps the
                            // prompt buffer and decides whether to retry attachment.
                            if (publishedSessionId !== undefined) {
                                this.recordMutation({ kind: 'upsert', summary: {
                                        sessionId: publishedSessionId,
                                        updatedAt: Date.now(),
                                        running: false,
                                        blank: true,
                                    } });
                            }
                        }
                        return [2 /*return*/, result];
                    case 2:
                        error_4 = _a.sent();
                        return [2 /*return*/, (0, api_1.transportError)(error_4)];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Contract session.fork; on success merge the child into summaries
     * immediately (same synchronous-addressability guarantee as create). The
     * child carries the source's history, so it is never blank; lineage rides
     * parentSessionId so the list nests it under its source. A child published
     * before Workspace attachment fails is also reconciled into the list.
     * @param opts - source session and the optional seq anchoring the cut.
     * @returns the fork result (the child session id).
     */
    SessionManager.prototype.fork = function (opts) {
        return __awaiter(this, void 0, void 0, function () {
            var source, result, childId, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        source = this.summaries.find(function (s) { return s.sessionId === opts.sessionId; });
                        return [4 /*yield*/, this.api.sessions.fork(__assign({ sessionId: opts.sessionId }, opts.atSeq === undefined ? {} : { atSeq: opts.atSeq }))];
                    case 1:
                        result = (_a.sent()).result;
                        childId = result.ok
                            ? result.value.sessionId
                            : workspaceAttachSessionId(result.error);
                        if (childId !== undefined) {
                            this.recordMutation({ kind: 'upsert', summary: __assign({ sessionId: childId, updatedAt: Date.now(), running: false, blank: false, parentSessionId: opts.sessionId }, ((source === null || source === void 0 ? void 0 : source.cwd) !== undefined ? { cwd: source.cwd } : {})) });
                        }
                        return [2 /*return*/, result];
                    case 2:
                        error_5 = _a.sent();
                        return [2 /*return*/, (0, api_1.transportError)(error_5)];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Insert-or-enrich a locally synthesized summary: a new id prepends; an
     * existing entry only gains fields it lacks (the session-added frame and the
     * create() echo race — whichever lands second must fill the placeholder's
     * missing cwd/parentSessionId, never overwrite list-refresh data).
     */
    SessionManager.prototype.mergeSummary = function (summary) {
        this.recordMutation({ kind: 'upsert', summary: summary });
    };
    /**
     * Record a host-confirmed composition switch (see ISessions.noteAgentPreset).
     * @param sessionId - the switched session.
     * @param agentPreset - the preset id the host confirmed.
     */
    SessionManager.prototype.noteAgentPreset = function (sessionId, agentPreset) {
        this.recordMutation({ kind: 'upsert', summary: {
                sessionId: sessionId,
                updatedAt: Date.now(), running: false, blank: true,
                agentPreset: agentPreset,
            } });
    };
    /** Apply immediately and retain for replay when a list response is in flight. */
    SessionManager.prototype.recordMutation = function (mutation) {
        var _a;
        (_a = this.listMutations) === null || _a === void 0 ? void 0 : _a.push(mutation);
        this.summaries = applyMutation(this.summaries, mutation);
        // Eager edge reconciliation — a snapshot-build-time pass would miss consecutive status frames.
        this.syncCompletedNotifications();
        this.notifier.markDirty();
    };
    // ---- Subscription API (for useSessionList) ----
    /**
     * uSES subscription entry for useSessionList.
     * @param listener - change callback.
     * @returns the unsubscribe function.
     */
    SessionManager.prototype.subscribe = function (listener) {
        return this.notifier.subscribe(listener);
    };
    /**
     * Cached list snapshot (rebuilt lazily when dirty with no listeners).
     * @returns the cached reference (stable until the next flush).
     */
    SessionManager.prototype.getListSnapshot = function () {
        this.notifier.ensureFresh();
        return this.listSnapshotCache;
    };
    /** Add or refresh one stable pending-interaction identity. */
    SessionManager.prototype.trackPending = function (sessionId, key, status) {
        var interactions = this.pendingInteractions.get(sessionId);
        if (interactions === undefined) {
            interactions = new Map();
            this.pendingInteractions.set(sessionId, interactions);
        }
        if (interactions.get(key) === status)
            return;
        interactions.set(key, status);
        this.notifier.markDirty();
    };
    /** Settle one pending-interaction identity without disturbing sibling waits. */
    SessionManager.prototype.resolvePending = function (sessionId, key) {
        var interactions = this.pendingInteractions.get(sessionId);
        if (interactions === undefined || !interactions.delete(key))
            return;
        if (interactions.size === 0)
            this.pendingInteractions.delete(sessionId);
        this.notifier.markDirty();
    };
    // ---- ConnectionController sinks (wired by boot) ----
    /**
     * Mux frame entry: sessionId-bearing frames go only to instantiated sessions
     * (no lazy build; non-pending frames for uninstantiated sessions drop —
     * history backfills them on open).
     * @param envelope - the frame with its wire rpcId.
     */
    SessionManager.prototype.handleMuxEnvelope = function (envelope) {
        var _a, _b;
        var frame = envelope.payload;
        if (frame.type === 'stream/error')
            return; // Controller already treats this as stream failure
        if (frame.type === 'session/event'
            && frame.event.type === 'user/message'
            && frame.event.data.source.kind === 'user') {
            // session.list supplies the cold baseline, while a direct prompt or an
            // admitted steer advances it between pulls. Max keeps replayed or
            // repaired older user messages from moving the row backwards.
            this.recordMutation({ kind: 'activity', sessionId: frame.sessionId, updatedAt: frame.event.time });
        }
        if (frame.type === 'session/projection') {
            // Finished host-computed value: land it in the resident store whether or
            // not the Session is instantiated (list rows read the 'title' key). The
            // synchronous markDirty keeps the list snapshot same-tick fresh (the
            // store's own any-key channel is microtask-batched).
            this.projectionStore(frame.sessionId).apply(frame.key, frame.value, frame.seq);
            this.notifier.markDirty();
            return;
        }
        if (frame.type === 'session/jobs') {
            // Whole-set snapshot, so last-wins with no reconciliation. The Host omits
            // the baseline for an empty set, which is the same fact an emptying change
            // reports as `[]` — both land as an absent key.
            if (frame.jobs.length === 0)
                this.jobsBySession.delete(frame.sessionId);
            else
                this.jobsBySession.set(frame.sessionId, frame.jobs);
            this.notifier.markDirty();
            return;
        }
        if (frame.type === 'session/subscribed') {
            // Rows past the host's durable baseline rode state a restart lost; drop
            // them so last-wins cannot pin a phantom value over recomputed truth.
            (_a = this.projectionStores.get(frame.sessionId)) === null || _a === void 0 ? void 0 : _a.truncate(frame.lastSeq);
            // Same re-baseline reasoning as the queue below: this generation sends a
            // task baseline only when the set is non-empty, so a mirror kept from the
            // previous generation would survive as a phantom list.
            this.jobsBySession.delete(frame.sessionId);
            this.notifier.markDirty();
            // New mux-generation baseline: discard the previous queue snapshot.
            // The host omits session/queue when the live queue is empty, so retaining
            // it could replay stale work when the Session is instantiated later.
            // This is the same re-baseline signal Session uses for its own mirror.
            var buffered = this.pendingBuffers.get(frame.sessionId);
            if (buffered !== undefined) {
                var kept = buffered.filter(function (item) { return item.payload.type !== 'session/queue'; });
                if (kept.length !== buffered.length) {
                    if (kept.length === 0)
                        this.pendingBuffers.delete(frame.sessionId);
                    else
                        this.pendingBuffers.set(frame.sessionId, kept);
                }
            }
        }
        // List-level pending-interaction status (the sidebar amber dot): tracked
        // for every session, instantiated or not; stable keys make replays idempotent.
        if (frame.type === 'approval/requested') {
            this.trackPending(frame.sessionId, "a:".concat(frame.approvalId), 'approval');
        }
        else if (frame.type === 'approval/resolved') {
            this.resolvePending(frame.sessionId, "a:".concat(frame.approvalId));
        }
        else if (frame.type === 'question/requested') {
            this.trackPending(frame.sessionId, "q:".concat(envelope.rpcId), questionInteractionStatus(frame.questions));
        }
        else if (frame.type === 'question/resolved') {
            this.resolvePending(frame.sessionId, "q:".concat(frame.questionRpcId));
        }
        var session = this.sessions.get(frame.sessionId);
        if (session === undefined) {
            // Answerable requests never hit history: retain each live identity until
            // instantiation, compacting replay duplicates and resolutions so list
            // status cannot outlive the PendingWait the user would need to answer.
            // Queue is a latest-value snapshot; everything else drops because open
            // backfills it from history.
            switch (frame.type) {
                case 'approval/requested':
                case 'question/requested':
                case 'session/queue': {
                    var buffer = (_b = this.pendingBuffers.get(frame.sessionId)) !== null && _b !== void 0 ? _b : [];
                    var key_1 = frame.type === 'approval/requested'
                        ? "a:".concat(frame.approvalId)
                        : frame.type === 'question/requested' ? "q:".concat(envelope.rpcId) : 'queue';
                    var prior = buffer.findIndex(function (item) { return bufferedRequestKey(item) === key_1; });
                    if (prior === -1)
                        buffer.push(envelope);
                    else
                        buffer[prior] = envelope;
                    this.pendingBuffers.set(frame.sessionId, buffer);
                    return;
                }
                case 'approval/resolved':
                case 'question/resolved': {
                    var buffer = this.pendingBuffers.get(frame.sessionId);
                    if (buffer === undefined)
                        return;
                    var key_2 = frame.type === 'approval/resolved'
                        ? "a:".concat(frame.approvalId)
                        : "q:".concat(frame.questionRpcId);
                    var prior = buffer.findIndex(function (item) { return bufferedRequestKey(item) === key_2; });
                    if (prior !== -1)
                        buffer.splice(prior, 1);
                    if (buffer.length === 0)
                        this.pendingBuffers.delete(frame.sessionId);
                    return;
                }
                default:
                    return;
            }
        }
        session.handleMuxEnvelope(envelope.rpcId, frame);
    };
    /**
     * Host frame entry: list upkeep + per-instance running/removed/agent-error relay.
     * @param envelope - the frame with its wire rpcId.
     */
    SessionManager.prototype.handleHostEnvelope = function (envelope) {
        var _a, _b, _c, _d, _e, _f;
        var frame = envelope.payload;
        switch (frame.type) {
            case 'host/session-added': {
                this.mergeSummary(__assign(__assign(__assign(__assign({ sessionId: frame.sessionId, updatedAt: Date.now(), running: false, blank: frame.blank }, (frame.parentSessionId !== undefined ? { parentSessionId: frame.parentSessionId } : {})), (frame.origin !== undefined ? { origin: frame.origin } : {})), (frame.cwd !== undefined ? { cwd: frame.cwd } : {})), (frame.agentPreset !== undefined ? { agentPreset: frame.agentPreset } : {})));
                (_a = this.sessions.get(frame.sessionId)) === null || _a === void 0 ? void 0 : _a.handleBlank(frame.blank);
                if (frame.origin === 'subagent' && frame.parentSessionId !== undefined) {
                    this.markCatalogParentExpandable(frame.parentSessionId);
                }
                if (frame.parentSessionId !== undefined
                    && (this.selected === frame.parentSessionId || this.openCatalogs.has(frame.parentSessionId))) {
                    this.scheduleCatalogRefresh(frame.parentSessionId);
                }
                return;
            }
            case 'host/session-removed': {
                var summary = this.summaries.find(function (candidate) { return candidate.sessionId === frame.sessionId; });
                var durableSubagent = (summary === null || summary === void 0 ? void 0 : summary.origin) === 'subagent' || this.addresses.has(frame.sessionId);
                this.recordMutation(durableSubagent
                    ? { kind: 'status', sessionId: frame.sessionId, running: false }
                    : { kind: 'remove', sessionId: frame.sessionId });
                this.updateCatalogActivity(frame.sessionId, false);
                if (durableSubagent) {
                    // An Activation detaching is not durable child deletion:
                    // keep its lineage and conversation while returning it to idle.
                    (_b = this.sessions.get(frame.sessionId)) === null || _b === void 0 ? void 0 : _b.handleRunning(false);
                }
                else {
                    (_c = this.sessions.get(frame.sessionId)) === null || _c === void 0 ? void 0 : _c.handleRemoved();
                }
                this.pendingBuffers.delete(frame.sessionId); // a removed session's buffered frames must not replay on a future instantiation
                this.pendingInteractions.delete(frame.sessionId); // a removed session cannot wait on anyone
                // Owner disposal already dropped these registry-side, but that lands on
                // the mux stream while this frame rides the host stream, so the two have
                // no relative order. Clearing here makes a detached Activation's rows
                // disappear whichever arrives first.
                this.jobsBySession.delete(frame.sessionId);
                if (!durableSubagent)
                    this.projectionStores.delete(frame.sessionId);
                // A pull already in flight was requested before this removal and can
                // carry the pre-removal parentAvailable:true, which would resurrect
                // the writable editor this invalidation just closed. Replay false over
                // that response and queue one trailing refresh so the post-removal
                // host truth converges.
                var inflightCatalog = this.catalogInflight.get(frame.sessionId);
                if (inflightCatalog !== undefined) {
                    inflightCatalog.parentAvailableOverride = false;
                    this.catalogStale.add(frame.sessionId);
                }
                // The removed session can no longer be the delivery owner of its
                // catalog: invalidate availability immediately. Removal schedules no
                // catalog refresh, and without this an addressed child keeps a
                // writable editor against a dead continuation owner until an
                // unrelated refresh (or forever, for a closed menu).
                var ownedCatalog = this.catalogs.get(frame.sessionId);
                if (ownedCatalog !== undefined && ownedCatalog.parentAvailable) {
                    this.catalogs.set(frame.sessionId, __assign(__assign({}, ownedCatalog), { parentAvailable: false }));
                }
                for (var _i = 0, _g = this.addresses; _i < _g.length; _i++) {
                    var _h = _g[_i], childId = _h[0], address = _h[1];
                    if (address.parentSessionId !== frame.sessionId)
                        continue;
                    (_d = this.sessions.get(childId)) === null || _d === void 0 ? void 0 : _d.handleSubagentParentAvailable(false);
                }
                return;
            }
            case 'host/session-status': {
                this.recordMutation({ kind: 'status', sessionId: frame.sessionId, running: frame.running });
                (_e = this.sessions.get(frame.sessionId)) === null || _e === void 0 ? void 0 : _e.handleRunning(frame.running);
                this.updateCatalogActivity(frame.sessionId, frame.running);
                return;
            }
            case 'host/agent-error': {
                (_f = this.sessions.get(frame.sessionId)) === null || _f === void 0 ? void 0 : _f.handleAgentError(frame.message);
                return; // not reflected in the list
            }
            default:
                return; // stream/error ignored; unknown frames ignored (documented default)
        }
    };
    /**
     * The moment a connection generation dies (before any next-generation frame
     * can arrive — onConnected waits for the readiness handshake while replayed
     * frames flow from stream open, so clearing there would race the replay):
     * drop generation-scoped live state. Interactions resolved while disconnected
     * send no frame, so stale statuses and buffered answerable frames must not
     * survive into the next generation — mux-open replay re-adds every still-pending
     * request with its live rpcId.
    */
    SessionManager.prototype.handleDisconnected = function () {
        if (this.pendingInteractions.size > 0) {
            this.pendingInteractions.clear();
            this.notifier.markDirty();
        }
        for (var _i = 0, _a = __spreadArray([], this.pendingBuffers, true); _i < _a.length; _i++) {
            var _b = _a[_i], sessionId = _b[0], buffer = _b[1];
            var kept = buffer.filter(function (item) {
                return item.payload.type !== 'approval/requested' && item.payload.type !== 'question/requested';
            });
            if (kept.length === buffer.length)
                continue;
            if (kept.length === 0)
                this.pendingBuffers.delete(sessionId);
            else
                this.pendingBuffers.set(sessionId, kept);
        }
    };
    /** After each connection generation: refresh the session baseline and rebuild opened windows. */
    SessionManager.prototype.handleConnected = function () {
        void this.refreshList();
        var selectedAddress = this.selected === undefined ? undefined : this.addresses.get(this.selected);
        if (selectedAddress !== undefined)
            void this.refreshSubagents(selectedAddress.parentSessionId);
        if (this.selected !== undefined)
            void this.refreshSubagents(this.selected);
        for (var _i = 0, _a = this.openCatalogs; _i < _a.length; _i++) {
            var parentSessionId = _a[_i];
            void this.refreshSubagents(parentSessionId);
        }
        for (var _b = 0, _c = this.sessions.values(); _b < _c.length; _b++) {
            var session = _c[_b];
            void session.resync();
        }
    };
    /** Debounce membership refetches while one parent catalog is selected or open. */
    SessionManager.prototype.scheduleCatalogRefresh = function (parentSessionId) {
        var _this = this;
        if (this.catalogDebounce.has(parentSessionId))
            return;
        var timer = setTimeout(function () {
            _this.catalogDebounce.delete(parentSessionId);
            // The in-flight response predates the membership frame that scheduled
            // this callback. Queue one post-settlement pull instead of treating an
            // ordinary overlapping read as evidence that catalog membership changed.
            if (_this.catalogInflight.has(parentSessionId)) {
                _this.catalogStale.add(parentSessionId);
                return;
            }
            void _this.refreshSubagents(parentSessionId);
        }, 50);
        this.catalogDebounce.set(parentSessionId, timer);
    };
    /** Apply one Agent-driver transition to loaded and in-flight catalogs. */
    SessionManager.prototype.updateCatalogActivity = function (childSessionId, running) {
        var activity = running ? 'running' : 'inactive';
        for (var _i = 0, _a = this.catalogInflight.values(); _i < _a.length; _i++) {
            var inflight = _a[_i];
            inflight.activityRows.set(childSessionId, activity);
        }
        var changed = false;
        for (var _b = 0, _c = this.catalogs; _b < _c.length; _b++) {
            var _d = _c[_b], parentSessionId = _d[0], catalog = _d[1];
            if (!catalog.entries.some(function (entry) {
                return entry.kind === 'child' && entry.id === childSessionId && entry.activity !== activity;
            }))
                continue;
            var entries = catalog.entries.map(function (entry) {
                if (entry.kind !== 'child' || entry.id !== childSessionId)
                    return entry;
                return __assign(__assign({}, entry), { activity: activity });
            });
            changed = true;
            this.catalogs.set(parentSessionId, __assign(__assign({}, catalog), { entries: entries }));
        }
        if (changed)
            this.notifier.markDirty();
    };
    /** Preserve and project a positive expandability hint after one direct subagent publishes. */
    SessionManager.prototype.markCatalogParentExpandable = function (parentSessionId) {
        this.applyCatalogParentExpandable(parentSessionId);
        for (var _i = 0, _a = this.catalogInflight.values(); _i < _a.length; _i++) {
            var inflight = _a[_i];
            inflight.expandableRows.add(parentSessionId);
        }
    };
    /** Apply one positive expandability hint to every loaded catalog containing that unique row id. */
    SessionManager.prototype.applyCatalogParentExpandable = function (parentSessionId) {
        var changed = false;
        for (var _i = 0, _a = this.catalogs; _i < _a.length; _i++) {
            var _b = _a[_i], catalogParentId = _b[0], catalog = _b[1];
            if (!catalog.entries.some(function (entry) {
                return entry.kind === 'child' && entry.id === parentSessionId && !entry.hasChildren;
            }))
                continue;
            var entries = catalog.entries.map(function (entry) {
                if (entry.kind !== 'child' || entry.id !== parentSessionId || entry.hasChildren)
                    return entry;
                return __assign(__assign({}, entry), { hasChildren: true });
            });
            changed = true;
            this.catalogs.set(catalogParentId, __assign(__assign({}, catalog), { entries: entries }));
        }
        if (changed)
            this.notifier.markDirty();
    };
    /** Fold request-local row mutations into one catalog result before publication. */
    SessionManager.prototype.withCatalogMutations = function (entries, expandableRows, activityRows) {
        return entries.map(function (entry) {
            if (entry.kind !== 'child')
                return entry;
            var activity = activityRows.get(entry.id);
            if (!expandableRows.has(entry.id) && activity === undefined)
                return entry;
            return __assign(__assign(__assign({}, entry), expandableRows.has(entry.id) ? { hasChildren: true } : {}), activity === undefined ? {} : { activity: activity });
        });
    };
    /**
     * Reconcile completion reminders against the latest summaries, eagerly after
     * every mutation and pull (a snapshot-build-time pass would collapse
     * consecutive status frames into one observation). A running→idle edge of a
     * non-selected session arms its reminder; running disarms it; removal drops
     * it. First observation only records the running bit — sessions already
     * idle at load get no reminder.
     */
    SessionManager.prototype.syncCompletedNotifications = function () {
        var seen = new Set();
        for (var _i = 0, _a = this.summaries; _i < _a.length; _i++) {
            var s = _a[_i];
            seen.add(s.sessionId);
            var prev = this.prevRunning.get(s.sessionId);
            if (prev === undefined) {
                this.prevRunning.set(s.sessionId, s.running);
                continue;
            }
            if (prev && !s.running) {
                if (s.sessionId !== this.selected)
                    this.completedNotifications.add(s.sessionId);
            }
            else if (s.running) {
                this.completedNotifications.delete(s.sessionId);
            }
            this.prevRunning.set(s.sessionId, s.running);
        }
        for (var _b = 0, _c = this.prevRunning.keys(); _b < _c.length; _b++) {
            var id = _c[_b];
            if (!seen.has(id))
                this.prevRunning.delete(id);
        }
        for (var _d = 0, _e = this.completedNotifications; _d < _e.length; _d++) {
            var id = _e[_d];
            if (!seen.has(id))
                this.completedNotifications.delete(id);
        }
    };
    SessionManager.prototype.buildListSnapshot = function () {
        var _this = this;
        var _a;
        var merged = this.summaries.map(function (summary) {
            // List rows read the generic 'title' projection key (host-computed unit
            // value; there is no dedicated title frame).
            var projectionStore = _this.projectionStores.get(summary.sessionId);
            var title = projectionStore === null || projectionStore === void 0 ? void 0 : projectionStore.get('title');
            var projectionValues = projectionStore === null || projectionStore === void 0 ? void 0 : projectionStore.values();
            return __assign(__assign(__assign({}, summary), (typeof title === 'string' && title !== '' ? { title: title } : {})), (projectionValues === undefined ? {} : { projectionValues: projectionValues }));
        });
        var pendingInteractions = new Map();
        for (var _i = 0, _b = this.pendingInteractions; _i < _b.length; _i++) {
            var _c = _b[_i], sessionId = _c[0], interactions = _c[1];
            var statuses = __spreadArray([], interactions.values(), true);
            // The composer selects the first question ahead of approval. Mirror that
            // answer order so the sidebar names the interaction the user can act on.
            var status_1 = (_a = statuses.find(function (candidate) { return candidate !== 'approval'; })) !== null && _a !== void 0 ? _a : statuses[0];
            if (status_1 !== undefined)
                pendingInteractions.set(sessionId, status_1);
        }
        var fresh = (0, lineage_ts_1.flattenLineage)(merged, pendingInteractions, this.completedNotifications);
        var items = fresh.map(function (entry) {
            var prev = _this.entryCache.get(entry.sessionId);
            if (prev !== undefined && prev.updatedAt === entry.updatedAt && prev.running === entry.running
                && prev.blank === entry.blank && prev.agentPreset === entry.agentPreset
                && prev.parentSessionId === entry.parentSessionId && prev.cwd === entry.cwd
                && prev.origin === entry.origin && prev.title === entry.title && prev.depth === entry.depth
                && prev.pendingInteraction === entry.pendingInteraction
                && prev.projectionValues === entry.projectionValues
                && prev.completed === entry.completed)
                return prev;
            _this.entryCache.set(entry.sessionId, entry);
            return entry;
        });
        var _loop_1 = function (id) {
            if (!items.some(function (e) { return e.sessionId === id; }))
                this_1.entryCache.delete(id);
        };
        var this_1 = this;
        for (var _d = 0, _e = this.entryCache.keys(); _d < _e.length; _d++) {
            var id = _e[_d];
            _loop_1(id);
        }
        var sameOrder = items.length === this.itemsCache.length && items.every(function (e, i) { return e === _this.itemsCache[i]; });
        if (!sameOrder)
            this.itemsCache = items;
        var selected = this.selected;
        var current = selected !== undefined
            && (items.some(function (item) { return item.sessionId === selected; }) || this.addresses.has(selected))
            ? selected
            : undefined;
        return {
            items: this.itemsCache,
            current: current,
            state: this.listState,
            phase: this.listPhase,
            error: this.listError,
            subagentsByParent: Object.fromEntries(this.catalogs),
            jobsBySession: Object.fromEntries(this.jobsBySession),
            currentAddress: current === undefined ? undefined : this.addresses.get(current),
        };
    };
    return SessionManager;
}());
exports.SessionManager = SessionManager;
/** Apply one list mutation without deriving display order. */
function applyMutation(summaries, mutation) {
    switch (mutation.kind) {
        case 'upsert': {
            var existing = summaries.find(function (summary) { return summary.sessionId === mutation.summary.sessionId; });
            if (existing === undefined)
                return __spreadArray([mutation.summary], summaries, true);
            var filled_1 = __assign(__assign(__assign(__assign(__assign(__assign({}, existing), { 
                // Blank only lowers: a stale true (session-added racing the local
                // first send) never re-hides an already-surfaced session.
                blank: existing.blank && mutation.summary.blank }), (existing.cwd === undefined && mutation.summary.cwd !== undefined ? { cwd: mutation.summary.cwd } : {})), (existing.parentSessionId === undefined && mutation.summary.parentSessionId !== undefined
                ? { parentSessionId: mutation.summary.parentSessionId } : {})), (existing.origin === undefined && mutation.summary.origin !== undefined
                ? { origin: mutation.summary.origin } : {})), (mutation.summary.agentPreset !== undefined
                ? { agentPreset: mutation.summary.agentPreset } : {}));
            if (filled_1.cwd === existing.cwd && filled_1.parentSessionId === existing.parentSessionId
                && filled_1.origin === existing.origin && filled_1.blank === existing.blank
                && filled_1.agentPreset === existing.agentPreset)
                return __spreadArray([], summaries, true);
            return summaries.map(function (summary) { return summary.sessionId === mutation.summary.sessionId ? filled_1 : summary; });
        }
        case 'remove':
            return summaries.filter(function (summary) { return summary.sessionId !== mutation.sessionId; });
        case 'status':
            // running:true doubles as the cross-client blank flip (a blank session
            // never runs, so the first running frame proves a message landed).
            return summaries.map(function (summary) { return summary.sessionId === mutation.sessionId
                && (summary.running !== mutation.running || (mutation.running && summary.blank))
                ? __assign(__assign({}, summary), { running: mutation.running, blank: summary.blank && !mutation.running }) : summary; });
        case 'activity':
            return summaries.map(function (summary) { return summary.sessionId === mutation.sessionId
                && mutation.updatedAt > summary.updatedAt
                ? __assign(__assign({}, summary), { updatedAt: mutation.updatedAt }) : summary; });
        case 'engaged':
            return summaries.map(function (summary) { return summary.sessionId === mutation.sessionId && summary.blank
                ? __assign(__assign({}, summary), { blank: false }) : summary; });
    }
}
/** Temporary source-plane bridge while the Host contract and client project build independently. */
function workspaceAttachSessionId(error) {
    var candidate = error;
    return candidate.code === 'workspace-attach-failed' ? candidate.details.sessionId : undefined;
}
