"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.SessionRuntime = exports.scopeOf = exports.SessionForkError = exports.SessionCreateError = void 0;
exports.workspaceTitleOf = workspaceTitleOf;
// Value import from the inline-safe wire layer (not the connection plugin):
// plugin-to-plugin value imports are a bundle purity error.
var api_1 = require("@z/dsh-host-apiproxy/api");
var store_ts_1 = require("../contract/store.ts");
var scope_ts_1 = require("../agents/scope.ts");
var manager_ts_1 = require("./manager.ts");
var provide_ts_1 = require("./provide.ts");
/** Structured session-create failure. */
var SessionCreateError = /** @class */ (function (_super) {
    __extends(SessionCreateError, _super);
    /**
     * @param rpcError - Host business or folded transport error.
     * @param requestedSessionId - caller-preallocated id used for later stream/list reconciliation.
     */
    function SessionCreateError(rpcError, requestedSessionId) {
        var _this = _super.call(this, "session create failed: ".concat(rpcError.code, ": ").concat(rpcError.message)) || this;
        _this.rpcError = rpcError;
        _this.requestedSessionId = requestedSessionId;
        _this.name = 'SessionCreateError';
        return _this;
    }
    return SessionCreateError;
}(Error));
exports.SessionCreateError = SessionCreateError;
/** Structured session-fork failure. */
var SessionForkError = /** @class */ (function (_super) {
    __extends(SessionForkError, _super);
    /**
     * @param rpcError - Host business or folded transport error.
     * @param sourceSessionId - the session the fork was cut from.
     */
    function SessionForkError(rpcError, sourceSessionId) {
        var _this = _super.call(this, "session fork failed: ".concat(rpcError.code, ": ").concat(rpcError.message)) || this;
        _this.rpcError = rpcError;
        _this.sourceSessionId = sourceSessionId;
        _this.name = 'SessionForkError';
        return _this;
    }
    return SessionForkError;
}(Error));
exports.SessionForkError = SessionForkError;
// Scope primitives live in ../agents/scope.ts (the client mirror of host
// dsh-scope, keyed by Agent identity); re-exported here so existing
// consumers keep their import site.
var scope_ts_2 = require("../agents/scope.ts");
Object.defineProperty(exports, "scopeOf", { enumerable: true, get: function () { return scope_ts_2.scopeOf; } });
/**
 * Workspace display title of a session cwd: the path's last non-empty
 * segment (both separators accepted; trailing separators ignored), or ''
 * for separator-only paths — callers own their fallback (session id, raw
 * cwd, default-directory copy). The repo-wide single basename derivation —
 * every surface naming a workspace (picker rows, toggle labels, list titles)
 * calls this instead of re-splitting paths.
 * @param cwd - workspace directory path.
 * @returns basename title, or '' when no non-empty segment exists.
 */
function workspaceTitleOf(cwd) {
    var _a;
    return (_a = cwd.replace(/[/\\]+$/, '').split(/[/\\]/).pop()) !== null && _a !== void 0 ? _a : '';
}
/**
 * Display title projection: durable title, project directory basename, then
 * the raw id.
 */
function displayTitleOf(title, cwd, id) {
    if (title !== undefined)
        return title;
    if (cwd !== undefined && cwd !== '') {
        var base = workspaceTitleOf(cwd);
        if (base !== '')
            return base;
    }
    return id;
}
/**
 * Increment a trailing fork number while preserving its half-width or
 * full-width parentheses; an unnumbered title starts with ` (1)`.
 * @param title - source session's durable title.
 * @returns the title assigned to the fork child.
 */
function increasedForkTitle(title) {
    var ascii = /^(.*?)\((\d+)\)$/u.exec(title);
    if ((ascii === null || ascii === void 0 ? void 0 : ascii[1]) !== undefined && ascii[2] !== undefined) {
        return "".concat(ascii[1], "(").concat(BigInt(ascii[2]) + 1n, ")");
    }
    var fullWidth = /^(.*?)（(\d+)）$/u.exec(title);
    if ((fullWidth === null || fullWidth === void 0 ? void 0 : fullWidth[1]) !== undefined && fullWidth[2] !== undefined) {
        return "".concat(fullWidth[1], "\uFF08").concat(BigInt(fullWidth[2]) + 1n, "\uFF09");
    }
    return "".concat(title, " (1)");
}
/** Root sessions service: list store, current selection, object-layer manager, scope tree, bindings, and breadcrumb routes. */
var SessionRuntime = /** @class */ (function () {
    /**
     * @param ctx - client root context (scope fibers mount under it).
     * @param api - wire client shared with every Session.
     * @param remote - generated Remote namespaces shared with every Session.
     * @param conversationRuntime - same-pass registry instances, when runtime apply owns them.
     */
    function SessionRuntime(rootCtx, api, remote, conversationRuntime) {
        var _this = this;
        this.rootCtx = rootCtx;
        /**
         * The wire schema's own result bound, re-exposed for presentation plugins as
         * injected data. Not per-connection state: the `session.search` response
         * schema caps `items` at this constant, so every transport (fixture included)
         * reports the same number.
         */
        this.searchResultLimit = api_1.SESSION_SEARCH_RESULT_LIMIT;
        this.scopes = new Map();
        /** Removed-while-staged sessions whose teardown waits for the stage to move away. */
        this.deferredRemovals = new Set();
        this.selection = (0, store_ts_1.createSnapshotStore)({}, { persist: { name: 'dsh.sessions.current' } });
        var restored = this.selection.getSnapshot();
        var conversationEvents = rootCtx.get('conversationEvents');
        var conversationViews = rootCtx.get('conversationViews');
        var conversation = conversationRuntime !== null && conversationRuntime !== void 0 ? conversationRuntime : (conversationEvents === undefined || conversationViews === undefined
            ? undefined
            : { events: conversationEvents, views: conversationViews });
        this.manager = new manager_ts_1.SessionManager(api, remote, restored.sessionId, restored.subagentAddress, conversation);
        this.list = (0, store_ts_1.createSnapshotStore)({
            ids: [], byId: {}, current: undefined, phase: 'pending',
            subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
        });
        // The manager owns wire truth; the store is its projection. Manager
        // notifications are already microtask-batched.
        this.manager.subscribe(function () { _this.projectList(); });
        // Stage follower: every current write (open() and projection alike)
        // re-evaluates staging, so startup restore (persisted selection validated
        // by the projection) and reconnect resurfacing open their window with no
        // dedicated code path. Safe to run synchronously inside the store notify:
        // the follower writes no list state — session.open()'s synchronous prefix
        // touches only session-side state and its own microtask-batched notifier.
        // The current-provide projection follows the same current writes.
        this.list.subscribe(function () {
            _this.followCurrent();
            _this.provideChannel.publishCurrent();
        });
        this.provideChannel = new provide_ts_1.SessionProvideChannel({
            rebuildBundles: function () {
                for (var _i = 0, _a = _this.scopes.values(); _i < _a.length; _i++) {
                    var record = _a[_i];
                    record.provideInfo = _this.provideChannel.materializeInfo(record.binding);
                }
            },
            resolveCurrent: function () { return _this.maybeProvideInfo(_this.list.getSnapshot().current); },
        });
        this.currentProvideInfo = this.provideChannel.currentProvideInfo;
        var registryRebuildQueued = false;
        var scheduleRegistryRebuild = function () {
            if (registryRebuildQueued)
                return;
            registryRebuildQueued = true;
            queueMicrotask(function () {
                registryRebuildQueued = false;
                _this.manager.rebuildConversationRegistry();
            });
        };
        if (conversation !== undefined) {
            rootCtx.effect(function () {
                var disposeEvents = conversation.events.subscribe(scheduleRegistryRebuild);
                var disposeViews = conversation.views.subscribe(scheduleRegistryRebuild);
                return function () {
                    disposeEvents();
                    disposeViews();
                };
            }, 'sessions: conversation registry rebuild');
        }
        rootCtx.reflect.provide('sessions', this, undefined);
    }
    /**
     * Register a per-session standard-props provider: every session-scope slot
     * component receives the contributed members as standard props (`hooks`
     * sources become `use<Name>` selector hooks on the render side; `props`
     * spread verbatim). Contributions materialize lazily with the session's
     * scope record and die with it. Registration order is resolution order;
     * duplicate member names fail loud at materialization.
     * @param descriptor - static member roster plus per-session resolver.
     * @returns disposer removing the provider (already-materialized bundles keep their members until their scope drops).
     */
    SessionRuntime.prototype.provide = function (descriptor) {
        // Scopes may already exist (boot order: the list lands and resolves
        // scopes before later plugins register) — the channel rebuilds their
        // bundles through the host hooks so every provider lands by first render.
        return this.provideChannel.provide(descriptor);
    };
    /**
     * Select a listed or retained catalog-addressed session as current.
     * @param id - listed or addressed session id.
     */
    SessionRuntime.prototype.open = function (id) {
        this.manager.select(id);
    };
    /**
     * Open a healthy catalog child through its direct-parent address.
     * @param address - catalog-derived parent and child ids.
     */
    SessionRuntime.prototype.openSubagent = function (address) {
        this.manager.selectSubagent(address);
    };
    /**
     * Resolve an already discovered direct-parent address without opening it.
     * Feature plugins use this to avoid Agent-bound RPCs in persisted child views.
     * @param id - possible addressed child id.
     * @returns The retained address, when present.
     */
    SessionRuntime.prototype.subagentAddress = function (id) {
        return this.manager.subagentAddress(id);
    };
    /**
     * Inform the runtime whether a catalog menu is consuming membership updates.
     * @param parentSessionId - selected parent.
     * @param open - menu state.
     */
    SessionRuntime.prototype.setSubagentCatalogOpen = function (parentSessionId, open) {
        this.manager.setSubagentCatalogOpen(parentSessionId, open);
    };
    /**
     * Refresh one direct-child catalog.
     * @param parentSessionId - catalog owner.
     */
    SessionRuntime.prototype.refreshSubagents = function (parentSessionId) {
        return this.manager.refreshSubagents(parentSessionId);
    };
    SessionRuntime.prototype.noteAgentPreset = function (sessionId, agentPreset) {
        this.manager.noteAgentPreset(sessionId, agentPreset);
    };
    /**
     * Clear the current selection so the layout shows the no-session empty
     * state (new-session affordance and the workspace preselection flow).
     * Wipes the persisted selection too — a reload stays on empty until the
     * user opens or starts a session. The staged scope keeps its frozen view
     * per the masked-gap contract until the next open() moves the stage.
     */
    SessionRuntime.prototype.clear = function () {
        this.manager.clearSelection();
    };
    /**
     * Refresh the real Session baseline, reusing an in-flight pull.
     * @returns completion of the current or newly started baseline pull.
     */
    SessionRuntime.prototype.refresh = function () {
        return this.manager.refreshList();
    };
    /**
     * Search the Host's visible message-content index. Results stay
     * request-local; the list snapshot remains the metadata authority.
     * @param query - non-blank literal phrase.
     * @param signal - cancellation for a superseded search.
     * @returns bounded results or a business/transport error.
     */
    SessionRuntime.prototype.search = function (query, signal) {
        return this.manager.search(query, signal);
    };
    /**
     * Route a mux stream envelope into the Session object layer.
     * @param envelope - validated mux stream envelope.
     */
    SessionRuntime.prototype.handleMuxEnvelope = function (envelope) {
        this.manager.handleMuxEnvelope(envelope);
    };
    /**
     * Route a Host stream envelope into the Session object layer.
     * @param envelope - validated Host stream envelope.
     */
    SessionRuntime.prototype.handleHostEnvelope = function (envelope) {
        this.manager.handleHostEnvelope(envelope);
    };
    /** Rebuild the Session baseline and every opened window after connection. */
    SessionRuntime.prototype.handleConnected = function () {
        this.manager.handleConnected();
    };
    /** Drop generation-scoped live interaction state the moment a connection generation dies. */
    SessionRuntime.prototype.handleDisconnected = function () {
        this.manager.handleDisconnected();
    };
    /**
     * Create a session on the host. Resolution guarantee: by the time the
     * promise resolves, the created session is in the list store and
     * {@link SessionRuntime.binding} resolves it — callers (New Session
     * draft hand-off) may address the scope synchronously, without waiting a
     * notifier flush. The synchronous projection below makes this structural
     * rather than an accident of microtask ordering.
     * @param opts - target workspace or directory and an optional preallocated id.
     * @returns the new session id.
     * @throws {SessionCreateError} with the requested id.
     */
    SessionRuntime.prototype.create = function () {
        return __awaiter(this, arguments, void 0, function (opts) {
            var result;
            if (opts === void 0) { opts = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.manager.create(opts)];
                    case 1:
                        result = _a.sent();
                        if (!result.ok)
                            throw new SessionCreateError(result.error, opts.sessionId);
                        this.projectList();
                        return [2 /*return*/, result.value.sessionId];
                }
            });
        });
    };
    /**
     * Fork a session from a completed-turn prefix of the source (same
     * synchronous-addressability guarantee as {@link SessionRuntime.create}:
     * on resolution the child is in the list store and open() can target it).
     * @param opts - source session id, the optional event seq anchoring the
     *   cut (the boundary is the first turn/end at or after it; an in-log
     *   anchor in an open turn is unavailable rather than clipped backward),
     *   and whether to increment an inherited durable title before resolving.
     *   A fractional anchor floors to a real event seq: the frozen nodes of an
     *   interrupted turn carry flow-ordering seqs between two events, and the
     *   wire takes integers only.
     * @returns the child session id.
     * @throws {SessionForkError} with the source id.
     * @throws {Error} when a requested child-title rename fails after creation.
     */
    SessionRuntime.prototype.fork = function (opts) {
        return __awaiter(this, void 0, void 0, function () {
            var sourceTitle, result, childId, child, renamed;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        sourceTitle = opts.increaseTitle
                            ? (_a = this.list.getSnapshot().byId[opts.sessionId]) === null || _a === void 0 ? void 0 : _a.title
                            : undefined;
                        return [4 /*yield*/, this.manager.fork(__assign({ sessionId: opts.sessionId }, (opts.atSeq === undefined ? {} : { atSeq: Math.floor(opts.atSeq) })))];
                    case 1:
                        result = _c.sent();
                        if (!result.ok)
                            throw new SessionForkError(result.error, opts.sessionId);
                        this.projectList();
                        childId = result.value.sessionId;
                        if (!(sourceTitle !== undefined)) return [3 /*break*/, 3];
                        child = (_b = this.binding(childId)) === null || _b === void 0 ? void 0 : _b.session;
                        if (child === undefined)
                            throw new Error("fork child \"".concat(childId, "\" is not locally addressable"));
                        return [4 /*yield*/, child.rename(increasedForkTitle(sourceTitle))];
                    case 2:
                        renamed = _c.sent();
                        if (!renamed.ok)
                            throw new Error("fork child rename failed: ".concat(renamed.error.code, ": ").concat(renamed.error.message));
                        _c.label = 3;
                    case 3: return [2 /*return*/, childId];
                }
            });
        });
    };
    /**
     * Resolve an Agent-scoped context view (use-and-discard).
     * @param id - session id (the agent identity — 1:1 same axis).
     * @returns scoped ctx, or undefined for a session neither listed nor already scoped.
     */
    SessionRuntime.prototype.scope = function (id) {
        var _a;
        return (_a = this.resolve(id)) === null || _a === void 0 ? void 0 : _a.ctx;
    };
    /**
     * Read the Agent scope tag off a context. Service-method boundary: fetch
     * bundles must reach scope resolution through ctx.sessions — a cross-bundle
     * value import of the standalone helper would inline a second module
     * instance whose private tag Symbol never matches.
     * @param ctx - any client context.
     * @returns the session id, or undefined on root contexts.
     */
    SessionRuntime.prototype.scopeOf = function (ctx) {
        return (0, scope_ts_1.scopeOf)(ctx);
    };
    /**
     * Resolve the business Session behind an Agent-scoped context — the one
     * hop every scoped consumer (event listeners, per-session controllers)
     * takes from ctx-space into object-space (the client mirror of host
     * `agent.session`). Same service-method boundary as
     * {@link SessionRuntime.scopeOf}.
     * @param ctx - an Agent-scoped context.
     * @returns the session face, or undefined when the ctx is untagged or its scope was pruned.
     */
    SessionRuntime.prototype.sessionOf = function (ctx) {
        var _a;
        var id = (0, scope_ts_1.scopeOf)(ctx);
        if (id === undefined)
            return undefined;
        return (_a = this.scopes.get(id)) === null || _a === void 0 ? void 0 : _a.binding.session;
    };
    /**
     * Resolve the stable session binding (scope-addressed assembly feed). Pure
     * resolution — no staging, no window side effects.
     * @param id - session id.
     * @returns binding, or undefined for a session neither listed nor already scoped.
     */
    SessionRuntime.prototype.binding = function (id) {
        var _a;
        return (_a = this.resolve(id)) === null || _a === void 0 ? void 0 : _a.binding;
    };
    /**
     * Resolve one session's render-layer standard-props bundle (ctx never
     * enters the render layer; the renderer subscribes to
     * {@link SessionRuntime.currentProvideInfo}). Pure resolution — render-safe:
     * no staging, no window side effects (StrictMode double-invokes and
     * concurrent discarded passes must stay free).
     */
    SessionRuntime.prototype.provideInfo = function (id) {
        var _a;
        return (_a = this.resolve(id)) === null || _a === void 0 ? void 0 : _a.provideInfo;
    };
    /**
     * Resolve the current-session-optional standard kit. Unknown or absent ids
     * return the static no-session projection rather than removing hook props.
     */
    SessionRuntime.prototype.maybeProvideInfo = function (id) {
        var _a;
        return (_a = (id === undefined ? undefined : this.provideInfo(id))) !== null && _a !== void 0 ? _a : this.provideChannel.maybeInfo;
    };
    /**
     * Move the stage to the list's current session: sweep teardowns deferred
     * behind the previous occupant and pull the new occupant's history window.
     * Staging IS the open signal — the window opens ⟺ the session is on stage
     * — and open() is idempotent (an in-flight or completed open no-ops; a
     * failed one retries the next time current is touched).
     */
    SessionRuntime.prototype.followCurrent = function () {
        var snapshot = this.list.getSnapshot();
        var current = snapshot.current;
        // A masked gap (current blanked while the selection's session is
        // transiently absent) holds the stage: tearing down on the gap would
        // destroy exactly the frozen scope the mask exists to preserve.
        if (current === undefined || snapshot.byId[current] === undefined || current === this.watched)
            return;
        this.watched = current;
        this.sweepDeferred();
        var record = this.resolve(current);
        /* v8 ignore next 3 -- defensive: current is always a listed id (open()
         * validates and the projection masks absent selections), so resolve
         * cannot miss; kept so a future current writer cannot crash the notify. */
        if (record !== undefined) {
            void record.session.open();
            void this.manager.refreshSubagents(current);
        }
    };
    /**
     * Lazily mint the scope + binding for an eligible session. Eligibility and
     * prune share one predicate: listed on the host or selected
     * through a retained subagent address. Breadcrumb-only ancestors remain
     * summary data and do not keep scopes alive.
     */
    SessionRuntime.prototype.resolve = function (id) {
        var existing = this.scopes.get(id);
        if (existing !== undefined)
            return existing;
        if (!this.eligible(id))
            return undefined;
        var _a = (0, scope_ts_1.createScope)(this.rootCtx, id), fiber = _a.fiber, ctx = _a.ctx;
        var session = this.manager.get(id);
        // The Session owns its scoped dispatch point (host Agent.loopCtx mirror);
        // mint and bind are one step so a live scope record implies a bound actx.
        session.bindScope(ctx);
        var binding = { sessionId: id, session: session, ctx: ctx };
        var record = {
            fiber: fiber,
            ctx: ctx,
            binding: binding,
            session: session,
            // Sources are bare observables; React binds selector hooks at its own boundary.
            provideInfo: this.provideChannel.materializeInfo(binding),
        };
        this.scopes.set(id, record);
        return record;
    };
    /** The one aliveness predicate shared by scope mint and prune: host-listed or currently addressed. */
    SessionRuntime.prototype.eligible = function (id) {
        var _a = this.list.getSnapshot(), ids = _a.ids, current = _a.current;
        return current === id || ids.includes(id);
    };
    /** Project the manager's list snapshot into the store (title derivation is display-only). */
    SessionRuntime.prototype.projectList = function () {
        var _a, _b, _c, _d, _e;
        var _f = this.manager.getListSnapshot(), items = _f.items, current = _f.current, phase = _f.phase, subagentsByParent = _f.subagentsByParent, jobsBySession = _f.jobsBySession, currentAddress = _f.currentAddress;
        var ids = [];
        var byId = {};
        for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
            var entry = items_1[_i];
            ids.push(entry.sessionId);
            byId[entry.sessionId] = __assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign({ id: entry.sessionId, displayTitle: displayTitleOf(entry.title, entry.cwd, entry.sessionId), running: entry.running }, (entry.completed ? { completed: true } : {})), { blank: entry.blank, updatedAt: entry.updatedAt }), (entry.pendingInteraction === undefined
                ? {}
                : { pendingInteraction: entry.pendingInteraction })), (entry.projectionValues === undefined
                ? {}
                : { projectionValues: entry.projectionValues })), (entry.title !== undefined ? { title: entry.title } : {})), (entry.cwd !== undefined ? { cwd: entry.cwd } : {})), (entry.parentSessionId !== undefined ? { parentId: entry.parentSessionId } : {})), (entry.origin !== undefined ? { origin: entry.origin } : {})), (entry.agentPreset !== undefined ? { agentPreset: entry.agentPreset } : {}));
        }
        if (current !== undefined && currentAddress !== undefined) {
            var seen = new Set();
            var address = currentAddress;
            var _loop_1 = function () {
                var childId = address.childSessionId;
                seen.add(childId);
                var child = (_a = subagentsByParent[address.parentSessionId]) === null || _a === void 0 ? void 0 : _a.entries.find(function (entry) { return entry.kind === 'child' && entry.id === childId; });
                if ((child === null || child === void 0 ? void 0 : child.kind) !== 'child')
                    return "break";
                var displayTitle = (_b = child.label) !== null && _b !== void 0 ? _b : childId;
                var summary = byId[childId];
                if (summary === undefined) {
                    byId[childId] = {
                        id: childId,
                        displayTitle: displayTitle,
                        parentId: address.parentSessionId,
                        origin: 'subagent',
                        running: child.activity === 'running',
                        blank: false,
                        updatedAt: 0,
                    };
                }
                else if (summary.displayTitle !== displayTitle) {
                    byId[childId] = __assign(__assign({}, summary), { displayTitle: displayTitle });
                }
                var parent_1 = byId[address.parentSessionId];
                if (parent_1 !== undefined && parent_1.origin !== 'subagent')
                    return "break";
                address = this_1.manager.navigationAddress(address.parentSessionId);
            };
            var this_1 = this;
            while (address !== undefined && !seen.has(address.childSessionId)) {
                var state_1 = _loop_1();
                if (state_1 === "break")
                    break;
            }
        }
        var persisted = this.selection.getSnapshot().sessionId;
        // No current (cleared, or masked gap) wipes the persisted cell — a reload
        // stays on empty; the in-memory selection still resurfaces a masked id.
        if (current === undefined) {
            if (persisted !== undefined)
                this.selection.set({});
        }
        else if (byId[current] !== undefined
            && (persisted !== current
                || ((_c = this.selection.getSnapshot().subagentAddress) === null || _c === void 0 ? void 0 : _c.childSessionId) !== (currentAddress === null || currentAddress === void 0 ? void 0 : currentAddress.childSessionId)
                || ((_d = this.selection.getSnapshot().subagentAddress) === null || _d === void 0 ? void 0 : _d.parentSessionId) !== (currentAddress === null || currentAddress === void 0 ? void 0 : currentAddress.parentSessionId)
                || ((_e = this.selection.getSnapshot().subagentAddress) === null || _e === void 0 ? void 0 : _e.mode) !== (currentAddress === null || currentAddress === void 0 ? void 0 : currentAddress.mode))) {
            this.selection.set(__assign({ sessionId: current }, (currentAddress === undefined ? {} : { subagentAddress: currentAddress })));
        }
        this.list.set({ ids: ids, byId: byId, current: current, phase: phase, subagentsByParent: subagentsByParent, jobsBySession: jobsBySession, currentAddress: currentAddress });
        this.pruneScopes();
    };
    /** Tear down scope + instance for no-longer-eligible sessions off stage; the staged one defers until the stage moves. */
    SessionRuntime.prototype.pruneScopes = function () {
        for (var _i = 0, _a = this.scopes; _i < _a.length; _i++) {
            var _b = _a[_i], id = _b[0], record = _b[1];
            if (this.eligible(id))
                continue;
            if (id === this.watched) {
                this.deferredRemovals.add(id);
                continue;
            }
            this.scopes.delete(id);
            this.deferredRemovals.delete(id);
            this.dropScope(id, record);
        }
    };
    /**
     * One teardown for the whole per-session axis: the scope
     * fiber (cascading every actx-registered effect: input shell, slash
     * controller, popup, plugin stores, listeners), and the Session instance.
     * The host session log is durable truth; reopening lazily rebuilds and
     * backfills via open().
     */
    SessionRuntime.prototype.dropScope = function (id, record) {
        void record.fiber.dispose();
        // Release the Session's dispatch point with the scope it belongs to (a
        // surviving instance — the live Intent — rebinds when resolve re-mints).
        record.session.unbindScope();
        this.manager.drop(id);
    };
    /** Run deferred teardowns whose session is no longer staged (called when the stage moves). */
    SessionRuntime.prototype.sweepDeferred = function () {
        for (var _i = 0, _a = __spreadArray([], this.deferredRemovals, true); _i < _a.length; _i++) {
            var id = _a[_i];
            /* v8 ignore next -- defensive: only the staged id ever defers, and every
             * stage move sweeps first, so the set cannot contain the id the stage just
             * moved to; kept as a guard against future extra sweep call sites. */
            if (id === this.watched)
                continue;
            // Eligible again? (A re-added id cancels the deferred teardown.)
            if (this.eligible(id)) {
                this.deferredRemovals.delete(id);
                continue;
            }
            var record = this.scopes.get(id);
            this.deferredRemovals.delete(id);
            /* v8 ignore next -- defensive: prune deletes a scope and its deferral
             * together, so a deferred id always still owns its record; kept so a
             * future teardown path cannot double-dispose. */
            if (record !== undefined) {
                this.scopes.delete(id);
                this.dropScope(id, record);
            }
        }
    };
    return SessionRuntime;
}());
exports.SessionRuntime = SessionRuntime;
