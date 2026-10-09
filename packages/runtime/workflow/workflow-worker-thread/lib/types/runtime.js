"use strict";
/**
 * Per-run worker-side vm hooks, child RPC, concurrency/caps, cancellation, and result serialization; it
 * never touches Cordis. Script values leaving the realm are materialized as plain JSON before
 * messaging. Values entering the trusted model-written realm are passed directly; `args` alone is
 * cloned so script mutation cannot alter initialization data. See `./realm.ts` for the trust model.
 *
 * Fatal workflow errors—bad hook arguments, unsupported schemas/options, caps, start failures, and
 * cancellation—propagate through combinators. Only child failures and ordinary stage errors become
 * per-item nulls. Every returned promise has a rejection consumer so dropped script promises cannot
 * kill the worker. A cancelled script that never settles emits nothing; the host force-settles the
 * run within grace and terminates the thread.
 * @module @z/dsh-workflow-worker-thread/runtime
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
exports.WorkflowExecution = void 0;
var vm = require("node:vm");
var dsh_session_1 = require("@z/dsh-session");
var dsh_tools_1 = require("@z/dsh-tools");
var dsh_workflow_1 = require("@z/dsh-workflow");
var realm_ts_1 = require("./realm.ts");
/** The `agent()` options the script may pass; everything else rejects loud. */
var SUPPORTED_AGENT_OPTIONS = new Set(['label', 'phase', 'schema', 'provider', 'model']);
/** Deferred Claude Code options we name explicitly in the rejection message. */
var DEFERRED_AGENT_OPTIONS = new Set(['effort', 'isolation', 'agentType']);
/** Flatten a child's final output blocks to text (the non-schema `agent()` result). */
function outputText(blocks) {
    return blocks
        .filter(function (block) { return block.type === 'text'; })
        .map(function (block) { return block.text; })
        .join('');
}
/** A short display label derived from the prompt when the script passes none. */
function defaultLabel(prompt) {
    var newline = prompt.indexOf('\n');
    var line = newline === -1 ? prompt : prompt.slice(0, newline);
    return line.length <= 48 ? line : "".concat(line.slice(0, 47), "\u2026");
}
/**
 * One live script execution inside the worker. Constructed per run by the
 * session; `drive()` is called exactly once and NEVER rejects — every failure
 * becomes a {@link WorkflowResult} with a non-`completed` stop reason. The
 * host owns cancellation and cleanup of any dropped child work.
 */
var WorkflowExecution = /** @class */ (function () {
    function WorkflowExecution(meta, body, args, limits, observer, children) {
        var _this = this;
        this.limits = limits;
        this.observer = observer;
        this.children = children;
        /** 1-based count of `agent()` calls started (the `agentsStarted` result field). */
        this.started = 0;
        this.activeSlots = 0;
        this.slotWaiters = [];
        // Compile FIRST: a body syntax error must throw out of the constructor
        // before any realm state exists. The host pre-parses the identical
        // wrapper, so under one Node version this throw is unreachable in
        // production — the session still maps it to an error result defensively.
        // lineOffset compensates for the wrapper line, so stack traces carry the
        // script's own line numbers.
        try {
            this.compiled = new vm.Script("(async () => {\n".concat(body, "\n})()"), {
                filename: "workflow:".concat(meta.name),
                lineOffset: -1,
            });
        }
        catch (error) {
            throw new dsh_workflow_1.WorkflowError("workflow script does not parse: ".concat(String(error)), 'SCRIPT_PARSE', { cause: error });
        }
        this.context = vm.createContext({}, { name: "workflow:".concat(meta.name) });
        var globals = {
            agent: function (prompt, opts) { return _this.contain(_this.agent(prompt, opts)); },
            parallel: function (thunks) { return _this.contain(_this.parallel(thunks)); },
            pipeline: function (items) {
                var stages = [];
                for (var _i = 1; _i < arguments.length; _i++) {
                    stages[_i - 1] = arguments[_i];
                }
                return _this.contain(_this.pipeline(items, stages));
            },
            phase: function (title) { _this.phase(title); },
            log: function (message) { _this.log(message); },
            // workerData already performed the real cross-thread structured clone.
            args: args,
        };
        for (var _i = 0, _a = Object.entries(globals); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], value = _b[1];
            // Data properties on the contextified global; frozen shape not required —
            // a script overwriting its own hooks only sabotages itself.
            ;
            this.context[key] = typeof value === 'function' ? Object.freeze(value) : value;
        }
    }
    /**
     * Whether the run has been cancelled. A METHOD, not an inline property
     * read: `cancel()` mutates `cancelReason` concurrently (the session's
     * message handler), and an inline read after an `await` gets narrowed by
     * control flow into an always-false comparison.
     */
    WorkflowExecution.prototype.isCancelled = function () {
        return this.cancelReason !== undefined;
    };
    /**
     * Shared hook entry guard: after {@link cancel}, EVERY hook throws
     * `CANCELLED` at its next call — cancellation is the next HOOK boundary,
     * not just the next `agent()`, so a script that caught one cancelled
     * rejection cannot keep emitting progress through `phase`/`log` or enter a
     * combinator.
     */
    WorkflowExecution.prototype.throwIfCancelled = function () {
        if (this.isCancelled())
            throw this.cancelledError();
    };
    /**
     * Cancel the run: waiting `agent()` slots reject and every future hook call
     * throws `CANCELLED` — the script dies at its next await. A script that
     * never settles anyway (parked on a promise no hook owns) is the HOST's
     * problem: its grace timer force-settles the run and terminates the
     * worker. Idempotent; the first reason wins.
     * @param reason - human-readable cause carried on the CANCELLED error. The
     * host independently aborts the required signal shared by every child.
     */
    WorkflowExecution.prototype.cancel = function (reason) {
        if (this.cancelReason !== undefined)
            return;
        this.cancelReason = reason;
        this.cancelError = new dsh_workflow_1.WorkflowError("workflow run cancelled: ".concat(this.cancelReason), 'CANCELLED');
        for (var _i = 0, _a = this.slotWaiters.splice(0); _i < _a.length; _i++) {
            var waiter = _a[_i];
            waiter.reject(this.cancelledError());
        }
    };
    /**
     * Run the script to settlement. Resolves — never rejects — with the run's
     * {@link WorkflowResult}: the materialized return value on `completed`, the
     * failure message on `error`, and `cancelled` when the script died of
     * cancellation. This method only chooses the result; the session publishes
     * it and the host owns terminal child cancellation.
     * @returns the settled outcome — this promise NEVER rejects (the seam's
     * `result`-never-rejects contract); every failure maps to a variant.
     */
    WorkflowExecution.prototype.drive = function () {
        return __awaiter(this, void 0, void 0, function () {
            var scriptPromise, raw, value, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        // Cancelled before the body ever ran (an already-aborted start signal,
                        // relayed by the host before its `go`): the script must not execute at
                        // all, let alone report `completed`.
                        if (this.isCancelled())
                            throw this.cancelledError();
                        scriptPromise = this.compiled.runInContext(this.context, { timeout: this.limits.syncTimeoutMs });
                        return [4 /*yield*/, this.contain(Promise.resolve(scriptPromise))
                            // Cancelled while the body ran: a script that settled without touching
                            // another hook (or without any) must still report `cancelled` — the
                            // holder asked for cancellation and `completed` would be a lie.
                        ];
                    case 1:
                        raw = _a.sent();
                        // Cancelled while the body ran: a script that settled without touching
                        // another hook (or without any) must still report `cancelled` — the
                        // holder asked for cancellation and `completed` would be a lie.
                        if (this.isCancelled())
                            throw this.cancelledError();
                        value = raw === undefined ? null : this.materializeResult(raw);
                        return [2 /*return*/, { value: value, stopReason: 'completed', agentsStarted: this.started }];
                    case 2:
                        error_1 = _a.sent();
                        // Any failure after cancel() reports `cancelled` with the canonical
                        // reason — the reject path mirrors the resolve path's post-settle check.
                        if (this.isCancelled()) {
                            return [2 /*return*/, { value: null, stopReason: 'cancelled', error: this.cancelledError().message, agentsStarted: this.started }];
                        }
                        // renderThrown is total (thrown values of any realm), so this arm
                        // cannot throw — drive() resolving is the `result` never-rejects contract
                        // contract.
                        return [2 /*return*/, { value: null, stopReason: 'error', error: (0, realm_ts_1.renderThrown)(error_1), agentsStarted: this.started }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Attach a no-op rejection consumer WITHOUT changing what the caller
     * receives: if the script drops the promise (no await), cancellation cannot
     * become an unhandled rejection (which would kill the worker thread); if
     * the script does await it, it still observes the rejection.
     */
    WorkflowExecution.prototype.contain = function (promise) {
        promise.catch(function () { });
        return promise;
    };
    WorkflowExecution.prototype.cancelledError = function () {
        var _a;
        // cancel() arms cancelError before any caller can observe isCancelled()
        // === true; the fallback guards the type, not a reachable path.
        /* v8 ignore next */
        return (_a = this.cancelError) !== null && _a !== void 0 ? _a : new dsh_workflow_1.WorkflowError('workflow run cancelled', 'CANCELLED');
    };
    /** Materialize the script's return value; violations become RESULT_UNSERIALIZABLE. */
    WorkflowExecution.prototype.materializeResult = function (raw) {
        try {
            return (0, realm_ts_1.materializeFromRealm)(raw, 'workflow result');
        }
        catch (error) {
            /* v8 ignore next -- defensive rethrow arm: materializeFromRealm only throws MaterializeError */
            if (!(error instanceof realm_ts_1.MaterializeError))
                throw error;
            throw new dsh_workflow_1.WorkflowError("the workflow's return value is not plain JSON data \u2014 ".concat(error.message, ". Return only JSON-serializable objects/arrays/scalars."), 'RESULT_UNSERIALIZABLE', { cause: error });
        }
    };
    /**
     * Acquire one concurrency slot (FIFO). Cancellation rejects QUEUED waiters
     * (see {@link cancel}); the callers guard their own entry and post-acquire
     * windows, so no cancelled-precheck is duplicated here.
     */
    WorkflowExecution.prototype.acquireSlot = function () {
        var _this = this;
        if (this.activeSlots < this.limits.maxConcurrentAgents) {
            this.activeSlots += 1;
            return Promise.resolve();
        }
        return new Promise(function (resolve, reject) {
            _this.slotWaiters.push({
                resolve: function () {
                    _this.activeSlots += 1;
                    resolve();
                },
                reject: reject,
            });
        });
    };
    WorkflowExecution.prototype.releaseSlot = function () {
        this.activeSlots -= 1;
        var next = this.slotWaiters.shift();
        if (next)
            next.resolve();
    };
    /** The `agent(prompt, opts)` hook. */
    WorkflowExecution.prototype.agent = function (rawPrompt, rawOpts) {
        return __awaiter(this, void 0, void 0, function () {
            var opts, seq, label, phase, run, error_2, info, result, error_3;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        this.throwIfCancelled();
                        if (typeof rawPrompt !== 'string' || rawPrompt.length === 0) {
                            throw new dsh_workflow_1.WorkflowError('agent() requires a non-empty prompt string', 'INVALID_ARGUMENT');
                        }
                        opts = this.readAgentOptions(rawOpts);
                        if (this.started >= this.limits.maxTotalAgents) {
                            throw new dsh_workflow_1.WorkflowError("this run reached its total agent cap (".concat(this.limits.maxTotalAgents, ") \u2014 a runaway-loop backstop; raise the applicable maxTotalAgents limit if the scale is intentional"), 'AGENT_CAP');
                        }
                        this.started += 1;
                        seq = this.started;
                        label = (_a = opts.label) !== null && _a !== void 0 ? _a : defaultLabel(rawPrompt);
                        phase = (_b = opts.phase) !== null && _b !== void 0 ? _b : this.currentPhase;
                        return [4 /*yield*/, this.acquireSlot()];
                    case 1:
                        _c.sent();
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, , 17, 18]);
                        // Re-check after the acquire: the await yields at least one microtask
                        // tick even when a slot is free, and a queued waiter resumes a tick
                        // after its release — a cancel() landing in either window must not
                        // reach the host (which would refuse anyway, but the refusal reads as
                        // a start failure rather than the cancellation it is).
                        this.throwIfCancelled();
                        run = void 0;
                        _c.label = 3;
                    case 3:
                        _c.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, this.children.startAgent(__assign(__assign(__assign({ prompt: rawPrompt }, opts.schema !== undefined ? { schema: opts.schema } : {}), opts.provider !== undefined ? { provider: opts.provider } : {}), opts.model !== undefined ? { model: opts.model } : {}))];
                    case 4:
                        run = _c.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        error_2 = _c.sent();
                        // The host refuses starts once the run is cancelled — a refusal that
                        // races our own cancel state must read as the cancellation it is,
                        // not as a broken contract.
                        if (this.isCancelled())
                            throw this.cancelledError();
                        throw new dsh_workflow_1.WorkflowError("agent() could not start a child: ".concat((0, realm_ts_1.renderThrown)(error_2)), 'AGENT_START', { cause: error_2 });
                    case 6:
                        if (!this.isCancelled()) return [3 /*break*/, 8];
                        return [4 /*yield*/, run.dispose()];
                    case 7:
                        _c.sent();
                        throw this.cancelledError();
                    case 8:
                        info = __assign(__assign({ seq: seq, label: label }, phase !== undefined ? { phase: phase } : {}), { childId: (0, dsh_session_1.SessionId)(run.id) });
                        this.observer.agentStart(info);
                        _c.label = 9;
                    case 9:
                        _c.trys.push([9, , 14, 16]);
                        result = void 0;
                        _c.label = 10;
                    case 10:
                        _c.trys.push([10, 12, , 13]);
                        return [4 /*yield*/, run.result];
                    case 11:
                        result = _c.sent();
                        return [3 /*break*/, 13];
                    case 12:
                        error_3 = _c.sent();
                        // A rejected child result is an INFRASTRUCTURE fault relayed by the
                        // host — distinct from a child that failed and resolved. Pair the
                        // lifecycle before propagating, and propagate FATAL: an ordinary
                        // throw would dissolve to a per-item null inside the combinators,
                        // and a broken provider must not read as a failed child.
                        if (this.isCancelled()) {
                            this.observer.agentEnd(__assign(__assign({}, info), { outcome: 'cancelled' }));
                            throw this.cancelledError();
                        }
                        this.observer.agentEnd(__assign(__assign({}, info), { outcome: 'failed' }));
                        throw new dsh_workflow_1.WorkflowError("child agent run failed: ".concat((0, realm_ts_1.renderThrown)(error_3)), 'AGENT_RESULT', { cause: error_3 });
                    case 13:
                        if (result.stopReason === 'completed') {
                            if (opts.schema !== undefined) {
                                // The provider honored outputSchema (capability-gated at start), so
                                // a completed run without a structured value is a child failure.
                                if (result.structured === undefined) {
                                    this.observer.agentEnd(__assign(__assign({}, info), { outcome: 'failed' }));
                                    return [2 /*return*/, null];
                                }
                                this.observer.agentEnd(__assign(__assign({}, info), { outcome: 'completed' }));
                                return [2 /*return*/, result.structured];
                            }
                            this.observer.agentEnd(__assign(__assign({}, info), { outcome: 'completed' }));
                            return [2 /*return*/, outputText(result.output)];
                        }
                        // A cancelled RUN kills the script; a child that failed for its own
                        // reasons resolves null (scripts .filter(Boolean) per the CC contract).
                        if (this.isCancelled()) {
                            this.observer.agentEnd(__assign(__assign({}, info), { outcome: 'cancelled' }));
                            throw this.cancelledError();
                        }
                        this.observer.agentEnd(__assign(__assign({}, info), { outcome: 'failed' }));
                        return [2 /*return*/, null];
                    case 14: return [4 /*yield*/, run.dispose()];
                    case 15:
                        _c.sent();
                        return [7 /*endfinally*/];
                    case 16: return [3 /*break*/, 18];
                    case 17:
                        this.releaseSlot();
                        return [7 /*endfinally*/];
                    case 18: return [2 /*return*/];
                }
            });
        });
    };
    /** Materialize + validate the `agent()` options bag from the realm. */
    WorkflowExecution.prototype.readAgentOptions = function (rawOpts) {
        if (rawOpts === undefined)
            return {};
        var opts;
        try {
            opts = (0, realm_ts_1.materializeFromRealm)(rawOpts, 'agent() options');
        }
        catch (error) {
            /* v8 ignore next -- defensive rethrow arm: materializeFromRealm only throws MaterializeError */
            if (!(error instanceof realm_ts_1.MaterializeError))
                throw error;
            throw new dsh_workflow_1.WorkflowError("agent() options must be plain JSON data \u2014 ".concat(error.message), 'INVALID_ARGUMENT', { cause: error });
        }
        if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
            throw new dsh_workflow_1.WorkflowError('agent() options must be an object', 'INVALID_ARGUMENT');
        }
        var record = opts;
        for (var _i = 0, _a = Object.keys(record); _i < _a.length; _i++) {
            var key = _a[_i];
            if (SUPPORTED_AGENT_OPTIONS.has(key))
                continue;
            if (DEFERRED_AGENT_OPTIONS.has(key)) {
                throw new dsh_workflow_1.WorkflowError("agent() option \"".concat(key, "\" is deferred and not supported by this engine (supported: label, phase, schema, provider, model)"), 'UNSUPPORTED_OPTION');
            }
            throw new dsh_workflow_1.WorkflowError("agent() option \"".concat(key, "\" is not recognized (supported: label, phase, schema, provider, model)"), 'UNSUPPORTED_OPTION');
        }
        for (var _b = 0, _c = ['label', 'phase', 'provider', 'model']; _b < _c.length; _b++) {
            var key = _c[_b];
            if (record[key] !== undefined && typeof record[key] !== 'string') {
                throw new dsh_workflow_1.WorkflowError("agent() option \"".concat(key, "\" must be a string"), 'INVALID_ARGUMENT');
            }
        }
        var schema;
        if (record.schema !== undefined) {
            try {
                (0, dsh_tools_1.assertObjectJsonSchema)(record.schema);
                schema = record.schema;
            }
            catch (error) {
                /* v8 ignore next -- defensive rethrow arm: assertObjectJsonSchema only throws JsonSchemaError */
                if (!(error instanceof dsh_tools_1.JsonSchemaError))
                    throw error;
                throw new dsh_workflow_1.WorkflowError("agent() schema is outside the supported subset \u2014 ".concat(error.message), 'UNSUPPORTED_SCHEMA', { cause: error });
            }
        }
        return __assign(__assign(__assign(__assign(__assign({}, record.label !== undefined ? { label: record.label } : {}), record.phase !== undefined ? { phase: record.phase } : {}), record.provider !== undefined ? { provider: record.provider } : {}), record.model !== undefined ? { model: record.model } : {}), schema !== undefined ? { schema: schema } : {});
    };
    /** The `parallel(thunks)` hook: each thunk caught → `null`; fatal errors propagate. */
    WorkflowExecution.prototype.parallel = function (rawThunks) {
        return __awaiter(this, void 0, void 0, function () {
            var thunks;
            var _this = this;
            return __generator(this, function (_a) {
                this.throwIfCancelled();
                if (!Array.isArray(rawThunks)) {
                    throw new dsh_workflow_1.WorkflowError('parallel() requires an array of zero-argument functions', 'INVALID_ARGUMENT');
                }
                this.assertItemCap(rawThunks.length, 'parallel()');
                thunks = rawThunks.map(function (thunk, index) {
                    if (typeof thunk !== 'function') {
                        throw new dsh_workflow_1.WorkflowError("parallel() item ".concat(index, " is not a function"), 'INVALID_ARGUMENT');
                    }
                    return thunk;
                });
                return [2 /*return*/, Promise.all(thunks.map(function (thunk) { return __awaiter(_this, void 0, void 0, function () {
                        var error_4;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    _a.trys.push([0, 2, , 3]);
                                    return [4 /*yield*/, thunk()];
                                case 1: return [2 /*return*/, _a.sent()];
                                case 2:
                                    error_4 = _a.sent();
                                    // Hook failures are WorkflowErrors built OUTSIDE the script's realm;
                                    // fatality is recognized by `instanceof` against this realm's class —
                                    // a script-built object can never pass it, so fatality cannot be
                                    // forged (nor accidentally dissolved).
                                    if ((0, dsh_workflow_1.isFatalWorkflowError)(error_4))
                                        throw error_4;
                                    return [2 /*return*/, null];
                                case 3: return [2 /*return*/];
                            }
                        });
                    }); }))];
            });
        });
    };
    /** The `pipeline(items, ...stages)` hook: per-item stage chains, NO cross-stage barrier. */
    WorkflowExecution.prototype.pipeline = function (rawItems, rawStages) {
        return __awaiter(this, void 0, void 0, function () {
            var stages;
            var _this = this;
            return __generator(this, function (_a) {
                this.throwIfCancelled();
                if (!Array.isArray(rawItems)) {
                    throw new dsh_workflow_1.WorkflowError('pipeline() requires an items array', 'INVALID_ARGUMENT');
                }
                this.assertItemCap(rawItems.length, 'pipeline()');
                if (rawStages.length === 0) {
                    throw new dsh_workflow_1.WorkflowError('pipeline() requires at least one stage function', 'INVALID_ARGUMENT');
                }
                stages = rawStages.map(function (stage, index) {
                    if (typeof stage !== 'function') {
                        throw new dsh_workflow_1.WorkflowError("pipeline() stage ".concat(index, " is not a function"), 'INVALID_ARGUMENT');
                    }
                    return stage;
                });
                return [2 /*return*/, Promise.all(rawItems.map(function (item, index) { return __awaiter(_this, void 0, void 0, function () {
                        var value, _i, stages_1, stage, error_5;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    value = item;
                                    _a.label = 1;
                                case 1:
                                    _a.trys.push([1, 6, , 7]);
                                    _i = 0, stages_1 = stages;
                                    _a.label = 2;
                                case 2:
                                    if (!(_i < stages_1.length)) return [3 /*break*/, 5];
                                    stage = stages_1[_i];
                                    return [4 /*yield*/, stage(value, item, index)];
                                case 3:
                                    value = _a.sent();
                                    _a.label = 4;
                                case 4:
                                    _i++;
                                    return [3 /*break*/, 2];
                                case 5: return [2 /*return*/, value];
                                case 6:
                                    error_5 = _a.sent();
                                    // An ordinary stage throw drops the ITEM to null and skips its
                                    // remaining stages; a fatal WorkflowError (see parallel()) kills the
                                    // whole script.
                                    if ((0, dsh_workflow_1.isFatalWorkflowError)(error_5))
                                        throw error_5;
                                    return [2 /*return*/, null];
                                case 7: return [2 /*return*/];
                            }
                        });
                    }); }))];
            });
        });
    };
    WorkflowExecution.prototype.assertItemCap = function (length, hook) {
        if (length > this.limits.maxItemsPerCall) {
            throw new dsh_workflow_1.WorkflowError("".concat(hook, " received ").concat(length, " items \u2014 over the per-call cap (").concat(this.limits.maxItemsPerCall, "); split the work or raise maxItemsPerCall in the engine config"), 'ITEM_CAP');
        }
    };
    /** The `phase(title)` hook: sets the current label for subsequent `agent()` calls and notifies observers. */
    WorkflowExecution.prototype.phase = function (title) {
        this.throwIfCancelled();
        if (typeof title !== 'string' || title.length === 0) {
            throw new dsh_workflow_1.WorkflowError('phase() requires a non-empty title string', 'INVALID_ARGUMENT');
        }
        this.currentPhase = title;
        this.observer.phase(title);
    };
    /** The `log(message)` hook: narration to observers. */
    WorkflowExecution.prototype.log = function (message) {
        this.throwIfCancelled();
        if (typeof message !== 'string') {
            throw new dsh_workflow_1.WorkflowError('log() requires a message string', 'INVALID_ARGUMENT');
        }
        this.observer.log(message);
    };
    return WorkflowExecution;
}());
exports.WorkflowExecution = WorkflowExecution;
