"use strict";
/** Host-side WebSocket carrier for the two server-to-browser event streams. */
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
exports.WebSocketDownlinks = void 0;
exports.rejectWebSocketUpgrade = rejectWebSocketUpgrade;
var node_crypto_1 = require("node:crypto");
var ws_1 = require("ws");
var api_1 = require("@z/dsh-host-apiproxy/api");
function serverRequest(frame) {
    return {
        type: 'server-request',
        rpcId: frame.rpcId,
        method: frame.payload.type,
        payload: frame.payload,
    };
}
function send(socket, frame) {
    return new Promise(function (resolve, reject) {
        if (socket.readyState !== ws_1.default.OPEN) {
            reject(new Error('websocket downlink closed before frame delivery'));
            return;
        }
        socket.send(JSON.stringify(serverRequest(frame)), function (error) {
            if (error)
                reject(error);
            else
                resolve();
        });
    });
}
function failureFrame(error) {
    return {
        rpcId: (0, api_1.RpcId)((0, node_crypto_1.randomUUID)()),
        payload: {
            type: 'stream/error',
            error: { code: 'internal', message: String(error), details: {} },
        },
    };
}
/**
 * Owns WebSocket negotiation and frame pumping for the connection plugin's
 * two downlinks. Client messages are a protocol violation: upstream traffic
 * remains on HTTP.
 */
var WebSocketDownlinks = /** @class */ (function () {
    /** @param api - host API supplying the typed event streams. */
    function WebSocketDownlinks(api) {
        this.api = api;
        this.server = new ws_1.WebSocketServer({ noServer: true });
        this.pumps = new Set();
    }
    /**
     * Upgrade one socket and pump the mux stream until either side closes.
     * @param req - HTTP upgrade request.
     * @param socket - Raw socket transferred by the HTTP server.
     * @param head - Bytes already read after the upgrade headers.
     */
    WebSocketDownlinks.prototype.handleMux = function (req, socket, head) {
        var _this = this;
        this.upgrade(req, socket, head, function (signal) { return _this.api.events.mux({
            rpcId: (0, api_1.RpcId)((0, node_crypto_1.randomUUID)()),
            payload: {},
        }, signal); });
    };
    /**
     * Upgrade one socket and pump the host stream until either side closes.
     * @param req - HTTP upgrade request.
     * @param socket - Raw socket transferred by the HTTP server.
     * @param head - Bytes already read after the upgrade headers.
     */
    WebSocketDownlinks.prototype.handleHost = function (req, socket, head) {
        var _this = this;
        this.upgrade(req, socket, head, function (signal) { return _this.api.events.host({
            rpcId: (0, api_1.RpcId)((0, node_crypto_1.randomUUID)()),
            payload: {},
        }, signal); });
    };
    /**
     * Terminate owned sockets and await the no-server acceptor plus frame pumps.
     * @returns A promise resolving after every socket and source iterator stops.
     */
    WebSocketDownlinks.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, socket;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        for (_i = 0, _a = this.server.clients; _i < _a.length; _i++) {
                            socket = _a[_i];
                            socket.terminate();
                        }
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                _this.server.close(function (error) {
                                    if (error === undefined)
                                        resolve();
                                    else
                                        reject(error);
                                });
                            })];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, Promise.all(this.pumps)];
                    case 2:
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    WebSocketDownlinks.prototype.upgrade = function (req, socket, head, open) {
        var _this = this;
        this.server.handleUpgrade(req, socket, head, function (websocket) {
            var abort = new AbortController();
            websocket.once('close', function () { abort.abort(); });
            websocket.once('error', function () { abort.abort(); });
            websocket.once('message', function () {
                websocket.close(1008, 'downlink only');
            });
            var pump = _this.pump(websocket, open(abort.signal), abort);
            _this.pumps.add(pump);
            void pump.then(function () { _this.pumps.delete(pump); });
        });
    };
    WebSocketDownlinks.prototype.pump = function (socket, frames, abort) {
        return __awaiter(this, void 0, void 0, function () {
            var frame, e_1_1, error_1, _a;
            var _b, frames_1, frames_1_1;
            var _c, e_1, _d, _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        _f.trys.push([0, 14, 19, 20]);
                        _f.label = 1;
                    case 1:
                        _f.trys.push([1, 7, 8, 13]);
                        _b = true, frames_1 = __asyncValues(frames);
                        _f.label = 2;
                    case 2: return [4 /*yield*/, frames_1.next()];
                    case 3:
                        if (!(frames_1_1 = _f.sent(), _c = frames_1_1.done, !_c)) return [3 /*break*/, 6];
                        _e = frames_1_1.value;
                        _b = false;
                        frame = _e;
                        return [4 /*yield*/, send(socket, frame)];
                    case 4:
                        _f.sent();
                        _f.label = 5;
                    case 5:
                        _b = true;
                        return [3 /*break*/, 2];
                    case 6: return [3 /*break*/, 13];
                    case 7:
                        e_1_1 = _f.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 13];
                    case 8:
                        _f.trys.push([8, , 11, 12]);
                        if (!(!_b && !_c && (_d = frames_1.return))) return [3 /*break*/, 10];
                        return [4 /*yield*/, _d.call(frames_1)];
                    case 9:
                        _f.sent();
                        _f.label = 10;
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 12: return [7 /*endfinally*/];
                    case 13: return [3 /*break*/, 20];
                    case 14:
                        error_1 = _f.sent();
                        if (!!abort.signal.aborted) return [3 /*break*/, 18];
                        _f.label = 15;
                    case 15:
                        _f.trys.push([15, 17, , 18]);
                        return [4 /*yield*/, send(socket, failureFrame(error_1))];
                    case 16:
                        _f.sent();
                        return [3 /*break*/, 18];
                    case 17:
                        _a = _f.sent();
                        return [3 /*break*/, 18];
                    case 18: return [3 /*break*/, 20];
                    case 19:
                        abort.abort();
                        if (socket.readyState === ws_1.default.OPEN)
                            socket.close();
                        return [7 /*endfinally*/];
                    case 20: return [2 /*return*/];
                }
            });
        });
    };
    return WebSocketDownlinks;
}());
exports.WebSocketDownlinks = WebSocketDownlinks;
/**
 * Reject an untrusted upgrade before protocol negotiation.
 * @param socket - Raw HTTP socket that remains owned by the caller.
 */
function rejectWebSocketUpgrade(socket) {
    socket.end([
        'HTTP/1.1 403 Forbidden',
        'Connection: close',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Length: 9',
        '',
        'forbidden',
    ].join('\r\n'));
}
