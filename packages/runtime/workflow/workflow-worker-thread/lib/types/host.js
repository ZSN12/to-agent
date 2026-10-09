"use strict";
/**
 * Host side of one workflow run. The first worker result, unexpected death, or
 * cancellation-grace expiry owns settlement and closes message admission.
 * Pending starts share one abort signal; published children share idempotent
 * cleanup, and quiescence waits for both while synthesizing any missing end events.
 * @module @z/dsh-workflow-worker-thread/host
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
exports.WorkerRun = void 0;
exports.workerSpawnEnv = workerSpawnEnv;
var node_os_1 = require("node:os");
var node_worker_threads_1 = require("node:worker_threads");
var node_url_1 = require("node:url");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_session_1 = require("@z/dsh-session");
var realm_ts_1 = require("./realm.ts");
var protocol_ts_1 = require("./protocol.ts");
/**
 * The scrubbed worker environment: no ambient credentials, no loader flags.
 * Windows derives `os.tmpdir()` from `TMP`/`TEMP` and falls back to the
 * literal relative path `undefined\temp` when the environment is empty, so
 * tsx's transform cache would land in a cwd-relative `undefined/temp`
 * directory; the host's real temp path (not a credential) is injected there.
 * The unbuilt shape additionally forwards `TSX_TSCONFIG_PATH` for path
 * resolution.
 * @param platform - host platform; overridable so tests exercise both peer arms.
 * @param tsconfigPath - the tsconfig pin to forward; only the unbuilt caller
 *   passes one, so the built worker never observes the host's pin.
 * @returns the scrubbed worker environment object.
 */
function workerSpawnEnv(platform, tsconfigPath) {
    if (platform === void 0) { platform = process.platform; }
    var env = {};
    if (platform === 'win32') {
        var tmp = (0, node_os_1.tmpdir)();
        env.TMP = tmp;
        env.TEMP = tmp;
    }
    if (tsconfigPath !== undefined)
        env.TSX_TSCONFIG_PATH = tsconfigPath;
    return env;
}
/**
 * Resolve a built worker bundle or an unbuilt bootstrap that installs both tsx
 * transforms inside the worker. Both shapes clear `execArgv` and the ambient
 * environment (the worker only sees the platform temp path and, unbuilt,
 * `TSX_TSCONFIG_PATH`).
 * @param init - the run payload, passed as `workerData`.
 * @returns the entry path or URL and the Worker options to spawn it with.
 */
function resolveWorkerSpawn(init) {
    /* v8 ignore next 3 -- the built-output arm: tests always run unbuilt (src/); the built-worker e2e exercises this shape for real */
    if (!import.meta.url.endsWith('.ts')) {
        return { entry: (0, node_url_1.fileURLToPath)(new URL('./worker.cjs', import.meta.url)), options: { workerData: init, env: workerSpawnEnv(), execArgv: [] } };
    }
    // Resolve tsx only for unbuilt consumers and install it before importing TS.
    var workerEntry = new URL('./worker.ts', import.meta.url);
    var tsxEsmApiEntry = import.meta.resolve('tsx/esm/api');
    var tsxCjsApiEntry = import.meta.resolve('tsx/cjs/api');
    var bootstrap = [
        "import { register as registerEsm } from ".concat(JSON.stringify(tsxEsmApiEntry)),
        "import { register as registerCjs } from ".concat(JSON.stringify(tsxCjsApiEntry)),
        'registerCjs()',
        'registerEsm()',
        "await import(".concat(JSON.stringify(workerEntry.href), ")"),
    ].join('\n');
    return {
        entry: new URL("data:text/javascript,".concat(encodeURIComponent(bootstrap))),
        options: {
            workerData: init,
            env: workerSpawnEnv(undefined, process.env.TSX_TSCONFIG_PATH),
            execArgv: [],
        },
    };
}
/**
 * One live worker-engine run — the seam's {@link WorkflowRun}, returned by
 * `start()` directly. Owns the Worker, the child registry, and the result
 * settlement; `result` never rejects. `meta` is trusted same-process data
 * borrowed as immutable by the handle and lifecycle events. The holder-bound
 * SubagentRuntime handle is captured before the
 * engine returns this run, so unloading the engine removes only the ability to
 * start another workflow; this run can still start and clean up its children.
 */
var WorkerRun = /** @class */ (function () {
    function WorkerRun(ctx, subagents, id, meta, parent, init, provider, disposeGraceMs, observer, signal) {
        var _this = this;
        this.ctx = ctx;
        this.subagents = subagents;
        this.id = id;
        this.meta = meta;
        this.parent = parent;
        this.provider = provider;
        this.disposeGraceMs = disposeGraceMs;
        this.observer = observer;
        this.settled = false;
        /** A Result/death/grace outcome atomically won before teardown callbacks. */
        this.terminalClaimed = false;
        /** The first death signal closes worker-message admission and owns failure-time cleanup. */
        this.workerDeathObserved = false;
        /** Set on `exit`: the thread is gone, so posting has nowhere to go. */
        this.workerGone = false;
        /** Accepted `child-start` messages — the terminate-path `agentsStarted` (see module doc). */
        this.hostStarted = 0;
        /** Published children by callId; an entry leaves only after disposal settles. */
        this.children = new Map();
        /** Provider starts that have not yet fulfilled or rejected. */
        this.pendingStarts = new Set();
        /** Started-but-not-ended agents by seq — the pairing ledger the HOST guarantees (see {@link endAgent}). */
        this.liveAgents = new Map();
        this.quiescenceWaiters = [];
        /** The per-run abort fanout every child start request carries. */
        this.controller = new AbortController();
        this.result = new Promise(function (resolve) { _this.settleResolve = resolve; });
        // workerData rides the structured clone: args are plain JSON by the seam
        // contract, so the clone is total and doubles as the caller-isolation
        // copy (a clone failure throws loud out of start()).
        var _a = resolveWorkerSpawn(init), entry = _a.entry, options = _a.options;
        this.worker = new node_worker_threads_1.Worker(entry, options);
        this.worker.on('message', function (message) { _this.onMessage(message); });
        this.worker.on('error', function (error) { _this.onWorkerDeath("workflow worker failed: ".concat((0, realm_ts_1.renderThrown)(error)), false); });
        /* v8 ignore next -- messageerror: not constructible from the engine's own protocol (every payload is JSON data) */
        this.worker.on('messageerror', function (error) { _this.onWorkerDeath("workflow worker message failed to deserialize: ".concat((0, realm_ts_1.renderThrown)(error)), false); });
        this.worker.on('exit', function (code) {
            _this.workerGone = true;
            _this.onWorkerDeath("workflow worker exited before the run settled (exit code ".concat(code, ")"), true);
        });
        if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
            this.cancel('workflow start signal already aborted');
        }
        else if (signal !== undefined) {
            var onAbort = function () {
                _this.detachInputSignal();
                _this.cancel('workflow signal aborted');
            };
            this.inputSignal = signal;
            this.inputSignalAbort = onAbort;
            signal.addEventListener('abort', onAbort, { once: true });
        }
    }
    /**
     * Cancel the run: the worker is told (its hooks start throwing and the
     * script dies at its next await), the required signal shared by every child
     * start is aborted, and the grace timer
     * arms: a run still unsettled `disposeGraceMs` later force-settles
     * `cancelled` and its worker is TERMINATED. Idempotent; the first reason
     * wins.
     * @param reason - human-readable cause (default `'workflow cancelled'`).
     */
    WorkerRun.prototype.cancel = function (reason) {
        var _this = this;
        // A settled run has nothing left to cancel, and a terminal source claimed
        // before its cleanup callbacks must exclude cancellation reentered by one
        // of those callbacks. Without the settled guard the
        // ordinary consumer path (await result, then dispose -> cancel) would arm
        // a grace timer nothing ever clears, pinning the run and its Worker
        // closure until the grace expires - a bounded leak per completed run.
        if (this.settled || this.terminalClaimed || this.cancelReason !== undefined)
            return;
        this.cancelReason = reason !== null && reason !== void 0 ? reason : 'workflow cancelled';
        this.post(protocol_ts_1.HostToWorkerType.Cancel, { reason: this.cancelReason });
        this.abortChildren(this.cancelReason);
        this.graceTimer = setTimeout(function () {
            // Cancellation already owns the race through cancelReason; close the
            // terminal boundary explicitly before observer teardown callbacks.
            _this.terminalClaimed = true;
            // The worker may no longer speak (it is about to be terminated): pair
            // every stranded start before the run settles, so ends precede
            // workflow/end.
            _this.endStrandedAgents();
            _this.settleResult(_this.cancelledResult(_this.hostStarted));
            void _this.worker.terminate();
        }, this.disposeGraceMs);
        // unref'd: an armed grace timer must never hold the process open.
        this.graceTimer.unref();
    };
    /**
     * Cancel + bounded settle + termination. Host-drives every registered
     * child's disposal IMMEDIATELY — a wedged worker can relay no dispose RPC,
     * and deferring child teardown to the post-terminate reap would spend the
     * whole grace waiting for a quiescence that cannot start, then return with
     * the disposals still in flight — so child disposal overlaps the same
     * grace the worker gets to settle (the worker's own dispose RPCs join the
     * shared per-child disposal). Waits (at most the grace) for the result and
     * child quiescence, then terminates the worker unconditionally — the
     * thread never outlives its run — and reaps whatever children remain
     * (their disposal is contained, not awaited past the grace, the same
     * abandonment the seam documents for a slow-disposing child). Idempotent;
     * safe on every path.
     * @returns resolves when the run's resources are released or abandoned.
     */
    WorkerRun.prototype.dispose = function () {
        var _this = this;
        if (this.disposed !== undefined)
            return this.disposed;
        // Claim the public transaction BEFORE its body invokes child/provider
        // disposal. A raw provider callback can reenter handle.dispose(); it must
        // join this promise rather than start a second traversal.
        var claimed = Promise.withResolvers();
        this.disposed = claimed.promise;
        void (function () { return __awaiter(_this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.detachInputSignal();
                        this.cancel('workflow disposed');
                        // cancel() deliberately becomes a no-op after terminal settlement, but
                        // disposal still owns every registered child. Reap independently so an
                        // already-settled workflow cannot wait on child quiescence before it has
                        // started the surviving children's disposals. On an unsettled run this
                        // joins the cancel path through the per-call cancellation/disposal gates.
                        this.reapChildren('workflow disposed');
                        return [4 /*yield*/, Promise.race([
                                (function () { return __awaiter(_this, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, this.result];
                                            case 1:
                                                _a.sent();
                                                return [4 /*yield*/, this.childQuiescence()];
                                            case 2:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })(),
                                sleep(this.disposeGraceMs),
                            ])];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.worker.terminate()];
                    case 2:
                        _a.sent();
                        this.reapChildren('workflow disposed');
                        return [2 /*return*/];
                }
            });
        }); })().then(function () { claimed.resolve(undefined); }, 
        /* v8 ignore next -- result/quiescence never reject and Worker.terminate is the only external promise */
        function (error) { claimed.reject(error); });
        return this.disposed;
    };
    /** Post one message to the worker (payload looked up from the tag's map entry), tolerating a thread that is already gone. */
    WorkerRun.prototype.post = function (type, payload) {
        if (this.workerGone || this.workerDeathObserved)
            return;
        try {
            this.worker.postMessage(__assign({ type: type }, payload));
        }
        catch (error) {
            // Only a teardown race can land here (every engine message is JSON
            // data, so serialization cannot fail); there is nothing left to
            // deliver to — log and move on.
            /* v8 ignore next -- postMessage teardown race (a throw between exit and its event): not constructible in-process */
            this.ctx.logger.warn("workflow-worker-thread: postMessage failed: ".concat((0, realm_ts_1.renderThrown)(error)));
        }
    };
    WorkerRun.prototype.onMessage = function (message) {
        // Node may emit `error`, then deliver an already-queued `message`, then
        // emit `exit`. The first death signal is the host's logical delivery
        // barrier: nothing arriving afterward may create a child, narrate after
        // workflow/end, or compete with the chosen outcome.
        if (this.workerDeathObserved)
            return;
        switch (message.type) {
            case protocol_ts_1.WorkerToHostType.Ready:
                this.post(protocol_ts_1.HostToWorkerType.Go, {});
                break;
            case protocol_ts_1.WorkerToHostType.Phase:
                // Post-cancel narration is suppressed host-side: worker-side the
                // hooks throw once the cancel message is PROCESSED, but narration
                // already in flight (or emitted while the cancel crossed the
                // boundary) must not reach observers — nothing is emitted after
                // cancel() returns.
                if (this.cancelReason === undefined)
                    this.observer.phase(message.title);
                break;
            case protocol_ts_1.WorkerToHostType.Log:
                if (this.cancelReason === undefined)
                    this.observer.log(message.message);
                break;
            case protocol_ts_1.WorkerToHostType.AgentStart:
                this.liveAgents.set(message.info.seq, message.info);
                this.observer.agentStart(message.info);
                break;
            case protocol_ts_1.WorkerToHostType.AgentEnd:
                // NOT suppressed on cancel: cancelled children report their paired
                // agent-end with outcome 'cancelled'. The gate (with the termination
                // paths' synthesis) is what makes the one-pair-per-started-child
                // contract hold on every stop path.
                this.endAgent(message.info);
                break;
            case protocol_ts_1.WorkerToHostType.ChildStart:
                this.onChildStart(message.callId, message.request);
                break;
            case protocol_ts_1.WorkerToHostType.ChildDispose:
                this.onChildDispose(message.callId);
                break;
            case protocol_ts_1.WorkerToHostType.Result:
                this.onResult(message.result);
                break;
            /* v8 ignore next 2 -- closed engine-owned union; the arm only makes adding a message type a compile error */
            default:
                (0, dsh_llm_1.assertNever)(message, 'worker-to-host message');
        }
    };
    /** Why a ready provider result may no longer be admitted to the worker. */
    WorkerRun.prototype.childAdmissionFailure = function () {
        if (this.cancelReason !== undefined) {
            return { reason: this.cancelReason, rendered: "workflow run cancelled: ".concat(this.cancelReason) };
        }
        if (this.workerDeathObserved) {
            return { reason: 'workflow worker gone', rendered: 'workflow worker is no longer available' };
        }
        if (this.terminalClaimed) {
            return { reason: 'workflow settled', rendered: 'workflow run already settled' };
        }
        return undefined;
    };
    WorkerRun.prototype.onChildStart = function (callId, request) {
        var _this = this;
        var initialFailure = this.childAdmissionFailure();
        if (initialFailure !== undefined) {
            // Refuse after a terminal boundary: a child must never start on an
            // already-aborted signal (a provider subscribing only to future abort
            // events would never observe it).
            this.post(protocol_ts_1.HostToWorkerType.ChildStartError, { callId: callId, rendered: initialFailure.rendered });
            return;
        }
        this.hostStarted += 1;
        var task = this.startChild(callId, request);
        this.pendingStarts.add(task);
        void task.then(function () { _this.finishPendingStart(task); }, 
        /* v8 ignore next -- startChild contains provider and cleanup failures */
        function () { _this.finishPendingStart(task); });
    };
    /** Await one provider-owned startup transaction and publish only while admitted. */
    WorkerRun.prototype.startChild = function (callId, request) {
        return __awaiter(this, void 0, void 0, function () {
            var run, error_1, failure_1, failure, error_2, record, forwardResult;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.subagents.start(this.provider, __assign(__assign({ prompt: [{ type: 'text', text: request.prompt }], parent: this.parent, signal: this.controller.signal }, request.schema !== undefined ? { outputSchema: request.schema } : {}), request.provider !== undefined || request.model !== undefined
                                ? {
                                    agentOptions: __assign(__assign({}, request.provider !== undefined ? { provider: request.provider } : {}), request.model !== undefined ? { model: request.model } : {}),
                                }
                                : {}))];
                    case 1:
                        run = _b.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _b.sent();
                        failure_1 = this.childAdmissionFailure();
                        this.post(protocol_ts_1.HostToWorkerType.ChildStartError, {
                            callId: callId,
                            rendered: (_a = failure_1 === null || failure_1 === void 0 ? void 0 : failure_1.rendered) !== null && _a !== void 0 ? _a : (0, realm_ts_1.renderThrown)(error_1),
                        });
                        return [2 /*return*/];
                    case 3:
                        failure = this.childAdmissionFailure();
                        if (!(failure !== undefined)) return [3 /*break*/, 8];
                        this.post(protocol_ts_1.HostToWorkerType.ChildStartError, { callId: callId, rendered: failure.rendered });
                        _b.label = 4;
                    case 4:
                        _b.trys.push([4, 6, , 7]);
                        return [4 /*yield*/, run.dispose()];
                    case 5:
                        _b.sent();
                        return [3 /*break*/, 7];
                    case 6:
                        error_2 = _b.sent();
                        this.ctx.logger.warn("workflow-worker-thread: refused child dispose failed: ".concat((0, realm_ts_1.renderThrown)(error_2)));
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                    case 8:
                        record = { run: run };
                        this.children.set(callId, record);
                        forwardResult = run.result.then(function (result) {
                            try {
                                var snapshot_1 = (0, dsh_session_1.snapshotJsonValue)(__assign(__assign({ output: result.output }, result.structured !== undefined ? { structured: result.structured } : {}), { stopReason: result.stopReason }));
                                if (snapshot_1 === undefined)
                                    throw new TypeError('child result is not losslessly JSON-serializable');
                                return function () { _this.post(protocol_ts_1.HostToWorkerType.ChildSettled, { callId: callId, result: snapshot_1 }); };
                            }
                            catch (error) {
                                var rendered_1 = "workflow child result could not cross the worker boundary: ".concat((0, realm_ts_1.renderThrown)(error));
                                return function () { _this.post(protocol_ts_1.HostToWorkerType.ChildFailed, { callId: callId, rendered: rendered_1 }); };
                            }
                        }, function (error) {
                            var rendered = (0, realm_ts_1.renderThrown)(error);
                            return function () { _this.post(protocol_ts_1.HostToWorkerType.ChildFailed, { callId: callId, rendered: rendered }); };
                        });
                        this.post(protocol_ts_1.HostToWorkerType.ChildStarted, { callId: callId, childId: run.id });
                        void forwardResult.then(function (forward) { forward(); });
                        return [2 /*return*/];
                }
            });
        });
    };
    WorkerRun.prototype.onChildDispose = function (callId) {
        var _this = this;
        var record = this.children.get(callId);
        if (record === undefined) {
            // Already disposed host-side (a dispose() drive or a death reap beat
            // the RPC) — the ack is still owed (the worker-side wrapper awaits it).
            this.post(protocol_ts_1.HostToWorkerType.ChildDisposed, { callId: callId });
            return;
        }
        // disposeChild never rejects (containment is inside), so the ack always follows.
        void this.disposeChild(callId, record).then(function () { _this.post(protocol_ts_1.HostToWorkerType.ChildDisposed, { callId: callId }); });
    };
    /**
     * Start (or join) one registered child's disposal; the registry entry
     * leaves when it settles. Memoized per callId: the worker's dispose RPC,
     * the dispose() host drive, and the reap can all land on the same child —
     * the child's `dispose()` runs once and every caller awaits that one
     * settlement. A rejection is contained (the subagent seam's dispose() is
     * not supposed to reject, but a backend that does anyway must not break
     * quiescence): logged, and the child still leaves the registry.
     * @param callId - the child's registry key.
     * @param record - the registered child (the caller looked it up).
     * @returns resolves when the disposal settled either way; never rejects.
     */
    WorkerRun.prototype.disposeChild = function (callId, record) {
        var _this = this;
        if (record.disposal !== undefined)
            return record.disposal;
        record.disposal = Promise.resolve()
            .then(function () { return record.run.dispose(); })
            .catch(function (error) {
            _this.ctx.logger.warn("workflow-worker-thread: child dispose failed: ".concat((0, realm_ts_1.renderThrown)(error)));
        })
            .then(function () { _this.finishChild(callId); });
        return record.disposal;
    };
    /** Drop a child record and release quiescence waiters when all work ends. */
    WorkerRun.prototype.finishChild = function (callId) {
        this.children.delete(callId);
        this.notifyChildQuiescence();
    };
    /** Retire one provider startup transaction. */
    WorkerRun.prototype.finishPendingStart = function (task) {
        this.pendingStarts.delete(task);
        this.notifyChildQuiescence();
    };
    /** Release waiters only after both pending starts and published children end. */
    WorkerRun.prototype.notifyChildQuiescence = function () {
        if (this.children.size !== 0 || this.pendingStarts.size !== 0)
            return;
        for (var _i = 0, _a = this.quiescenceWaiters.splice(0); _i < _a.length; _i++) {
            var waiter = _a[_i];
            waiter();
        }
    };
    /** Resolves once every pending start and published child has reached quiescence. */
    WorkerRun.prototype.childQuiescence = function () {
        var _this = this;
        if (this.children.size === 0 && this.pendingStarts.size === 0)
            return Promise.resolve();
        return new Promise(function (resolve) { _this.quiescenceWaiters.push(resolve); });
    };
    /** Abort + dispose every registered child (worker death / final teardown); disposal is contained, not awaited. */
    WorkerRun.prototype.reapChildren = function (reason) {
        var _a;
        this.abortChildren((_a = this.cancelReason) !== null && _a !== void 0 ? _a : reason);
        for (var _i = 0, _b = __spreadArray([], this.children, true); _i < _b.length; _i++) {
            var _c = _b[_i], callId = _c[0], record = _c[1];
            void this.disposeChild(callId, record);
        }
    };
    /** Abort the one canonical signal shared by pending and published children. */
    WorkerRun.prototype.abortChildren = function (reason) {
        if (!this.controller.signal.aborted)
            this.controller.abort(reason);
    };
    WorkerRun.prototype.onResult = function (result) {
        // The owned worker session sends one Result. Keep a late duplicate or a
        // Result queued behind another terminal source completely side-effect-free.
        if (this.terminalClaimed)
            return;
        // First-wins is decided when the Result message reaches the host. If no
        // external cancellation was already in flight, this result won. Reaping a
        // stray child below may synchronously reenter cancel() through provider
        // callbacks, but that internal post-result cleanup must not retroactively
        // rewrite the worker result that arrived first.
        var cancellationWasRequested = this.cancelReason !== undefined;
        // Claim before settlement cleanup invokes provider disposal. Once Result
        // won, a later cancellation cannot rewrite it.
        this.terminalClaimed = true;
        // Abort pending starts and begin disposing published children before the
        // workflow becomes externally settled. Cleanup remains independently
        // tracked by childQuiescence and the holder's dispose().
        this.reapChildren('workflow settled');
        if (!cancellationWasRequested) {
            this.settleResult(result);
            return;
        }
        if (result.stopReason !== 'cancelled') {
            // The script settled while our cancel was crossing the thread boundary
            // — the seam-visible result had NOT settled when cancellation was
            // requested, so report cancelled (the vm drive()'s post-settle check,
            // relocated to the receiving side of the race).
            this.settleResult(this.cancelledResult(result.agentsStarted));
            return;
        }
        this.settleResult(result);
    };
    /** Process an error/messageerror/exit signal; `exit` also performs the final disposal sweep. */
    WorkerRun.prototype.onWorkerDeath = function (message, isExit) {
        if (!this.workerDeathObserved) {
            // Close message admission BEFORE cleanup callbacks: Node can deliver a
            // message queued before the crash after its `error` event. Treating the
            // first death signal as a logical barrier prevents that late message
            // from creating work or narrating after workflow/end.
            this.workerDeathObserved = true;
            var outcomeWasClaimed = this.terminalClaimed;
            var cancellationWasRequested = this.cancelReason !== undefined;
            // When death is itself the terminal source, claim BEFORE child reap or
            // synthesized observer callbacks. Either can reenter cancel(); a death
            // that arrived first remains an error, while a cancellation already
            // accepted before death remains cancelled. If Result/grace already won,
            // preserve it while still performing prompt failure-time cleanup.
            if (!outcomeWasClaimed)
                this.terminalClaimed = true;
            if (this.children.size > 0 || this.pendingStarts.size > 0)
                this.reapChildren('workflow worker gone');
            this.endStrandedAgents();
            if (!outcomeWasClaimed) {
                if (cancellationWasRequested) {
                    this.settleResult(this.cancelledResult(this.hostStarted));
                }
                else {
                    this.settleResult({ value: null, stopReason: 'error', error: message, agentsStarted: this.hostStarted });
                }
            }
        }
        if (!isExit)
            return;
        // `error` is not Node's physical delivery barrier: a queued message may
        // precede `exit`. Admission is already closed, so this final sweep only
        // joins/starts disposal for registry survivors; it deliberately does not
        // repeat explicit provider cancellation.
        for (var _i = 0, _a = __spreadArray([], this.children, true); _i < _a.length; _i++) {
            var _b = _a[_i], callId = _b[0], record = _b[1];
            void this.disposeChild(callId, record);
        }
        this.endStrandedAgents();
    };
    /**
     * The single agent-end emission gate: forwards `end` iff its start is still
     * unpaired in the ledger, so every forwarded `workflow/agent-start` gets
     * EXACTLY one `workflow/agent-end` — the worker's own report where it can
     * speak, a host-synthesized one where it cannot ({@link endStrandedAgents}).
     * @param end - the settlement to emit (worker-reported or synthesized).
     */
    WorkerRun.prototype.endAgent = function (end) {
        /* v8 ignore next -- a real end still in flight across the grace force-settle: not orderable in-process */
        if (!this.liveAgents.delete(end.seq))
            return;
        this.observer.agentEnd(end);
    };
    /**
     * Synthesize the missing `agent-end` for every started-but-unpaired agent,
     * outcome `'cancelled'`: the reap cancels every child, and a real
     * settlement racing the force-settle loses to that already-started external
     * cancellation. The atomic terminal boundaries in {@link onResult} and
     * {@link onWorkerDeath} deliberately exclude teardown callbacks as contenders.
     * Called where the worker can no longer speak (the grace force-settle,
     * worker death, physical exit). When grace/death is the terminal source it
     * runs before settleResult, so already-known pairs precede `workflow/end`;
     * after an earlier Result, exit cleanup may close a survivor afterward.
     * The ledger preserves exactly-once pairing in both orders.
     */
    WorkerRun.prototype.endStrandedAgents = function () {
        for (var _i = 0, _a = __spreadArray([], this.liveAgents.values(), true); _i < _a.length; _i++) {
            var info = _a[_i];
            this.endAgent(__assign(__assign({}, info), { outcome: 'cancelled' }));
        }
    };
    WorkerRun.prototype.cancelledResult = function (agentsStarted) {
        var _a;
        // cancel() is the only writer of cancelReason and every caller checks it
        // first; the fallback guards the type, not a reachable path.
        /* v8 ignore next */
        var reason = (_a = this.cancelReason) !== null && _a !== void 0 ? _a : 'workflow cancelled';
        return { value: null, stopReason: 'cancelled', error: "workflow run cancelled: ".concat(reason), agentsStarted: agentsStarted };
    };
    /** Remove the exact abort callback installed on the caller's start signal. */
    WorkerRun.prototype.detachInputSignal = function () {
        var signal = this.inputSignal;
        var onAbort = this.inputSignalAbort;
        if (signal === undefined || onAbort === undefined)
            return;
        this.inputSignal = undefined;
        this.inputSignalAbort = undefined;
        signal.removeEventListener('abort', onAbort);
    };
    /** First settle wins; disarms the grace timer and releases the caller signal. */
    WorkerRun.prototype.settleResult = function (result) {
        // Every current terminal source claims ownership before calling here; keep
        // the fallback local so a future caller cannot resolve twice.
        /* v8 ignore next -- defensive fallback outside the claimed state machine */
        if (this.settled)
            return;
        this.terminalClaimed = true;
        this.settled = true;
        this.detachInputSignal();
        clearTimeout(this.graceTimer);
        this.settleResolve(result);
    };
    return WorkerRun;
}());
exports.WorkerRun = WorkerRun;
/** A plain timer sleep (the dispose grace); unref'd so it never holds the process open. */
function sleep(ms) {
    return new Promise(function (resolve) {
        var timer = setTimeout(resolve, ms);
        timer.unref();
    });
}
