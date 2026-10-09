"use strict";
/**
 * Agent service: live registry, factory delegation, and process-local
 * initiator scope. Concrete creation and driving belong to the loop.
 *
 * @module @z/dsh-agent
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
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
exports.AgentRegistry = exports.emitAgentEvent = exports.assembleContextFor = exports.agentEvents = exports.agentCarrier = void 0;
var cordis_1 = require("@z/cordis");
var node_async_hooks_1 = require("node:async_hooks");
var types_1 = require("node:util/types");
var dsh_scope_1 = require("@z/dsh-scope");
__exportStar(require("./runtime-types.ts"), exports);
__exportStar(require("./types.ts"), exports);
__exportStar(require("./inbox.ts"), exports);
__exportStar(require("./consumed-work.ts"), exports);
__exportStar(require("./model-selection.ts"), exports);
var dispatch_ts_1 = require("./dispatch.ts");
Object.defineProperty(exports, "agentCarrier", { enumerable: true, get: function () { return dispatch_ts_1.agentCarrier; } });
Object.defineProperty(exports, "agentEvents", { enumerable: true, get: function () { return dispatch_ts_1.agentEvents; } });
Object.defineProperty(exports, "assembleContextFor", { enumerable: true, get: function () { return dispatch_ts_1.assembleContextFor; } });
Object.defineProperty(exports, "emitAgentEvent", { enumerable: true, get: function () { return dispatch_ts_1.emitAgentEvent; } });
/** Thrown when create/resume is called before an agent factory is registered. */
var NO_FACTORY_MESSAGE = 'no agent factory registered (load an agent-loop plugin)';
var NO_INITIATOR_MESSAGE = 'no initiating agent is active';
var DISPOSED_INITIATOR_MESSAGE = 'agent initiator scope is disposed';
/**
 * Agent service (`ctx.agents`): tracks live agents and carries the initiating
 * Agent through one process-local asynchronous driver chain. Agent *creation*
 * is provided by whichever plugin implements the {@link AgentFactory}
 * (`@z/dsh-agent-loop`), registered via {@link setFactory}.
 *
 * Initiator methods provide same-process causal attribution only. Ambient
 * presence is neither liveness proof nor authorization; subjects and owners
 * remain explicit, as does identity at worker, process, persistence, and wire
 * boundaries. Returned Promise boundaries drain during teardown, except a
 * nested lineage that starts an owning-fiber unload is excluded from its own drain.
 */
var AgentRegistry = /** @class */ (function (_super) {
    __extends(AgentRegistry, _super);
    function AgentRegistry(ctx) {
        var _this = _super.call(this, ctx, 'agents') || this;
        _this.store = new Map();
        _this.initiators = new node_async_hooks_1.AsyncLocalStorage();
        _this.initiatorRuns = new node_async_hooks_1.AsyncLocalStorage();
        _this.initiatorState = 'active';
        _this.activeInitiatorRuns = 0;
        ctx.inject(['typert'], function (typeCtx) {
            typeCtx.typert.lookups.register('agent', {
                parameter: 'agent',
                wire: 'agentId',
                hostTypeSymbol: '@z/dsh-agent#Agent',
                wireTypeSymbol: '@z/dsh-session/types#SessionId',
                resolve: function (sessionId) { return _this.get(sessionId); },
            });
            typeCtx.typert.contexts.registerHost('agent', {
                wire: 'agentId',
                wireTypeSymbol: '@z/dsh-session/types#SessionId',
                resolve: function (sessionId) { var _a; return (_a = _this.get(sessionId)) === null || _a === void 0 ? void 0 : _a.ctx; },
            });
        });
        // The `ctx.agent` DX accessor: default `undefined` on every context, so a
        // plain plugin context reads cleanly instead of hitting the Cordis
        // unknown-property throw. Each Agent.ctx shadows it with an own property
        // (own properties resolve before the context proxy is consulted), so the
        // accessor body never needs to resolve a scope itself. Effect-scoped:
        // unwinds with this service's fiber.
        ctx.accessor('agent', { get: function () { return undefined; } });
        ctx.on('internal/status', function (fiber) {
            if (fiber.state === cordis_1.FiberState.UNLOADING && _this.hasLifecycleAncestor(fiber)) {
                _this.closeInitiators();
            }
        });
        ctx.effect(function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, function () { return _this.disposeInitiators(); }];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, function () { _this.closeInitiators(); }];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }.bind(_this), 'agents.initiatorLifecycle()');
        return _this;
    }
    /**
     * Read the Agent that initiated the inherited asynchronous driver chain.
     * Use this optional form for logging, tracing, metrics, or host attribution
     * that also supports agentless calls. When a parent creates a child, setup
     * reports the causal parent while `agentCtx.agent` identifies the child.
     * @returns the inherited Agent, or `undefined` outside an initiator boundary
     *   and inside an explicit clearing boundary.
     * @throws when this service instance has been disposed.
     */
    AgentRegistry.prototype.currentInitiator = function () {
        this.assertInitiatorsReadable();
        return this.initiators.getStore();
    };
    /**
     * Read the initiating Agent and fail when no initiator boundary is active.
     * Use this for private helpers contractually below a driver, or for a
     * deployment-owned outbound request whose contract forbids agentless calls.
     * Generic or direct-call paths use optional lookup or explicit request fields.
     * @returns the inherited Agent.
     * @throws when no initiator is active or this service instance has been disposed.
     */
    AgentRegistry.prototype.requireInitiator = function () {
        var agent = this.currentInitiator();
        if (agent === undefined)
            throw new Error(NO_INITIATOR_MESSAGE);
        return agent;
    };
    /**
     * Run an operation with one exact Agent as its process-local initiator. The
     * exact synchronous value or Promise returned by the operation is preserved.
     * Custom drivers and test harnesses wrap their complete returned foreground
     * lifetime.
     * A queue or wire receiver may establish this boundary only after validating
     * explicit identity and resolving the exact live Agent; this method does neither.
     * Detached work remains owned by the subsystem that starts it.
     * @param agent - initiating Agent to inherit; presence is neither liveness proof nor authorization.
     * @param operation - synchronous or asynchronous operation to invoke.
     * @returns the exact value returned by `operation`.
     * @throws when the initiator scope is closing/disposed, or when `operation` throws.
     */
    AgentRegistry.prototype.withInitiator = function (agent, operation) {
        return this.runWithInitiator(agent, operation);
    };
    /**
     * Run an operation inside a boundary that hides any inherited initiating
     * Agent. The exact synchronous value or Promise is preserved.
     * Use this while creating lazy shared timers, queue pumps, pool maintenance,
     * watchers, or exporters so they do not inherit the first Agent that happens
     * to initialize them. It clears only initiator attribution, not explicit
     * fields, and does not own or drain detached resources.
     * @param operation - synchronous or asynchronous operation to invoke without an initiator.
     * @returns the exact value returned by `operation`.
     * @throws when the initiator scope is closing/disposed, or when `operation` throws.
     */
    AgentRegistry.prototype.withoutInitiator = function (operation) {
        return this.runWithInitiator(undefined, operation);
    };
    /**
     * Register the agent-creation factory (the loop calls this on construction,
     * effect-scoped). A traced Cordis service is canonicalized to its concrete
     * target; each create/resume call is then traced through that caller's
     * context so ownership follows the caller without stacking proxy layers.
     * Throws if a factory is already registered. Returns the disposer; on
     * dispose the factory slot is cleared.
     * @param factory - the loop-owned factory {@link create}/{@link resume} delegate to.
     * @returns the disposer that clears the factory slot. The exact
     *   Cordis effect disposer (single-shot): composite (generator) effects may
     *   yield it directly — exact identity nests the teardown in order.
     */
    AgentRegistry.prototype.setFactory = function (factory) {
        var _this = this;
        var dispose = this.ctx.effect(function () {
            var _a;
            if (_this.factory !== undefined)
                throw new Error('an agent factory is already registered');
            // Avoid stacking two Cordis shadow layers when a caller passes a Service
            // already read through a context. Calls are re-traced through their
            // actual owner context below.
            var target = (_a = factory[cordis_1.symbols.original]) !== null && _a !== void 0 ? _a : factory;
            _this.factory = { target: target };
            return function () { _this.factory = undefined; };
        }, 'agents.setFactory()');
        // The exact cordis effect disposer (the agents.register() convention): a
        // caller's composite effect can yield it for in-order teardown; the
        // loop's constructor effect returns it directly, identity-nesting the
        // registration under that effect.
        // oxlint-disable-next-line typescript/no-misused-promises -- synchronous cleanup; direct return preserves disposer identity
        return dispose;
    };
    /** Return the active creation factory. */
    AgentRegistry.prototype.requireFactory = function () {
        if (this.factory === undefined)
            throw new Error(NO_FACTORY_MESSAGE);
        return this.factory;
    };
    /**
     * Create and publish a new agent through the registered factory.
     * Distinct from {@link register} (which records an already-constructed
     * agent): this constructs the agent and its session. Rejects if no factory is
     * registered or creation/setup fails. The resolved {@link AgentHandle} lets
     * the owner tear down exactly this agent.
     * @param options - shared identity, session seed/metadata, and agent options.
     * @returns the handle after setup, rollback-covered publication, and loop start complete.
     */
    AgentRegistry.prototype.create = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var ownerCtx, target, receiver;
            return __generator(this, function (_a) {
                ownerCtx = this.ctx;
                target = this.requireFactory().target;
                receiver = (0, cordis_1.getTraceable)(ownerCtx, target);
                // oxlint-disable-next-line typescript/unbound-method -- Reflect.apply intentionally supplies the caller-traced receiver
                return [2 /*return*/, Reflect.apply(target.createAgent, receiver, [ownerCtx, options])];
            });
        });
    };
    /**
     * Load a persisted session and resume an agent on it through the registered
     * factory. Rejects if no factory is registered; the factory rejects if
     * session persistence is not configured or persistence/setup fails.
     * @param options - persisted identity, configuration, and optional setup.
     * @returns the handle after setup, rollback-covered publication, and loop start complete.
     */
    AgentRegistry.prototype.resume = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var ownerCtx, target, receiver;
            return __generator(this, function (_a) {
                ownerCtx = this.ctx;
                target = this.requireFactory().target;
                receiver = (0, cordis_1.getTraceable)(ownerCtx, target);
                // oxlint-disable-next-line typescript/unbound-method -- Reflect.apply intentionally supplies the caller-traced receiver
                return [2 /*return*/, Reflect.apply(target.resume, receiver, [ownerCtx, options])];
            });
        });
    };
    /**
     * Register a live agent. Throws if an agent with the same id is already
     * registered. Emits `agent/created` on registration and `agent/disposed`
     * when the calling fiber is disposed — both with the agent's scope carrier
     * (`scopeTarget(agent, agent)`): the subject is the agent in hand, so the
     * emits are scope-filtered regardless of which context invoked `register`
     * (calling through `agent.ctx` scopes EFFECTS; dispatch scoping always
     * requires passing the carrier). Returns the disposer.
     * @param agent - the already-constructed agent to record in the store.
     * @returns the EXACT Cordis effect disposer (single-shot; a repeat call
     *   returns undefined without awaiting an in-flight teardown). Exact
     *   identity is load-bearing: a composite (generator) effect that owns a
     *   teardown ORDER — the agent factory's lifecycle chain — must yield THIS
     *   function so Cordis nests the unregistration at that yield position;
     *   yielding a wrapper would leave it disposing as a concurrent sibling on
     *   owner unload, unregistering the agent (and emitting `agent/disposed`)
     *   while its final turn is still draining.
     */
    AgentRegistry.prototype.register = function (agent) {
        var dispose = this.ctx.effect(function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.enter(agent, this.ctx.agent)];
                    case 1:
                        _a.sent();
                        this.announce(agent);
                        return [2 /*return*/];
                }
            });
        }.bind(this), 'agents.register()');
        // oxlint-disable-next-line typescript/no-misused-promises -- synchronous cleanup; direct return preserves disposer identity
        return dispose;
    };
    /**
     * Insert an already-constructed agent without announcing it. This is the
     * advanced ordered-lifecycle primitive used by the async agent factory: it
     * first completes setup while the agent is unpublished, then assigns the
     * returned detach closure into its pre-installed composite teardown before
     * calling {@link announce}. Ordinary callers use {@link register}.
     * @param agent - the prepared, unpublished agent.
     * @param owner - live agent whose scoped context created this agent, or
     *   undefined for a top-level runtime root. This is runtime ownership, not
     *   the resumed session's durable parent lineage.
     * @returns an idempotent closure that removes this exact entry and emits
     *   `agent/disposed` with listener failures contained. When called from a
     *   synchronous `agent/created` listener, removal and disposal wait until
     *   that creation dispatch unwinds.
     */
    AgentRegistry.prototype.enter = function (agent, owner) {
        var _this = this;
        var id = agent.id;
        if (id !== agent.session.id) {
            throw new Error("agent id \"".concat(id, "\" does not match session id \"").concat(agent.session.id, "\""));
        }
        var carrier = (0, dsh_scope_1.scopeTarget)(agent, agent);
        // This is the authoritative collision boundary. Concurrent create/resume
        // operations may both prepare, but only one exact entry can publish.
        if (this.store.has(id))
            throw new Error("agent \"".concat(id, "\" is already registered"));
        var entry = {
            id: id,
            agent: agent,
            owner: owner,
            carrier: carrier,
            announced: false,
            announcing: false,
            detachRequested: false,
        };
        this.store.set(id, entry);
        var entered = true;
        var detach = function () {
            if (!entered)
                return;
            entered = false;
            // Every callback reached by this creation dispatch must observe the same
            // live entry, and disposal must follow creation. A listener may own
            // the advanced detach capability, so make that ordering structural:
            // visibility and the paired disposal are deferred until announce()'s
            // synchronous dispatch has unwound.
            if (entry.announcing) {
                entry.detachRequested = true;
                return;
            }
            _this.detachEntered(entry);
        };
        return detach;
    };
    /** Remove one exact entered agent and emit its paired disposal when announced. */
    AgentRegistry.prototype.detachEntered = function (entry) {
        entry.detachRequested = false;
        // A stale capability can never delete a later same-id lifecycle. The
        // captured entry identity is the final boundary.
        /* v8 ignore next -- enter() rejects replacement while this single-shot detach capability is live. */
        if (this.store.get(entry.id) !== entry)
            return;
        this.store.delete(entry.id);
        // An insertion rolled back before announce was never externally created,
        // so emitting disposed would invent an impossible lifecycle edge. Marking
        // happens before the created emit: if a later created listener throws,
        // earlier listeners may already have observed it and must see disposal.
        if (!entry.announced)
            return;
        this.emitDisposed(entry);
    };
    /** Emit the paired disposal edge through the entry's stable carrier. */
    AgentRegistry.prototype.emitDisposed = function (entry) {
        var _this = this;
        var args = [entry.carrier, 'agent/disposed', { agent: entry.agent }];
        for (var _i = 0, _a = this.ctx.events.dispatch('emit', args); _i < _a.length; _i++) {
            var callback = _a[_i];
            try {
                var returned = callback.apply(void 0, args);
                void Promise.resolve(returned).catch(function (error) {
                    _this.ctx.logger.warn("agent \"".concat(entry.id, "\": agent/disposed listener rejected: ").concat(String(error)));
                });
            }
            catch (error) {
                this.ctx.logger.warn("agent \"".concat(entry.id, "\": agent/disposed listener threw: ").concat(String(error)));
            }
        }
    };
    /**
     * Announce an agent previously inserted with {@link enter}.
     * @param agent - the live inserted agent to announce.
     * @throws if `agent` is not the exact live registry entry for its id, or its
     *   creation announcement already began (including a reentrant call from a
     *   creation listener).
     */
    AgentRegistry.prototype.announce = function (agent) {
        var _this = this;
        var entry = this.store.get(agent.id);
        if (entry === undefined || entry.agent !== agent) {
            throw new Error("agent \"".concat(agent.id, "\" is not live in this registry"));
        }
        if (entry.announced || entry.announcing) {
            throw new Error("agent \"".concat(entry.id, "\" was already announced"));
        }
        // Mark before dispatch so a listener cannot recursively create a second
        // lifecycle edge; detach still pairs a partially delivered first edge.
        entry.announcing = true;
        entry.announced = true;
        var args = [entry.carrier, 'agent/created', { agent: entry.agent }];
        try {
            for (var _i = 0, _a = this.ctx.events.dispatch('emit', args); _i < _a.length; _i++) {
                var callback = _a[_i];
                // A synchronous creation failure vetoes publication and rolls back.
                // Returned-promise rejection happens after this synchronous boundary, so
                // observe and report it instead of leaking an unhandled rejection.
                var returned = callback.apply(void 0, args);
                void Promise.resolve(returned).catch(function (error) {
                    _this.ctx.logger.warn("agent \"".concat(entry.id, "\": agent/created listener rejected: ").concat(String(error)));
                });
            }
        }
        finally {
            entry.announcing = false;
            if (entry.detachRequested)
                this.detachEntered(entry);
        }
    };
    /**
     * Look up a live agent.
     * @param id - the shared agent/session id to look up.
     * @returns the agent, or undefined when no live agent has that id.
     */
    AgentRegistry.prototype.get = function (id) {
        var _a;
        return (_a = this.store.get(id)) === null || _a === void 0 ? void 0 : _a.agent;
    };
    /**
     * Test whether a live agent was created through one exact parent agent's
     * scoped context. Runtime ownership is independent of durable session
     * lineage and remains unambiguous when unrelated providers reuse an id.
     * @param id - the candidate child agent's shared agent/session id.
     * @param owner - the expected runtime creator agent.
     * @returns true only while the exact child entry is live under that owner.
     */
    AgentRegistry.prototype.isOwnedBy = function (id, owner) {
        var _a;
        return ((_a = this.store.get(id)) === null || _a === void 0 ? void 0 : _a.owner) === owner;
    };
    /**
     * All live agents, in registration order.
     * @returns a fresh array; mutating it does not affect the registry.
     */
    AgentRegistry.prototype.list = function () {
        return __spreadArray([], this.store.values(), true).map(function (entry) { return entry.agent; });
    };
    /**
     * All live top-level agents in registration order. A top-level agent was
     * created without an owning agent context; durable session lineage does not
     * affect this runtime relation, so a resumed fork may still be a root.
     * @returns a fresh array; mutating it does not affect the registry.
     */
    AgentRegistry.prototype.roots = function () {
        return __spreadArray([], this.store.values(), true).filter(function (entry) { return entry.owner === undefined; })
            .map(function (entry) { return entry.agent; });
    };
    /** Reject new initiator boundaries while inherited continuations drain. */
    AgentRegistry.prototype.closeInitiators = function () {
        if (this.initiatorState === 'active')
            this.initiatorState = 'closing';
    };
    /** Wait for returned-Promise boundaries, then invalidate retained references. */
    AgentRegistry.prototype.disposeInitiators = function () {
        var _this = this;
        var _a;
        return ((_a = this.initiatorDisposal) !== null && _a !== void 0 ? _a : (this.initiatorDisposal = (function () { return __awaiter(_this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        this.closeInitiators();
                        this.releaseReentrantInitiatorRuns();
                        if (!(this.activeInitiatorRuns !== 0)) return [3 /*break*/, 2];
                        (_a = this.initiatorDrain) !== null && _a !== void 0 ? _a : (this.initiatorDrain = Promise.withResolvers());
                        return [4 /*yield*/, this.initiatorDrain.promise];
                    case 1:
                        _b.sent();
                        _b.label = 2;
                    case 2:
                        this.initiatorState = 'disposed';
                        this.initiators.disable();
                        this.initiatorRuns.disable();
                        return [2 /*return*/];
                }
            });
        }); })()));
    };
    /** Establish one tracked initiator or clearing boundary. */
    AgentRegistry.prototype.runWithInitiator = function (agent, operation) {
        var _this = this;
        if (this.initiatorState !== 'active')
            throw new Error(DISPOSED_INITIATOR_MESSAGE);
        var run = {
            active: true,
            parent: this.initiatorRuns.getStore(),
        };
        this.activeInitiatorRuns += 1;
        var result;
        try {
            result = this.initiatorRuns.run(run, function () { return _this.initiators.run(agent, operation); });
        }
        catch (error) {
            this.releaseInitiatorRun(run);
            throw error;
        }
        if ((0, types_1.isPromise)(result)) {
            try {
                void Promise.prototype.then.call(result, function () { _this.releaseInitiatorRun(run); }, function () { _this.releaseInitiatorRun(run); });
            }
            catch (_a) {
                // A branded Promise may expose a failing @@species. Observer setup did
                // not attach, so preserve the exact return without leaking the run.
                this.releaseInitiatorRun(run);
            }
        }
        else {
            this.releaseInitiatorRun(run);
        }
        return result;
    };
    /** Whether one unloading fiber owns this service's lifecycle. */
    AgentRegistry.prototype.hasLifecycleAncestor = function (candidate) {
        var fiber = this.ctx.fiber;
        while (true) {
            if (fiber === candidate)
                return true;
            var parent_1 = fiber.parent.fiber;
            if (parent_1 === fiber)
                return false;
            fiber = parent_1;
        }
    };
    AgentRegistry.prototype.assertInitiatorsReadable = function () {
        if (this.initiatorState === 'disposed')
            throw new Error(DISPOSED_INITIATOR_MESSAGE);
    };
    /** Exclude the boundary chain that initiated this teardown from its own drain. */
    AgentRegistry.prototype.releaseReentrantInitiatorRuns = function () {
        var run = this.initiatorRuns.getStore();
        while (run !== undefined) {
            this.releaseInitiatorRun(run);
            run = run.parent;
        }
    };
    AgentRegistry.prototype.releaseInitiatorRun = function (run) {
        var _a;
        if (!run.active)
            return;
        run.active = false;
        this.activeInitiatorRuns -= 1;
        if (this.activeInitiatorRuns !== 0)
            return;
        (_a = this.initiatorDrain) === null || _a === void 0 ? void 0 : _a.resolve();
        this.initiatorDrain = undefined;
    };
    return AgentRegistry;
}(cordis_1.Service));
exports.AgentRegistry = AgentRegistry;
exports.default = AgentRegistry;
