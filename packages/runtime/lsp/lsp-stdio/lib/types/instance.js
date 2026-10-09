"use strict";
/**
 * One language-server instance: a connection plus the initialize handshake, the serialized abortable
 * query queue, the transient `didOpen`→request→`didClose` lifecycle, and bounded teardown. One
 * instance owns one `(provider id, canonical workspace)` process. Queries serialize through a single
 * queue so a cancellation that fails to stop the server can terminate it without killing unrelated
 * work; distinct instances run in parallel.
 * @module @z/dsh-lsp-stdio/instance
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
exports.LspInstance = void 0;
var dsh_lsp_1 = require("@z/dsh-lsp");
var dsh_timeout_1 = require("@z/dsh-timeout");
var abort_ts_1 = require("./abort.ts");
var connection_ts_1 = require("./connection.ts");
var translate_ts_1 = require("./translate.ts");
/**
 * A single initialized server process. Not exported as a provider — the provider single-flights and
 * pools these. `query()` serializes; `dispose()` rejects queued work and tears the process down.
 */
var LspInstance = /** @class */ (function () {
    /**
     * @param spec - the launch, initialize, and teardown parameters.
     * @param spawner - the subprocess seam's spawn function.
     * @param writer - optional connection writer used by transport conformance tests.
     */
    function LspInstance(spec, spawner, writer) {
        var _this = this;
        this.spec = spec;
        /** The serialization tail: each query awaits the prior one, so lifecycles never interleave. */
        this.queue = Promise.resolve();
        this.disposed = false;
        /** Set once the process closes, so the pool can synchronously skip a dead instance. */
        this.processClosed = false;
        this.connection = new connection_ts_1.LspConnection(spec, spawner, function (method, params) { return _this.answerServerRequest(method, params); }, writer);
        this.ready = this.initialize();
        // A handshake rejection must not surface as an unhandled rejection before the first query awaits
        // it; queries attach the real handler.
        this.ready.catch(function () { });
        void this.connection.closed.then(function () { _this.processClosed = true; });
    }
    Object.defineProperty(LspInstance.prototype, "dead", {
        /** Synchronous liveness check: true once the process has closed or the instance was disposed. */
        get: function () {
            return this.processClosed || this.disposed || this.connection.failed;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Test whether a caught query error came from this instance's transport.
     * @param error - error caught by the provider.
     * @returns `true` only for the connection's retained fatal transport cause.
     */
    LspInstance.prototype.isTransportFailure = function (error) {
        return this.connection.failedWith(error);
    };
    /**
     * Run one query through the serialized queue.
     * @param request - the resolved provider query.
     * @param source - the pre-validated, already-read host source (the provider reads before spawning).
     * @param signal - optional cancellation for this query's full lifecycle.
     * @returns the normalized result.
     */
    LspInstance.prototype.query = function (request, source, signal) {
        var _this = this;
        // Serialize behind prior work, but observe abort DURING the queue wait too: if an earlier query
        // hangs (e.g. a signal-less service caller), a later tool's timeout must still be able to give up
        // rather than block on the shared tail forever.
        var run = (0, abort_ts_1.abortable)(this.queue, signal)
            .then(function () { return _this.runQuery(request, source, signal); })
            .catch(function (error) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.isTransportFailure(error)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.startTeardown()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: throw error;
                }
            });
        }); });
        // Keep the tail alive regardless of this query's outcome so the next caller still serializes. The
        // tail follows the ACTUAL prior work (this.queue), not the abortable view, so a caller giving up
        // on the wait does not deserialize the queue.
        this.queue = this.queue.then(function () { return run; }).then(function () { return undefined; }, function () { return undefined; });
        return run;
    };
    LspInstance.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var initializeResult, capabilities;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.connection.request('initialize', {
                            // A subprocess provider may run in another PID namespace or machine;
                            // the host PID would let the server monitor an unrelated process.
                            processId: null,
                            rootUri: this.spec.workspaceUri,
                            workspaceFolders: [{ uri: this.spec.workspaceUri, name: 'workspace' }],
                            capabilities: CLIENT_CAPABILITIES,
                            initializationOptions: this.spec.initializationOptions,
                        })];
                    case 1:
                        initializeResult = _a.sent();
                        capabilities = initializeResult.capabilities;
                        // An omitted encoding defaults to utf-16; any other value is a protocol error we reject here.
                        (0, translate_ts_1.negotiatePositionEncoding)(capabilities.positionEncoding);
                        this.capabilities = capabilities;
                        return [4 /*yield*/, this.connection.notify('initialized', {})];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    LspInstance.prototype.runQuery = function (request, source, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var error_1, capabilities, uri, opened, error_2, payload, _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (this.disposed)
                            throw new dsh_lsp_1.LspError('LSP instance was disposed', 'LSP_DISPOSED');
                        /* v8 ignore next -- the abortable queue wait rejects a pre-aborted signal before runQuery; this is a belt-and-suspenders guard. */
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            throw (0, abort_ts_1.abortError)(signal);
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 6]);
                        return [4 /*yield*/, (0, abort_ts_1.abortable)(this.ready, signal)];
                    case 2:
                        _c.sent();
                        return [3 /*break*/, 6];
                    case 3:
                        error_1 = _c.sent();
                        if (!!this.dead) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.startTeardown()];
                    case 4:
                        _c.sent();
                        _c.label = 5;
                    case 5: throw error_1;
                    case 6:
                        capabilities = this.capabilities;
                        /* v8 ignore next -- `ready` resolves only after capabilities are set, else it rejects above; defensive. */
                        if (capabilities === undefined)
                            throw new Error('LSP instance is not initialized');
                        if (!(0, translate_ts_1.supportsOperation)(capabilities, request.operation)) {
                            throw new dsh_lsp_1.LspError("server does not support ".concat(request.operation), 'LSP_UNSUPPORTED_OPERATION');
                        }
                        if (!(0, translate_ts_1.supportsTransientOpen)(capabilities.textDocumentSync)) {
                            throw new dsh_lsp_1.LspError('server does not support the transient textDocument/didOpen this host requires', 'LSP_UNSUPPORTED_OPERATION');
                        }
                        uri = source.fileUrl;
                        opened = false;
                        _c.label = 7;
                    case 7:
                        _c.trys.push([7, , 14, 23]);
                        /* v8 ignore next -- guards an abort landing between the ready wait and didOpen; not deterministically reproducible. */
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            throw (0, abort_ts_1.abortError)(signal);
                        _c.label = 8;
                    case 8:
                        _c.trys.push([8, 10, , 12]);
                        return [4 /*yield*/, (0, abort_ts_1.abortable)(this.connection.notify('textDocument/didOpen', {
                                textDocument: { uri: uri, languageId: request.languageId, version: 1, text: source.text },
                            }), signal)];
                    case 9:
                        _c.sent();
                        return [3 /*break*/, 12];
                    case 10:
                        error_2 = _c.sent();
                        // A canceled backpressured write or failed stdin leaves the protocol stream unusable before
                        // `opened` can arm the didClose cleanup. Teardown here makes the pool evict the instance.
                        return [4 /*yield*/, this.startTeardown()];
                    case 11:
                        // A canceled backpressured write or failed stdin leaves the protocol stream unusable before
                        // `opened` can arm the didClose cleanup. Teardown here makes the pool evict the instance.
                        _c.sent();
                        throw error_2;
                    case 12:
                        opened = true;
                        return [4 /*yield*/, this.sendRequest(request.operation, uri, request.position, signal)];
                    case 13:
                        payload = _c.sent();
                        return [2 /*return*/, this.normalize(request.operation, payload)];
                    case 14:
                        if (!(opened && !this.dead)) return [3 /*break*/, 22];
                        _c.label = 15;
                    case 15:
                        _c.trys.push([15, 17, , 22]);
                        return [4 /*yield*/, this.connection.notify('textDocument/didClose', { textDocument: { uri: uri } })];
                    case 16:
                        _c.sent();
                        return [3 /*break*/, 22];
                    case 17:
                        _a = _c.sent();
                        _c.label = 18;
                    case 18:
                        _c.trys.push([18, 20, , 21]);
                        return [4 /*yield*/, this.startTeardown()];
                    case 19:
                        _c.sent();
                        return [3 /*break*/, 21];
                    case 20:
                        _b = _c.sent();
                        return [3 /*break*/, 21];
                    case 21: return [3 /*break*/, 22];
                    case 22: return [7 /*endfinally*/];
                    case 23: return [2 /*return*/];
                }
            });
        });
    };
    LspInstance.prototype.sendRequest = function (operation, uri, position, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var params, requestId, send;
            return __generator(this, function (_a) {
                params = __assign({ textDocument: { uri: uri }, position: { line: position.line, character: position.character } }, (operation === 'findReferences' ? { context: { includeDeclaration: true } } : {}));
                requestId = this.connection.peekNextId();
                send = this.connection.request((0, translate_ts_1.requestMethod)(operation), params);
                if (signal === undefined)
                    return [2 /*return*/, send];
                return [2 /*return*/, this.raceAbort(send, requestId, signal)];
            });
        });
    };
    /**
     * Race a pending request against abort. On abort, send `$/cancelRequest` and give the server a
     * bounded grace to acknowledge; if it does not settle in time, invalidate and tear down the
     * instance so the still-active request cannot overlap the next queued query's document lifecycle.
     */
    LspInstance.prototype.raceAbort = function (send, requestId, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var error_3, grace_1, settled;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 9]);
                        return [4 /*yield*/, (0, abort_ts_1.abortable)(send, signal)];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2:
                        error_3 = _a.sent();
                        if (!signal.aborted)
                            throw error_3;
                        this.connection.cancel(requestId);
                        grace_1 = (0, dsh_timeout_1.deadline)(undefined, this.spec.killGraceMs, 'LSP_CANCEL_GRACE');
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, , 7, 8]);
                        return [4 /*yield*/, Promise.race([
                                send.then(markSettled, markSettled),
                                new Promise(function (resolve) {
                                    /* v8 ignore next -- the cancel-grace deadline signal is freshly armed and not yet aborted here; defensive. */
                                    if (grace_1.signal.aborted) {
                                        resolve(false);
                                        return;
                                    }
                                    grace_1.signal.addEventListener('abort', function () { resolve(false); }, { once: true });
                                }),
                            ])];
                    case 4:
                        settled = _a.sent();
                        if (!!settled) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.startTeardown()];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6: return [3 /*break*/, 8];
                    case 7:
                        grace_1[Symbol.dispose]();
                        return [7 /*endfinally*/];
                    case 8: throw error_3;
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    LspInstance.prototype.normalize = function (operation, payload) {
        if (operation === 'hover') {
            return { kind: 'hover', hover: (0, translate_ts_1.normalizeHover)(payload) };
        }
        // The filesystem provider owns URI syntax for the execution platform, which may differ from the
        // harness host. Preserve that coordinate through rendering instead of reparsing `spec.cwd` there.
        return { kind: 'locations', locations: (0, translate_ts_1.normalizeLocations)(payload), resolvedWorkspaceUri: this.spec.workspaceUri };
    };
    LspInstance.prototype.answerServerRequest = function (method, params) {
        var _this = this;
        if (method === 'workspace/configuration') {
            // Answer every requested item with the one static configuration value.
            var record = params;
            /* v8 ignore next -- a configuration request always carries an items array; the empty fallback is defensive. */
            var items = Array.isArray(record === null || record === void 0 ? void 0 : record.items) ? record.items : [];
            return Promise.resolve(items.map(function () { return _this.spec.configuration; }));
        }
        if (LIFECYCLE_NOOP_METHODS.has(method)) {
            // Accept lifecycle bookkeeping requests with an empty result; we register nothing dynamic.
            return Promise.resolve(null);
        }
        if (method === 'workspace/applyEdit') {
            // This host never applies edits or runs commands.
            return Promise.reject(new Error('workspace/applyEdit is not permitted by this host'));
        }
        return Promise.reject(new Error("unsupported server request: ".concat(method)));
    };
    /**
     * Reject queued work, attempt graceful `shutdown`/`exit`, then escalate SIGTERM→SIGKILL, awaiting
     * process close so nothing outlives disposal.
     */
    LspInstance.prototype.dispose = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.startTeardown()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Publish disposal once and make every caller await the same quiescence boundary. */
    LspInstance.prototype.startTeardown = function () {
        var _a;
        this.disposed = true;
        (_a = this.teardownPromise) !== null && _a !== void 0 ? _a : (this.teardownPromise = this.tearDown());
        return this.teardownPromise;
    };
    LspInstance.prototype.tearDown = function () {
        return __awaiter(this, void 0, void 0, function () {
            var shutdownDeadline, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        shutdownDeadline = (0, dsh_timeout_1.deadline)(undefined, this.spec.shutdownTimeoutMs, 'LSP_SHUTDOWN');
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, 4, 5]);
                        return [4 /*yield*/, this.gracefulShutdown(shutdownDeadline.signal)];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 5];
                    case 3:
                        _a = _b.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        shutdownDeadline[Symbol.dispose]();
                        return [7 /*endfinally*/];
                    case 5: return [4 /*yield*/, this.forceTerminate()];
                    case 6:
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Best-effort LSP `shutdown`/`exit`, including process close, bounded by `signal`. */
    LspInstance.prototype.gracefulShutdown = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, abort_ts_1.abortable)(this.connection.request('shutdown', null), signal)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.connection.notify('exit', null)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, (0, abort_ts_1.abortable)(this.connection.closed, signal)];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Terminate the tree (the seam escalates SIGTERM→`killGraceMs`→SIGKILL),
     * then await leader and helper exit. The awaits are unbounded on purpose:
     * the seam's escalation already committed to SIGKILL, so quiescence — not
     * another timer — is the postcondition disposal owes its callers.
     */
    LspInstance.prototype.forceTerminate = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.connection.terminate();
                        return [4 /*yield*/, Promise.all([
                                this.connection.closed,
                                this.connection.waitForProcessTreeExit(),
                            ])];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return LspInstance;
}());
exports.LspInstance = LspInstance;
/** Server→client request methods this host acknowledges with an empty result (no dynamic registration). */
var LIFECYCLE_NOOP_METHODS = new Set([
    'window/workDoneProgress/create',
    'client/registerCapability',
    'client/unregisterCapability',
]);
/** Mark a settled request in the cancel-grace race (either outcome means the request finished). */
function markSettled() {
    return true;
}
/**
 * The client capabilities advertised at `initialize`: UTF-16 positions, workspace folders and
 * configuration, markdown/plaintext hover, and link support for definition/implementation. No
 * dynamic registration; the server's returned capabilities are authoritative.
 */
var CLIENT_CAPABILITIES = {
    general: { positionEncodings: ['utf-16'] },
    workspace: { workspaceFolders: true, configuration: true },
    textDocument: {
        synchronization: { dynamicRegistration: false },
        hover: { contentFormat: ['markdown', 'plaintext'] },
        definition: { linkSupport: true },
        implementation: { linkSupport: true },
        references: {},
    },
};
