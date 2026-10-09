"use strict";
// Sessions remain resident after creation so they continue consuming mux frames off-screen.
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
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
exports.Session = exports.PAGE_MESSAGES = void 0;
// Value import from the inline-safe wire layer (not the connection plugin):
// plugin-to-plugin value imports are a bundle purity error.
var api_1 = require("@z/dsh-host-apiproxy/api");
var conversation_assembler_ts_1 = require("./conversation-assembler.ts");
var conversation_ts_1 = require("./conversation.ts");
var pending_ts_1 = require("./pending.ts");
var notifier_ts_1 = require("./notifier.ts");
var projection_store_ts_1 = require("./projection-store.ts");
var time_zone_ts_1 = require("../time-zone.ts");
var queue_mirror_ts_1 = require("./queue-mirror.ts");
/** Messages requested per history page. */
exports.PAGE_MESSAGES = 50;
/**
 * Owns a session's event window, derived conversation state, and observable
 * snapshot. React bindings remain outside this data layer. Features see only
 * the {@link SessionFace} slice (ISession verbs + the snapshot source); the
 * remaining public members are manager/runtime entry points.
 */
var Session = /** @class */ (function () {
    /**
     * @param sessionId - Host session identity (client sessions are always Host-born).
     * @param api - shared wire client.
     * @param remote - generated Remote namespaces this session calls.
     * @param options - optional manager-owned state observers.
     */
    function Session(sessionId, api, remote, options) {
        if (options === void 0) { options = {}; }
        var _this = this;
        var _a, _b;
        this.sessionId = sessionId;
        this.api = api;
        this.remote = remote;
        this.options = options;
        // ---- Window and derived state (all private; the snapshot is the only read API) ----
        this.events = [];
        /** Wire views aligned with `events` by index (envelope-level annotations; undefined = no view).
         *  Kept parallel rather than merged so `events` stays the raw log slice (model-visible ⟺ logged). */
        this.views = [];
        this.baseSeq = 0;
        this.hasMore = false;
        this.openState = 'cold';
        this.openError = null;
        this.openPromise = null;
        /** Bumped by resync to invalidate an in-flight doOpen: a reconnect must rebuild, never adopt
         *  a pre-disconnect open whose history request is already doomed. Stale doOpen
         *  passes drop all writes once the generation moves on. */
        this.openGeneration = 0;
        this.loadingOlder = false;
        this.pending = new Map();
        this.pendingRev = 0;
        this.pendingCache = null;
        /** Authoritative stream-only inbox snapshot; pending work never hits history. */
        this.queueMirror = new queue_mirror_ts_1.SessionQueueMirror();
        this.running = false;
        this.parentAvailable = false;
        /**
         * Sticky send marker, private input of the composerPhase derivation: set
         * synchronously before prompt()'s first await, never reset — the blank →
         * engaging edge of the phase machine (see ComposerPhase).
         */
        this.promptAttempted = false;
        /** A first accepted prompt stays in the engaging phase until its turn is observable. */
        this.firstPromptPendingTurn = false;
        /** Empty-log mirror (see ConversationSnapshot.blank); unknown bare sessions begin conservatively blank. */
        this.blankBit = true;
        this.removed = false;
        this.promptError = null;
        this.lastAgentError = null;
        /** Live events buffered during open/resync and stitched by sequence once history lands. */
        this.liveBuffer = [];
        /** Gap repair in flight; live events detour to the buffer until the tail page lands. */
        this.stitching = false;
        /** subscribed.lastSeq baseline (gap detection; null when no subscribed frame arrived — degrade to the liveBuffer dedup path). */
        this.subscribedLastSeq = null;
        this.projections = (_a = options.projections) !== null && _a !== void 0 ? _a : new projection_store_ts_1.ProjectionValueStore();
        this.address = options.address;
        this.parentAvailable = (_b = options.parentAvailable) !== null && _b !== void 0 ? _b : false;
        this.conversation = options.conversation === undefined
            ? new conversation_assembler_ts_1.ConversationNodeAssembler({ entries: function () { return []; }, fallbackEntry: function () { return undefined; } }, { entries: function () { return []; } })
            : new conversation_assembler_ts_1.ConversationNodeAssembler(options.conversation.events, options.conversation.views);
        this.notifier = new notifier_ts_1.Notifier(function () {
            _this.conversation.flush();
            _this.snapshotCache = _this.buildSnapshot();
        });
        this.snapshotCache = this.buildSnapshot();
    }
    /**
     * Bind the Agent-scoped context minted by SessionRuntime (single write;
     * a second bind is a wiring error and throws). Direction stays one-way at
     * this binding boundary: consumers still reach the Session via `sessions.sessionOf`,
     * while the Session holds its own dispatch point (host Agent.loopCtx
     * mirror).
     * @param actx - the agent's scoped context.
     */
    Session.prototype.bindScope = function (actx) {
        if (this.actx !== undefined)
            throw new Error("session ".concat(this.sessionId, " already has a bound scope"));
        this.actx = actx;
    };
    /** Release the bound scope at prune time (a later rebind accompanies a freshly minted scope). */
    Session.prototype.unbindScope = function () {
        this.actx = undefined;
    };
    // ---- Operations ----
    /**
     * Send (queue/steer passed through 1:1); failures land in the snapshot's promptError.
     * @param content - text plus browser-owned temporary image uploads.
     * @param mode - queue appends after the current turn; steer interrupts it.
     * @returns the prompt result (also mirrored into promptError on failure).
     */
    Session.prototype.prompt = function (content, mode, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var result, routed, error_1;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        this.promptError = null;
                        this.lastAgentError = null;
                        // Synchronous, before the first await: the blank → engaging edge must be
                        // visible on the session area's very first frame when a caller sends
                        // ahead of navigation (first-send flow).
                        this.promptAttempted = true;
                        if (this.blankBit)
                            this.firstPromptPendingTurn = true;
                        this.notifier.markDirty();
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 8, , 9]);
                        if (!(this.address === undefined)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.api.sessions.prompt({
                                sessionId: this.sessionId,
                                mode: mode,
                                content: content,
                                clientTimeZone: (0, time_zone_ts_1.resolvedClientTimeZone)(),
                            }, signal)];
                    case 2:
                        result = (_c.sent()).result;
                        return [3 /*break*/, 7];
                    case 3:
                        if (!(this.address.mode === 'one-shot')) return [3 /*break*/, 4];
                        result = {
                            ok: false,
                            error: {
                                code: 'subagent-not-resumable',
                                message: 'one-shot subagent conversations are read-only',
                                details: { childSessionId: this.address.childSessionId },
                            },
                        };
                        return [3 /*break*/, 7];
                    case 4:
                        if (!content.some(function (part) { return part.type === 'image'; })) return [3 /*break*/, 5];
                        result = {
                            ok: false,
                            error: {
                                code: 'attachment-error',
                                message: 'Image input is unavailable for subagent continuations.',
                                details: { reason: 'SUBAGENT_IMAGE_UNSUPPORTED' },
                            },
                        };
                        return [3 /*break*/, 7];
                    case 5: return [4 /*yield*/, this.api.subagents.prompt(__assign(__assign({}, this.address), { content: content.flatMap(function (part) { return part.type === 'text'
                                ? [{ type: 'text', text: part.text }]
                                : []; }), clientTimeZone: (0, time_zone_ts_1.resolvedClientTimeZone)() }), signal)];
                    case 6:
                        routed = (_c.sent()).result;
                        result = routed.ok ? { ok: true, value: { accepted: true } } : routed;
                        _c.label = 7;
                    case 7: return [3 /*break*/, 9];
                    case 8:
                        error_1 = _c.sent();
                        result = (0, api_1.transportError)(error_1);
                        return [3 /*break*/, 9];
                    case 9:
                        if (!result.ok) {
                            this.promptError = { op: 'send', error: result.error };
                            this.notifier.markDirty();
                            return [2 /*return*/, result];
                        }
                        // Blank flips on ACCEPTANCE, not attempt: an accepted prompt starts the
                        // conversation's first turn on the host (the host criterion — a logged
                        // turn/start — is fact, not optimism; standalone command and projection
                        // events never flip it), while a rejected first prompt must keep the
                        // session blank — the client-side blank mirror only ever lowers, so
                        // flipping early on a failure would surface the session forever and
                        // strip its connectWorkspace reuse eligibility against the host's
                        // authority.
                        if (this.blankBit) {
                            this.blankBit = false;
                            (_b = (_a = this.options).onEngaged) === null || _b === void 0 ? void 0 : _b.call(_a, this);
                            this.notifier.markDirty();
                        }
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Resolve one image referenced by this session into browser-consumable bytes.
     * @param attachmentId - opaque id found in the folded session log.
     * @returns the authenticated reference and decoded bytes.
     */
    Session.prototype.readAttachment = function (attachmentId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, binary, data, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.api.sessions.attachment({
                                sessionId: this.sessionId,
                                attachmentId: attachmentId,
                            })];
                    case 1:
                        result = (_a.sent()).result;
                        if (!result.ok)
                            return [2 /*return*/, result];
                        binary = atob(result.value.data);
                        data = Uint8Array.from(binary, function (char) { return char.charCodeAt(0); });
                        return [2 /*return*/, { ok: true, value: { attachment: result.value.attachment, data: data } }];
                    case 2:
                        error_2 = _a.sent();
                        return [2 /*return*/, (0, api_1.transportError)(error_2)];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /** Apply one operation to a still-pending queue occurrence. */
    Session.prototype.updateQueue = function (itemId, action) {
        return __awaiter(this, void 0, void 0, function () {
            var error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.api.sessions.updateQueue({ sessionId: this.sessionId, itemId: itemId, action: action })];
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
     * Stop the active turn while the Host preserves pending inbox work; failures
     * land in promptError (same error-strip display slot). A continuable
     * subagent address routes through `subagent.interrupt`, whose durable
     * parent-address authority works without a live parent Agent; a one-shot
     * address stays uncancellable (the UI offers no stop action, so this arm is
     * defensive).
     * @returns the cancel result.
     */
    Session.prototype.cancel = function () {
        return __awaiter(this, void 0, void 0, function () {
            var address, result_1, result, _a, error_4;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        address = this.address;
                        if (address !== undefined && address.mode === 'one-shot') {
                            result_1 = {
                                ok: false,
                                error: {
                                    code: 'subagent-delivery-unavailable',
                                    message: 'subagent activation cancellation is unavailable',
                                    details: { childSessionId: address.childSessionId },
                                },
                            };
                            this.promptError = { op: 'stop', error: result_1.error };
                            this.notifier.markDirty();
                            return [2 /*return*/, result_1];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 6, , 7]);
                        if (!(address !== undefined)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.api.subagents.interrupt(address)];
                    case 2:
                        _a = (_b.sent()).result;
                        return [3 /*break*/, 5];
                    case 3: return [4 /*yield*/, this.api.sessions.cancel({ sessionId: this.sessionId })];
                    case 4:
                        _a = (_b.sent()).result;
                        _b.label = 5;
                    case 5:
                        result = _a;
                        return [3 /*break*/, 7];
                    case 6:
                        error_4 = _b.sent();
                        result = (0, api_1.transportError)(error_4);
                        return [3 /*break*/, 7];
                    case 7:
                        if (!result.ok) {
                            this.promptError = { op: 'stop', error: result.error };
                            this.notifier.markDirty();
                        }
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Rename: contract session.rename 1:1. On success settle the 'title'
     * projection cell from the response's `{title, seq}` under the store's
     * higher-seq-wins rule (the push frame arriving later is a no-op replay),
     * so the list row and any useProjection('title') reader update without
     * waiting for the mux frame.
     * @param title - raw title text (the host normalizes acceptance).
     * @returns the rename result (normalized accepted title + title event seq).
     */
    Session.prototype.rename = function (title) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.api.sessions.rename({ sessionId: this.sessionId, title: title })];
                    case 1:
                        result = (_a.sent()).result;
                        if (result.ok)
                            this.projections.apply('title', result.value.title, result.value.seq);
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
     * Execute one slash-command line against this session's agent — pure
     * admission semantics (the host executor durably logs the lifecycle;
     * outcomes render as flow nodes, never as a response echo).
     * @param line - the full command line, leading slash included.
     * @returns the admission result, or the error branch on transport failure.
     */
    Session.prototype.command = function (line) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.remote.commands.execute(this.sessionId, line, [])];
                    case 1:
                        result = _a.sent();
                        if (!result.ok)
                            return [2 /*return*/, result];
                        return [2 /*return*/, { ok: true, value: { matched: result.value !== undefined } }];
                }
            });
        });
    };
    /** First open: pull the tail page (idempotent — in-flight/already-open returns the existing promise). */
    Session.prototype.open = function () {
        var _this = this;
        if (this.openState === 'open')
            return Promise.resolve();
        if (this.openPromise !== null)
            return this.openPromise;
        var promise = this.doOpen(this.openGeneration).finally(function () {
            // Identity-guarded: a superseded open must not null out the promise resync just started.
            if (_this.openPromise === promise)
                _this.openPromise = null;
        });
        this.openPromise = promise;
        return promise;
    };
    /** Page up: pull one earlier page with the window's first seq as beforeSeq and prepend. */
    Session.prototype.loadOlder = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result, older, tail, error_6;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (this.openState !== 'open' || !this.hasMore || this.loadingOlder)
                            return [2 /*return*/];
                        this.loadingOlder = true;
                        this.notifier.markDirty();
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, 4, 5]);
                        return [4 /*yield*/, this.history({ beforeSeq: this.baseSeq, maxMessages: exports.PAGE_MESSAGES })];
                    case 2:
                        result = (_c.sent()).result;
                        if (!result.ok)
                            return [2 /*return*/]; // keep the window as-is; do not overwrite openError (open already succeeded)
                        older = result.value.events;
                        if (older.length === 0) {
                            this.hasMore = result.value.hasMore;
                            this.conversation.prepend([], this.hasMore);
                            return [2 /*return*/];
                        }
                        tail = older[older.length - 1];
                        if (tail === undefined || tail.event.seq + 1 !== this.baseSeq) {
                            // Continuity assertion: on violation drop the page fail-soft rather than render an out-of-order stream.
                            console.error("[web-runtime] history page discontinuous: tail seq ".concat(tail === null || tail === void 0 ? void 0 : tail.event.seq, " vs baseSeq ").concat(this.baseSeq));
                            this.hasMore = false;
                            this.conversation.prepend([], false);
                            return [2 /*return*/];
                        }
                        this.events = __spreadArray(__spreadArray([], older.map(function (e) { return e.event; }), true), this.events, true);
                        this.views = __spreadArray(__spreadArray([], older.map(function (e) { return e.view; }), true), this.views, true);
                        /* v8 ignore next -- the ?? arm needs older[0] undefined, but the empty-page branch above already returned. */
                        this.baseSeq = (_b = (_a = older[0]) === null || _a === void 0 ? void 0 : _a.event.seq) !== null && _b !== void 0 ? _b : this.baseSeq;
                        this.hasMore = result.value.hasMore;
                        this.conversation.prepend(older.map(conversationInput), this.hasMore);
                        return [3 /*break*/, 5];
                    case 3:
                        error_6 = _c.sent();
                        console.error('[web-runtime] loadOlder failed:', error_6);
                        return [3 /*break*/, 5];
                    case 4:
                        this.loadingOlder = false;
                        this.notifier.markDirty();
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /** Reconnect rebuild (manager calls this on onConnected for instances that were opened):
     *  reset the window and rerun open; pending waits for the baseline replay. Invalidates any
     *  in-flight open first — its history request rode the dead connection and must not settle
     *  the fresh generation into 'error'. */
    Session.prototype.resync = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // The queue mirror is NOT cleared here: onConnected (which drives resync)
                        // races the mux frames — the fresh generation's baseline may have landed
                        // already, and the host never resends it. The mirror re-baselines on the
                        // session/subscribed frame instead (same stream as the queue snapshot
                        // that follows it, so ordering is guaranteed).
                        if (this.openState === 'cold')
                            return [2 /*return*/]; // never opened: no window to rebuild (doOpen flips to 'loading' synchronously, so cold implies no in-flight open)
                        this.openGeneration++;
                        this.openPromise = null;
                        this.openState = 'cold';
                        this.openError = null;
                        this.events = [];
                        this.views = [];
                        this.baseSeq = 0;
                        // Superseded, not settled: the baseline replay re-sends still-pending requested frames verbatim
                        // (same rpcId), re-minting fresh waits; a stale reference's respond() still reaches the host.
                        this.pending.clear();
                        this.pendingRev++;
                        this.subscribedLastSeq = null;
                        this.liveBuffer = [];
                        this.notifier.markDirty();
                        return [4 /*yield*/, this.open()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    // ---- Subscription API (useSyncExternalStore direct wiring) ----
    /**
     * uSES subscription entry.
     * @param listener - change callback.
     * @returns the unsubscribe function.
     */
    Session.prototype.subscribe = function (listener) {
        return this.notifier.subscribe(listener);
    };
    /**
     * Cached conversation snapshot (rebuilt lazily when dirty with no listeners).
     * @returns the cached reference (stable until the next flush).
     */
    Session.prototype.getSnapshot = function () {
        this.notifier.ensureFresh();
        return this.snapshotCache;
    };
    // ---- Manager-only entry points (@internal; never called by the UI) ----
    /**
     * Mux frame arrival (the dispatch switch).
     * @param rpcId - the frame envelope id (the respond backfill key for requested frames).
     * @param frame - the routed frame.
     */
    Session.prototype.handleMuxEnvelope = function (rpcId, frame) {
        var _this = this;
        switch (frame.type) {
            case 'session/event': {
                this.acceptLiveEvent(frame.event, frame.view);
                return;
            }
            case 'session/queue': {
                this.queueMirror.replace(frame.items);
                this.notifier.markDirty();
                return;
            }
            case 'session/subscribed': {
                this.subscribedLastSeq = frame.lastSeq;
                // New mux-generation baseline: the host pushes this session's queue
                // snapshot AFTER the subscribed frame on the same stream, so the
                // stale mirror clears here — race-free against onConnected/resync
                // timing (clearing there could wipe a baseline that already landed).
                if (this.queueMirror.reset())
                    this.notifier.markDirty();
                return;
            }
            case 'approval/requested': {
                var _type = frame.type, _sid = frame.sessionId, payload = __rest(frame, ["type", "sessionId"]);
                this.mint(new pending_ts_1.PendingWait('approval', rpcId, this.sessionId, payload, function (m) { return _this.api.respond(m); }));
                this.notifier.markDirty();
                return;
            }
            case 'approval/resolved': {
                for (var _i = 0, _a = this.pending.values(); _i < _a.length; _i++) {
                    var item = _a[_i];
                    if (item.kind === 'approval' && item.payload.approvalId === frame.approvalId)
                        this.settle(item);
                }
                this.notifier.markDirty();
                return;
            }
            case 'question/requested': {
                var _type = frame.type, _sid = frame.sessionId, payload = __rest(frame, ["type", "sessionId"]);
                this.mint(new pending_ts_1.PendingWait('question', rpcId, this.sessionId, payload, function (m) { return _this.api.respond(m); }));
                this.notifier.markDirty();
                return;
            }
            case 'question/resolved': {
                var item = this.pending.get("q:".concat(frame.questionRpcId));
                if (item !== undefined)
                    this.settle(item);
                this.notifier.markDirty();
                return;
            }
            default:
                return; // stream/error never reaches Session (Controller converges it); unknown frames ignored (documented default)
        }
    };
    /**
     * Running-bit relay from the host stream (list entry and snapshot stay consistent).
     * @param running - the new running state.
     */
    Session.prototype.handleRunning = function (running) {
        // Turn-start conversion: a blank session never runs, so the first
        // running:true proves another side's first message landed.
        if (running && this.blankBit) {
            this.blankBit = false;
            this.notifier.markDirty();
        }
        if (running)
            this.firstPromptPendingTurn = false;
        if (this.running === running)
            return;
        this.running = running;
        this.notifier.markDirty();
    };
    /**
     * Install or clear the catalog-discovered transport address. A changed
     * address rebuilds an already-open window through its new history route.
     * @param address - direct parent/child address, or undefined for ordinary transport.
     * @param parentAvailable - latest exact-parent availability hint.
     */
    Session.prototype.configureSubagent = function (address, parentAvailable) {
        var _a, _b, _c;
        if (parentAvailable === void 0) { parentAvailable = false; }
        var same = ((_a = this.address) === null || _a === void 0 ? void 0 : _a.parentSessionId) === (address === null || address === void 0 ? void 0 : address.parentSessionId)
            && ((_b = this.address) === null || _b === void 0 ? void 0 : _b.childSessionId) === (address === null || address === void 0 ? void 0 : address.childSessionId)
            && ((_c = this.address) === null || _c === void 0 ? void 0 : _c.mode) === (address === null || address === void 0 ? void 0 : address.mode);
        this.address = address;
        this.parentAvailable = parentAvailable;
        if (!same && this.openState !== 'cold')
            void this.resync();
        else
            this.notifier.markDirty();
    };
    /**
     * Update only the parent availability hint from a catalog refresh.
     * @param available - whether the exact direct parent is live.
     */
    Session.prototype.handleSubagentParentAvailable = function (available) {
        if (this.parentAvailable === available)
            return;
        this.parentAvailable = available;
        this.notifier.markDirty();
    };
    /**
     * Blank-bit relay from the authoritative summary source (list baseline and
     * the session-added frame). Monotone: once any signal (local first send,
     * running flip, an earlier summary) cleared it, a stale true never
     * re-blanks.
     * @param blank - the summary's derived empty-log bit.
     */
    Session.prototype.handleBlank = function (blank) {
        if (blank === this.blankBit)
            return;
        if (blank && (this.promptAttempted || this.running))
            return;
        this.blankBit = blank;
        this.notifier.markDirty();
    };
    /** host/session-removed relay: flag the snapshot (instance survives — resident-instance rule). */
    Session.prototype.handleRemoved = function () {
        this.removed = true;
        this.notifier.markDirty();
    };
    /**
     * host/agent-error relay: the only outlet for live failures with no turn position.
     * @param message - the stringified error.
     */
    Session.prototype.handleAgentError = function (message) {
        this.lastAgentError = message;
        this.notifier.markDirty();
    };
    /** No-op because session instances remain resident. */
    Session.prototype.dispose = function () { };
    /** Rebuild the current window after a low-frequency Definition or view registration change. */
    Session.prototype.rebuildConversationRegistry = function () {
        this.scheduleConversation(this.conversation.rebuildRegistry());
    };
    // ---- Private ----
    /** Requested-frame arrival: the wait enters the pending map under its own key. */
    Session.prototype.mint = function (wait) {
        this.pending.set(wait.key, wait);
        this.pendingRev++;
    };
    /** Authoritative resolved-frame settlement: mark, then drop from the pending map. */
    Session.prototype.settle = function (wait) {
        wait.markSettled();
        this.pending.delete(wait.key);
        this.pendingRev++;
    };
    /** @param generation - openGeneration at launch; every await re-checks it and a stale pass
     *  drops all writes (resync superseded this open — its outcome belongs to a dead connection). */
    Session.prototype.doOpen = function (generation) {
        return __awaiter(this, void 0, void 0, function () {
            var result, tailSeq, error_7, folded;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.openState = 'loading';
                        this.openError = null;
                        this.notifier.markDirty();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, 6, 7]);
                        return [4 /*yield*/, this.history({ maxMessages: exports.PAGE_MESSAGES })];
                    case 2:
                        result = (_a.sent()).result;
                        if (generation !== this.openGeneration)
                            return [2 /*return*/];
                        if (!result.ok) {
                            this.openState = 'error';
                            this.openError = result.error;
                            return [2 /*return*/];
                        }
                        this.installWindow(result.value.events, result.value.hasMore, result.value.projections);
                        tailSeq = this.windowTailSeq();
                        if (!(this.subscribedLastSeq !== null && tailSeq !== null && this.subscribedLastSeq > tailSeq)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.history({ maxMessages: exports.PAGE_MESSAGES })];
                    case 3:
                        result = (_a.sent()).result;
                        if (generation !== this.openGeneration)
                            return [2 /*return*/];
                        if (result.ok)
                            this.installWindow(result.value.events, result.value.hasMore, result.value.projections);
                        _a.label = 4;
                    case 4:
                        this.openState = 'open';
                        return [3 /*break*/, 7];
                    case 5:
                        error_7 = _a.sent();
                        if (generation !== this.openGeneration)
                            return [2 /*return*/];
                        this.openState = 'error';
                        folded = (0, api_1.transportError)(error_7);
                        /* v8 ignore next -- the `? null` arm is unreachable: transportError always returns ok:false. */
                        this.openError = folded.ok ? null : folded.error;
                        return [3 /*break*/, 7];
                    case 6:
                        if (generation === this.openGeneration)
                            this.notifier.markDirty();
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /** Install the history window + stitch the liveBuffer (seq is the sole dedup key).
     *  Stitching MUST NOT route through acceptLiveEvent: openState is still 'loading' here
     *  (doOpen flips it after install), so recursing would push every buffered event straight
     *  back into liveBuffer where nothing ever drains it — a silent drop loop.
     *  A carried projections block seeds the value store (higher seq wins, so a stale
     *  baseline cannot overwrite a newer push frame); the window events themselves are
     *  never folded — the host is the only computation site. */
    Session.prototype.installWindow = function (entries, hasMore, projections) {
        var _a, _b;
        this.events = entries.map(function (e) { return e.event; });
        this.views = entries.map(function (e) { return e.view; });
        this.baseSeq = (_b = (_a = this.events[0]) === null || _a === void 0 ? void 0 : _a.seq) !== null && _b !== void 0 ? _b : 0;
        this.hasMore = hasMore;
        if (this.events.some(function (event) { return event.type === 'turn/start'; }))
            this.firstPromptPendingTurn = false;
        this.conversation.replaceWindow(entries.map(conversationInput), hasMore);
        if (projections !== undefined)
            this.projections.seed(projections);
        var buffered = this.liveBuffer;
        this.liveBuffer = [];
        for (var _i = 0, buffered_1 = buffered; _i < buffered_1.length; _i++) {
            var item = buffered_1[_i];
            this.appendLive(item.event, item.view);
        }
        this.notifier.markDirty();
    };
    /** Seq-guarded append shared by stitching and the open-state live path. */
    Session.prototype.appendLive = function (event, view) {
        var tailSeq = this.windowTailSeq();
        if (tailSeq !== null && event.seq <= tailSeq)
            return 'none'; // replay overlap, drop
        this.events.push(event);
        this.views.push(view);
        if (event.type === 'turn/start')
            this.firstPromptPendingTurn = false;
        var queueChanged = this.queueMirror.acceptDurable(event);
        var publication = this.conversation.append({ event: event, view: view });
        return queueChanged ? 'immediate' : publication;
    };
    /** Land a live session/event (open/repair in flight -> buffer; overlapping seq -> drop;
     *  a seq gap -> buffer + tail-page repull instead of appending a hole (a gap is an
     *  expected reconnect-window artifact, repaired by refetch). The window stays one contiguous
     *  raw range, which lets Conversation Definitions correlate every recorded event between its
     *  ends and lets a compaction checkpoint resolve its cited summary event. */
    Session.prototype.acceptLiveEvent = function (event, view) {
        if (this.openState === 'loading' || this.stitching) {
            this.liveBuffer.push({ event: event, view: view });
            return;
        }
        if (this.openState !== 'open')
            return; // cold/error: no window upkeep (history fully backfills on open)
        var tailSeq = this.windowTailSeq();
        if (tailSeq !== null && event.seq > tailSeq + 1) {
            this.liveBuffer.push({ event: event, view: view });
            void this.repairGap();
            return;
        }
        this.scheduleConversation(this.appendLive(event, view));
    };
    /** Route assembler cadence into the Session's existing microtask/RAF notifier. */
    Session.prototype.scheduleConversation = function (publication) {
        if (publication === 'immediate')
            this.notifier.markDirty();
        else if (publication === 'animation-frame')
            this.notifier.markFrameDirty();
    };
    /** Resync-lite: repull the tail page and stitch the liveBuffer through the shared
     *  installWindow path. No openState transition — the UI keeps the current window (no loading
     *  flash); events arriving meanwhile detour to liveBuffer via the stitching flag. */
    Session.prototype.repairGap = function () {
        return __awaiter(this, void 0, void 0, function () {
            var generation, result, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        /* v8 ignore next -- re-entry guard: acceptLiveEvent already detours to liveBuffer while stitching, so no second call reaches here. */
                        if (this.stitching)
                            return [2 /*return*/];
                        this.stitching = true;
                        generation = this.openGeneration;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, 4, 5]);
                        return [4 /*yield*/, this.history({ maxMessages: exports.PAGE_MESSAGES })
                            // Failure or superseded by a full resync: drop — the resync path rebuilds and clears the buffer itself.
                        ];
                    case 2:
                        result = (_a.sent()).result;
                        // Failure or superseded by a full resync: drop — the resync path rebuilds and clears the buffer itself.
                        if (result.ok && generation === this.openGeneration && this.openState === 'open') {
                            this.installWindow(result.value.events, result.value.hasMore, result.value.projections);
                        }
                        return [3 /*break*/, 5];
                    case 3:
                        error_8 = _a.sent();
                        console.error('[web-runtime] gap repair failed:', error_8);
                        return [3 /*break*/, 5];
                    case 4:
                        this.stitching = false;
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    Session.prototype.windowTailSeq = function () {
        var tail = this.events[this.events.length - 1];
        return tail === undefined ? null : tail.seq;
    };
    Session.prototype.buildSnapshot = function () {
        var _a;
        if (this.pendingCache === null || this.pendingCache.rev !== this.pendingRev) {
            this.pendingCache = { rev: this.pendingRev, value: __spreadArray([], this.pending.values(), true) };
        }
        var chat = (_a = this.conversation.snapshot('chat')) !== null && _a !== void 0 ? _a : conversation_ts_1.EMPTY_CHAT_SNAPSHOT;
        var legacy = chat.legacy;
        return {
            sessionId: this.sessionId,
            views: this.conversation,
            chat: chat,
            nodes: legacy.nodes,
            turnTimings: legacy.turnTimings,
            turnEnds: legacy.turnEnds,
            partial: legacy.partial,
            runningCalls: legacy.runningCalls,
            pending: this.pendingCache.value,
            queue: this.queueMirror.snapshot(),
            running: this.running,
            subagent: this.address === undefined
                ? null
                : { address: this.address, parentAvailable: this.parentAvailable },
            composerPhase: derivePhase(hasVisibleConversationContent(chat)
                || (!this.blankBit && !this.firstPromptPendingTurn)
                || this.running
                || this.pendingCache.value.length > 0, this.promptAttempted),
            removed: this.removed,
            openState: this.openState,
            openError: this.openError,
            hasMore: this.hasMore,
            loadingOlder: this.loadingOlder,
            promptError: this.promptError,
            blank: this.blankBit,
            lastAgentError: this.lastAgentError,
        };
    };
    /** Select ordinary or addressed history transport from the stored browser fact. */
    Session.prototype.history = function (payload) {
        return this.address === undefined
            ? this.api.sessions.history(__assign({ sessionId: this.sessionId }, payload))
            : this.api.subagents.history(__assign(__assign({}, this.address), payload));
    };
    return Session;
}());
exports.Session = Session;
/** Convert one wire history row into the assembler's transport-neutral input. */
function conversationInput(entry) {
    return { event: entry.event, view: entry.view };
}
/** A generic command row alone remains control-plane content; every other visible Chat Node activates the conversation. */
function hasVisibleConversationContent(chat) {
    return chat.order.some(function (key) { var _a; return ((_a = chat.nodes.get(key)) === null || _a === void 0 ? void 0 : _a.kind) !== 'command'; });
}
/**
 * The composerPhase judgment — the single site that knows the predicate
 * (consumers switch on the result, never re-derive). A failed first prompt
 * stays engaging until an authoritative accepted-turn, running, or pending
 * signal arrives (retry semantics — see ComposerPhase).
 * @param hasContent - authoritative non-blank activity beyond a pending first
 *   prompt, visible non-command Chat content, a running turn, or a pending interaction.
 * @param promptAttempted - a prompt was initiated on this session object.
 * @returns the derived phase.
 */
function derivePhase(hasContent, promptAttempted) {
    if (hasContent)
        return 'active';
    return promptAttempted ? 'engaging' : 'blank';
}
