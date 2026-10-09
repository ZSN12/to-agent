"use strict";
/**
 * Concrete agent-loop plugin: creates scoped ReactLoopAgents, publishes them
 * through the agent/session registries, and owns their ordered teardown.
 *
 * @module @z/dsh-agent-loop
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
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
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
exports.AgentLoop = exports.AGENT_LOOP_SETTINGS_SCHEMA = exports.AGENT_LOOP_SETTINGS_NAMESPACE = exports.CONFIGURED_AGENT_IDENTITIES_KEY = exports.DEFAULT_MAX_PARALLEL_TOOL_CALLS = void 0;
var cordis_1 = require("@z/cordis");
var node_crypto_1 = require("node:crypto");
var schemastery_1 = require("@z/schemastery");
var dsh_agent_1 = require("@z/dsh-agent");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_settings_1 = require("@z/dsh-settings");
var dsh_session_1 = require("@z/dsh-session");
var agent_ts_1 = require("./agent.ts");
var constants_ts_1 = require("./constants.ts");
Object.defineProperty(exports, "DEFAULT_MAX_PARALLEL_TOOL_CALLS", { enumerable: true, get: function () { return constants_ts_1.DEFAULT_MAX_PARALLEL_TOOL_CALLS; } });
/** Fiber states that cannot own or serve a new lifecycle. */
var INACTIVE_STATES = new Set([
    cordis_1.FiberState.UNLOADING,
    cordis_1.FiberState.DISPOSED,
    cordis_1.FiberState.FAILED,
]);
/** Factory-level ownership: live agent teardowns plus config startup work. */
var FactoryOwnership = /** @class */ (function () {
    function FactoryOwnership(fiber) {
        this.fiber = fiber;
        this.accepting = true;
        this.teardown = new AbortController();
        this.inactive = Promise.withResolvers();
        this.liveAgents = new Set();
        this.startupTasks = new Set();
    }
    Object.defineProperty(FactoryOwnership.prototype, "signal", {
        /** Aborts (reason: `agent loop is not active` error) when factory teardown begins. */
        get: function () {
            return this.teardown.signal;
        },
        enumerable: false,
        configurable: true
    });
    FactoryOwnership.prototype.isActive = function () {
        return this.accepting && !INACTIVE_STATES.has(this.fiber.state);
    };
    /** Track one live agent's shared teardown until it has run. */
    FactoryOwnership.prototype.track = function (dispose) {
        var _this = this;
        this.liveAgents.add(dispose);
        return function () { _this.liveAgents.delete(dispose); };
    };
    /** Join config startup work that begins before an agent exists. */
    FactoryOwnership.prototype.trackStartup = function (job) {
        var _this = this;
        this.startupTasks.add(job);
        var forget = function () { _this.startupTasks.delete(job); };
        void job.then(forget, forget);
    };
    /** Join one public create/resume continuation; factory dispose awaits its settlement. */
    FactoryOwnership.prototype.trackWrapper = function (job) {
        this.trackStartup(job.then(function () { return undefined; }, function () { return undefined; }));
    };
    /** Resolve `task`, or stop waiting when factory teardown begins. */
    FactoryOwnership.prototype.waitWhileActive = function (job) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.race([job, this.inactive.promise])];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    FactoryOwnership.prototype.dispose = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.accepting = false;
                        this.teardown.abort(new Error('agent loop is not active'));
                        this.inactive.resolve();
                        return [4 /*yield*/, Promise.all(__spreadArray(__spreadArray([], __spreadArray([], this.liveAgents, true).map(function (dispose) { return dispose(); }), true), this.startupTasks, true))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return FactoryOwnership;
}());
/** Await `operation`, or throw the signal's reason as soon as it aborts. */
function raceAbort(operation, signal, id) {
    return __awaiter(this, void 0, void 0, function () {
        var toAbortError, aborted, listener;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    toAbortError = function () { return signal.reason instanceof Error
                        ? signal.reason
                        : new Error("agent \"".concat(id, "\" creation aborted"), { cause: signal.reason }); };
                    if (signal.aborted)
                        throw toAbortError();
                    aborted = Promise.withResolvers();
                    listener = function () { aborted.reject(toAbortError()); };
                    signal.addEventListener('abort', listener, { once: true });
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, , 3, 4]);
                    return [4 /*yield*/, Promise.race([Promise.resolve(operation), aborted.promise])];
                case 2: return [2 /*return*/, _a.sent()];
                case 3:
                    signal.removeEventListener('abort', listener);
                    return [7 /*endfinally*/];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/** Start an abortable operation and release a value that arrives after cancellation. */
function raceAbortCall(operation, signal, id, releaseAbandoned) {
    return __awaiter(this, void 0, void 0, function () {
        var pending, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (signal.aborted) {
                        throw signal.reason instanceof Error
                            ? signal.reason
                            : new Error("agent \"".concat(id, "\" creation aborted"), { cause: signal.reason });
                    }
                    pending = Promise.resolve().then(operation);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, raceAbort(pending, signal, id)];
                case 2: return [2 /*return*/, _a.sent()];
                case 3:
                    error_1 = _a.sent();
                    // oxlint-disable-next-line typescript/no-unnecessary-condition -- the signal can abort while the operation is awaited.
                    if (signal.aborted && releaseAbandoned !== undefined) {
                        void pending.then(releaseAbandoned, function () { return undefined; });
                    }
                    throw error_1;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/** Resolve the deployment-wide scheduler cap at the owning config boundary. */
function resolveMaxParallelToolCalls(value) {
    var maxParallelToolCalls = value !== null && value !== void 0 ? value : constants_ts_1.DEFAULT_MAX_PARALLEL_TOOL_CALLS;
    if (!Number.isInteger(maxParallelToolCalls) || maxParallelToolCalls < 1) {
        throw new Error('maxParallelToolCalls must be a positive integer');
    }
    return maxParallelToolCalls;
}
/** Reject an output-token cap that cannot be represented exactly on the request wire. */
function assertAgentOptions(options) {
    if (options.maxTokens !== undefined
        && (!Number.isSafeInteger(options.maxTokens) || options.maxTokens <= 0)) {
        throw new TypeError('agent maxTokens must be a positive safe integer');
    }
}
/**
 * Context key a launcher sets before any Loader entry mounts
 * (`ctx.provide(CONFIGURED_AGENT_IDENTITIES_KEY, identities)`) to fix
 * configured agents' session identities without a config key, so an overlay
 * repointing the row's model route cannot drop them.
 */
exports.CONFIGURED_AGENT_IDENTITIES_KEY = 'configuredAgentIdentities';
/**
 * Apply launcher-owned identities over the configured agents, replacing both
 * identity keys for every entry the launcher named so a config-supplied
 * identity can never survive alongside a launcher-supplied one.
 * @param agents - the configured agent entries.
 * @param identities - launcher identities keyed by configured agent `id`, or `undefined`.
 * @returns the entries with launcher-owned identities applied.
 */
function applyLauncherIdentities(agents, identities) {
    if (identities === undefined)
        return agents;
    return agents.map(function (agent) {
        var identity = identities[agent.id];
        if (identity === undefined)
            return agent;
        var _sessionId = agent.sessionId, _resumeSessionId = agent.resumeSessionId, rest = __rest(agent, ["sessionId", "resumeSessionId"]);
        return identity.resume
            ? __assign(__assign({}, rest), { resumeSessionId: identity.id }) : __assign(__assign({}, rest), { sessionId: identity.id });
    });
}
/** Settings namespace carrying the tool-call parallelism a user owns. */
exports.AGENT_LOOP_SETTINGS_NAMESPACE = (0, dsh_settings_1.settingsNamespace)('agent-loop');
/** Schema of the agent-loop settings section. */
exports.AGENT_LOOP_SETTINGS_SCHEMA = schemastery_1.default.object({
    maxParallelToolCalls: schemastery_1.default.number().step(1).min(1).default(constants_ts_1.DEFAULT_MAX_PARALLEL_TOOL_CALLS),
});
/** Reject self-contained identity conflicts before any configured agent starts. */
function validateConfiguredAgents(agents) {
    var exactIdentities = new Map();
    for (var _i = 0, agents_1 = agents; _i < agents_1.length; _i++) {
        var _a = agents_1[_i], id = _a.id, sessionId = _a.sessionId, resumeSessionId = _a.resumeSessionId;
        var hasResumeId = resumeSessionId !== undefined && resumeSessionId !== '';
        if (sessionId !== undefined && hasResumeId) {
            throw new Error("agent \"".concat(id, "\": sessionId and resumeSessionId are mutually exclusive"));
        }
        var exactIdentity = hasResumeId ? resumeSessionId : sessionId;
        if (exactIdentity === undefined)
            continue;
        var firstId = exactIdentities.get(exactIdentity);
        if (firstId !== undefined) {
            throw new Error("agents \"".concat(firstId, "\" and \"").concat(id, "\" use duplicate exact session identity \"").concat(exactIdentity, "\""));
        }
        exactIdentities.set(exactIdentity, id);
    }
}
/** Concrete agent factory and driver service. */
var AgentLoop = /** @class */ (function (_super) {
    __extends(AgentLoop, _super);
    function AgentLoop(ctx, config) {
        var _this = _super.call(this, ctx, 'agentLoop') || this;
        var entry = {
            maxParallelToolCalls: resolveMaxParallelToolCalls(config.maxParallelToolCalls),
        };
        var source = function () { return entry; };
        _this.config = __assign(__assign({}, config), { agents: applyLauncherIdentities(config.agents, ctx.get(exports.CONFIGURED_AGENT_IDENTITIES_KEY)), 
            // Read through on every scheduler decision: `tool-calls.ts` destructures
            // this at the start of each group, so a committed change caps the next
            // group without disturbing the one in flight.
            get maxParallelToolCalls() {
                return source().maxParallelToolCalls;
            } });
        (0, dsh_settings_1.installSettingsSection)(ctx, exports.AGENT_LOOP_SETTINGS_NAMESPACE, exports.AGENT_LOOP_SETTINGS_SCHEMA, entry, {
            // The schema admits any integer above zero; `resolveMaxParallelToolCalls`
            // owns the whole rule, so refusing here keeps the running scheduler on
            // its last good cap instead of failing at the next tool group.
            validate: function (value) { return void resolveMaxParallelToolCalls(value.maxParallelToolCalls); },
            setSource: function (current) {
                source = current;
            },
            // Nothing is derived from the cap: the getter above is the only reader.
            onChange: function () { },
        });
        validateConfiguredAgents(_this.config.agents);
        _this.ownership = new FactoryOwnership(ctx.fiber);
        _this.runtime = { ctx: ctx };
        ctx.effect(function () { return function () { return _this.ownership.dispose(); }; }, 'agentLoop.transactions()');
        ctx.effect(function () { return ctx.agents.setFactory(_this); }, 'agentLoop.setFactory()');
        ctx.systemPrompt.variable('provider', function (context) { var _a; return (_a = context.agent) === null || _a === void 0 ? void 0 : _a.options.provider; });
        ctx.systemPrompt.variable('model', function (context) { var _a; return (_a = context.agent) === null || _a === void 0 ? void 0 : _a.options.model; });
        ctx.systemPrompt.variable('cwd', function (context) { var _a; return (_a = context.agent) === null || _a === void 0 ? void 0 : _a.session.header.cwd; });
        var _loop_1 = function (_b) {
            var id = _b.id, sessionId = _b.sessionId, cwd = _b.cwd, resumeSessionId = _b.resumeSessionId, options = __rest(_b, ["id", "sessionId", "cwd", "resumeSessionId"]);
            var meta = cwd === undefined ? {} : { cwd: cwd };
            if (resumeSessionId === undefined || resumeSessionId === '') {
                var configuredId_1 = sessionId !== null && sessionId !== void 0 ? sessionId : (0, dsh_session_1.SessionId)("".concat(id, "-session-").concat((0, node_crypto_1.randomUUID)()));
                var persistence = sessionId === undefined ? undefined : ctx.get('sessionPersistence');
                if (persistence === undefined) {
                    this_1.create(configuredId_1, options, meta);
                }
                else {
                    var startup = this_1.restoreOrCreateConfigured(ctx, persistence, configuredId_1, options, meta).catch(function (error) {
                        _this.reportConfiguredStartupFailure(id, 'restore', configuredId_1, error);
                    });
                    this_1.ownership.trackStartup(startup);
                }
                return "continue";
            }
            ctx.effect(function () {
                var fiber = ctx.inject(['sessionPersistence'], function (childCtx) {
                    void _this.resumeWith(ctx, childCtx.sessionPersistence, {
                        resumeSessionId: resumeSessionId,
                        agentOptions: options,
                    }).catch(function (error) {
                        _this.reportConfiguredStartupFailure(id, 'resume', resumeSessionId, error);
                    });
                });
                return fiber.dispose;
            }, "agentLoop.resume(".concat(id, ")"));
        };
        var this_1 = this;
        for (var _i = 0, _a = _this.config.agents; _i < _a.length; _i++) {
            var _b = _a[_i];
            _loop_1(_b);
        }
        return _this;
    }
    /** Report a contained declarative-start failure to identity-bound consumers. */
    AgentLoop.prototype.reportConfiguredStartupFailure = function (configId, action, sessionId, error) {
        var _this = this;
        if (!this.ownership.isActive())
            return;
        this.ctx.logger.warn("agent \"".concat(configId, "\": config-driven ").concat(action, " of \"").concat(sessionId, "\" failed: ").concat((0, dsh_llm_1.errorChain)(error)));
        var args = ['agent-loop/config-start-failed', { sessionId: sessionId, error: error }];
        for (var _i = 0, _a = this.ctx.events.dispatch('emit', args); _i < _a.length; _i++) {
            var callback = _a[_i];
            try {
                var returned = callback.apply(void 0, args);
                void Promise.resolve(returned).catch(function (listenerError) {
                    _this.ctx.logger.warn("agent \"".concat(configId, "\": config-start-failed listener rejected: ").concat((0, dsh_llm_1.errorChain)(listenerError)));
                });
            }
            catch (listenerError) {
                this.ctx.logger.warn("agent \"".concat(configId, "\": config-start-failed listener threw: ").concat((0, dsh_llm_1.errorChain)(listenerError)));
            }
        }
    };
    /** Restore a materialized exact config identity on remount, or create it on first use. */
    AgentLoop.prototype.restoreOrCreateConfigured = function (ownerCtx, persistence, sessionId, agentOptions, meta) {
        return __awaiter(this, void 0, void 0, function () {
            var error_2, exists;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.waitForDrainingConfiguredIdentity(ownerCtx, sessionId)];
                    case 1:
                        _a.sent();
                        if (!this.ownership.isActive())
                            return [2 /*return*/];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 6]);
                        return [4 /*yield*/, this.resumeWith(ownerCtx, persistence, { resumeSessionId: sessionId, agentOptions: agentOptions })];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                    case 4:
                        error_2 = _a.sent();
                        if (!this.ownership.isActive())
                            return [2 /*return*/];
                        return [4 /*yield*/, persistence.list()];
                    case 5:
                        exists = (_a.sent()).some(function (header) { return header.id === sessionId; });
                        if (exists)
                            throw error_2;
                        return [3 /*break*/, 6];
                    case 6:
                        this.create(sessionId, agentOptions, meta);
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Wait for a draining same-id lifecycle to finish registry teardown. */
    AgentLoop.prototype.waitForDrainingConfiguredIdentity = function (ownerCtx, sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var released, checkReleased, disposeAgentListener, disposeSessionListener;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // Only an id still occupying a registry needs waiting for; a live healthy
                        // occupant is a collision the create/resume below will surface itself.
                        if (ownerCtx.agents.get(sessionId) === undefined && ownerCtx.sessions.get(sessionId) === undefined)
                            return [2 /*return*/];
                        released = Promise.withResolvers();
                        checkReleased = function () {
                            if (ownerCtx.agents.get(sessionId) === undefined && ownerCtx.sessions.get(sessionId) === undefined) {
                                released.resolve();
                            }
                        };
                        disposeAgentListener = ownerCtx.on('agent/disposed', function () { checkReleased(); });
                        disposeSessionListener = ownerCtx.on('session/disposed', checkReleased);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 3, 4]);
                        checkReleased();
                        return [4 /*yield*/, this.ownership.waitWhileActive(released.promise)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        disposeAgentListener();
                        disposeSessionListener();
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Construct the driver, scope, and one memoized reverse teardown for a new
     * agent. The teardown is registered with the factory and the owner fiber
     * BEFORE publication, so a mid-setup unload rolls everything back; `signal`
     * fuses caller cancellation with lifecycle teardown for setup awaits.
     */
    AgentLoop.prototype.prepare = function (ownerCtx, id, options, session, callerSignal) {
        var _this = this;
        assertAgentOptions(options);
        ownerCtx.fiber.assertActive();
        // Every caller reaches prepare() synchronously from a service method
        // whose Cordis dispatch already requires the live factory fiber, or
        // re-checks ownership itself after its awaits (resume's load barrier).
        /* v8 ignore next -- unreachable backstop, see above */
        if (!this.ownership.isActive())
            throw new Error('agent loop is not active');
        if (callerSignal === null || callerSignal === void 0 ? void 0 : callerSignal.aborted) {
            throw callerSignal.reason instanceof Error
                ? callerSignal.reason
                : new Error("agent \"".concat(id, "\" creation aborted"), { cause: callerSignal.reason });
        }
        var loopCtx = this.runtime.ctx;
        // Deactivation fuses three owners, each with its own reason: the caller's
        // cancellation signal, the owner fiber's unload, and factory teardown.
        // It is registered BEFORE any resource exists, over mutable slots, so an
        // unload arriving while the scope is still minting finds a working
        // disposer instead of a leak.
        var abort = new AbortController();
        var onCallerAbort = function () {
            abort.abort((callerSignal === null || callerSignal === void 0 ? void 0 : callerSignal.reason) instanceof Error
                ? callerSignal.reason
                : new Error("agent \"".concat(id, "\" creation aborted"), { cause: callerSignal === null || callerSignal === void 0 ? void 0 : callerSignal.reason }));
        };
        var onFactoryTeardown = function () { abort.abort(_this.ownership.signal.reason); };
        callerSignal === null || callerSignal === void 0 ? void 0 : callerSignal.addEventListener('abort', onCallerAbort, { once: true });
        this.ownership.signal.addEventListener('abort', onFactoryTeardown, { once: true });
        var machine;
        var detachSession;
        var detachAgent;
        var disposing;
        var machineReady = Promise.withResolvers();
        // Reverse teardown, memoized so every racing owner awaits one quiescence:
        // stop the machine, leave the registries, unwind the scope, release
        // bookkeeping.
        var dispose = function (ownerTriggered) {
            if (ownerTriggered === void 0) { ownerTriggered = false; }
            return (disposing !== null && disposing !== void 0 ? disposing : (disposing = (function () { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            abort.abort(new Error("agent \"".concat(id, "\" lifecycle disposed")));
                            callerSignal === null || callerSignal === void 0 ? void 0 : callerSignal.removeEventListener('abort', onCallerAbort);
                            this.ownership.signal.removeEventListener('abort', onFactoryTeardown);
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, , 7, 12]);
                            if (!(machine === undefined)) return [3 /*break*/, 3];
                            return [4 /*yield*/, machineReady.promise];
                        case 2:
                            _a.sent();
                            _a.label = 3;
                        case 3:
                            if (!(machine !== undefined)) return [3 /*break*/, 6];
                            machine.cancel({ kind: 'disposed' });
                            return [4 /*yield*/, machine.whenIdle()];
                        case 4:
                            _a.sent();
                            return [4 /*yield*/, machine.scope.dispose()];
                        case 5:
                            _a.sent();
                            _a.label = 6;
                        case 6: return [3 /*break*/, 12];
                        case 7:
                            _a.trys.push([7, , 8, 11]);
                            detachAgent === null || detachAgent === void 0 ? void 0 : detachAgent();
                            detachSession === null || detachSession === void 0 ? void 0 : detachSession();
                            return [3 /*break*/, 11];
                        case 8:
                            untrack();
                            if (!!ownerTriggered) return [3 /*break*/, 10];
                            return [4 /*yield*/, unfollowOwner()];
                        case 9:
                            _a.sent();
                            _a.label = 10;
                        case 10: return [7 /*endfinally*/];
                        case 11: return [7 /*endfinally*/];
                        case 12: return [2 /*return*/];
                    }
                });
            }); })()));
        };
        var untrack = this.ownership.track(dispose);
        var unfollowOwner;
        try {
            unfollowOwner = ownerCtx.effect(function () { return function () {
                // Owner disposal owns the same quiescence boundary. Its teardown skips
                // unregistering this already-running owner effect from inside itself.
                if (disposing !== undefined)
                    return;
                abort.abort(new Error("agent \"".concat(id, "\" setup aborted: owner disposed during setup")));
                return dispose(true);
            }; }, "agentLoop.lifecycle(".concat(id, ")"));
            /* v8 ignore start -- ctx.effect throws only on an inactive fiber, which assertActive() above already rejected */
        }
        catch (error) {
            untrack();
            callerSignal === null || callerSignal === void 0 ? void 0 : callerSignal.removeEventListener('abort', onCallerAbort);
            this.ownership.signal.removeEventListener('abort', onFactoryTeardown);
            throw error;
        }
        /* v8 ignore stop */
        var assertLive = function () {
            if (!abort.signal.aborted)
                return;
            // Every fused abort source carries an Error reason: onCallerAbort and
            // raceAbort wrap non-Error caller reasons, and the factory/lifecycle
            // owners abort with constructed Errors.
            /* v8 ignore next -- unreachable String() arm, see above */
            throw abort.signal.reason instanceof Error ? abort.signal.reason : new Error(String(abort.signal.reason));
        };
        try {
            var agent_1 = machine = new agent_ts_1.ReactLoopAgent(loopCtx, id, options, session);
            machineReady.resolve();
            assertLive();
            return {
                agent: agent_1,
                signal: abort.signal,
                publish: function (source) {
                    assertLive();
                    detachSession = agent_1.ctx.sessions.enter(session);
                    detachAgent = loopCtx.agents.enter(agent_1, ownerCtx.agent);
                    agent_1.ctx.sessions.announce(session);
                    assertLive();
                    loopCtx.agents.announce(agent_1);
                    assertLive();
                    // A synchronous announce/session-start listener may have started
                    // teardown; the machine is already live (delivery works from the
                    // session-start extension point), so only the liveness recheck is owed.
                    (0, dsh_agent_1.emitAgentEvent)(loopCtx, agent_1, 'agent/session-start', { source: source });
                    assertLive();
                    return { agent: agent_1, dispose: dispose };
                },
                dispose: dispose,
            };
        }
        catch (error) {
            machineReady.resolve();
            void dispose();
            throw error;
        }
    };
    /**
     * Create an agent and session under one caller-supplied identity, owned by
     * the accessing fiber. Constructor-driven config calls mint a fresh combined
     * id before entering this boundary.
     * @param id - shared agent/session identity.
     * @param options - concrete loop options.
     * @param meta - optional fresh-session workspace metadata.
     * @returns the published running agent.
     */
    AgentLoop.prototype.create = function (id, options, meta) {
        if (options === void 0) { options = {}; }
        if (meta === void 0) { meta = {}; }
        var env_1 = { stack: [], error: void 0, hasError: false };
        try {
            var preparation = __addDisposableResource(env_1, dsh_session_1.SessionPreparation.create(this.runtime.ctx.sessions.prepare(id, { meta: meta })), false);
            var prepared = this.prepare(this.ctx, id, options, preparation.session);
            try {
                return prepared.publish('startup').agent;
            }
            catch (error) {
                void prepared.dispose();
                throw error;
            }
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    };
    /**
     * Create an owned agent on a caller-supplied session id.
     * @param ownerCtx - caller context that structurally owns the lifecycle.
     * @param options - identities, session seed/metadata, loop options, setup, and cancellation.
     * @returns the published handle.
     */
    AgentLoop.prototype.createAgent = function (ownerCtx, options) {
        return __awaiter(this, void 0, void 0, function () {
            var preparation, published;
            var _a;
            return __generator(this, function (_b) {
                preparation = dsh_session_1.SessionPreparation.create(this.runtime.ctx.sessions.prepare(options.sessionId, __assign(__assign({}, options.seed === undefined ? {} : { seed: options.seed }), options.meta === undefined ? {} : { meta: options.meta })));
                published = this.setupAndPublish(ownerCtx, options.sessionId, preparation, (_a = options.agentOptions) !== null && _a !== void 0 ? _a : {}, options.setup, options.signal, 'startup');
                this.ownership.trackWrapper(published);
                return [2 /*return*/, published];
            });
        });
    };
    /** Prepare one Agent around an acquired Session, run setup, and publish it. */
    AgentLoop.prototype.setupAndPublish = function (ownerCtx, id, preparation, agentOptions, setup, signal, source) {
        return __awaiter(this, void 0, void 0, function () {
            var env_2, ownedPreparation, session, prepared, setupCommit, error_3, e_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        env_2 = { stack: [], error: void 0, hasError: false };
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, 8, 9]);
                        ownedPreparation = __addDisposableResource(env_2, preparation, false);
                        session = ownedPreparation.session;
                        prepared = this.prepare(ownerCtx, id, agentOptions, session, signal);
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 6]);
                        return [4 /*yield*/, raceAbort(setup === null || setup === void 0 ? void 0 : setup(prepared.agent.ctx), prepared.signal, id)];
                    case 3:
                        setupCommit = _a.sent();
                        setupCommit === null || setupCommit === void 0 ? void 0 : setupCommit.commit();
                        return [2 /*return*/, prepared.publish(source)];
                    case 4:
                        error_3 = _a.sent();
                        return [4 /*yield*/, prepared.dispose()];
                    case 5:
                        _a.sent();
                        throw error_3;
                    case 6: return [3 /*break*/, 9];
                    case 7:
                        e_2 = _a.sent();
                        env_2.error = e_2;
                        env_2.hasError = true;
                        return [3 /*break*/, 9];
                    case 8:
                        __disposeResources(env_2);
                        return [7 /*endfinally*/];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Resume an owned agent from the configured persistence service.
     * @param ownerCtx - caller context that owns load, setup, and the live lifecycle.
     * @param options - persisted identity, loop options, setup, and cancellation.
     * @returns the published handle.
     */
    AgentLoop.prototype.resume = function (ownerCtx, options) {
        return __awaiter(this, void 0, void 0, function () {
            var persistence;
            return __generator(this, function (_a) {
                persistence = this.runtime.ctx.get('sessionPersistence');
                if (persistence === undefined) {
                    throw new Error('cannot resume: session persistence is not configured (load a dsh-session-persistence backend)');
                }
                return [2 /*return*/, this.resumeWith(ownerCtx, persistence, options)];
            });
        });
    };
    /** Resume through an explicit persistence handle used by the deferred config path. */
    AgentLoop.prototype.resumeWith = function (ownerCtx, persistence, options) {
        var _this = this;
        var id = options.resumeSessionId;
        var published = (function () { return __awaiter(_this, void 0, void 0, function () {
            var ownerAbort, unfollowOwner, fused, preparation;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        ownerAbort = new AbortController();
                        unfollowOwner = ownerCtx.effect(function () { return function () {
                            ownerAbort.abort(new Error("agent \"".concat(id, "\" setup aborted: owner disposed during setup")));
                        }; }, "agentLoop.resume-load(".concat(id, ")"));
                        fused = AbortSignal.any(__spreadArray(__spreadArray([], options.signal === undefined ? [] : [options.signal], true), [
                            ownerAbort.signal,
                            this.ownership.signal,
                        ], false));
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, , 8, 9]);
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, , 4, 6]);
                        return [4 /*yield*/, raceAbortCall(function () { return persistence.prepare(id, fused); }, fused, id, function (abandoned) { abandoned[Symbol.dispose](); })];
                    case 3:
                        preparation = _b.sent();
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, unfollowOwner()];
                    case 5:
                        _b.sent();
                        return [7 /*endfinally*/];
                    case 6:
                        ownerCtx.fiber.assertActive();
                        if (!this.ownership.isActive())
                            throw new Error('agent loop is not active');
                        return [4 /*yield*/, this.setupAndPublish(ownerCtx, id, preparation, (_a = options.agentOptions) !== null && _a !== void 0 ? _a : {}, options.setup, options.signal, 'resume')];
                    case 7: return [2 /*return*/, _b.sent()];
                    case 8:
                        preparation === null || preparation === void 0 ? void 0 : preparation[Symbol.dispose]();
                        return [7 /*endfinally*/];
                    case 9: return [2 /*return*/];
                }
            });
        }); })();
        this.ownership.trackWrapper(published);
        return published;
    };
    AgentLoop.inject = ['agents', 'sessions', 'llm', 'tools', 'systemPrompt'];
    /** Runtime schema for declarative agents. */
    AgentLoop.Config = schemastery_1.default.object({
        maxParallelToolCalls: schemastery_1.default.number().step(1).min(1).default(constants_ts_1.DEFAULT_MAX_PARALLEL_TOOL_CALLS),
        agents: schemastery_1.default.array(schemastery_1.default.object({
            id: schemastery_1.default.string().required(),
            sessionId: schemastery_1.default.string().min(1),
            provider: schemastery_1.default.string(),
            model: schemastery_1.default.string(),
            maxTokens: schemastery_1.default.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
            cwd: schemastery_1.default.string(),
            resumeSessionId: schemastery_1.default.string(),
        })).default([]),
    });
    return AgentLoop;
}(cordis_1.Service));
exports.AgentLoop = AgentLoop;
exports.default = AgentLoop;
