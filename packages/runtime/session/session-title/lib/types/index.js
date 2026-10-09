"use strict";
/**
 * Log-backed session title service, deterministic fallback, and provider contract.
 * @module @z/dsh-session-title
 */
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
exports.SessionTitleService = exports.SessionTitleInvalidError = exports.truncateTitleUtf8 = exports.normalizeSessionTitle = exports.fallbackSessionTitle = void 0;
exports.SessionTitleProviderId = SessionTitleProviderId;
exports.collectSessionTitleMessages = collectSessionTitleMessages;
exports.foldSessionTitle = foldSessionTitle;
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var zod_1 = require("zod");
var dsh_llm_1 = require("@z/dsh-llm");
var normalize_ts_1 = require("./normalize.ts");
var normalize_ts_2 = require("./normalize.ts");
Object.defineProperty(exports, "fallbackSessionTitle", { enumerable: true, get: function () { return normalize_ts_2.fallbackSessionTitle; } });
Object.defineProperty(exports, "normalizeSessionTitle", { enumerable: true, get: function () { return normalize_ts_2.normalizeSessionTitle; } });
Object.defineProperty(exports, "truncateTitleUtf8", { enumerable: true, get: function () { return normalize_ts_2.truncateTitleUtf8; } });
/**
 * Brand a raw provider id.
 * @param id - stable non-empty provider identifier supplied by a plugin.
 * @returns the same string with the session-title provider brand.
 */
function SessionTitleProviderId(id) {
    return id;
}
/**
 * Rejection of an explicit user title whose text normalizes to empty — the
 * one {@link SessionTitleService.rename} failure that blames the input.
 * Callers translating rename failures onto a wire (`title-invalid`) narrow on
 * this class; liveness and disposal failures stay plain `Error`s.
 */
var SessionTitleInvalidError = /** @class */ (function (_super) {
    __extends(SessionTitleInvalidError, _super);
    function SessionTitleInvalidError() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.name = 'SessionTitleInvalidError';
        return _this;
    }
    return SessionTitleInvalidError;
}(Error));
exports.SessionTitleInvalidError = SessionTitleInvalidError;
/**
 * Collect human text-bearing user messages in log order.
 * @param events - session log or persisted replay.
 * @param throughSeq - optional inclusive event boundary.
 * @returns eligible messages with exact source seqs.
 */
function collectSessionTitleMessages(events, throughSeq) {
    var messages = [];
    var _loop_1 = function (event_1) {
        if (throughSeq !== undefined && event_1.seq > throughSeq)
            return "break";
        if (event_1.type !== 'user/message' || event_1.data.source.kind !== 'user')
            return "continue";
        var content = event_1.data.content;
        var text = content
            .filter(function (block) { return block.type === 'text'; })
            .map(function (block) { return block.text; })
            .join('\n');
        if ((0, normalize_ts_1.normalizeSessionTitle)(text, Number.MAX_SAFE_INTEGER).length === 0)
            return "continue";
        messages.push({ seq: event_1.seq, text: text });
    };
    for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
        var event_1 = events_1[_i];
        var state_1 = _loop_1(event_1);
        if (state_1 === "break")
            break;
    }
    return messages;
}
/**
 * Fold the latest logged title without consulting mutable metadata.
 * @param events - live or persisted session log.
 * @returns the latest immutable title snapshot, or `undefined`.
 */
function foldSessionTitle(events) {
    var event = events.findLast(function (item) { return item.type === 'session/title'; });
    if (event === undefined)
        return undefined;
    return (0, dsh_llm_1.deepFreeze)({
        title: event.data.title,
        messageSeqs: __spreadArray([], event.data.messageSeqs, true),
        source: copySessionTitleSource(event.data.source),
        eventSeq: event.seq,
        updatedAt: event.time,
    });
}
/** Defensive copy of a logged title source (the snapshot must not alias log-owned objects). */
function copySessionTitleSource(source) {
    switch (source.kind) {
        case 'fallback': return { kind: 'fallback' };
        case 'provider': return __assign({ kind: 'provider', provider: source.provider }, (source.model === undefined ? {} : { model: __assign({}, source.model) }));
        case 'user': return { kind: 'user' };
        /* v8 ignore next -- closed-union exhaustiveness guard */
        default: return (0, dsh_llm_1.assertNever)(source, 'SessionTitleSource');
    }
}
/** Validate one positive integer configuration field. */
function assertPositiveInteger(name, value) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error("session-title: ".concat(name, " must be a positive integer"));
    }
}
/** Log-backed title fold plus asynchronous fallback generation. */
var SessionTitleService = /** @class */ (function (_super) {
    __extends(SessionTitleService, _super);
    function SessionTitleService(ctx, config) {
        var _this = _super.call(this, ctx, 'sessionTitle') || this;
        _this.work = new Map();
        _this.lifetime = new AbortController();
        _this.inFlight = new Set();
        _this.ownerFiber = ctx.fiber;
        var candidate = config;
        if (candidate === null || typeof candidate !== 'object') {
            throw new Error('session-title: configuration is required');
        }
        var value = candidate;
        assertPositiveInteger('fallbackMaxWords', value.fallbackMaxWords);
        assertPositiveInteger('fallbackMaxBytes', value.fallbackMaxBytes);
        assertPositiveInteger('maxTitleBytes', value.maxTitleBytes);
        if (value.fallbackMaxBytes > value.maxTitleBytes) {
            throw new Error('session-title: fallbackMaxBytes must not exceed maxTitleBytes');
        }
        _this.config = (0, dsh_llm_1.deepFreeze)(__assign({}, value));
        ctx.effect(function () { return function () { return __awaiter(_this, void 0, void 0, function () {
            var _i, _a, state;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        this.lifetime.abort(new Error('session-title service disposed'));
                        if (this.registration !== undefined)
                            this.registration.closing = true;
                        this.registration = undefined;
                        for (_i = 0, _a = this.work.values(); _i < _a.length; _i++) {
                            state = _a[_i];
                            delete state.pending;
                            (_b = state.active) === null || _b === void 0 ? void 0 : _b.controller.abort(new Error('session-title service disposed'));
                        }
                        return [4 /*yield*/, this.drain(this.inFlight)];
                    case 1:
                        _c.sent();
                        this.work.clear();
                        return [2 /*return*/];
                }
            });
        }); }; }, 'sessionTitle lifecycle');
        // The title projection unit: pure last-wins fold of session/title events
        // (the same events foldSessionTitle consumes), serving the plain title
        // string clients list rows read. The unit child activates only when a
        // projection registry is composed (headless assemblies stay unaffected).
        ctx.inject(['sessionProjections'], function (projectionCtx) {
            var titleSchema = zod_1.z.union([zod_1.z.string().min(1), zod_1.z.null()]);
            projectionCtx.sessionProjections.register({
                key: 'title',
                stateSchema: titleSchema,
                init: function () { return null; },
                apply: function (state, event) { return (event.type === 'session/title' ? event.data.title : state); },
                wire: { viewSchema: titleSchema, view: function (state) { return state; } },
                stateVersion: 1,
            });
        });
        ctx.on('session/event', function (session, event) {
            switch (event.type) {
                case 'user/message':
                    _this.onUserMessage(session, event);
                    break;
                case 'request/header':
                    _this.onRequestHeader(session, event);
                    break;
                default:
                    break;
            }
        });
        ctx.on('llm/stream', function (options, next) {
            _this.onMainRequest(options);
            return next();
        }, { global: true, prepend: true });
        ctx.on('session/disposed', function (session) {
            var _a;
            var state = _this.work.get(session);
            if (state === undefined)
                return;
            (_a = state.active) === null || _a === void 0 ? void 0 : _a.controller.abort(new Error('session disposed during title generation'));
            _this.work.delete(session);
        });
        return _this;
    }
    /**
     * Read the latest folded title from one live or replayed session.
     * @param session - session whose log is the title source of truth.
     * @returns latest title snapshot, or `undefined` before eligible input.
     */
    SessionTitleService.prototype.get = function (session) {
        return foldSessionTitle(session.events);
    };
    /**
     * Accept an explicit user title. Appends a `session/title` event with the
     * `user` source, which pins the title: in-flight automatic generation is
     * superseded and later user messages schedule none (an explicit
     * {@link SessionTitleService.refresh} remains the deliberate unpin).
     * @param session - exact live session to rename.
     * @param title - raw user input; normalized before acceptance.
     * @returns the accepted title snapshot.
     * @throws {SessionTitleInvalidError} when the title normalizes to empty.
     * @throws {Error} when the session is not live or the service is disposed.
     */
    SessionTitleService.prototype.rename = function (session, title) {
        this.assertServiceActive();
        if (this.ctx.sessions.get(session.id) !== session) {
            throw new Error("session \"".concat(session.id, "\" is not live in this store"));
        }
        var normalized = (0, normalize_ts_1.normalizeSessionTitle)(title, this.config.maxTitleBytes);
        if (normalized.length === 0) {
            throw new SessionTitleInvalidError('session title must contain visible characters');
        }
        var state = this.stateFor(session);
        this.supersede(state, 'user rename superseded automatic title generation');
        session.append('session/title', {
            title: normalized,
            messageSeqs: [],
            source: { kind: 'user' },
        });
        var snapshot = this.get(session);
        /* v8 ignore next -- unreachable: the append above just committed a session/title event. */
        if (snapshot === undefined)
            throw new Error('renamed title failed to fold');
        return snapshot;
    };
    /**
     * Explicitly retry the registered provider, or materialize the built-in
     * fallback when no provider is registered.
     * @param session - exact live session to refresh.
     * @param signal - optional caller cancellation.
     * @returns latest accepted title, or `undefined` when no eligible text exists.
     */
    SessionTitleService.prototype.refresh = function (session, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var registration, messages, latest, current, first, fallback, state, revision, work, config, route;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        this.assertServiceActive();
                        if (this.ctx.sessions.get(session.id) !== session) {
                            throw new Error("session \"".concat(session.id, "\" is not live in this store"));
                        }
                        registration = this.registration;
                        messages = collectSessionTitleMessages(session.events);
                        latest = messages.at(-1);
                        if (!(registration === undefined || registration.closing || latest === undefined)) return [3 /*break*/, 2];
                        current = this.get(session);
                        first = messages[0];
                        if ((current === null || current === void 0 ? void 0 : current.source.kind) === 'user' && first !== undefined) {
                            this.appendFallback(session, first);
                            signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                            return [2 /*return*/, this.get(session)];
                        }
                        return [4 /*yield*/, this.ensureFallback(session)];
                    case 1:
                        fallback = _b.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [2 /*return*/, fallback];
                    case 2:
                        state = this.stateFor(session);
                        revision = this.supersede(state, 'explicit title refresh superseded older generation');
                        work = this.activate({
                            registration: registration,
                            revision: revision,
                            throughSeq: latest.seq,
                        }, state, signal);
                        config = (_a = session.requestHeader()) === null || _a === void 0 ? void 0 : _a.config;
                        route = config === undefined ? undefined : { provider: config.provider, model: config.model };
                        return [2 /*return*/, this.startProvider(session, work, route)];
                }
            });
        });
    };
    /**
     * Register the sole optional title provider. Disposal aborts its pending and
     * active work before another provider may register.
     * @param provider - provider identity, cadence, and generation function.
     * @returns exact Cordis effect disposer, which settles after active calls quiesce.
     */
    SessionTitleService.prototype.register = function (provider) {
        this.validateProvider(provider);
        if (this.registration !== undefined) {
            throw new Error("session-title provider \"".concat(this.registration.provider.id, "\" is already registered"));
        }
        var registration = {
            provider: provider,
            active: new Set(),
            closing: false,
        };
        var dispose = this.ctx.effect(function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.registration = registration;
                        return [4 /*yield*/, function () { return __awaiter(_this, void 0, void 0, function () {
                                var _i, _a, state;
                                var _b, _c;
                                return __generator(this, function (_d) {
                                    switch (_d.label) {
                                        case 0:
                                            registration.closing = true;
                                            for (_i = 0, _a = this.work.values(); _i < _a.length; _i++) {
                                                state = _a[_i];
                                                if (((_b = state.pending) === null || _b === void 0 ? void 0 : _b.registration) === registration)
                                                    delete state.pending;
                                                if (((_c = state.active) === null || _c === void 0 ? void 0 : _c.registration) === registration) {
                                                    state.active.controller.abort(new Error("session-title provider \"".concat(provider.id, "\" was disposed")));
                                                }
                                            }
                                            return [4 /*yield*/, this.drain(registration.active)];
                                        case 1:
                                            _d.sent();
                                            if (this.registration === registration)
                                                this.registration = undefined;
                                            return [2 /*return*/];
                                    }
                                });
                            }); }];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }.bind(this), 'sessionTitle.register()');
        return dispose;
    };
    /** Schedule fallback creation and any provider cadence for one eligible event. */
    SessionTitleService.prototype.onUserMessage = function (session, event) {
        var _this = this;
        var _a;
        if (!this.serviceActive())
            return;
        if (event.data.source.kind !== 'user' || collectSessionTitleMessages([event]).length === 0)
            return;
        // A user rename pins the title: no automatic revision may override it.
        if (((_a = this.get(session)) === null || _a === void 0 ? void 0 : _a.source.kind) === 'user')
            return;
        var registration = this.registration;
        if (registration !== undefined && !registration.closing) {
            var messages = collectSessionTitleMessages(session.events, event.seq);
            var shouldSchedule = registration.provider.automatic === 'all-prompts'
                || (session.header.parentSession === undefined && messages.length === 1 && this.get(session) === undefined);
            if (shouldSchedule) {
                var state = this.stateFor(session);
                var revision = this.supersede(state, 'newer user message superseded title generation');
                state.pending = { registration: registration, revision: revision, throughSeq: event.seq };
            }
        }
        this.defer(function () { return __awaiter(_this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.ensureFallback(session)];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        if (!this.serviceActive())
                            return [2 /*return*/];
                        this.ctx.logger.warn("session \"".concat(session.id, "\": fallback title update failed: ").concat(String(error_1)));
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
    };
    /** Start pending automatic work only after its exact main-request route is logged. */
    SessionTitleService.prototype.onRequestHeader = function (session, event) {
        if (!this.serviceActive())
            return;
        var state = this.work.get(session);
        var pending = state === null || state === void 0 ? void 0 : state.pending;
        if (state === undefined || pending === undefined || pending.throughSeq >= event.seq)
            return;
        var route = {
            provider: event.data.header.config.provider,
            model: event.data.header.config.model,
        };
        this.startPending(session, state, pending, route);
    };
    /** Start unchanged-route work from the marked loop request after its header fold is current. */
    SessionTitleService.prototype.onMainRequest = function (options) {
        var _a;
        if (!this.serviceActive() || options.sessionId === undefined || !(0, dsh_llm_1.isAgentLoopRequest)(options))
            return;
        var session = this.ctx.sessions.get(options.sessionId);
        var state = session === undefined ? undefined : this.work.get(session);
        var pending = state === null || state === void 0 ? void 0 : state.pending;
        if (session === undefined || state === undefined || pending === undefined)
            return;
        var boundary = session.events.findLast(function (event) { return event.type === 'step/start' || event.type === 'step/end'; });
        var route = (_a = session.requestHeader()) === null || _a === void 0 ? void 0 : _a.config;
        if ((boundary === null || boundary === void 0 ? void 0 : boundary.type) !== 'step/start'
            || boundary.seq <= pending.throughSeq
            || (route === null || route === void 0 ? void 0 : route.provider) !== options.provider
            || route.model !== options.model)
            return;
        this.startPending(session, state, pending, { provider: options.provider, model: options.model });
    };
    /** Consume one pending revision and schedule its non-blocking provider call. */
    SessionTitleService.prototype.startPending = function (session, state, pending, route) {
        var _this = this;
        delete state.pending;
        this.defer(function () { return __awaiter(_this, void 0, void 0, function () {
            var work, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.registration !== pending.registration
                            || pending.registration.closing
                            || this.work.get(session) !== state
                            || state.revision !== pending.revision)
                            return [2 /*return*/];
                        work = this.activate(pending, state);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.startProvider(session, work, route)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _a.sent();
                        if (work.signal.aborted || !this.serviceActive())
                            return [2 /*return*/];
                        this.ctx.logger.warn("session \"".concat(session.id, "\": automatic title generation failed: ").concat(String(error_2)));
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
    };
    /** Start one tracked provider call after publishing its active revision. */
    SessionTitleService.prototype.startProvider = function (session, work, route) {
        var _this = this;
        var run = Promise.resolve().then(function () { return _this.runProvider(session, work, route); });
        return this.track(run, work.registration);
    };
    /** Execute and accept one current provider revision. */
    SessionTitleService.prototype.runProvider = function (session, work, route) {
        return __awaiter(this, void 0, void 0, function () {
            var messages, result, accepted, state;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, , 3, 4]);
                        this.assertCurrent(session, work);
                        return [4 /*yield*/, this.ensureFallback(session)];
                    case 1:
                        _a.sent();
                        this.assertCurrent(session, work);
                        messages = collectSessionTitleMessages(session.events, work.throughSeq);
                        return [4 /*yield*/, work.registration.provider.generate(__assign(__assign({ session: session, messages: messages }, route === undefined ? {} : { route: route }), { signal: work.signal }))];
                    case 2:
                        result = _a.sent();
                        this.assertCurrent(session, work);
                        accepted = this.validateResult(result, messages);
                        session.append('session/title', {
                            title: accepted.title,
                            messageSeqs: __spreadArray([], accepted.messageSeqs, true),
                            source: __assign({ kind: 'provider', provider: work.registration.provider.id }, accepted.model === undefined ? {} : { model: accepted.model }),
                        });
                        return [2 /*return*/, this.get(session)];
                    case 3:
                        state = this.work.get(session);
                        if ((state === null || state === void 0 ? void 0 : state.active) === work)
                            delete state.active;
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /** Validate and normalize provider output against the supplied message snapshot. */
    SessionTitleService.prototype.validateResult = function (result, messages) {
        if (result === null || typeof result !== 'object') {
            throw new Error('session-title provider returned an invalid result');
        }
        var candidate = result;
        if (typeof candidate.title !== 'string')
            throw new Error('session-title provider title must be a string');
        var title = (0, normalize_ts_1.normalizeSessionTitle)(candidate.title, this.config.maxTitleBytes);
        if (title.length === 0)
            throw new Error('session-title provider returned an empty title');
        if (!Array.isArray(candidate.messageSeqs) || candidate.messageSeqs.length === 0) {
            throw new Error('session-title provider must identify at least one source message seq');
        }
        var messageSeqs = [];
        var order = new Map(messages.map(function (message, index) { return [message.seq, index]; }));
        var previous = -1;
        for (var _i = 0, _a = candidate.messageSeqs; _i < _a.length; _i++) {
            var seq = _a[_i];
            if (typeof seq !== 'number') {
                throw new Error('session-title provider messageSeqs must be unique, ordered seqs from the request');
            }
            var index = order.get(seq);
            if (!Number.isSafeInteger(seq) || seq < 0 || index === undefined || index <= previous) {
                throw new Error('session-title provider messageSeqs must be unique, ordered seqs from the request');
            }
            messageSeqs.push(seq);
            previous = index;
        }
        var modelCandidate = candidate.model;
        var model;
        if (modelCandidate !== undefined) {
            if (modelCandidate === null || typeof modelCandidate !== 'object') {
                throw new Error('session-title provider result model must contain non-empty provider and model strings');
            }
            var record = modelCandidate;
            if (typeof record.provider !== 'string' || record.provider.length === 0
                || typeof record.model !== 'string' || record.model.length === 0) {
                throw new Error('session-title provider result model must contain non-empty provider and model strings');
            }
            model = { provider: record.provider, model: record.model };
        }
        return __assign({ title: title, messageSeqs: messageSeqs }, (model === undefined ? {} : { model: model }));
    };
    /** Fail a completion whose provider, revision, session, or signal is stale. */
    SessionTitleService.prototype.assertCurrent = function (session, work) {
        this.assertServiceActive();
        work.signal.throwIfAborted();
        var state = this.work.get(session);
        /* v8 ignore next -- every supported supersession, provider disposal, and session disposal aborts
         * the work signal before changing this state. */
        if (this.registration !== work.registration
            || (state === null || state === void 0 ? void 0 : state.active) !== work
            || state.revision !== work.revision
            || this.ctx.sessions.get(session.id) !== session) {
            throw new Error('session title generation state changed without cancellation');
        }
    };
    /** Create and publish an active provider call from one fixed revision. */
    SessionTitleService.prototype.activate = function (pending, state, upstream) {
        var controller = new AbortController();
        var signal = upstream === undefined
            ? AbortSignal.any([controller.signal, this.lifetime.signal])
            : AbortSignal.any([controller.signal, this.lifetime.signal, upstream]);
        var work = __assign(__assign({}, pending), { controller: controller, signal: signal });
        state.active = work;
        return work;
    };
    /** Abort older active work and reserve the next session-local revision. */
    SessionTitleService.prototype.supersede = function (state, reason) {
        var _a;
        (_a = state.active) === null || _a === void 0 ? void 0 : _a.controller.abort(new Error(reason));
        delete state.pending;
        state.revision += 1;
        return state.revision;
    };
    /** Return mutable work state for one session. */
    SessionTitleService.prototype.stateFor = function (session) {
        var state = this.work.get(session);
        if (state === undefined) {
            state = { revision: 0 };
            this.work.set(session, state);
        }
        return state;
    };
    /** Queue detached service work and retain it through service disposal. */
    SessionTitleService.prototype.defer = function (task) {
        var _this = this;
        var run = Promise.resolve().then(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.serviceActive())
                            return [2 /*return*/];
                        return [4 /*yield*/, task()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        void this.track(run);
    };
    /** Retain one promise until settlement for service and optional provider teardown. */
    SessionTitleService.prototype.track = function (run, registration) {
        var _this = this;
        this.inFlight.add(run);
        registration === null || registration === void 0 ? void 0 : registration.active.add(run);
        var settled = function () {
            _this.inFlight.delete(run);
            registration === null || registration === void 0 ? void 0 : registration.active.delete(run);
        };
        void run.then(settled, settled);
        return run;
    };
    /** Await every current and settling promise in one lifecycle registry. */
    SessionTitleService.prototype.drain = function (active) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(active.size > 0)) return [3 /*break*/, 2];
                        return [4 /*yield*/, Promise.allSettled(__spreadArray([], active, true))];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 0];
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    /** Whether the owning plugin fiber can still start or commit title work. */
    SessionTitleService.prototype.serviceActive = function () {
        return !this.lifetime.signal.aborted
            && this.ownerFiber.uid !== null
            && this.ownerFiber.state === cordis_1.FiberState.ACTIVE;
    };
    /** Reject work once the owning plugin fiber has begun unloading. */
    SessionTitleService.prototype.assertServiceActive = function () {
        if (!this.serviceActive())
            throw new Error('session-title service disposed');
    };
    /** Reject malformed provider registrations before publishing an effect. */
    SessionTitleService.prototype.validateProvider = function (provider) {
        if (provider === null || typeof provider !== 'object') {
            throw new Error('session-title provider must be an object');
        }
        var candidate = provider;
        if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
            throw new Error('session-title provider id must be a non-empty string');
        }
        if (candidate.automatic !== 'first-prompt' && candidate.automatic !== 'all-prompts') {
            throw new Error('session-title provider automatic mode is invalid');
        }
        if (typeof candidate.generate !== 'function') {
            throw new Error("session-title provider \"".concat(candidate.id, "\" requires generate()"));
        }
    };
    /**
     * Derive and append the deterministic fallback title over whatever stands
     * (the refresh unpin path: overwriting a pinned user title is the point).
     * Synchronous on purpose — no await may separate derivation from append, so
     * it needs neither ensureFallback's in-flight dedup nor its liveness
     * re-check. An underivable fallback (empty after the caps) appends nothing.
     */
    SessionTitleService.prototype.appendFallback = function (session, first) {
        var title = (0, normalize_ts_1.fallbackSessionTitle)(first.text, this.config.fallbackMaxWords, this.config.fallbackMaxBytes);
        if (title.length === 0)
            return;
        session.append('session/title', {
            title: title,
            messageSeqs: [first.seq],
            source: { kind: 'fallback' },
        });
    };
    /** Create the first deterministic fallback if the session still lacks a title. */
    SessionTitleService.prototype.ensureFallback = function (session) {
        return __awaiter(this, void 0, void 0, function () {
            var current, first, title, state, fallback;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.assertServiceActive();
                        current = this.get(session);
                        if (current !== undefined)
                            return [2 /*return*/, current];
                        first = collectSessionTitleMessages(session.events)[0];
                        if (first === undefined)
                            return [2 /*return*/, undefined];
                        title = (0, normalize_ts_1.fallbackSessionTitle)(first.text, this.config.fallbackMaxWords, this.config.fallbackMaxBytes);
                        if (title.length === 0)
                            return [2 /*return*/, undefined];
                        state = this.stateFor(session);
                        if (state.fallback !== undefined)
                            return [2 /*return*/, state.fallback];
                        fallback = Promise.resolve().then(function () {
                            _this.assertServiceActive();
                            if (_this.ctx.sessions.get(session.id) !== session) {
                                throw new Error("session \"".concat(session.id, "\" is not live in this store"));
                            }
                            var accepted = _this.get(session);
                            if (accepted !== undefined)
                                return accepted;
                            session.append('session/title', {
                                title: title,
                                messageSeqs: [first.seq],
                                source: { kind: 'fallback' },
                            });
                            return _this.get(session);
                        });
                        state.fallback = fallback;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 3, 4]);
                        return [4 /*yield*/, fallback];
                    case 2: return [2 /*return*/, _a.sent()];
                    case 3:
                        delete state.fallback;
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    SessionTitleService.inject = ['sessions'];
    SessionTitleService.Config = schemastery_1.default.object({
        fallbackMaxWords: schemastery_1.default.number().step(1).min(1).required(),
        fallbackMaxBytes: schemastery_1.default.number().step(1).min(1).required(),
        maxTitleBytes: schemastery_1.default.number().step(1).min(1).required(),
    });
    return SessionTitleService;
}(cordis_1.Service));
exports.SessionTitleService = SessionTitleService;
exports.default = SessionTitleService;
