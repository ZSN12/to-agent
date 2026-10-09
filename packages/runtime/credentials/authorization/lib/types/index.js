"use strict";
/**
 * Service Definition for the authorization capability seam (`ctx.authorization`):
 * obtaining a credential nobody can supply from configuration alone, because
 * getting it requires a conversation with the human — open this page, paste
 * that code, pick an account.
 *
 * The seam owns the conversation and the lifecycle; it never owns the protocol.
 * A plugin that knows how to obtain its own credential registers a flow keyed
 * by the `CredentialKey` that flow writes, and the flow talks to whatever
 * surface started it through one neutral vocabulary of notices and prompts. So
 * a second authorization protocol arrives as another flow rather than as
 * another seam, and a surface that renders one flow renders all of them.
 *
 * ```ts
 * const dispose = ctx.authorization.registerFlow({
 *   key: credentialKey('llm-pi-ai', 'openai-codex'),
 *   label: 'ChatGPT (Codex)',
 *   methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
 *   async run(session) {
 *     session.notify({ message: 'Continue in your browser', url })
 *     await commitThroughCredentials(await exchange(session.signal))
 *   },
 * })
 * ```
 *
 * @module @z/dsh-authorization
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
exports.AuthorizationService = exports.AuthorizationDeclinedError = exports.AuthorizationError = void 0;
var cordis_1 = require("@z/cordis");
var dsh_llm_1 = require("@z/dsh-llm");
/** Stable error taxonomy for authorization failures. */
var AuthorizationError = /** @class */ (function (_super) {
    __extends(AuthorizationError, _super);
    function AuthorizationError(message, code, options) {
        var _this = _super.call(this, message, code, options) || this;
        _this.name = 'AuthorizationError';
        return _this;
    }
    return AuthorizationError;
}(dsh_llm_1.HarnessError));
exports.AuthorizationError = AuthorizationError;
/**
 * The rejection an {@link AuthorizationInteraction.prompt} uses to say the
 * human declined — dismissed the question, chose not to answer — rather than
 * that the surface broke. An attempt whose flow fails after a prompt was
 * declined settles as `cancelled`, the same outcome as a withdrawn signal,
 * because the human saying no is a refusal, not a breakage. Only a human's
 * "no" may reject with this class: a prompt withdrawn by its own `signal` (a
 * flow retiring the losing question of a race) must reject with something
 * else, or a later genuine failure would be misread as a decline.
 */
var AuthorizationDeclinedError = /** @class */ (function (_super) {
    __extends(AuthorizationDeclinedError, _super);
    function AuthorizationDeclinedError(message) {
        if (message === void 0) { message = 'the authorization prompt was declined'; }
        var _this = _super.call(this, message, 'DECLINED') || this;
        _this.name = 'AuthorizationDeclinedError';
        return _this;
    }
    return AuthorizationDeclinedError;
}(AuthorizationError));
exports.AuthorizationDeclinedError = AuthorizationDeclinedError;
/**
 * `ctx.authorization`: a registry of credential-obtaining flows, one attempt at
 * a time per key.
 */
var AuthorizationService = /** @class */ (function (_super) {
    __extends(AuthorizationService, _super);
    function AuthorizationService(ctx) {
        var _this = _super.call(this, ctx, 'authorization') || this;
        _this.flows = new Map();
        _this.running = new Map();
        return _this;
    }
    /**
     * Offer a way to obtain one credential. One flow per key: two plugins
     * claiming the same key would each write a record in their own format, and
     * whichever ran last would leave the other reading a payload it cannot parse.
     *
     * @param flow - the key it writes, its label, its methods, and its runner.
     * @returns Disposer that withdraws this flow.
     * @throws {AuthorizationError} code `DUPLICATE_FLOW` when the key is already claimed.
     */
    AuthorizationService.prototype.registerFlow = function (flow) {
        var dispose = this.ctx.effect(function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.flows.has(flow.key)) {
                            throw new AuthorizationError("an authorization flow for \"".concat(flow.key, "\" is already registered"), 'DUPLICATE_FLOW');
                        }
                        this.flows.set(flow.key, flow);
                        return [4 /*yield*/, function () {
                                var _a;
                                _this.flows.delete(flow.key);
                                // A flow leaving mid-attempt takes its attempt with it: the runner
                                // belongs to a plugin that is going away, so letting it keep prompting
                                // would outlive the fiber that can answer for it.
                                (_a = _this.running.get(flow.key)) === null || _a === void 0 ? void 0 : _a.controller.abort();
                            }];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }.bind(this), 'authorization.registerFlow()');
        return function () { return void dispose(); };
    };
    /**
     * Every registered flow, for a surface listing what can be authorized.
     * @returns one entry per flow, in registration order.
     */
    AuthorizationService.prototype.list = function () {
        var _this = this;
        return __spreadArray([], this.flows.values(), true).map(function (flow) { return _this.entry(flow); });
    };
    /**
     * One registered flow.
     * @param key - the credential record to ask about.
     * @returns the entry, or undefined when no flow claims that key.
     */
    AuthorizationService.prototype.describe = function (key) {
        var flow = this.flows.get(key);
        return flow === undefined ? undefined : this.entry(flow);
    };
    /** The public view of one registered flow. */
    AuthorizationService.prototype.entry = function (flow) {
        return {
            key: flow.key,
            label: flow.label,
            methods: flow.methods,
            inFlight: this.running.has(flow.key),
        };
    };
    /**
     * Withdraw the attempt running for a key, if any. Separate from the
     * request's own signal because a request/response transport answers a Cancel
     * button on a second call, with no handle on the first one's signal.
     * @param key - the credential record whose attempt should stop.
     */
    AuthorizationService.prototype.cancel = function (key) {
        var _a;
        (_a = this.running.get(key)) === null || _a === void 0 ? void 0 : _a.controller.abort();
    };
    /**
     * Run one attempt to authorize a key, and report how it ended.
     *
     * One attempt per key at a time. A second caller is refused rather than
     * joined: the two would be prompting different humans through the same flow,
     * and the second would answer questions the first was asked.
     *
     * @param request - the key, the method, the surface, and the cancel signal.
     * @returns `authorized` once the flow's record is committed during this
     *   attempt and observed, or `cancelled` when the human declined or the
     *   caller withdrew.
     * @throws {AuthorizationError} code `NO_FLOW` when nothing claims the key,
     *   `UNKNOWN_METHOD` when the named method is not one the flow offers,
     *   `ALREADY_IN_FLIGHT` when an attempt is already running for the key, or
     *   `NOT_COMMITTED` when the flow resolved without committing a record
     *   during the attempt.
     */
    AuthorizationService.prototype.begin = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var key, flow, method, controller, withdraw, settlement, outcome;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        key = request.key;
                        flow = this.flows.get(key);
                        if (flow === undefined) {
                            throw new AuthorizationError("no authorization flow is registered for \"".concat(key, "\""), 'NO_FLOW');
                        }
                        method = (_a = request.method) !== null && _a !== void 0 ? _a : flow.methods[0].id;
                        if (!flow.methods.some(function (candidate) { return candidate.id === method; })) {
                            throw new AuthorizationError("authorization flow for \"".concat(key, "\" offers no method \"").concat(method, "\""), 'UNKNOWN_METHOD');
                        }
                        if (this.running.has(key)) {
                            throw new AuthorizationError("an authorization attempt for \"".concat(key, "\" is already running"), 'ALREADY_IN_FLIGHT');
                        }
                        // Withdrawn before it began: never claim the slot and never run the flow.
                        // Handing an aborted signal to `run()` would rely on every flow checking it
                        // before its first await, and one that does not would hang holding the key.
                        // Validation still runs first, so a caller naming a key or method that does
                        // not exist hears about it whether or not it also gave up.
                        if (((_b = request.signal) === null || _b === void 0 ? void 0 : _b.aborted) === true)
                            return [2 /*return*/, { status: 'cancelled' }];
                        controller = new AbortController();
                        withdraw = function () { var _a; controller.abort((_a = request.signal) === null || _a === void 0 ? void 0 : _a.reason); };
                        (_c = request.signal) === null || _c === void 0 ? void 0 : _c.addEventListener('abort', withdraw, { once: true });
                        this.running.set(key, { controller: controller });
                        settlement = 'failed';
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, , 3, 4]);
                        return [4 /*yield*/, this.attempt(flow, method, controller.signal, request.interaction)];
                    case 2:
                        outcome = _e.sent();
                        settlement = outcome.status;
                        return [2 /*return*/, outcome];
                    case 3:
                        (_d = request.signal) === null || _d === void 0 ? void 0 : _d.removeEventListener('abort', withdraw);
                        this.running.delete(key);
                        // After the slot is released, so a listener that reacts by starting the
                        // next attempt is not refused by the one that just finished.
                        this.settle(key, settlement);
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /* jscpd:ignore-start -- deliberate symmetry with the credentials seam's
       commit fan-out (`CredentialProvider`): the contained-dispatch shape is the
       reviewed listener-lifecycle contract, and extracting it would couple the
       two seams' event semantics. */
    /**
     * Fan `authorization/settled` out with contained listener failures: every
     * listener runs, and a sync throw or async rejection is logged without
     * changing the finished attempt's own outcome — except `INVARIANT`-coded
     * failures, which rethrow after every listener ran. The attempt is already
     * over and its key released when this fires, so a broken watcher (that
     * second browser tab) can never turn the caller's settled result into a
     * failure of its own.
     */
    AuthorizationService.prototype.settle = function (key, settlement) {
        var _this = this;
        var invariantFailure;
        var args = ['authorization/settled', key, settlement];
        for (var _i = 0, _a = this.ctx.events.dispatch('emit', args); _i < _a.length; _i++) {
            var listener = _a[_i];
            try {
                var returned = listener(key, settlement);
                if (returned != null && typeof returned.then === 'function') {
                    void Promise.resolve(returned).then(undefined, function (error) {
                        _this.warnSettledListenerFailure(key, error);
                    });
                }
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.code) === 'INVARIANT') {
                    invariantFailure !== null && invariantFailure !== void 0 ? invariantFailure : (invariantFailure = error);
                    continue;
                }
                this.warnSettledListenerFailure(key, error);
            }
        }
        if (invariantFailure !== undefined)
            throw invariantFailure;
    };
    /* jscpd:ignore-end */
    /** Contained-listener diagnostic shared by the sync and async failure paths. */
    AuthorizationService.prototype.warnSettledListenerFailure = function (key, error) {
        this.ctx.logger.warn('authorization: an authorization/settled listener for "%s" failed', key);
        this.ctx.logger.warn(error);
    };
    /** Run the flow, then hold it to its half of the commit contract. */
    AuthorizationService.prototype.attempt = function (flow, method, signal, interaction) {
        return __awaiter(this, void 0, void 0, function () {
            var withdrawn, observed, unwatch, running, error_1, stored;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        withdrawn = new Promise(function (resolve) {
                            // `begin()` returns before claiming the key when its caller has already
                            // withdrawn, so this signal cannot already be aborted here.
                            signal.addEventListener('abort', function () { resolve('withdrawn'); }, { once: true });
                        });
                        observed = { declined: false, committed: false };
                        unwatch = this.ctx.on('credentials/record-updated', function (key) {
                            if (key === flow.key)
                                observed.committed = true;
                        });
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 6, 7]);
                        running = flow.run({
                            method: method,
                            signal: signal,
                            notify: function (notice) {
                                try {
                                    interaction.notify(notice);
                                }
                                catch (error) {
                                    // Fire-and-forget is held at the seam: a surface that cannot
                                    // render a notice (a page whose connection just closed) loses the
                                    // notice, never the attempt.
                                    _this.ctx.logger.warn('authorization: the interaction surface failed to render a notice');
                                    _this.ctx.logger.warn(error);
                                }
                            },
                            prompt: function (prompt) { return interaction.prompt(prompt).catch(function (error) {
                                if (error instanceof AuthorizationDeclinedError)
                                    observed.declined = true;
                                throw error;
                            }); },
                        });
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, Promise.race([running.then(function () { return 'ran'; }), withdrawn])];
                    case 3:
                        if ((_a.sent()) === 'withdrawn') {
                            // Nothing awaits the orphan any more, so its eventual failure has to be
                            // marked handled or it would take down the process.
                            void running.catch(function () { _this.ctx.logger.debug('authorization: withdrawn flow failed after the fact'); });
                            return [2 /*return*/, { status: 'cancelled' }];
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _a.sent();
                        // A withdrawn attempt and a declined prompt are outcomes, not
                        // failures: the human said no, or closed the page. Anything else is
                        // the flow failing and belongs to the caller, cause chain intact.
                        if (signal.aborted || observed.declined)
                            return [2 /*return*/, { status: 'cancelled' }];
                        throw error_1;
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        unwatch();
                        return [7 /*endfinally*/];
                    case 7:
                        if (!observed.committed) {
                            throw new AuthorizationError("authorization flow for \"".concat(flow.key, "\" resolved without committing a credential record in this attempt"), 'NOT_COMMITTED');
                        }
                        return [4 /*yield*/, this.ctx.credentials.describeRecord(flow.key)];
                    case 8:
                        stored = _a.sent();
                        if (!stored.configured) {
                            throw new AuthorizationError("authorization flow for \"".concat(flow.key, "\" deleted its credential record instead of committing one"), 'NOT_COMMITTED');
                        }
                        return [2 /*return*/, { status: 'authorized' }];
                }
            });
        });
    };
    /** The commit this seam confirms is a credential-record write, so the store is required, not optional. */
    AuthorizationService.inject = ['credentials'];
    return AuthorizationService;
}(cordis_1.Service));
exports.AuthorizationService = AuthorizationService;
exports.default = AuthorizationService;
