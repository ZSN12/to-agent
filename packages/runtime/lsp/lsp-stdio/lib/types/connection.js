"use strict";
/**
 * A JSON-RPC endpoint over one language server spawned through the subprocess
 * capability. Owns id correlation, outbound requests/notifications, and inbound
 * server→client requests: it answers `workspace/configuration` from static
 * config, and rejects `workspace/applyEdit` (this host never applies edits or
 * runs commands). It caps stderr, surfaces framing/decoder failures as a
 * fatal close, and exposes tree-scoped termination through the handle so the
 * instance owns teardown; group/tree mechanics live in the subprocess
 * Service Provider.
 * @module @z/dsh-lsp-stdio/connection
 */
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
exports.LspConnection = void 0;
var framing_ts_1 = require("./framing.ts");
var writeConnectionMessage = function (stdin, message, done) {
    stdin.write((0, framing_ts_1.encodeMessage)(message), done);
};
/** A live JSON-RPC endpoint bound to one child process. */
var LspConnection = /** @class */ (function () {
    /**
     * @param spec - how to launch the server and answer its config requests.
     * @param spawner - the subprocess seam's spawn (the provider passes `ctx.subprocess.spawn`).
     * @param onServerRequest - answers a server→client request; rejects to send an error response.
     * @param writer - message writer; tests inject callback failures without relying on OS pipe races.
     */
    function LspConnection(spec, spawner, onServerRequest, writer) {
        if (writer === void 0) { writer = writeConnectionMessage; }
        var _this = this;
        this.onServerRequest = onServerRequest;
        this.writer = writer;
        this.pending = new Map();
        this.nextId = 1;
        this.decoder = new framing_ts_1.MessageDecoder(spec.maxMessageBytes);
        // stdin/stdout are piped protocol streams this endpoint frames itself;
        // stderr is a collected diagnostic tail (no spill — the bounded tail IS
        // the contract). The seam owns detachment and tree-scoped signalling.
        this.handle = spawner({
            argv: __spreadArray([spec.command], spec.args, true),
            cwd: spec.cwd,
            stdio: {
                stdin: 'pipe',
                stdout: 'pipe',
                stderr: { maxBytes: spec.maxStderrBytes },
            },
            graceMs: spec.killGraceMs,
            // The seam merges explicit config entries after its ambient scrub, so a
            // configured credential or DSH_* fact reaches the child deliberately.
            env: spec.env,
        });
        /* v8 ignore start -- 'pipe' dispositions expose both streams by the seam contract; defensive. */
        if (this.handle.stdin === undefined || this.handle.stdout === undefined) {
            throw new Error('lsp-stdio: subprocess implementation dropped a piped protocol stream');
        }
        /* v8 ignore stop */
        this.stdin = this.handle.stdin;
        this.closed = new Promise(function (resolve) {
            var close = function () {
                var _a;
                var reason = (_a = _this.closeReason) !== null && _a !== void 0 ? _a : new Error(_this.exitMessage());
                // Record the reason so any request issued AFTER close rejects immediately instead of hanging
                // (a closed process sends no further responses).
                _this.closeReason = reason;
                _this.failAll(reason);
                resolve();
            };
            _this.handle.done.then(close, function (error) {
                // A spawn-level failure never produces a close event; the rejection is
                // the fatal cause and the close boundary at once.
                _this.fail(asError(error));
                close();
            });
        });
        // Child stdin can fail while the process itself remains alive (for example, a server closes fd
        // 0). Treat that as a fatal connection error so pending requests reject immediately instead of
        // waiting for a process-close event that may never arrive.
        this.stdin.on('error', function (error) { _this.fail(error); });
        this.handle.stdout.on('data', function (chunk) { _this.onStdout(chunk); });
    }
    Object.defineProperty(LspConnection.prototype, "pid", {
        /** The child's pid, or `-1` when the spawn produced no pid (so signalling is a no-op). */
        get: function () {
            return this.handle.pid;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(LspConnection.prototype, "stderrTail", {
        /** The retained stderr tail, for diagnostics on a failed server. */
        get: function () {
            var _a, _b;
            /* v8 ignore next -- the collect disposition always exposes a stderr reader; defensive. */
            return (_b = (_a = this.handle.collected.stderr) === null || _a === void 0 ? void 0 : _a.readFrom(0).text) !== null && _b !== void 0 ? _b : '';
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(LspConnection.prototype, "failed", {
        /** Whether the transport has failed even if the child close event has not arrived yet. */
        get: function () {
            return this.closeReason !== undefined;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Test whether a caught error is this connection's retained fatal transport cause.
     * @param error - error caught by the instance or provider.
     * @returns `true` only when this connection produced that exact failure.
     */
    LspConnection.prototype.failedWith = function (error) {
        return this.closeReason === error;
    };
    /**
     * Send a request and await its result.
     * @param method - the JSON-RPC method.
     * @param params - the request params.
     * @returns the response result; rejects on an error response, write failure, or close.
     */
    LspConnection.prototype.request = function (method, params) {
        var _this = this;
        var id = this.nextId++;
        var promise = new Promise(function (resolve, reject) {
            if (_this.closeReason !== undefined) {
                reject(_this.closeReason);
                return;
            }
            _this.pending.set(id, { resolve: resolve, reject: reject });
            // `write()` records either synchronous or callback-delivered failures on the connection and
            // rejects every pending request. This handler only consumes the write promise itself.
            void _this.write({ jsonrpc: '2.0', id: id, method: method, params: params }).catch(function () { });
        });
        // A caller that stops awaiting (e.g. an aborted query) can leave this promise to reject later
        // when the process closes; a benign no-op handler keeps that from surfacing as an unhandled
        // rejection. The returned promise still delivers the rejection to the caller's own await/catch.
        promise.catch(function () { });
        return promise;
    };
    /**
     * Send a notification (no id, no response).
     * @param method - the JSON-RPC method.
     * @param params - the notification params.
     * @returns a promise that settles when the framed notification has been written.
     */
    LspConnection.prototype.notify = function (method, params) {
        return this.write({ jsonrpc: '2.0', method: method, params: params });
    };
    /**
     * Send a `$/cancelRequest` for an in-flight request id (best-effort; ignores write failure).
     * @param requestId - the numeric id of the request to cancel.
     */
    LspConnection.prototype.cancel = function (requestId) {
        // The server is already gone or unwritable when this rejects; `write()` has recorded the fatal
        // connection failure and rejected the pending request, so cancellation remains best-effort.
        void this.write({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id: requestId } }).catch(function () { });
    };
    /**
     * The id the NEXT `request()` will use, so the instance can pre-arm a cancel.
     * @returns the numeric id the next request will be assigned.
     */
    LspConnection.prototype.peekNextId = function () {
        return this.nextId;
    };
    /** Terminate the server's process tree (the seam's SIGTERM→grace→SIGKILL escalation; idempotent). */
    LspConnection.prototype.terminate = function () {
        this.handle.terminate();
    };
    /**
     * Wait until the owned process tree has exited.
     * @param signal - optional bound for the wait.
     * @returns `true` when the tree exited, or `false` when the signal aborted first.
     */
    LspConnection.prototype.waitForProcessTreeExit = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.handle.waitForExit(signal)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    LspConnection.prototype.onStdout = function (chunk) {
        var messages;
        try {
            messages = this.decoder.push(chunk);
        }
        catch (error) {
            // A framing/JSON failure corrupts the stream position irrecoverably: fail the instance and
            // terminate the whole group so helper processes don't outlive the leader (SIGTERM first, then
            // the kill grace's SIGKILL — a misbehaving server still gets its bounded flush window).
            this.fail(asError(error));
            this.handle.terminate();
            return;
        }
        for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
            var message = messages_1[_i];
            this.dispatch(message);
        }
    };
    LspConnection.prototype.dispatch = function (message) {
        if (message === null || typeof message !== 'object')
            return;
        var frame = message;
        var id = frame.id;
        var method = frame.method;
        if (typeof method === 'string' && (typeof id === 'number' || typeof id === 'string')) {
            // A response-write failure has already invalidated the connection in `write()`.
            /* v8 ignore next -- protocol tests exercise response writes; only a simultaneous connection
               failure makes this consumption handler run. */
            void this.handleServerRequest(id, method, frame.params).catch(function () { });
            return;
        }
        if (typeof method === 'string') {
            // A server→client notification (e.g. diagnostics, logs): ignored by this MVP host.
            return;
        }
        if (typeof id === 'number')
            this.handleResponse(id, frame);
    };
    LspConnection.prototype.handleServerRequest = function (id, method, params) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 5]);
                        return [4 /*yield*/, this.onServerRequest(method, params)];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, this.write({ jsonrpc: '2.0', id: id, result: result })];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 3:
                        error_1 = _a.sent();
                        return [4 /*yield*/, this.write({ jsonrpc: '2.0', id: id, error: { code: -32601, message: asError(error_1).message } })];
                    case 4:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    LspConnection.prototype.handleResponse = function (id, frame) {
        var pending = this.pending.get(id);
        if (!pending)
            return;
        this.pending.delete(id);
        var error = frame.error;
        if (error !== null && typeof error === 'object') {
            var record = error;
            pending.reject(new Error(typeof record.message === 'string' ? record.message : 'LSP error response'));
            return;
        }
        pending.resolve(frame.result);
    };
    LspConnection.prototype.write = function (message) {
        var _this = this;
        if (this.closeReason !== undefined)
            return Promise.reject(this.closeReason);
        return new Promise(function (resolve, reject) {
            var done = function (error) {
                if (error === undefined || error === null) {
                    resolve();
                    return;
                }
                _this.fail(error);
                reject(error);
            };
            try {
                _this.writer(_this.stdin, message, done);
                /* v8 ignore start -- Node stream write failures are callback-delivered; this guards a
                   nonconforming Writable implementation throwing synchronously. */
            }
            catch (error) {
                var failure = asError(error);
                _this.fail(failure);
                reject(failure);
            }
            /* v8 ignore stop */
        });
    };
    /** The exit-close error message, appending the retained stderr tail when the server wrote any. */
    LspConnection.prototype.exitMessage = function () {
        var tail = this.stderrTail.trim();
        return tail === '' ? 'language server exited' : "language server exited; stderr: ".concat(tail);
    };
    LspConnection.prototype.fail = function (error) {
        /* v8 ignore next -- the second arm (closeReason already set) needs two fail() calls before close; defensive. */
        if (this.closeReason === undefined)
            this.closeReason = error;
        this.failAll(error);
    };
    LspConnection.prototype.failAll = function (error) {
        var waiting = __spreadArray([], this.pending.values(), true);
        this.pending.clear();
        for (var _i = 0, waiting_1 = waiting; _i < waiting_1.length; _i++) {
            var pending = waiting_1[_i];
            pending.reject(error);
        }
    };
    return LspConnection;
}());
exports.LspConnection = LspConnection;
/** Coerce an unknown thrown value to an `Error`. */
function asError(value) {
    /* v8 ignore next -- the non-Error branch guards against a non-Error throw, which our paths never produce. */
    return value instanceof Error ? value : new Error(String(value));
}
