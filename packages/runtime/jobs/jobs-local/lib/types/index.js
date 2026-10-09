"use strict";
/**
 * Process-local provider for the background-job capability seam
 * (`ctx.jobs`). It keeps every record in memory and hands out fresh
 * snapshots, never live state.
 *
 * Registrations outlive producer and controller fibers. Agent or service
 * disposal cancels live work and awaits compliant producers; a throwing
 * teardown cancel force-fails only the record and reports a possible orphan.
 * @module @z/dsh-jobs-local
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalJobRegistry = exports.TASK_WAIT_TIMEOUT = void 0;
var schemastery_1 = require("@z/schemastery");
var dsh_scope_1 = require("@z/dsh-scope");
var dsh_timeout_1 = require("@z/dsh-timeout");
var dsh_jobs_1 = require("@z/dsh-jobs");
/** Timeout code that distinguishes a bounded wait from caller cancellation. */
exports.TASK_WAIT_TIMEOUT = 'TASK_WAIT_TIMEOUT';
/** Default maximum number of active jobs in one exact-owner bucket. */
var DEFAULT_MAX_CONCURRENT_TASKS_PER_OWNER = 10;
/** True for the three terminal {@link JobStatus} values. */
function isTerminal(status) {
    return status === 'completed' || status === 'killed' || status === 'failed';
}
/**
 * One scope's contributions: the job controllers attached from it and the
 * completion listeners registered there. Both tables are anonymous because a
 * contribution is identified by its own disposer, never by a name a second
 * registrant could shadow.
 */
var JobLayer = /** @class */ (function () {
    function JobLayer() {
        this.controllers = new dsh_scope_1.AnonymousEntries();
        this.listeners = new dsh_scope_1.AnonymousEntries();
        this.changed = new dsh_scope_1.AnonymousEntries();
    }
    JobLayer.prototype.isEmpty = function () {
        return this.controllers.isEmpty() && this.listeners.isEmpty() && this.changed.isEmpty();
    };
    return JobLayer;
}());
/**
 * The in-memory `jobs` registry. See the Service Definition contract in
 * `@z/dsh-jobs` for the ownership, isolation, and lifecycle
 * semantics this implementation honors.
 */
var LocalJobRegistry = /** @class */ (function (_super) {
    __extends(LocalJobRegistry, _super);
    function LocalJobRegistry(ctx, config) {
        var _this = _super.call(this, ctx) || this;
        _this.store = new Map();
        _this.counters = new Map();
        /**
         * Surfaces and listeners layered by the scope that registered them, in the
         * tools-registry shape: a contribution files into its registering context's
         * scope, and a read unions the global layer with the reader's scope chain.
         *
         * The registry is one process-wide instance serving every composition, so a
         * flat table would answer a per-owner question process-wide: one preset's
         * job controls would hold `start()` open for an agent whose own composition
         * loads none, and one settlement would reach every preset's notice listener.
         * Layers make both reads owner-relative. Nothing derives a cache from a
         * layer, so change notification is a no-op.
         */
        _this.layers = new dsh_scope_1.ScopedLayers(function () { return new JobLayer(); }, function () { });
        _this.listenersClosed = false;
        /** Owner agents with attached scope cleanup, mapped to the exact disposer. */
        _this.ownerCleanups = new Map();
        // Schemastery validates and fills the default before constructing the service.
        _this.maxConcurrentJobsPerOwner = config.maxConcurrentJobsPerOwner;
        _this.selfCtx = ctx;
        ctx.effect(function () { return function () { return _this.disposeAll(); }; }, 'jobs teardown');
        return _this;
    }
    LocalJobRegistry.prototype.start = function (spec) {
        var _this = this;
        var _a, _b;
        if (!this.servesOwner(spec.owner)) {
            throw new Error('background jobs unavailable: no job controller serves this agent (load @z/dsh-tool-jobs in its composition)');
        }
        if (spec.kind.length === 0)
            throw new Error('invalid job kind: expected a non-empty string');
        if (spec.label.length === 0)
            throw new Error('invalid job label: expected a non-empty string');
        if (spec.outputLimitBytes !== undefined
            && (!Number.isSafeInteger(spec.outputLimitBytes) || spec.outputLimitBytes <= 0)) {
            throw new Error("invalid outputLimitBytes: expected a positive safe integer, got ".concat(JSON.stringify(spec.outputLimitBytes)));
        }
        if (spec.owner !== undefined)
            this.ensureOwnerCleanup(spec.owner);
        var active = this.activeTaskCount(spec.owner);
        if (active >= this.maxConcurrentJobsPerOwner) {
            throw new Error("background job limit reached for this owner (limit: ".concat(this.maxConcurrentJobsPerOwner, "); use job_kill to stop an unneeded job, wait for it to finish, then retry"));
        }
        var hooks = spec.run();
        var count = ((_a = this.counters.get(spec.kind)) !== null && _a !== void 0 ? _a : 0) + 1;
        this.counters.set(spec.kind, count);
        var id = (0, dsh_jobs_1.JobId)("".concat(spec.kind, "-").concat(count));
        var markSettled;
        var settled = new Promise(function (resolve) { markSettled = resolve; });
        var job = {
            id: id,
            kind: spec.kind,
            label: spec.label,
            outputLimitBytes: spec.outputLimitBytes,
            owner: spec.owner,
            cancel: hooks.cancel.bind(hooks),
            readOutput: (_b = hooks.readOutput) === null || _b === void 0 ? void 0 : _b.bind(hooks),
            status: 'running',
            detail: undefined,
            output: undefined,
            startedAt: Date.now(),
            finishedAt: undefined,
            reported: false,
            settled: settled,
            markSettled: markSettled,
            waiters: 0,
            waitResolvers: new Set(),
        };
        this.store.set(id, job);
        void hooks.done.then(function (outcome) { _this.settle(job, outcome); }, function (error) {
            // Contain a producer contract violation (`done` rejected) so cleanup and waiters cannot hang.
            _this.selfCtx.logger.warn("jobs: job ".concat(job.id, " producer done promise rejected (producer contract violation): ").concat(String(error)));
            _this.settle(job, { status: 'failed', detail: String(error) });
        });
        // Registration is complete and cannot fail from here, so the visible set
        // has genuinely changed.
        this.notifyChanged(job.owner);
        return id;
    };
    LocalJobRegistry.prototype.list = function (caller) {
        var _this = this;
        var session = caller === null || caller === void 0 ? void 0 : caller.id;
        return __spreadArray([], this.store.values(), true).filter(function (job) { return job.owner === undefined || job.owner.id === session; })
            .map(function (job) { return _this.snapshot(job); });
    };
    LocalJobRegistry.prototype.get = function (id, caller) {
        var job = this.expect(id);
        this.assertAccess(job, caller);
        return this.snapshot(job);
    };
    LocalJobRegistry.prototype.read = function (id, caller) {
        var _a;
        var job = this.expect(id);
        this.assertAccess(job, caller);
        var text = job.readOutput !== undefined
            ? job.readOutput()
            : isTerminal(job.status) ? (_a = job.output) !== null && _a !== void 0 ? _a : '' : '';
        if (isTerminal(job.status))
            job.reported = true;
        return { text: text, snapshot: this.snapshot(job) };
    };
    LocalJobRegistry.prototype.kill = function (id, caller, reason) {
        var job = this.expect(id);
        this.assertAccess(job, caller);
        if (isTerminal(job.status)) {
            job.reported = true;
            return 'already-finished';
        }
        // Cancel first so a throw leaves both lifecycle and notice state unchanged.
        job.cancel(reason);
        job.status = 'stopping';
        job.reported = true;
        this.notifyChanged(job.owner);
        return 'requested';
    };
    LocalJobRegistry.prototype.wait = function (id, timeoutMs, caller, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var job, counted_1, uncount_1, env_1, d_1, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        job = this.expect(id);
                        this.assertAccess(job, caller);
                        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
                            throw new Error("invalid wait timeout: expected a positive number of milliseconds, got ".concat(JSON.stringify(timeoutMs)));
                        }
                        if (!!isTerminal(job.status)) return [3 /*break*/, 8];
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            throw new Error('wait aborted');
                        // Abort removes the waiter synchronously so same-tick settlement cannot
                        // suppress a notice for a wait that will reject.
                        job.waiters += 1;
                        counted_1 = true;
                        uncount_1 = function () {
                            if (!counted_1)
                                return;
                            counted_1 = false;
                            job.waiters -= 1;
                        };
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 7, 8]);
                        env_1 = { stack: [], error: void 0, hasError: false };
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, 5, 6]);
                        d_1 = __addDisposableResource(env_1, (0, dsh_timeout_1.deadline)(signal, timeoutMs, exports.TASK_WAIT_TIMEOUT), false);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var onSettled = function () {
                                    job.waitResolvers.delete(onSettled);
                                    d_1.signal.removeEventListener('abort', onAbort);
                                    resolve();
                                };
                                var onAbort = function () {
                                    job.waitResolvers.delete(onSettled);
                                    // A settled job cannot reach here: settlement releases every waiter
                                    // before it announces completion, and each released waiter detaches
                                    // this listener in the same synchronous span, so nothing that reacts
                                    // to a settlement can abort a wait the settlement already owed.
                                    if ((0, dsh_timeout_1.timeoutOf)(d_1.signal, exports.TASK_WAIT_TIMEOUT) !== undefined) {
                                        resolve();
                                    }
                                    else {
                                        uncount_1();
                                        reject(new Error('wait aborted'));
                                    }
                                };
                                job.waitResolvers.add(onSettled);
                                d_1.signal.addEventListener('abort', onAbort, { once: true });
                            })];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 4:
                        e_1 = _a.sent();
                        env_1.error = e_1;
                        env_1.hasError = true;
                        return [3 /*break*/, 6];
                    case 5:
                        __disposeResources(env_1);
                        return [7 /*endfinally*/];
                    case 6: return [3 /*break*/, 8];
                    case 7:
                        uncount_1();
                        return [7 /*endfinally*/];
                    case 8:
                        if (isTerminal(job.status))
                            job.reported = true;
                        return [2 /*return*/, this.snapshot(job)];
                }
            });
        });
    };
    LocalJobRegistry.prototype.onJobDone = function (listener) {
        return this.layers.effect(this.ctx, function (layer) { return layer.listeners.append(listener); }, { label: 'jobs.onJobDone()' });
    };
    LocalJobRegistry.prototype.onJobsChanged = function (listener) {
        return this.layers.effect(this.ctx, function (layer) { return layer.changed.append(listener); }, { label: 'jobs.onJobsChanged()' });
    };
    LocalJobRegistry.prototype.attachController = function (name) {
        // One token per call keeps duplicate labels independently disposable.
        var token = Symbol(name);
        return this.layers.effect(this.ctx, function (layer) { return layer.controllers.append(token); }, { label: 'jobs.attachController()' });
    };
    /**
     * Whether an attached job controller can collect and stop work owned by
     * `owner`. The global layer holds every controller attached from an unscoped
     * context — a host composition's own controls — and therefore serves every
     * owner; a scoped controller serves exactly the agents composed under it.
     * @param owner - the job's owner, or undefined for unowned work.
     * @returns whether some reachable controller serves the owner.
     */
    LocalJobRegistry.prototype.servesOwner = function (owner) {
        if (!this.layers.global.controllers.isEmpty())
            return true;
        return this.layers.chainLayers(owner === undefined ? undefined : (0, dsh_scope_1.scopeOf)(owner.ctx))
            .some(function (layer) { return !layer.controllers.isEmpty(); });
    };
    /** Count authoritative active records for one exact owner or the shared unowned bucket. */
    LocalJobRegistry.prototype.activeTaskCount = function (owner) {
        var count = 0;
        for (var _i = 0, _a = this.store.values(); _i < _a.length; _i++) {
            var job = _a[_i];
            if (job.owner === owner && (job.status === 'running' || job.status === 'stopping'))
                count += 1;
        }
        return count;
    };
    /**
     * The completion listeners that own `owner`'s notices: the global layer's
     * first, then each scoped layer along the owner's chain. A listener outside
     * that chain belongs to another composition and must not deliver, or the
     * owner reads one notice per mounted preset.
     * @param owner - the settled job's owner, or undefined for unowned work.
     * @returns the listeners to notify, in registration order per layer.
     */
    LocalJobRegistry.prototype.listenersFor = function (owner) {
        var scope, _i, _a, layer;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [5 /*yield**/, __values(this.layers.global.listeners.values())];
                case 1:
                    _b.sent();
                    scope = owner === undefined ? undefined : (0, dsh_scope_1.scopeOf)(owner.ctx);
                    _i = 0, _a = this.layers.chainLayers(scope);
                    _b.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 5];
                    layer = _a[_i];
                    return [5 /*yield**/, __values(layer.listeners.values())];
                case 3:
                    _b.sent();
                    _b.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/];
            }
        });
    };
    /** Look up a job or fail loud. */
    LocalJobRegistry.prototype.expect = function (id) {
        var job = this.store.get(id);
        if (job === undefined)
            throw new Error("unknown job ".concat(id));
        return job;
    };
    /**
     * The isolation fence: a job with an owner is reachable only by callers
     * whose session id matches (`!== undefined` semantics — an unowned job is
     * open, and a no-agent caller can never match an owned one).
     */
    LocalJobRegistry.prototype.assertAccess = function (job, caller) {
        if (job.owner !== undefined && job.owner.id !== (caller === null || caller === void 0 ? void 0 : caller.id)) {
            throw new Error("job ".concat(job.id, " belongs to another session"));
        }
    };
    /** Project a fresh read-only snapshot from the mutable record. */
    LocalJobRegistry.prototype.snapshot = function (job) {
        var _a;
        var ownerSession = (_a = job.owner) === null || _a === void 0 ? void 0 : _a.id;
        return __assign(__assign(__assign(__assign(__assign(__assign(__assign({ id: job.id, kind: job.kind, label: job.label }, job.outputLimitBytes !== undefined ? { outputLimitBytes: job.outputLimitBytes } : {}), ownerSession !== undefined ? { ownerSession: ownerSession } : {}), { status: job.status }), job.detail !== undefined ? { detail: job.detail } : {}), { startedAt: job.startedAt }), job.finishedAt !== undefined ? { finishedAt: job.finishedAt } : {}), { reported: job.reported });
    };
    /**
     * The change observers that own `owner`'s updates, resolved exactly like
     * {@link listenersFor}: the global layer — a host composition's own carrier,
     * which serves every owner — then each scoped layer along the owner's chain.
     * An observer outside that chain belongs to another composition and would
     * otherwise be told about agents it does not compose.
     * @param owner - the owner whose visible set moved, or undefined for unowned work.
     * @returns the observers to notify, in registration order per layer.
     */
    LocalJobRegistry.prototype.changedFor = function (owner) {
        var scope, _i, _a, layer;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [5 /*yield**/, __values(this.layers.global.changed.values())];
                case 1:
                    _b.sent();
                    scope = owner === undefined ? undefined : (0, dsh_scope_1.scopeOf)(owner.ctx);
                    _i = 0, _a = this.layers.chainLayers(scope);
                    _b.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 5];
                    layer = _a[_i];
                    return [5 /*yield**/, __values(layer.changed.values())];
                case 3:
                    _b.sent();
                    _b.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/];
            }
        });
    };
    /**
     * Announce that one owner's visible set changed. Each listener is contained
     * so an observer cannot break a lifecycle commit that already happened.
     */
    LocalJobRegistry.prototype.notifyChanged = function (owner) {
        for (var _i = 0, _a = this.changedFor(owner); _i < _a.length; _i++) {
            var listener = _a[_i];
            try {
                listener(owner);
            }
            catch (error) {
                this.selfCtx.logger.warn("jobs: onJobsChanged listener threw: ".concat(String(error)));
            }
        }
    };
    /**
     * Record the first terminal outcome, release waiters, then announce
     * completion. First-wins preserves a teardown force-failure against late
     * producer settlement. Pending waits mark the job reported before listeners
     * run. Completion is announced last because a reporter may open a model turn
     * synchronously: every other observer of this settlement must already have
     * seen the committed record.
     */
    LocalJobRegistry.prototype.settle = function (job, outcome) {
        var _this = this;
        if (isTerminal(job.status))
            return;
        job.status = outcome.status;
        job.detail = outcome.detail;
        job.output = outcome.output;
        job.finishedAt = Date.now();
        if (job.waiters > 0)
            job.reported = true;
        var snapshot = this.snapshot(job);
        var waitResolvers = __spreadArray([], job.waitResolvers, true);
        job.waitResolvers.clear();
        for (var _i = 0, waitResolvers_1 = waitResolvers; _i < waitResolvers_1.length; _i++) {
            var resolveWait = waitResolvers_1[_i];
            resolveWait();
        }
        job.markSettled();
        this.notifyChanged(job.owner);
        if (this.listenersClosed)
            return;
        for (var _a = 0, _b = this.listenersFor(job.owner); _a < _b.length; _a++) {
            var listener = _b[_a];
            try {
                var returned = listener(snapshot, job.owner);
                void Promise.resolve(returned).catch(function (error) {
                    _this.selfCtx.logger.warn("jobs: onJobDone listener rejected for ".concat(job.id, ": ").concat(String(error)));
                });
            }
            catch (error) {
                this.selfCtx.logger.warn("jobs: onJobDone listener threw for ".concat(job.id, ": ").concat(String(error)));
            }
        }
    };
    /**
     * Attach one awaited cleanup through the exact owner's scope. This survives
     * producer reloads and joins agent quiescence; the retained disposer lets
     * service teardown detach the cross-fiber effect. Fails when the registry is
     * absent or the owner is not its currently registered instance.
     */
    LocalJobRegistry.prototype.ensureOwnerCleanup = function (owner) {
        var _this = this;
        var ownerId = owner.id;
        var agents = this.selfCtx.get('agents');
        if (agents === undefined) {
            throw new Error('background job ownership requires the agent registry (load @z/dsh-agent)');
        }
        if (agents.get(ownerId) !== owner) {
            throw new Error("agent \"".concat(ownerId, "\" is not the registered agent instance (background job owner must be live)"));
        }
        if (this.ownerCleanups.has(owner))
            return;
        // Record only after attach succeeds; a disposing scope rejects new effects.
        var detach = owner.ctx.effect(function () { return function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.ownerCleanups.delete(owner);
                        return [4 /*yield*/, this.disposeOwned(owner)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }; }, 'jobs.ownerCleanup()');
        this.ownerCleanups.set(owner, detach);
    };
    /** Cancel, await terminal records, and drop every job owned by one exact agent lifecycle. */
    LocalJobRegistry.prototype.disposeOwned = function (owner) {
        return __awaiter(this, void 0, void 0, function () {
            var owned, _i, owned_1, job;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        owned = __spreadArray([], this.store.values(), true).filter(function (job) { return job.owner === owner; });
                        this.cancelForTeardown(owned, 'owner disposed');
                        return [4 /*yield*/, Promise.all(owned.map(function (job) { return job.settled; }))];
                    case 1:
                        _a.sent();
                        for (_i = 0, owned_1 = owned; _i < owned_1.length; _i++) {
                            job = owned_1[_i];
                            this.store.delete(job.id);
                        }
                        // Removal is the one visible-set change no per-job record carries, so it
                        // must be announced here or an observer keeps the dropped rows forever.
                        if (owned.length > 0)
                            this.notifyChanged(owner);
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Close listeners, cancel live jobs, await settlement, and detach owner
     * effects. Throwing cancels are force-failed to avoid teardown deadlock.
     */
    LocalJobRegistry.prototype.disposeAll = function () {
        return __awaiter(this, void 0, void 0, function () {
            var all, emptied, _i, emptied_1, owner, ownerCleanups;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // The flag is the whole guard: each layer entry's undo belongs to the fiber
                        // that registered it, so this service may not drop them on its own way out.
                        this.listenersClosed = true;
                        all = __spreadArray([], this.store.values(), true);
                        this.cancelForTeardown(all, 'jobs service disposed');
                        return [4 /*yield*/, Promise.all(all.map(function (job) { return job.settled; }))
                            // Distinct owners whose records just disappeared. A change observer files
                            // into the layer of the context that registered it, so a consumer mounted
                            // outside this service — the api-proxy carrier registers from the mux
                            // stream — is still reachable here. Without this it keeps the rows it last
                            // received after a registry reload.
                        ];
                    case 1:
                        _a.sent();
                        emptied = new Set(all.map(function (job) { return job.owner; }));
                        this.store.clear();
                        for (_i = 0, emptied_1 = emptied; _i < emptied_1.length; _i++) {
                            owner = emptied_1[_i];
                            this.notifyChanged(owner);
                        }
                        ownerCleanups = __spreadArray([], this.ownerCleanups.values(), true);
                        this.ownerCleanups.clear();
                        return [4 /*yield*/, Promise.all(ownerCleanups.map(function (cleanup) { return Promise.resolve(cleanup()); }))];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Cancel jobs during teardown with per-job containment. A throwing cancel
     * force-fails the record and reports a possible orphan; a cancel that returns
     * without settling remains indistinguishable from a slow stop and may stall.
     */
    LocalJobRegistry.prototype.cancelForTeardown = function (jobs, reason) {
        for (var _i = 0, jobs_1 = jobs; _i < jobs_1.length; _i++) {
            var job = jobs_1[_i];
            if (isTerminal(job.status))
                continue;
            // Teardown cancellation is a kill without a caller, so it claims the
            // terminal report the same way `kill()` does. Nothing will read a notice
            // for a job whose owner or service is being destroyed, and a waking
            // reporter would spend a model request per teardown layer. This is
            // decided before the producer runs: the force-failure below settles the
            // record too, so a throwing cancel must not be the one path that
            // announces an unreported completion into a disposing owner.
            job.reported = true;
            try {
                job.cancel(reason);
                job.status = 'stopping';
                // Teardown reaches settlement only after the producer releases, which a
                // slow stop can defer; announcing the transition here is what keeps an
                // observer from showing `running` for that whole window.
                this.notifyChanged(job.owner);
            }
            catch (error) {
                var detail = "cancel threw during teardown; work may be orphaned: ".concat(String(error));
                this.selfCtx.logger.warn("jobs: cancel of ".concat(job.id, " threw during teardown; job record forced failed and work may be orphaned: ").concat(String(error)));
                this.settle(job, { status: 'failed', detail: detail });
            }
        }
    };
    LocalJobRegistry.Config = schemastery_1.default.object({
        maxConcurrentJobsPerOwner: schemastery_1.default.number()
            .step(1)
            .min(1)
            .max(Number.MAX_SAFE_INTEGER)
            .default(DEFAULT_MAX_CONCURRENT_TASKS_PER_OWNER),
    });
    return LocalJobRegistry;
}(dsh_jobs_1.JobRegistry));
exports.LocalJobRegistry = LocalJobRegistry;
exports.default = LocalJobRegistry;
