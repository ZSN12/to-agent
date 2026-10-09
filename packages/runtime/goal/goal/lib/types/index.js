"use strict";
/**
 * Same-session goal domain: event-sourced state, compare-and-set mutations,
 * and process-local continuation activation.
 * @module @z/dsh-goal
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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoalService = exports.goalChangeRef = exports.foldGoal = exports.decodeGoalChange = exports.GoalId = exports.GoalError = exports.GOAL_CHANGE_VERSION = void 0;
exports.applyGoalProjection = applyGoalProjection;
var node_crypto_1 = require("node:crypto");
var schemastery_1 = require("@z/schemastery");
var zod_1 = require("zod");
var dsh_agent_1 = require("@z/dsh-agent");
var dsh_typert_protocol_1 = require("@z/dsh-typert-protocol");
var fold_ts_1 = require("./fold.ts");
var runtime_ts_1 = require("./runtime.ts");
var runtime_ts_2 = require("./runtime.ts");
Object.defineProperty(exports, "GOAL_CHANGE_VERSION", { enumerable: true, get: function () { return runtime_ts_2.GOAL_CHANGE_VERSION; } });
Object.defineProperty(exports, "GoalError", { enumerable: true, get: function () { return runtime_ts_2.GoalError; } });
Object.defineProperty(exports, "GoalId", { enumerable: true, get: function () { return runtime_ts_2.GoalId; } });
var fold_ts_2 = require("./fold.ts");
Object.defineProperty(exports, "decodeGoalChange", { enumerable: true, get: function () { return fold_ts_2.decodeGoalChange; } });
Object.defineProperty(exports, "foldGoal", { enumerable: true, get: function () { return fold_ts_2.foldGoal; } });
Object.defineProperty(exports, "goalChangeRef", { enumerable: true, get: function () { return fold_ts_2.goalChangeRef; } });
/** Wire payload schema of the `goal` projection (whole current goal or pre-create/cleared null). */
var goalProjectionSchema = zod_1.z.union([
    zod_1.z.object({
        goal: zod_1.z.object({
            id: zod_1.z.string().min(1),
            revision: zod_1.z.number().int().positive(),
            objective: zod_1.z.string().min(1),
            phase: zod_1.z.union([zod_1.z.literal('active'), zod_1.z.literal('paused'), zod_1.z.literal('blocked'), zod_1.z.literal('complete')]),
            blockedReason: zod_1.z.object({ code: zod_1.z.string(), message: zod_1.z.string() }).optional(),
            maxGoalRounds: zod_1.z.number().int().positive(),
        }),
        roundsStarted: zod_1.z.number().int().nonnegative(),
        createdAt: zod_1.z.number(),
        updatedAt: zod_1.z.number(),
    }),
    zod_1.z.null(),
]);
/**
 * Light last-wins fold of the `goal` projection unit. Unlike the strict
 * replay fold (fold.ts: transition validation, fail-loud on malformed
 * changes, Set-typed state), this transition is projection-grade: the state
 * is plain JSON (persisted-cache precondition), any non-goal or malformed
 * event returns the same reference (the registry's Object.is gate — the
 * title/todos posture), and correctness of the written change is the write
 * side's job (GoalService validated it before appending; the package
 * invariant rejects a violating stream fail-loud where it is installed).
 * @param state - the projection covering all prior events.
 * @param event - the next committed session event.
 * @returns the next projection (same reference when the event is not a goal change).
 */
function applyGoalProjection(state, event) {
    if (event.type !== 'goal/change')
        return state;
    var change;
    try {
        change = (0, fold_ts_1.decodeGoalChange)(event.data);
    }
    catch (_invalidPersistedGoalChange) {
        return state;
    }
    if (change === undefined)
        return state;
    return change.operation === 'clear'
        ? null
        : {
            goal: change.goal,
            roundsStarted: change.roundsStarted,
            createdAt: change.createdAt,
            updatedAt: change.updatedAt,
        };
}
/** Validate a caller-visible positive safe-integer round cap. */
function resolveMaxGoalRounds(value) {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new runtime_ts_1.GoalError('maxGoalRounds must be a positive safe integer', 'GOAL_INVALID_MAX_ROUNDS');
    }
    return value;
}
/** Validate and normalize an objective at the domain boundary. */
function resolveObjective(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new runtime_ts_1.GoalError('goal objective must be a non-empty string', 'GOAL_INVALID_OBJECTIVE');
    }
    return value.trim();
}
/** Materialize deployment defaults and validate one create request. */
function resolveCreateGoal(request, defaultMaxGoalRounds) {
    var _a;
    return {
        objective: resolveObjective(request.objective),
        maxGoalRounds: resolveMaxGoalRounds((_a = request.maxGoalRounds) !== null && _a !== void 0 ? _a : defaultMaxGoalRounds),
    };
}
/** Validate and detach one policy-owned blocker explanation. */
function resolveBlockReason(reason) {
    var record = typeof reason === 'object' && reason !== null && !Array.isArray(reason)
        ? reason
        : undefined;
    var code = record === null || record === void 0 ? void 0 : record['code'];
    var message = record === null || record === void 0 ? void 0 : record['message'];
    if (typeof code !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(code)
        || typeof message !== 'string' || message.trim().length === 0) {
        throw new runtime_ts_1.GoalError('goal block reason requires a lower-kebab-case code and a non-empty message', 'GOAL_INVALID_BLOCK_REASON');
    }
    return { code: code, message: message.trim() };
}
/** Goal service (`ctx.goals`) backed exclusively by the owning session log. */
var GoalService = function () {
    var _a;
    var _classSuper = dsh_typert_protocol_1.TypertRemoteService;
    var _instanceExtraInitializers = [];
    var _edit_decorators;
    var _pause_decorators;
    var _resume_decorators;
    var _complete_decorators;
    var _clear_decorators;
    var _remoteExportCreate_decorators;
    return _a = /** @class */ (function (_super) {
            __extends(GoalService, _super);
            function GoalService(ctx, config) {
                if (config === void 0) { config = {}; }
                var _b;
                var _this = _super.call(this, ctx, 'goals') || this;
                _this.resolved = __runInitializers(_this, _instanceExtraInitializers);
                _this.caches = new WeakMap();
                _this.resolved = {
                    defaultMaxGoalRounds: resolveMaxGoalRounds((_b = config.defaultMaxGoalRounds) !== null && _b !== void 0 ? _b : 256),
                };
                ctx.on('agent/session-start', function (_b) {
                    var agent = _b.agent;
                    _this.cache(agent.session).activation = 'disarmed';
                });
                // The `goal` projection unit: last-wins fold of goal/change whole values
                // (see applyGoalProjection). The unit child activates only when a
                // projection registry is composed (headless assemblies stay unaffected).
                ctx.inject(['sessionProjections'], function (projectionCtx) {
                    projectionCtx.sessionProjections.register({
                        key: 'goal',
                        stateSchema: goalProjectionSchema,
                        init: function () { return null; },
                        apply: applyGoalProjection,
                        wire: { viewSchema: goalProjectionSchema, view: function (state) { return state; } },
                        stateVersion: 4,
                    });
                });
                return _this;
            }
            /**
             * Read the current goal for one exact live agent.
             * @param agent - owning live agent.
             * @returns a fresh view or `undefined` when no goal is current.
             * @throws {@link GoalError} when the agent is not the registry's live instance.
             */
            GoalService.prototype.get = function (agent) {
                this.assertLive(agent);
                var cache = this.cache(agent.session);
                this.sync(agent.session, cache);
                return this.view(cache);
            };
            /**
             * Remove process-local continuation authority without changing durable goal
             * phase or revision. Lifecycle owners use this before unloading a driver;
             * a later human-authorized {@link resume} records the new activation edge.
             * @param agent - owning live agent.
             * @returns a fresh disarmed view, or `undefined` when no goal is current.
             */
            GoalService.prototype.disarm = function (agent) {
                this.assertLive(agent);
                var cache = this.cache(agent.session);
                this.sync(agent.session, cache);
                cache.activation = 'disarmed';
                return this.view(cache);
            };
            /**
             * Create and arm a goal. A completed goal may be replaced; every other
             * current phase must be cleared or resumed instead.
             * @param agent - owning live agent.
             * @param request - objective and optional round cap.
             * @returns the created live view.
             */
            GoalService.prototype.create = function (agent, request) {
                var spec = resolveCreateGoal(request, this.resolved.defaultMaxGoalRounds);
                var cache = this.prepareMutation(agent);
                var current = cache.state.goal;
                if (current !== undefined && current.phase !== 'complete') {
                    throw new runtime_ts_1.GoalError("goal \"".concat(current.id, "\" already exists with phase \"").concat(current.phase, "\""), 'GOAL_ALREADY_EXISTS');
                }
                var now = Date.now();
                var goal = {
                    id: (0, runtime_ts_1.GoalId)("goal-".concat((0, node_crypto_1.randomUUID)())),
                    revision: 1,
                    objective: spec.objective,
                    phase: 'active',
                    maxGoalRounds: spec.maxGoalRounds,
                };
                return this.commitSnapshot(agent, cache, 'create', goal, 0, now, now, 'armed');
            };
            /**
             * Edit objective and/or round cap without changing phase.
             * @param agent - owning live agent.
             * @param ref - expected current revision.
             * @param request - at least one replacement field.
             * @returns the edited view.
             */
            GoalService.prototype.edit = function (agent, ref, request) {
                var cache = this.prepareMutation(agent);
                var current = this.expectCurrent(cache, ref);
                if (request.objective === undefined && request.maxGoalRounds === undefined) {
                    throw new runtime_ts_1.GoalError('goal edit requires objective and/or maxGoalRounds', 'GOAL_INVALID_EDIT');
                }
                var goal = __assign(__assign(__assign(__assign({}, current), { revision: current.revision + 1 }), request.objective === undefined ? {} : { objective: resolveObjective(request.objective) }), request.maxGoalRounds === undefined ? {} : { maxGoalRounds: resolveMaxGoalRounds(request.maxGoalRounds) });
                return this.commitCurrent(agent, cache, 'edit', goal, cache.activation);
            };
            /**
             * Pause an active goal and disarm automatic continuation.
             * @param agent - owning live agent.
             * @param ref - expected current revision.
             * @returns the paused view.
             */
            GoalService.prototype.pause = function (agent, ref) {
                return this.transition(agent, ref, 'pause', ['active'], 'paused', 'disarmed');
            };
            /**
             * Resume and arm a stopped goal, or rearm an active goal after a
             * session-start edge, while its round budget still has capacity.
             * @param agent - owning live agent.
             * @param ref - expected current revision.
             * @returns the active view.
             */
            GoalService.prototype.resume = function (agent, ref) {
                var cache = this.prepareMutation(agent);
                var current = this.expectCurrent(cache, ref);
                var resumable = ['active', 'paused', 'blocked'];
                if (!resumable.includes(current.phase)) {
                    throw this.transitionError(current, 'resume', resumable);
                }
                if (current.phase === 'active' && cache.activation === 'armed') {
                    throw new runtime_ts_1.GoalError("goal \"".concat(current.id, "\" is already active and armed"), 'GOAL_INVALID_TRANSITION');
                }
                if (cache.state.roundsStarted >= current.maxGoalRounds) {
                    throw new runtime_ts_1.GoalError("goal \"".concat(current.id, "\" exhausted ").concat(current.maxGoalRounds, " goal rounds; increase maxGoalRounds before resuming"), 'GOAL_INVALID_TRANSITION');
                }
                return this.commitCurrent(agent, cache, 'resume', this.withPhase(current, 'active'), 'armed');
            };
            /**
             * Mark a current non-complete goal complete and disarm it.
             * @param agent - owning live agent.
             * @param ref - expected current revision.
             * @returns the completed view.
             */
            GoalService.prototype.complete = function (agent, ref) {
                return this.transition(agent, ref, 'complete', ['active', 'paused', 'blocked'], 'complete', 'disarmed');
            };
            /**
             * Mark an active goal blocked and disarm it.
             * @param agent - owning live agent.
             * @param ref - expected current revision.
             * @param reason - policy-owned stable code and human-readable explanation.
             * @returns the blocked view with its durable reason.
             */
            GoalService.prototype.block = function (agent, ref, reason) {
                var cache = this.prepareMutation(agent);
                var current = this.expectCurrent(cache, ref);
                if (current.phase !== 'active') {
                    throw this.transitionError(current, 'block', ['active']);
                }
                return this.commitCurrent(agent, cache, 'block', __assign(__assign({}, this.withPhase(current, 'blocked')), { blockedReason: resolveBlockReason(reason) }), 'disarmed');
            };
            /**
             * Clear the current goal while retaining a durable tombstone and history.
             * @param agent - owning live agent.
             * @param ref - expected current revision.
             * @returns the tombstone ref whose revision is one past the cleared snapshot.
             */
            GoalService.prototype.clear = function (agent, ref) {
                var cache = this.prepareMutation(agent);
                var current = this.expectCurrent(cache, ref);
                var tombstone = { id: current.id, revision: current.revision + 1 };
                var change = {
                    kind: 'goal/change',
                    version: runtime_ts_1.GOAL_CHANGE_VERSION,
                    operation: 'clear',
                    cleared: tombstone,
                    clearedAt: this.nextMutationTime(cache),
                };
                this.commit(agent, cache, change, 'disarmed');
                return __assign({}, tombstone);
            };
            /** Resolve and validate the cache used by a mutation. */
            GoalService.prototype.prepareMutation = function (agent) {
                this.assertLive(agent);
                var cache = this.cache(agent.session);
                this.sync(agent.session, cache);
                return cache;
            };
            /** Reject stale or missing current-state refs. */
            GoalService.prototype.expectCurrent = function (cache, ref) {
                var current = cache.state.goal;
                if (current === undefined)
                    throw new runtime_ts_1.GoalError('no current goal', 'GOAL_NOT_FOUND');
                if (ref.id !== current.id || ref.revision !== current.revision) {
                    throw new runtime_ts_1.GoalError("stale goal ref \"".concat(ref.id, "\" revision ").concat(ref.revision, "; current is \"").concat(current.id, "\" revision ").concat(current.revision), 'GOAL_STALE_REVISION');
                }
                return current;
            };
            /** Enforce exact live-agent identity rather than trusting a matching id. */
            GoalService.prototype.assertLive = function (agent) {
                if (this.ctx.agents.get(agent.id) !== agent) {
                    throw new runtime_ts_1.GoalError("agent \"".concat(agent.id, "\" is not live in this registry"), 'GOAL_AGENT_NOT_LIVE');
                }
            };
            /** Return the per-session cache, folding a seed once with activation disarmed. */
            GoalService.prototype.cache = function (session) {
                var cache = this.caches.get(session);
                if (cache !== undefined)
                    return cache;
                var state = (0, fold_ts_1.emptyGoalFoldState)();
                for (var _i = 0, _b = session.events; _i < _b.length; _i++) {
                    var event_1 = _b[_i];
                    (0, fold_ts_1.applyGoalEvent)(state, event_1);
                }
                cache = {
                    state: state,
                    activation: 'disarmed',
                    observedSeq: session.seq,
                    pendingActivation: undefined,
                };
                this.caches.set(session, cache);
                return cache;
            };
            /** Incrementally observe durable events and reconcile local activation intent. */
            GoalService.prototype.sync = function (session, cache) {
                var _b;
                for (var _i = 0, _c = session.events.slice(cache.observedSeq); _i < _c.length; _i++) {
                    var event_2 = _c[_i];
                    (0, fold_ts_1.applyGoalEvent)(cache.state, event_2);
                    if (event_2.type === 'goal/change') {
                        cache.activation = ((_b = cache.pendingActivation) === null || _b === void 0 ? void 0 : _b.seq) === event_2.seq
                            ? cache.pendingActivation.activation
                            : 'disarmed';
                    }
                    cache.observedSeq += 1;
                }
            };
            /** Build a new revision with one replacement phase. */
            GoalService.prototype.withPhase = function (current, phase) {
                return {
                    id: current.id,
                    revision: current.revision + 1,
                    objective: current.objective,
                    phase: phase,
                    maxGoalRounds: current.maxGoalRounds,
                };
            };
            /** Shared validated phase transition. */
            GoalService.prototype.transition = function (agent, ref, operation, allowed, phase, activation) {
                var cache = this.prepareMutation(agent);
                var current = this.expectCurrent(cache, ref);
                if (!allowed.includes(current.phase))
                    throw this.transitionError(current, operation, allowed);
                return this.commitCurrent(agent, cache, operation, this.withPhase(current, phase), activation);
            };
            /** Render a stable invalid-transition error. */
            GoalService.prototype.transitionError = function (current, operation, allowed) {
                return new runtime_ts_1.GoalError("cannot ".concat(operation, " goal \"").concat(current.id, "\" from phase \"").concat(current.phase, "\"; expected ").concat(allowed.join(' or ')), 'GOAL_INVALID_TRANSITION');
            };
            /** Commit a mutation that retains the current goal's derived counters/times. */
            GoalService.prototype.commitCurrent = function (agent, cache, operation, goal, activation) {
                var createdAt = cache.state.createdAt;
                /* v8 ignore next -- strict replay and every snapshot commit set createdAt whenever a current goal exists */
                if (createdAt === undefined)
                    throw new Error('current goal cache lacks createdAt');
                return this.commitSnapshot(agent, cache, operation, goal, cache.state.roundsStarted, createdAt, this.nextMutationTime(cache), activation);
            };
            /** Clamp a current goal's next timestamp across backward wall-clock movement. */
            GoalService.prototype.nextMutationTime = function (cache) {
                var updatedAt = cache.state.updatedAt;
                /* v8 ignore next -- strict replay and every snapshot commit set updatedAt whenever a current goal exists */
                if (updatedAt === undefined)
                    throw new Error('current goal cache lacks updatedAt');
                return Math.max(Date.now(), updatedAt);
            };
            /** Build and commit one full-snapshot mutation. */
            GoalService.prototype.commitSnapshot = function (agent, cache, operation, goal, roundsStarted, createdAt, updatedAt, activation) {
                var change = {
                    kind: 'goal/change',
                    version: runtime_ts_1.GOAL_CHANGE_VERSION,
                    operation: operation,
                    goal: goal,
                    roundsStarted: roundsStarted,
                    createdAt: createdAt,
                    updatedAt: updatedAt,
                };
                this.commit(agent, cache, change, activation);
                var view = this.view(cache);
                /* v8 ignore next -- the durable goal event installs the snapshot before this read */
                if (view === undefined)
                    throw new Error('snapshot commit cleared the goal unexpectedly');
                return view;
            };
            /** Commit one mutation into the goal log, cache, and live event stream. */
            GoalService.prototype.commit = function (agent, cache, change, activation) {
                var ref = (0, fold_ts_1.goalChangeRef)(change);
                cache.pendingActivation = { seq: agent.session.seq, activation: activation };
                try {
                    agent.session.append('goal/change', change);
                    this.sync(agent.session, cache);
                }
                finally {
                    cache.pendingActivation = undefined;
                }
                var goal = this.view(cache);
                var notification = __assign({ operation: change.operation, ref: __assign({}, ref) }, goal === undefined ? {} : { goal: goal });
                (0, dsh_agent_1.agentEvents)(this.ctx, agent).emit('goal/changed', { change: notification });
            };
            /** Build a detached current view. */
            GoalService.prototype.view = function (cache) {
                var goal = cache.state.goal;
                var createdAt = cache.state.createdAt;
                var updatedAt = cache.state.updatedAt;
                if (goal === undefined)
                    return undefined;
                /* v8 ignore next 3 -- strict replay and snapshot commits establish both timestamps with every current goal */
                if (createdAt === undefined || updatedAt === undefined) {
                    throw new Error("goal \"".concat(goal.id, "\" cache lacks timestamps"));
                }
                return __assign(__assign({}, goal), { roundsStarted: cache.state.roundsStarted, createdAt: createdAt, updatedAt: updatedAt, activation: cache.activation });
            };
            /**
             * Create one Goal through the remote boundary.
             * @param agent - exact live Agent resolved from the wire identity.
             * @param request - objective and optional round cap.
             * @returns the created Goal identity.
             */
            GoalService.prototype.remoteExportCreate = function (agent, request) {
                var view = this.create(agent, request);
                return { ref: { id: view.id, revision: view.revision } };
            };
            return GoalService;
        }(_classSuper)),
        (function () {
            var _b;
            var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create((_b = _classSuper[Symbol.metadata]) !== null && _b !== void 0 ? _b : null) : void 0;
            _edit_decorators = [(0, dsh_typert_protocol_1.Remote)('edit')];
            _pause_decorators = [(0, dsh_typert_protocol_1.Remote)('pause')];
            _resume_decorators = [(0, dsh_typert_protocol_1.Remote)('resume')];
            _complete_decorators = [(0, dsh_typert_protocol_1.Remote)('complete')];
            _clear_decorators = [(0, dsh_typert_protocol_1.Remote)('clear')];
            _remoteExportCreate_decorators = [(0, dsh_typert_protocol_1.Remote)('create')];
            __esDecorate(_a, null, _edit_decorators, { kind: "method", name: "edit", static: false, private: false, access: { has: function (obj) { return "edit" in obj; }, get: function (obj) { return obj.edit; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _pause_decorators, { kind: "method", name: "pause", static: false, private: false, access: { has: function (obj) { return "pause" in obj; }, get: function (obj) { return obj.pause; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _resume_decorators, { kind: "method", name: "resume", static: false, private: false, access: { has: function (obj) { return "resume" in obj; }, get: function (obj) { return obj.resume; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _complete_decorators, { kind: "method", name: "complete", static: false, private: false, access: { has: function (obj) { return "complete" in obj; }, get: function (obj) { return obj.complete; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _clear_decorators, { kind: "method", name: "clear", static: false, private: false, access: { has: function (obj) { return "clear" in obj; }, get: function (obj) { return obj.clear; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _remoteExportCreate_decorators, { kind: "method", name: "remoteExportCreate", static: false, private: false, access: { has: function (obj) { return "remoteExportCreate" in obj; }, get: function (obj) { return obj.remoteExportCreate; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a.inject = ['agents'],
        _a.Config = schemastery_1.default.object({
            defaultMaxGoalRounds: schemastery_1.default.number().default(256),
        }),
        _a;
}();
exports.GoalService = GoalService;
exports.default = GoalService;
