"use strict";
/**
 * The worker-side half of the engine: {@link runWorkerSession} wires one MessagePort to one
 * {@link WorkflowExecution} — hook progress and child starts go out as messages, run control
 * and child lifecycle come back in — and posts the run's terminal result exactly once. Keeping it
 * separate from `worker.ts` lets unit tests drive the session over a MessageChannel, because main
 * process coverage cannot observe code inside a real Worker.
 *
 * The session announces ready and waits for `go`, so cancellation racing startup can prevent even
 * the script's synchronous prefix. A cancel in place of `go` releases the gate into a cancelled
 * drive without executing the body.
 * @module @z/dsh-workflow-worker-thread/session
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
exports.requireParentPort = requireParentPort;
exports.runWorkerSession = runWorkerSession;
var dsh_llm_1 = require("@z/dsh-llm");
var protocol_ts_1 = require("./protocol.ts");
var realm_ts_1 = require("./realm.ts");
var runtime_ts_1 = require("./runtime.ts");
/**
 * The worker-side handle for one started child agent ({@link ChildHandle}):
 * every member is an RPC to the host keyed by this call's `callId`, resolved
 * by the session's message handler through the bridge's pending entry.
 */
var RpcChildHandle = /** @class */ (function () {
    function RpcChildHandle(post, callId, entry, id) {
        this.post = post;
        this.callId = callId;
        this.entry = entry;
        this.id = id;
        this.result = entry.settled.promise;
    }
    RpcChildHandle.prototype.dispose = function () {
        this.post(protocol_ts_1.WorkerToHostType.ChildDispose, { callId: this.callId });
        return this.entry.disposed.promise;
    };
    return RpcChildHandle;
}());
/**
 * The worker-side child-RPC bridge ({@link ChildPort}): allocates callIds,
 * posts the start/dispose RPCs, and owns the per-call pending
 * book-keeping the session's message handler settles via the `onChild*`
 * entry points.
 */
var ChildRpcBridge = /** @class */ (function () {
    function ChildRpcBridge(post) {
        this.post = post;
        this.nextCallId = 0;
        this.pending = new Map();
    }
    ChildRpcBridge.prototype.startAgent = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var callId, entry, childId;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.nextCallId += 1;
                        callId = this.nextCallId;
                        entry = {
                            started: Promise.withResolvers(),
                            settled: Promise.withResolvers(),
                            disposed: Promise.withResolvers(),
                        };
                        // Containment: when asynchronous provider start fails (or
                        // the run is torn down), the settled promise may never gain a consumer —
                        // it must not surface as an unhandled rejection and kill the worker.
                        entry.settled.promise.catch(function () { });
                        this.pending.set(callId, entry);
                        this.post(protocol_ts_1.WorkerToHostType.ChildStart, { callId: callId, request: request });
                        return [4 /*yield*/, entry.started.promise];
                    case 1:
                        childId = _a.sent();
                        return [2 /*return*/, new RpcChildHandle(this.post, callId, entry, childId)];
                }
            });
        });
    };
    /** The host established a published child; releases the `startAgent` await. */
    ChildRpcBridge.prototype.onChildStarted = function (callId, childId) {
        var _a;
        (_a = this.pending.get(callId)) === null || _a === void 0 ? void 0 : _a.started.resolve(childId);
    };
    /** Asynchronous provider start failed; reject and retire the pending RPC. */
    ChildRpcBridge.prototype.onChildStartError = function (callId, rendered) {
        var entry = this.pending.get(callId);
        this.pending.delete(callId);
        entry === null || entry === void 0 ? void 0 : entry.started.reject(new Error(rendered));
    };
    /** The child's terminal result arrived. */
    ChildRpcBridge.prototype.onChildSettled = function (callId, result) {
        var _a;
        (_a = this.pending.get(callId)) === null || _a === void 0 ? void 0 : _a.settled.resolve(result);
    };
    /** The child's `result` rejected host-side (an infrastructure fault, relayed as fatal). */
    ChildRpcBridge.prototype.onChildFailed = function (callId, rendered) {
        var _a;
        (_a = this.pending.get(callId)) === null || _a === void 0 ? void 0 : _a.settled.reject(new Error(rendered));
    };
    /** The host acked the dispose; the call's book-keeping is complete. */
    ChildRpcBridge.prototype.onChildDisposed = function (callId) {
        var entry = this.pending.get(callId);
        this.pending.delete(callId);
        entry === null || entry === void 0 ? void 0 : entry.disposed.resolve();
    };
    return ChildRpcBridge;
}());
/**
 * Narrow the nullable `parentPort` the bootstrap reads from
 * `node:worker_threads`.
 * @param port - `parentPort` as imported (null on the main thread).
 * @returns the port, non-null.
 */
function requireParentPort(port) {
    if (port === null)
        throw new Error('the workflow worker entry must be loaded inside a worker thread (no parentPort)');
    return port;
}
/**
 * Run one workflow script to settlement against `port`, posting the terminal result message
 * exactly once; resolves after that post (stray children may still be winding down through the
 * port — the host owns their teardown and ultimately terminates the thread). It never rejects:
 * constructor failure becomes an error result. Host pre-parse makes syntax failure here a likely
 * Node-version skew, but the session still reports it instead of dying silently.
 * @param port - the channel to the host (the real `parentPort`, or one side
 *   of an in-process `MessageChannel` in tests).
 * @param init - the run payload the host provided as `workerData`.
 */
function runWorkerSession(port, init) {
    return __awaiter(this, void 0, void 0, function () {
        var post, children, observer, execution, gate, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    post = function (type, payload) {
                        port.postMessage(__assign({ type: type }, payload));
                    };
                    children = new ChildRpcBridge(post);
                    observer = {
                        phase: function (title) { post(protocol_ts_1.WorkerToHostType.Phase, { title: title }); },
                        log: function (message) { post(protocol_ts_1.WorkerToHostType.Log, { message: message }); },
                        agentStart: function (info) { post(protocol_ts_1.WorkerToHostType.AgentStart, { info: info }); },
                        agentEnd: function (info) { post(protocol_ts_1.WorkerToHostType.AgentEnd, { info: info }); },
                    };
                    try {
                        execution = new runtime_ts_1.WorkflowExecution(init.meta, init.body, init.args, init.limits, observer, children);
                    }
                    catch (error) {
                        post(protocol_ts_1.WorkerToHostType.Result, { result: { value: null, stopReason: 'error', error: (0, realm_ts_1.renderThrown)(error), agentsStarted: 0 } });
                        return [2 /*return*/];
                    }
                    gate = Promise.withResolvers();
                    port.on('message', function (message) {
                        switch (message.type) {
                            case protocol_ts_1.HostToWorkerType.Go:
                                gate.resolve();
                                break;
                            case protocol_ts_1.HostToWorkerType.Cancel:
                                execution.cancel(message.reason);
                                // A cancel doubles as the gate release: drive() checks the cancelled
                                // state before running the body, so the script never executes.
                                gate.resolve();
                                break;
                            case protocol_ts_1.HostToWorkerType.ChildStarted:
                                children.onChildStarted(message.callId, message.childId);
                                break;
                            case protocol_ts_1.HostToWorkerType.ChildStartError:
                                children.onChildStartError(message.callId, message.rendered);
                                break;
                            case protocol_ts_1.HostToWorkerType.ChildSettled:
                                children.onChildSettled(message.callId, message.result);
                                break;
                            case protocol_ts_1.HostToWorkerType.ChildFailed:
                                children.onChildFailed(message.callId, message.rendered);
                                break;
                            case protocol_ts_1.HostToWorkerType.ChildDisposed:
                                children.onChildDisposed(message.callId);
                                break;
                            /* v8 ignore next 2 -- closed engine-owned union; the arm only makes adding a message type a compile error */
                            default:
                                (0, dsh_llm_1.assertNever)(message, 'host-to-worker message');
                        }
                    });
                    post(protocol_ts_1.WorkerToHostType.Ready, {});
                    return [4 /*yield*/, gate.promise];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, execution.drive()];
                case 2:
                    result = _a.sent();
                    post(protocol_ts_1.WorkerToHostType.Result, { result: result });
                    return [2 /*return*/];
            }
        });
    });
}
