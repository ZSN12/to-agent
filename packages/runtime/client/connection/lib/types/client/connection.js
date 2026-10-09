"use strict";
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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionController = void 0;
var CONNECTION_DEFAULTS = {
    backoffBaseMs: 500,
    backoffFactor: 2,
    backoffMaxMs: 10000,
    streamOpenTimeoutMs: 3000,
};
function sleep(ms, signal) {
    return new Promise(function (resolve) {
        var t = setTimeout(done, ms);
        signal.addEventListener('abort', done, { once: true });
        function done() {
            clearTimeout(t);
            signal.removeEventListener('abort', done);
            resolve();
        }
    });
}
/**
 * Opens both streams and keeps iterating (pull mode: nothing reads the socket and the tap
 * never fires unless someone for-awaits), reconnecting with exponential backoff on loss.
 * State (generation/attempt) is instance-private, never in the store.
 * The pump body feeds each frame to a sink (sink exceptions must
 * not kill the pump — a broken business layer must not drag down the connection layer).
 */
var ConnectionController = /** @class */ (function () {
    function ConnectionController(api, sinks, config) {
        if (sinks === void 0) { sinks = {}; }
        if (config === void 0) { config = {}; }
        this.api = api;
        this.sinks = sinks;
        this.generation = 0;
        this.attempt = 0;
        this.current = null;
        this.running = false;
        this.lastState = null;
        this.config = __assign(__assign({}, CONNECTION_DEFAULTS), config);
    }
    /** Idempotent: begin the connect/pump/reconnect loop. */
    ConnectionController.prototype.start = function () {
        if (this.running)
            return;
        this.running = true;
        void this.loop();
    };
    /** Stop the loop and abort the current generation's streams. */
    ConnectionController.prototype.stop = function () {
        var _a;
        this.running = false;
        (_a = this.current) === null || _a === void 0 ? void 0 : _a.abort();
        this.current = null;
    };
    ConnectionController.prototype.backoffDelay = function (attempt) {
        var _a = this.config, backoffBaseMs = _a.backoffBaseMs, backoffFactor = _a.backoffFactor, backoffMaxMs = _a.backoffMaxMs;
        var cap = Math.min(backoffMaxMs, backoffBaseMs * Math.pow(backoffFactor, Math.max(0, attempt - 1)));
        return cap / 2 + Math.random() * (cap / 2);
    };
    /** Read through a method: stop() flips the flag across awaits, so narrowing from the loop condition must not stick. */
    ConnectionController.prototype.isRunning = function () {
        return this.running;
    };
    /** Re-read both mutable liveness guards after a potentially reentrant sink. */
    ConnectionController.prototype.isGenerationActive = function (controller) {
        return this.isRunning() && !controller.signal.aborted;
    };
    ConnectionController.prototype.loop = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _loop_1, this_1, state_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _loop_1 = function () {
                            var gen, ac, muxOpened, hostOpened, streamsOpen, failed, timeout, description, descriptionResult_1, _b, idle;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        gen = ++this_1.generation;
                                        ac = new AbortController();
                                        this_1.current = ac;
                                        muxOpened = function () { };
                                        hostOpened = function () { };
                                        streamsOpen = Promise.all([
                                            new Promise(function (resolve) { muxOpened = resolve; }),
                                            new Promise(function (resolve) { hostOpened = resolve; }),
                                        ]);
                                        failed = new Promise(function (resolve) {
                                            var settle = function () {
                                                if (gen === _this.generation && !ac.signal.aborted)
                                                    ac.abort();
                                                resolve();
                                            };
                                            void _this.pumpStream(_this.api.events.mux({}, ac.signal, muxOpened), _this.sinks.onMuxEnvelope, settle);
                                            void _this.pumpStream(_this.api.events.host({}, ac.signal, hostOpened), _this.sinks.onHostEnvelope, settle);
                                        });
                                        _c.label = 1;
                                    case 1:
                                        _c.trys.push([1, 3, , 4]);
                                        timeout = new AbortController();
                                        return [4 /*yield*/, Promise.all([
                                                this_1.api.host.describe({}),
                                                Promise.race([streamsOpen, sleep(this_1.config.streamOpenTimeoutMs, timeout.signal)]),
                                            ])];
                                    case 2:
                                        description = (_c.sent())[0];
                                        timeout.abort();
                                        descriptionResult_1 = description.result;
                                        if (!descriptionResult_1.ok) {
                                            throw new Error("host.describe failed: ".concat(descriptionResult_1.error.code, ": ").concat(descriptionResult_1.error.message));
                                        }
                                        if (ac.signal.aborted)
                                            throw new Error('generation aborted during readiness handshake');
                                        this_1.attempt = 0;
                                        this_1.emitState('connected');
                                        // A state sink may synchronously stop this controller. Do not publish
                                        // a description for a generation that no longer exists afterward.
                                        if (this_1.isGenerationActive(ac)) {
                                            this_1.callSink(function () { var _a, _b; (_b = (_a = _this.sinks).onConnected) === null || _b === void 0 ? void 0 : _b.call(_a, descriptionResult_1.value); });
                                        }
                                        return [3 /*break*/, 4];
                                    case 3:
                                        _b = _c.sent();
                                        // Transport failure: treat as generation failure, fall through to the shared backoff.
                                        if (!ac.signal.aborted)
                                            ac.abort();
                                        return [3 /*break*/, 4];
                                    case 4: return [4 /*yield*/, failed];
                                    case 5:
                                        _c.sent();
                                        if (!this_1.isRunning())
                                            return [2 /*return*/, { value: void 0 }];
                                        this_1.emitState('reconnecting');
                                        this_1.attempt += 1;
                                        console.warn("[web-runtime] connection lost, retry #".concat(this_1.attempt));
                                        idle = new AbortController();
                                        return [4 /*yield*/, sleep(this_1.backoffDelay(this_1.attempt), idle.signal)];
                                    case 6:
                                        _c.sent();
                                        return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        _a.label = 1;
                    case 1:
                        if (!this.running) return [3 /*break*/, 3];
                        return [5 /*yield**/, _loop_1()];
                    case 2:
                        state_1 = _a.sent();
                        if (typeof state_1 === "object")
                            return [2 /*return*/, state_1.value];
                        return [3 /*break*/, 1];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /** Deduplicated state emission (sink isolation applies). */
    ConnectionController.prototype.emitState = function (state) {
        var _this = this;
        if (this.lastState === state)
            return;
        this.lastState = state;
        this.callSink(function () { var _a, _b; return (_b = (_a = _this.sinks).onStateChange) === null || _b === void 0 ? void 0 : _b.call(_a, state); });
    };
    ConnectionController.prototype.pumpStream = function (stream, sink, onEnd) {
        return __awaiter(this, void 0, void 0, function () {
            var _loop_2, this_2, state_2, e_1_1, _a;
            var _b, stream_1, stream_1_1;
            var _c, e_1, _d, _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        _f.trys.push([0, 13, , 14]);
                        _f.label = 1;
                    case 1:
                        _f.trys.push([1, 6, 7, 12]);
                        _loop_2 = function () {
                            _e = stream_1_1.value;
                            _b = false;
                            var envelope = _e;
                            if (envelope.payload.type === 'stream/error')
                                return "break";
                            if (sink !== undefined)
                                this_2.callSink(function () { sink(envelope); });
                        };
                        this_2 = this;
                        _b = true, stream_1 = __asyncValues(stream);
                        _f.label = 2;
                    case 2: return [4 /*yield*/, stream_1.next()];
                    case 3:
                        if (!(stream_1_1 = _f.sent(), _c = stream_1_1.done, !_c)) return [3 /*break*/, 5];
                        state_2 = _loop_2();
                        if (state_2 === "break")
                            return [3 /*break*/, 5];
                        _f.label = 4;
                    case 4:
                        _b = true;
                        return [3 /*break*/, 2];
                    case 5: return [3 /*break*/, 12];
                    case 6:
                        e_1_1 = _f.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 12];
                    case 7:
                        _f.trys.push([7, , 10, 11]);
                        if (!(!_b && !_c && (_d = stream_1.return))) return [3 /*break*/, 9];
                        return [4 /*yield*/, _d.call(stream_1)];
                    case 8:
                        _f.sent();
                        _f.label = 9;
                    case 9: return [3 /*break*/, 11];
                    case 10:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 11: return [7 /*endfinally*/];
                    case 12: return [3 /*break*/, 14];
                    case 13:
                        _a = _f.sent();
                        return [3 /*break*/, 14];
                    case 14:
                        onEnd();
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Sink exception isolation: a business-layer throw is logged only, never affecting pump or reconnect semantics. */
    ConnectionController.prototype.callSink = function (fn) {
        try {
            fn();
        }
        catch (error) {
            console.error('[web-runtime] connection sink threw:', error);
        }
    };
    return ConnectionController;
}());
exports.ConnectionController = ConnectionController;
