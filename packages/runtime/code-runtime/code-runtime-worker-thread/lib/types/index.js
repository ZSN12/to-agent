"use strict";
/**
 * Worker-thread code runtime: a fresh worker runs each host-type-stripped TypeScript program
 * and bridges bindings over its message port. This is containment, not a security boundary:
 * model code has bash-equivalent trust despite an empty environment, a heap cap, measured
 * event-loop busy-time and wall-time budgets, and termination that also stops synchronous loops.
 * @module @z/dsh-code-runtime-worker-thread
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
exports.WorkerThreadCodeRuntime = void 0;
var node_worker_threads_1 = require("node:worker_threads");
var node_module_1 = require("node:module");
var node_url_1 = require("node:url");
var schemastery_1 = require("@z/schemastery");
var dsh_timeout_1 = require("@z/dsh-timeout");
var dsh_code_runtime_1 = require("@z/dsh-code-runtime");
var dsh_session_1 = require("@z/dsh-session");
var output_json_ts_1 = require("./output-json.ts");
var worker_json_ts_1 = require("./worker-json.ts");
/**
 * How often the host samples the worker's event-loop utilization for the
 * `computeMs` budget. An internal cadence, not config: the only effect of
 * the interval is budget-expiry granularity (a run can overshoot by up to
 * one interval), and nothing a deployment could tune here improves that
 * without burning host CPU.
 */
var ELU_POLL_INTERVAL_MS = 25;
/** Smallest cap that can represent the counted payloads: an empty logs array plus an empty JSON failure message. */
var MIN_OUTPUT_BYTES = 4;
/**
 * The seam's language-portable identifier subset (see
 * `CodeBindingNamespace.global`): no `$`, which is JS-only spelling — the same
 * namespace list must be usable against every backend regardless of language.
 */
var IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
/**
 * The shell a program is wrapped in for the type-strip, matching the
 * grammatical context it will execute in (an async function body, where
 * top-level `return` and `await` are legal — a bare module parse would
 * reject the `return`). Strip mode is position-preserving (removed syntax
 * becomes whitespace, nothing shifts), so the wrapper survives the strip
 * byte-identical and the body slices back out with the model's own
 * line/column positions intact.
 */
var STRIP_WRAP = { prefix: 'async function __dsh_program__() {\n', suffix: '\n}' };
/**
 * The worker entry path. Source runs unbuilt (`src/worker.ts`, loadable
 * directly on this repo's Node range via native type stripping — the file
 * is erasable-only with type-only relative imports); the built package
 * ships it as a sibling CommonJS bundle (`lib/worker.cjs`, its own tsdown
 * entry) because pkg's VFS Worker hook compiles string-path entries as
 * CommonJS.
 * The URL *pathname*'s extension says which world this module is in —
 * pathname, because dev-time module runners (vitest) may suffix
 * `import.meta.url` with a query string; relative resolution drops it. Worker
 * receives a filesystem string so pkg's VFS Worker hook can resolve it.
 */
/* v8 ignore next -- the './worker.cjs' arm is the built-lib world, unreachable unbuilt by construction; the built-lib e2e pins it. */
var WORKER_PATH = (0, node_url_1.fileURLToPath)(new URL(new URL(import.meta.url).pathname.endsWith('.ts') ? './worker.ts' : './worker.cjs', import.meta.url));
/** Render an unknown thrown value as a message, `Error` or not. */
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/** Resolve after a worker pipe emits all queued data, or closes/errors during termination. */
function waitForPipeDrain(stream) {
    if (stream.readableEnded || stream.destroyed)
        return Promise.resolve();
    return new Promise(function (resolve) {
        var done = function () {
            stream.off('end', done);
            stream.off('close', done);
            stream.off('error', done);
            resolve();
        };
        stream.once('end', done);
        stream.once('close', done);
        stream.once('error', done);
        // Close the event-registration race if termination finished between the
        // initial state check and the listeners above.
        /* v8 ignore next -- this race cannot be scheduled deterministically between the adjacent state check and listener registration. */
        if (stream.readableEnded || stream.destroyed)
            done();
    });
}
/**
 * Runtime shape gate for inbound port traffic. The peer runs MODEL CODE and
 * can post anything — `null`, primitives, objects with poisoned fields — so
 * the compile-time `WorkerToHost` type means nothing here: everything is
 * re-validated and REBUILT field by field (a forged extra field never rides
 * along; a non-number call id can never be echoed into a reply). Junk returns
 * `undefined` and is dropped — a throw in the host's `message` listener would
 * crash the host process.
 */
function parseWorkerMessage(raw) {
    if (typeof raw !== 'object' || raw === null)
        return undefined;
    var m = raw;
    switch (m.type) {
        case 'call': {
            if (typeof m.id !== 'number' || typeof m.global !== 'string' || typeof m.name !== 'string')
                return undefined;
            return { type: 'call', id: m.id, global: m.global, name: m.name, args: m.args };
        }
        case 'log': {
            if (typeof m.text !== 'string')
                return undefined;
            return { type: 'log', text: m.text };
        }
        case 'output-limit': return { type: 'output-limit' };
        case 'done': {
            if (m.error === undefined)
                return __assign({ type: 'done' }, m.value !== undefined ? { value: m.value } : {});
            var error = m.error;
            if (typeof error !== 'object' || error === null)
                return undefined;
            var _a = error, kind = _a.kind, message = _a.message;
            if ((kind !== 'exception' && kind !== 'invalid-output' && kind !== 'output-limit') || typeof message !== 'string')
                return undefined;
            return { type: 'done', error: { kind: kind, message: message } };
        }
        default: return undefined;
    }
}
/** One run's combined outer-output ledger; binding values never enter it. */
var OutputLedger = /** @class */ (function () {
    function OutputLedger(maxBytes) {
        this.maxBytes = maxBytes;
        this.bytes = 2; // JSON serialization of the empty logs array: []
        this.entries = 0;
    }
    /** Admit one exact log entry, or report that the hard cap was crossed. */
    OutputLedger.prototype.admit = function (text, sink) {
        var separatorBytes = this.entries > 0 ? 1 : 0;
        var stringBytes = (0, output_json_ts_1.jsonStringBytesUpTo)(text, this.maxBytes - this.bytes - separatorBytes);
        if (stringBytes === undefined)
            return false;
        this.bytes += stringBytes + separatorBytes;
        this.entries += 1;
        sink.push(text);
        return true;
    };
    /** Finalize a successful absent-or-JSON completion against the combined cap. */
    OutputLedger.prototype.success = function (logs, value) {
        if (value !== undefined && (0, output_json_ts_1.jsonValueBytesUpTo)(value, this.maxBytes - this.bytes) === undefined)
            return this.limit(logs);
        return __assign({ logs: logs }, value !== undefined ? { value: value } : {});
    };
    /** Finalize a failure diagnostic, with output-limit taking precedence when combined bytes exceed the cap. */
    OutputLedger.prototype.failure = function (logs, error) {
        if ((0, output_json_ts_1.jsonStringBytesUpTo)(error.message, this.maxBytes - this.bytes) === undefined)
            return this.limit(logs);
        return { logs: logs, error: error };
    };
    /** Build the explicit output-limit failure while retaining a fitting prefix of the final log. */
    OutputLedger.prototype.limit = function (logs) {
        var fullMessage = "outer output exceeded ".concat(this.maxBytes, " bytes");
        // The fixed diagnostic is ASCII, so every character is one byte plus the quotes.
        var messageBytes = fullMessage.length + 2;
        var retained = [];
        var retainedBytes = 2;
        var logBudget = this.maxBytes - messageBytes;
        for (var _i = 0, logs_1 = logs; _i < logs_1.length; _i++) {
            var text = logs_1[_i];
            var separatorBytes = retained.length > 0 ? 1 : 0;
            var availableBytes = logBudget - retainedBytes - separatorBytes;
            var stringBytes = (0, output_json_ts_1.jsonStringBytesUpTo)(text, availableBytes);
            if (stringBytes !== undefined) {
                retained.push(text);
                retainedBytes += stringBytes + separatorBytes;
                continue;
            }
            var prefix = (0, output_json_ts_1.truncateJsonStringBytes)(text, availableBytes);
            if (prefix.length > 0) {
                var prefixBytes = (0, output_json_ts_1.jsonStringBytesUpTo)(prefix, availableBytes);
                /* v8 ignore next -- truncateJsonStringBytes guarantees its returned prefix fits the same budget. */
                if (prefixBytes === undefined)
                    throw new Error('output ledger produced an oversized log prefix');
                retained.push(prefix);
                retainedBytes += prefixBytes + separatorBytes;
            }
            break;
        }
        var availableMessageBytes = this.maxBytes - retainedBytes;
        var message = (0, output_json_ts_1.truncateJsonStringBytes)(fullMessage, availableMessageBytes);
        return { logs: retained, error: { kind: 'output-limit', message: message } };
    };
    return OutputLedger;
}());
/**
 * The shipped {@link CodeRuntime} backend (`ctx.codeRuntime`). Registers as
 * the `codeRuntime` service; every cap comes from validated config. See the
 * module doc for the containment model and the Service Definition's class JSDoc for
 * the contract this implements (error-as-field, hostile-peer port,
 * no cross-run state, dispose to quiescence).
 */
var WorkerThreadCodeRuntime = /** @class */ (function (_super) {
    __extends(WorkerThreadCodeRuntime, _super);
    function WorkerThreadCodeRuntime(ctx, config) {
        var _this = _super.call(this, ctx) || this;
        _this.language = 'typescript';
        _this.isolation = 'worker-thread';
        _this.live = new Set();
        _this.disposed = false;
        // Schemastery filled the defaults; the cast records that. Positivity is a
        // semantic check the schema's plain number type does not carry.
        _this.config = config;
        for (var _i = 0, _a = Object.entries(_this.config); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], value = _b[1];
            if (!(Number.isFinite(value) && value > 0))
                throw new Error("dsh-code-runtime-worker-thread: config.".concat(key, " must be a positive number, got ").concat(String(value)));
        }
        if (!Number.isSafeInteger(_this.config.maxOutputBytes) || _this.config.maxOutputBytes < MIN_OUTPUT_BYTES) {
            throw new Error("dsh-code-runtime-worker-thread: config.maxOutputBytes must be a safe integer of at least ".concat(MIN_OUTPUT_BYTES, ", got ").concat(String(_this.config.maxOutputBytes)));
        }
        // maxWallMs reaches setTimeout, which clamps any delay above
        // MAX_TIMER_DELAY_MS to 1 ms; the positivity check above accepts such a
        // value, so a 25-day ceiling would time the run out immediately.
        if (_this.config.maxWallMs > dsh_timeout_1.MAX_TIMER_DELAY_MS) {
            throw new Error("dsh-code-runtime-worker-thread: config.maxWallMs must be at most ".concat(dsh_timeout_1.MAX_TIMER_DELAY_MS, " (Node clamps a longer setTimeout delay to 1ms), got ").concat(String(_this.config.maxWallMs)));
        }
        ctx.effect(function () { return function () { return _this.teardown(); }; }, 'worker code-runtime teardown');
        return _this;
    }
    /**
     * Dispose to quiescence: mark the service unusable, fail every in-flight
     * run as aborted, and AWAIT each worker's exit so no worker outlives the
     * fiber.
     */
    WorkerThreadCodeRuntime.prototype.teardown = function () {
        return __awaiter(this, void 0, void 0, function () {
            var runs, _i, runs_1, run;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.disposed = true;
                        runs = __spreadArray([], this.live, true);
                        for (_i = 0, runs_1 = runs; _i < runs_1.length; _i++) {
                            run = runs_1[_i];
                            run.settle({ kind: 'abort', message: 'runtime disposed' });
                        }
                        return [4 /*yield*/, Promise.all(runs.map(function (run) { return run.finished; }))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Execute one program in a fresh worker. Program outcomes — including a
     * type-strip syntax error, which never spawns a worker — resolve with
     * `result.error`; the method rejects only for Service Definition contract misuse (a disposed
     * runtime, an invalid binding namespace).
     * @param request - the program, its bindings, and the abort signal.
     * @returns the run's outcome per the seam contract.
     */
    WorkerThreadCodeRuntime.prototype.run = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var bindings, code, stripped;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (this.disposed)
                            throw new Error('dsh-code-runtime-worker-thread: run() after disposal');
                        bindings = this.validateBindings(request);
                        if ((_a = request.signal) === null || _a === void 0 ? void 0 : _a.aborted) {
                            return [2 /*return*/, this.failureBeforeWorker({ kind: 'abort', message: String(request.signal.reason) })];
                        }
                        try {
                            stripped = (0, node_module_1.stripTypeScriptTypes)(STRIP_WRAP.prefix + request.program + STRIP_WRAP.suffix);
                            code = stripped.slice(STRIP_WRAP.prefix.length, stripped.length - STRIP_WRAP.suffix.length);
                        }
                        catch (error) {
                            // A program that does not survive the type-strip (syntax error,
                            // non-erasable syntax like `enum`) is a program failure, reported the
                            // same way a thrown exception would be — and no worker ever spawns.
                            return [2 /*return*/, this.failureBeforeWorker({ kind: 'exception', message: messageOf(error) })];
                        }
                        return [4 /*yield*/, this.execute(request, code, bindings)];
                    case 1: return [2 /*return*/, _b.sent()];
                }
            });
        });
    };
    /** Apply the outer-output ledger to failures that occur before a worker owns one. */
    WorkerThreadCodeRuntime.prototype.failureBeforeWorker = function (error) {
        return new OutputLedger(this.config.maxOutputBytes).failure([], error);
    };
    /** Reject malformed binding globals or typed-error declarations as Service Definition contract misuse. */
    WorkerThreadCodeRuntime.prototype.validateBindings = function (request) {
        var bindings = new Map();
        for (var _i = 0, _a = request.bindings; _i < _a.length; _i++) {
            var namespace = _a[_i];
            if (!IDENTIFIER.test(namespace.global) || dsh_code_runtime_1.PORTABLE_RESERVED_WORDS.has(namespace.global)) {
                throw new Error("dsh-code-runtime-worker-thread: binding global ".concat(JSON.stringify(namespace.global), " is not a usable identifier"));
            }
            // RESERVED_BINDING_GLOBALS is the seam's shared backend-owned set:
            // `console` is THIS backend's log-capture slot; the dunder entries exist
            // for the Python side — its seeded/wrapped slots plus the `__debug__`
            // compile-time constant — refused here too so the namespace list stays
            // portable across backends. The seam declaration is the single home for
            // why each entry is reserved.
            if (dsh_code_runtime_1.RESERVED_BINDING_GLOBALS.has(namespace.global)) {
                throw new Error("dsh-code-runtime-worker-thread: reserved binding global ".concat(JSON.stringify(namespace.global)));
            }
            if (bindings.has(namespace.global)) {
                throw new Error("dsh-code-runtime-worker-thread: duplicate binding global ".concat(JSON.stringify(namespace.global)));
            }
            bindings.set(namespace.global, namespace);
        }
        var errorClassNames = new Set();
        for (var _b = 0, _c = request.bindings; _b < _c.length; _b++) {
            var namespace = _c[_b];
            var descriptor = namespace.errorClass;
            if (!descriptor)
                continue;
            if (!IDENTIFIER.test(descriptor.name) || dsh_code_runtime_1.PORTABLE_RESERVED_WORDS.has(descriptor.name)) {
                throw new Error("dsh-code-runtime-worker-thread: binding error class ".concat(JSON.stringify(descriptor.name), " is not a usable identifier"));
            }
            if (dsh_code_runtime_1.RESERVED_BINDING_GLOBALS.has(descriptor.name)) {
                throw new Error("dsh-code-runtime-worker-thread: reserved binding global ".concat(JSON.stringify(descriptor.name)));
            }
            if (bindings.has(descriptor.name) || errorClassNames.has(descriptor.name)) {
                throw new Error("dsh-code-runtime-worker-thread: duplicate injected global ".concat(JSON.stringify(descriptor.name)));
            }
            var member = descriptor.memberNameProperty;
            if (member.length === 0 || dsh_code_runtime_1.RESERVED_ERROR_MEMBERS.has(member) || dsh_code_runtime_1.DUNDER_MEMBER.test(member)) {
                throw new Error("dsh-code-runtime-worker-thread: binding error member property ".concat(JSON.stringify(descriptor.memberNameProperty), " is not usable"));
            }
            errorClassNames.add(descriptor.name);
        }
        return bindings;
    };
    /** Spawn the worker for one validated, type-stripped run and drive it to settlement. */
    WorkerThreadCodeRuntime.prototype.execute = function (request, code, bindings) {
        var _this = this;
        var bootData = {
            code: code,
            namespaces: __spreadArray([], bindings, true).map(function (_a) {
                var global = _a[0], namespace = _a[1];
                return (__assign({ global: global, names: Object.keys(namespace.functions) }, namespace.errorClass ? { errorClass: namespace.errorClass } : {}));
            }),
            maxOutputBytes: this.config.maxOutputBytes,
        };
        var worker = new node_worker_threads_1.Worker(WORKER_PATH, {
            workerData: bootData,
            // Model code gets NO ambient environment — stronger than the scrubbed
            // env the defensive-patterns rule requires for spawned commands.
            env: {},
            // Hermetic flags too: without this the worker inherits the host process's execArgv (a
            // test runner's or tsx's loader hooks), which a bare isolate with an empty environment
            // cannot satisfy.
            execArgv: [],
            resourceLimits: { maxOldGenerationSizeMb: this.config.maxOldGenerationSizeMb },
            // Backstop capture: the bootstrap patches JS-level writes into its own
            // ordered buffer, so these pipes normally stay silent; anything that
            // still arrives (native-level writes) is appended after the done logs.
            stdout: true,
            stderr: true,
        });
        return new Promise(function (resolve) {
            var _a;
            var settled = false;
            var answered = new Set();
            var logs = [];
            var strayLogs = [];
            var output = new OutputLedger(_this.config.maxOutputBytes);
            var terminalOverride;
            // Pipe and message-port delivery are independent. Continue bounded pipe
            // capture after a terminal message while worker termination drains bytes
            // that were already queued; `finish` materializes the result only after
            // termination completes.
            var captureStray = function (chunk) {
                /* v8 ignore next -- a second post-overflow chunk races immediate worker termination; the first overflow path is covered. */
                if (terminalOverride !== undefined)
                    return;
                var text = chunk.toString('utf8');
                if (!output.admit(text, strayLogs)) {
                    var limited = output.limit(__spreadArray(__spreadArray(__spreadArray([], logs, true), strayLogs, true), [text], false));
                    terminalOverride = limited;
                    finish(limited);
                }
            };
            worker.stdout.on('data', captureStray);
            worker.stderr.on('data', captureStray);
            // Exactly one outcome wins. Every path cleans up, terminates, and awaits the worker;
            // logs captured before timeout, abort, or failure remain in the result.
            var finishResolve;
            var finished = new Promise(function (done) { finishResolve = done; });
            var finish = function (finalize) {
                var _a;
                if (settled)
                    return;
                settled = true;
                clearInterval(eluTimer);
                clearTimeout(wallTimer);
                (_a = request.signal) === null || _a === void 0 ? void 0 : _a.removeEventListener('abort', onAbort);
                _this.live.delete(live);
                // Let the poll phase deliver pipe bytes already queued independently
                // of the terminal port message before termination closes the streams.
                void new Promise(function (resume) { setImmediate(resume); }).then(function () { return __awaiter(_this, void 0, void 0, function () {
                    var stdoutDrained, stderrDrained, result;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                stdoutDrained = waitForPipeDrain(worker.stdout);
                                stderrDrained = waitForPipeDrain(worker.stderr);
                                return [4 /*yield*/, Promise.all([worker.terminate(), stdoutDrained, stderrDrained])];
                            case 1:
                                _a.sent();
                                result = terminalOverride !== null && terminalOverride !== void 0 ? terminalOverride : (typeof finalize === 'function' ? finalize() : finalize);
                                finishResolve();
                                resolve(result);
                                return [2 /*return*/];
                        }
                    });
                }); });
            };
            var onDone = function (message) {
                if (message.type !== 'done')
                    return;
                if (message.error) {
                    var error_1 = message.error;
                    finish(function () { return output.failure(__spreadArray(__spreadArray([], logs, true), strayLogs, true), error_1); });
                    return;
                }
                if (message.value === undefined) {
                    finish(function () { return output.success(__spreadArray(__spreadArray([], logs, true), strayLogs, true)); });
                    return;
                }
                var value = (0, worker_json_ts_1.decodeWorkerJson)(message.value);
                if (value === undefined) {
                    finish(function () { return output.failure(__spreadArray(__spreadArray([], logs, true), strayLogs, true), { kind: 'invalid-output', message: 'program completion must be lossless JSON' }); });
                }
                else {
                    finish(function () { return output.success(__spreadArray(__spreadArray([], logs, true), strayLogs, true), value); });
                }
            };
            var onCall = function (message) {
                var _a;
                if (message.type !== 'call' || settled)
                    return;
                // Hostile-peer rules: a duplicate id is ignored, an unknown name is
                // answered with a failure, and a binding throw/reject becomes the
                // program-side rejection — contained here, never a host crash.
                if (answered.has(message.id))
                    return;
                answered.add(message.id);
                var reply = function (payload) {
                    if (settled)
                        return;
                    // Canonical resolutions were snapshotted as lossless JSON before
                    // this point, so this payload is structured-cloneable by contract.
                    worker.postMessage(payload);
                };
                var record = (_a = bindings.get(message.global)) === null || _a === void 0 ? void 0 : _a.functions;
                // Own-property lookup only: a forged name like 'constructor' or
                // 'hasOwnProperty' must not walk the record's prototype chain and
                // reach a callable the consumer never declared.
                var fn = record && Object.hasOwn(record, message.name) ? record[message.name] : undefined;
                if (typeof fn !== 'function') {
                    reply({ type: 'reply', id: message.id, ok: false, message: "unknown binding ".concat(JSON.stringify("".concat(message.global, ".").concat(message.name))) });
                    return;
                }
                var args = (0, worker_json_ts_1.decodeWorkerJson)(message.args);
                if (args === undefined) {
                    reply({ type: 'reply', id: message.id, ok: false, message: 'binding arguments must be lossless JSON' });
                    return;
                }
                void (function () { return __awaiter(_this, void 0, void 0, function () {
                    var resolved, value, error_2;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                _a.trys.push([0, 2, , 3]);
                                return [4 /*yield*/, fn(args)];
                            case 1:
                                resolved = _a.sent();
                                value = void 0;
                                try {
                                    value = (0, dsh_session_1.snapshotJsonValue)(resolved);
                                }
                                catch (_b) {
                                    value = undefined;
                                }
                                if (value === undefined) {
                                    reply({ type: 'reply', id: message.id, ok: false, message: 'binding resolution must be lossless JSON' });
                                }
                                else {
                                    reply({ type: 'reply', id: message.id, ok: true, value: (0, worker_json_ts_1.encodeWorkerJson)(value) });
                                }
                                return [3 /*break*/, 3];
                            case 2:
                                error_2 = _a.sent();
                                reply({ type: 'reply', id: message.id, ok: false, message: messageOf(error_2) });
                                return [3 /*break*/, 3];
                            case 3: return [2 /*return*/];
                        }
                    });
                }); })();
            };
            worker.on('message', function (raw) {
                // Parse before touching: the peer can post ANY shape, and a throw in
                // this listener would crash the host process. Junk drops silently.
                var message = parseWorkerMessage(raw);
                if (!message)
                    return;
                if (message.type === 'log' && !settled && !output.admit(message.text, logs)) {
                    var limited = output.limit(__spreadArray(__spreadArray(__spreadArray([], logs, true), strayLogs, true), [message.text], false));
                    finish(limited);
                    return;
                }
                if (message.type === 'output-limit' && !settled) {
                    var limited = output.limit(__spreadArray(__spreadArray([], logs, true), strayLogs, true));
                    finish(limited);
                    return;
                }
                onCall(message);
                onDone(message);
            });
            worker.on('error', function (error) {
                finish(function () { return output.failure(__spreadArray(__spreadArray([], logs, true), strayLogs, true), { kind: 'worker-exit', message: "worker error: ".concat(error.message) }); });
            });
            worker.on('exit', function (exitCode) {
                finish(function () { return output.failure(__spreadArray(__spreadArray([], logs, true), strayLogs, true), { kind: 'worker-exit', message: "worker exited with code ".concat(exitCode, " before completing") }); });
            });
            // The compute budget reads the worker's own measured busy time, so a
            // hot loop expires it no matter what dispatches are in flight, while a
            // program idling on a slow binding accrues nothing.
            var eluTimer = setInterval(function () {
                var elu = worker.performance.eventLoopUtilization();
                if (elu.active > _this.config.computeMs) {
                    finish(function () { return output.failure(__spreadArray(__spreadArray([], logs, true), strayLogs, true), { kind: 'timeout', message: "compute budget exhausted (".concat(_this.config.computeMs, "ms busy)") }); });
                }
            }, ELU_POLL_INTERVAL_MS);
            var wallTimer = setTimeout(function () {
                finish(function () { return output.failure(__spreadArray(__spreadArray([], logs, true), strayLogs, true), { kind: 'timeout', message: "wall-clock ceiling reached (".concat(_this.config.maxWallMs, "ms)") }); });
            }, _this.config.maxWallMs);
            var onAbort = function () {
                finish(function () { var _a; return output.failure(__spreadArray(__spreadArray([], logs, true), strayLogs, true), { kind: 'abort', message: String((_a = request.signal) === null || _a === void 0 ? void 0 : _a.reason) }); });
            };
            (_a = request.signal) === null || _a === void 0 ? void 0 : _a.addEventListener('abort', onAbort, { once: true });
            var live = {
                worker: worker,
                finished: finished,
                settle: function (failure) { finish(function () { return output.failure(__spreadArray(__spreadArray([], logs, true), strayLogs, true), failure); }); },
            };
            _this.live.add(live);
        });
    };
    WorkerThreadCodeRuntime.Config = schemastery_1.default.object({
        computeMs: schemastery_1.default.number().default(60000),
        maxWallMs: schemastery_1.default.number().default(600000),
        maxOutputBytes: schemastery_1.default.number().default(67108864),
        maxOldGenerationSizeMb: schemastery_1.default.number().default(512),
    });
    return WorkerThreadCodeRuntime;
}(dsh_code_runtime_1.CodeRuntime));
exports.WorkerThreadCodeRuntime = WorkerThreadCodeRuntime;
exports.default = WorkerThreadCodeRuntime;
