"use strict";
/**
 * Connection supervisor: owns the MCP client/transport generations for one
 * plugin instance, keeps the harness tool registry in sync with the live
 * generation, and — when the connection drops — restarts the configured
 * server with bounded exponential backoff.
 *
 * One outage shares one attempt budget (`maxAttempts` consecutive failed
 * attempts, delays doubling from `initialDelayMs` up to `maxDelayMs`). A
 * connection that stays up past the stability window closes the outage, so
 * the next disconnect starts a fresh budget while a crash-looping server —
 * even one whose connects briefly succeed — still exhausts the cap instead of
 * restarting forever. Exhaustion unregisters the server's tools and stops;
 * disposal (including HMR) is the only way back from that state.
 *
 * @module
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECONNECT_DEFAULTS = void 0;
exports.resolveReconnectPolicy = resolveReconnectPolicy;
exports.startConnection = startConnection;
var index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
var types_js_1 = require("@modelcontextprotocol/sdk/types.js");
var dsh_timeout_1 = require("@z/dsh-timeout");
var transport_ts_1 = require("./transport.ts");
var tools_ts_1 = require("./tools.ts");
/** Defaults shared by the Config schema and {@link resolveReconnectPolicy}. */
exports.RECONNECT_DEFAULTS = Object.freeze({
    enabled: true,
    initialDelayMs: 500,
    maxDelayMs: 30000,
    maxAttempts: 10,
});
// The SDK's stdio transport owns two two-second termination grace periods.
// Keep one additional second for the process-close event that proves the old
// generation is gone; timing out fails closed instead of overlapping children.
var GENERATION_CLOSE_TIMEOUT_MS = 5000;
/**
 * The one explicit resolve step from raw reconnect config to the policy the
 * supervisor runs. Programmatic construction may bypass Schemastery
 * normalization, so every default and bound is re-judged here — misconfiguration
 * fails the plugin instance at load.
 *
 * @param config - Raw `reconnect` config; omission uses the defaults.
 * @param path - Diagnostic prefix naming the config location in thrown messages.
 * @returns The frozen resolved policy.
 */
function resolveReconnectPolicy(config, path) {
    var _a, _b, _c, _d;
    if (config !== undefined) {
        for (var _i = 0, _e = Object.keys(config); _i < _e.length; _i++) {
            var key = _e[_i];
            if (!Object.hasOwn(exports.RECONNECT_DEFAULTS, key))
                throw new Error("".concat(path, ".").concat(key, " is not a reconnect option"));
        }
    }
    var enabled = (_a = config === null || config === void 0 ? void 0 : config.enabled) !== null && _a !== void 0 ? _a : exports.RECONNECT_DEFAULTS.enabled;
    var initialDelayMs = (_b = config === null || config === void 0 ? void 0 : config.initialDelayMs) !== null && _b !== void 0 ? _b : exports.RECONNECT_DEFAULTS.initialDelayMs;
    var maxDelayMs = (_c = config === null || config === void 0 ? void 0 : config.maxDelayMs) !== null && _c !== void 0 ? _c : exports.RECONNECT_DEFAULTS.maxDelayMs;
    var maxAttempts = (_d = config === null || config === void 0 ? void 0 : config.maxAttempts) !== null && _d !== void 0 ? _d : exports.RECONNECT_DEFAULTS.maxAttempts;
    /* jscpd:ignore-start — domain-specific delay validation parallels llm retry-policy; not extractable */
    if (!Number.isFinite(initialDelayMs) || initialDelayMs <= 0 || initialDelayMs > dsh_timeout_1.MAX_TIMER_DELAY_MS) {
        throw new Error("".concat(path, ".initialDelayMs must be a positive finite number no greater than ").concat(dsh_timeout_1.MAX_TIMER_DELAY_MS));
    }
    if (!Number.isFinite(maxDelayMs) || maxDelayMs <= 0 || maxDelayMs > dsh_timeout_1.MAX_TIMER_DELAY_MS) {
        throw new Error("".concat(path, ".maxDelayMs must be a positive finite number no greater than ").concat(dsh_timeout_1.MAX_TIMER_DELAY_MS));
    }
    if (initialDelayMs > maxDelayMs) {
        throw new Error("".concat(path, ".initialDelayMs must be less than or equal to maxDelayMs"));
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
        throw new Error("".concat(path, ".maxAttempts must be a positive integer"));
    }
    /* jscpd:ignore-end */
    return Object.freeze({ enabled: enabled, initialDelayMs: initialDelayMs, maxDelayMs: maxDelayMs, maxAttempts: maxAttempts });
}
/**
 * Start the supervised connection for one MCP server and keep it alive per
 * the reconnect policy.
 *
 * @param ctx - Cordis context providing the `tools` registry and logger.
 * @param config - Resolved plugin config selecting the transport and server identity.
 * @param policy - Resolved reconnect policy from {@link resolveReconnectPolicy}.
 * @returns Handle with a `ready` promise for startup-await and a `dispose` for teardown.
 */
function startConnection(ctx, config, policy) {
    var label = "mcp-client(".concat(config.serverName, ")");
    var opts = {
        registrationFailure: 'contain',
        serverName: config.serverName,
        toolCallTimeoutMs: config.toolCallTimeoutMs,
    };
    // The initial sync uses 'throw' when failOnStartupError is configured, so
    // a registration conflict propagates to the startup-await path. Re-syncs
    // and reconnect syncs always contain conflicts.
    var startupOpts = config.failOnStartupError
        ? __assign(__assign({}, opts), { registrationFailure: 'throw' }) : opts;
    var disposed = false;
    /** Current generation: the connecting or connected client; undefined during backoff waits and after final failure. */
    var client;
    /** Close signal paired with {@link client}; captured by dispose before current ownership is cleared. */
    var clientClosed;
    /** Live tool registrations owned by this server; only {@link enqueueSync} and dispose swap it. */
    var disposers = new Map();
    var reconnectTimer;
    /** Consecutive failed connection attempts within the current outage. */
    var failedAttempts = 0;
    /** When the current generation finished connect + initial sync; undefined while down. */
    var connectedAt;
    /** The real error from the first connection attempt, for startup-await diagnostics. */
    var firstAttemptError;
    /** A generation may act only while it is the current one on a live plugin. */
    var isCurrent = function (generation) { return !disposed && client === generation; };
    /**
     * Serializes every syncTools call — initial syncs and notification re-syncs
     * across all generations — so two syncs can never interleave their
     * dispose-previous/register-next swap (which would double-dispose one
     * generation and leak another).
     */
    var syncChain = Promise.resolve();
    function enqueueSync(generation, syncOpts) {
        var _this = this;
        if (syncOpts === void 0) { syncOpts = opts; }
        var run = syncChain.then(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!isCurrent(generation))
                            return [2 /*return*/];
                        return [4 /*yield*/, (0, tools_ts_1.syncTools)(generation, ctx, syncOpts, disposers)];
                    case 1:
                        disposers = _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        // The chain tail must survive a failed sync; the enqueuing caller owns reporting.
        syncChain = run.catch(function () { });
        return run;
    }
    /** One disconnect decision per generation: the isCurrent guard makes racing close/error signals idempotent. */
    function generationDown(generation) {
        if (!isCurrent(generation))
            return;
        client = undefined;
        clientClosed = undefined;
        scheduleReconnect();
    }
    /** Wait for the transport-owned close signal without letting a broken transport wedge teardown forever. */
    function waitForClose(closed) {
        return new Promise(function (resolve) {
            var timeout = setTimeout(function () { resolve(false); }, GENERATION_CLOSE_TIMEOUT_MS);
            timeout.unref();
            void closed.then(function () {
                clearTimeout(timeout);
                resolve(true);
            });
        });
    }
    function scheduleReconnect() {
        var lostEstablishedConnection = connectedAt !== undefined;
        if (!policy.enabled) {
            var message = lostEstablishedConnection
                ? 'connection lost and reconnect is disabled — registered tools will fail until an HMR reload or Host restart'
                : 'connection failed and reconnect is disabled — no tools were registered; reload the plugin or restart the Host to connect';
            ctx.logger.error("".concat(label, ": ").concat(message));
            return;
        }
        // A connection that stayed up past the stability window (= maxDelayMs, the
        // longest backoff spacing) ended the previous outage: start a fresh budget.
        if (connectedAt !== undefined && Date.now() - connectedAt >= policy.maxDelayMs)
            failedAttempts = 0;
        connectedAt = undefined;
        failedAttempts += 1;
        if (failedAttempts > policy.maxAttempts) {
            // Enqueue the give-up disposal so it cannot race an in-flight sync's
            // phase-2 swap (which checks isCurrent inside the queue).
            syncChain = syncChain.then(function () {
                for (var _i = 0, _a = disposers.values(); _i < _a.length; _i++) {
                    var dispose = _a[_i];
                    dispose();
                }
                disposers = new Map();
            });
            ctx.logger.error("".concat(label, ": giving up after ").concat(policy.maxAttempts, " consecutive failed reconnect attempts \u2014 tools unregistered; reload the plugin or restart the Host to reconnect"));
            return;
        }
        var delayMs = Math.min(policy.maxDelayMs, policy.initialDelayMs * Math.pow(2, (failedAttempts - 1)));
        var action = lostEstablishedConnection ? 'connection lost; reconnecting' : 'connection failed; retrying';
        ctx.logger.warn("".concat(label, ": ").concat(action, " in ").concat(delayMs, "ms (attempt ").concat(failedAttempts, "/").concat(policy.maxAttempts, ")"));
        reconnectTimer = setTimeout(function () {
            reconnectTimer = undefined;
            settling = connectGeneration(false);
        }, delayMs);
        // An armed reconnect timer must never hold the process open on its own.
        reconnectTimer.unref();
    }
    /**
     * One connection attempt: fresh transport + client (the MCP SDK binds a
     * Protocol to one transport for life), connect, then queue the initial tool
     * sync. The startup flag belongs to the attempt rather than the shared sync
     * queue, so an early notification cannot consume strict startup semantics.
     * Every failure funnels through {@link generationDown}; success arms the
     * onclose-driven disconnect path. Never rejects.
     *
     * @param startup - Whether this is the plugin's activation attempt.
     */
    function connectGeneration(startup) {
        return __awaiter(this, void 0, void 0, function () {
            var generation, closed, attemptSettled, closeObserved, hasClosed, error_1, _a, quiesced, _b;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        generation = new index_js_1.Client({ name: 'dsh-mcp-client', version: '0.0.1' }, { capabilities: {} });
                        closed = Promise.withResolvers();
                        attemptSettled = false;
                        closeObserved = false;
                        hasClosed = function () { return closeObserved; };
                        client = generation;
                        clientClosed = closed.promise;
                        generation.onclose = function () {
                            closeObserved = true;
                            closed.resolve();
                            // A failed connect owns its close barrier in the catch path below. An
                            // established generation can transition down directly from this signal.
                            if (attemptSettled)
                                generationDown(generation);
                        };
                        // Registered before connect so a list change during the initial sync is
                        // queued behind it rather than dropped.
                        generation.setNotificationHandler(types_js_1.ToolListChangedNotificationSchema, function () { return __awaiter(_this, void 0, void 0, function () {
                            var error_2;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (!isCurrent(generation))
                                            return [2 /*return*/];
                                        ctx.logger.info("".concat(label, ": tool list changed, re-syncing"));
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, , 4]);
                                        return [4 /*yield*/, enqueueSync(generation)];
                                    case 2:
                                        _a.sent();
                                        return [3 /*break*/, 4];
                                    case 3:
                                        error_2 = _a.sent();
                                        // Fetch-phase failure: the previous generation is still registered
                                        // and `disposers` still owns it — keep serving the last good list.
                                        if (!disposed)
                                            ctx.logger.error("".concat(label, ": tool re-sync failed: ").concat(String(error_2)));
                                        return [3 /*break*/, 4];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        }); });
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 4, , 11]);
                        return [4 /*yield*/, generation.connect((0, transport_ts_1.createTransport)(config))];
                    case 2:
                        _c.sent();
                        if (hasClosed()) {
                            attemptSettled = true;
                            generationDown(generation);
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, enqueueSync(generation, startup ? startupOpts : opts)];
                    case 3:
                        _c.sent();
                        return [3 /*break*/, 11];
                    case 4:
                        error_1 = _c.sent();
                        if (firstAttemptError === undefined)
                            firstAttemptError = error_1;
                        // Disposal clears current ownership before it closes the generation, so
                        // only a live supervisor reports an attempt failure.
                        if (isCurrent(generation))
                            ctx.logger.warn("".concat(label, ": connection attempt failed: ").concat(String(error_1)));
                        _c.label = 5;
                    case 5:
                        _c.trys.push([5, 7, , 8]);
                        return [4 /*yield*/, generation.close()];
                    case 6:
                        _c.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        _a = _c.sent();
                        return [3 /*break*/, 8];
                    case 8:
                        _b = hasClosed();
                        if (_b) return [3 /*break*/, 10];
                        return [4 /*yield*/, waitForClose(closed.promise)];
                    case 9:
                        _b = (_c.sent());
                        _c.label = 10;
                    case 10:
                        quiesced = _b;
                        attemptSettled = true;
                        if (!isCurrent(generation))
                            return [2 /*return*/];
                        if (!quiesced) {
                            client = undefined;
                            clientClosed = undefined;
                            ctx.logger.error("".concat(label, ": failed generation did not close within ").concat(GENERATION_CLOSE_TIMEOUT_MS, "ms \u2014 reconnect stopped to avoid overlapping server processes; reload the plugin or restart the Host to retry"));
                            return [2 /*return*/];
                        }
                        generationDown(generation);
                        return [2 /*return*/];
                    case 11:
                        attemptSettled = true;
                        if (hasClosed()) {
                            generationDown(generation);
                            return [2 /*return*/];
                        }
                        if (!isCurrent(generation))
                            return [2 /*return*/];
                        connectedAt = Date.now();
                        if (failedAttempts > 0)
                            ctx.logger.info("".concat(label, ": reconnected and re-synced tools (attempt ").concat(failedAttempts, "/").concat(policy.maxAttempts, ")"));
                        return [2 /*return*/];
                }
            });
        });
    }
    /** The in-flight (or last settled) connection attempt; dispose awaits it for quiescence. */
    var settling = connectGeneration(true);
    // The ready promise settles when the first attempt finishes (regardless of
    // success). If the first attempt fails and reconnect is enabled, the
    // supervisor is already scheduling a retry — ready just reports the outcome.
    var ready = settling.then(function () {
        // After settling: if client is set the initial connect+sync succeeded.
        // If not, the supervisor either scheduled a retry (error logged) or gave
        // up (error logged). Either way the outcome is reported with the real error.
        // Note: settling.then() is a microtask; stdio onclose is a macrotask — so
        // a server that crashes AFTER a successful initial sync cannot flip client
        // to undefined before this continuation runs.
        if (client !== undefined)
            return {};
        /* v8 ignore next -- defensive: firstAttemptError is always set when connect/sync fails */
        return { error: firstAttemptError !== null && firstAttemptError !== void 0 ? firstAttemptError : new Error("".concat(label, ": initial connection failed")) };
    });
    return {
        ready: ready,
        dispose: function () {
            return __awaiter(this, void 0, void 0, function () {
                var current, currentClosed, _a, _b, _i, _c, dispose;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            disposed = true;
                            if (reconnectTimer !== undefined) {
                                clearTimeout(reconnectTimer);
                                reconnectTimer = undefined;
                            }
                            current = client;
                            currentClosed = clientClosed;
                            client = undefined;
                            clientClosed = undefined;
                            if (!(current !== undefined)) return [3 /*break*/, 7];
                            _d.label = 1;
                        case 1:
                            _d.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, current.close()];
                        case 2:
                            _d.sent();
                            return [3 /*break*/, 4];
                        case 3:
                            _a = _d.sent();
                            return [3 /*break*/, 4];
                        case 4:
                            _b = currentClosed !== undefined;
                            if (!_b) return [3 /*break*/, 6];
                            return [4 /*yield*/, waitForClose(currentClosed)];
                        case 5:
                            _b = !(_d.sent());
                            _d.label = 6;
                        case 6:
                            if (_b) {
                                ctx.logger.error("".concat(label, ": generation did not close within ").concat(GENERATION_CLOSE_TIMEOUT_MS, "ms during disposal \u2014 server shutdown may be incomplete"));
                            }
                            _d.label = 7;
                        case 7: 
                        // Quiesce, don't just request it: the in-flight attempt enqueues its
                        // sync before settling, so awaiting both leaves `disposers` final.
                        return [4 /*yield*/, settling];
                        case 8:
                            // Quiesce, don't just request it: the in-flight attempt enqueues its
                            // sync before settling, so awaiting both leaves `disposers` final.
                            _d.sent();
                            return [4 /*yield*/, syncChain];
                        case 9:
                            _d.sent();
                            for (_i = 0, _c = disposers.values(); _i < _c.length; _i++) {
                                dispose = _c[_i];
                                dispose();
                            }
                            disposers = new Map();
                            return [2 /*return*/];
                    }
                });
            });
        },
    };
}
