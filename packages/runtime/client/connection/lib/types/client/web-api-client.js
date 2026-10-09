"use strict";
/** Browser API carrier: HTTP upstream plus one WebSocket per downstream event stream. */
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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebApiClient = void 0;
var api_ts_1 = require("./api.ts");
var events_schema_1 = require("@z/dsh-host-apiproxy/api/events.schema");
var rpc_schema_1 = require("@z/dsh-host-apiproxy/api/rpc.schema");
var api_path_ts_1 = require("../api-path.ts");
/** Browser platform subclass: unary/respond use fetch; mux/host use downlink-only WebSockets. */
var WebApiClient = /** @class */ (function (_super) {
    __extends(WebApiClient, _super);
    function WebApiClient() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    WebApiClient.prototype.doFetch = function (input, init) {
        return globalThis.fetch(input, init);
    };
    WebApiClient.prototype.openMux = function (_payload, signal, onOpen) {
        return this.readWebSocket(api_path_ts_1.MUX_EVENTS_PATH, signal, events_schema_1.muxFrameSchema, onOpen);
    };
    WebApiClient.prototype.openHost = function (_payload, signal, onOpen) {
        return this.readWebSocket(api_path_ts_1.HOST_EVENTS_PATH, signal, events_schema_1.hostFrameSchema, onOpen);
    };
    WebApiClient.prototype.readWebSocket = function (path, signal, frameSchema, onOpen) {
        return __asyncGenerator(this, arguments, function readWebSocket_1() {
            var url, socket, inbox, wake, enqueue, handleOpen, handleMessage, handleClose, handleAbort, item;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = new URL(path, this.resolveBase());
                        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
                        socket = new WebSocket(url);
                        inbox = [];
                        enqueue = function (item) {
                            inbox.push(item);
                            wake === null || wake === void 0 ? void 0 : wake();
                            wake = undefined;
                        };
                        handleOpen = function () { onOpen === null || onOpen === void 0 ? void 0 : onOpen(); };
                        handleMessage = function (event) {
                            var full;
                            var frame;
                            try {
                                if (typeof event.data !== 'string')
                                    throw new Error('binary WebSocket frame');
                                full = rpc_schema_1.serverRequestSchema.parse(JSON.parse(event.data));
                                frame = frameSchema.parse(full.payload);
                            }
                            catch (error) {
                                console.error("[client-connection] dropping malformed WebSocket frame on ".concat(path, ":"), error);
                                return;
                            }
                            _this.onEnvelope(full);
                            enqueue({ kind: 'frame', envelope: { rpcId: full.rpcId, payload: frame } });
                        };
                        handleClose = function () { enqueue({ kind: 'end' }); };
                        handleAbort = function () {
                            if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
                                socket.close();
                        };
                        socket.addEventListener('open', handleOpen);
                        socket.addEventListener('message', handleMessage);
                        socket.addEventListener('close', handleClose, { once: true });
                        signal.addEventListener('abort', handleAbort, { once: true });
                        if (signal.aborted)
                            handleAbort();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 11, 12]);
                        _a.label = 2;
                    case 2:
                        if (!true) return [3 /*break*/, 10];
                        _a.label = 3;
                    case 3:
                        if (!(inbox.length > 0)) return [3 /*break*/, 8];
                        item = inbox.shift();
                        if (!(item.kind === 'end')) return [3 /*break*/, 5];
                        return [4 /*yield*/, __await(void 0)];
                    case 4: return [2 /*return*/, _a.sent()];
                    case 5: return [4 /*yield*/, __await(item.envelope)];
                    case 6: return [4 /*yield*/, _a.sent()];
                    case 7:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 8: return [4 /*yield*/, __await(new Promise(function (resolve) { wake = resolve; }))];
                    case 9:
                        _a.sent();
                        return [3 /*break*/, 2];
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        signal.removeEventListener('abort', handleAbort);
                        socket.removeEventListener('open', handleOpen);
                        socket.removeEventListener('message', handleMessage);
                        socket.removeEventListener('close', handleClose);
                        handleAbort();
                        return [7 /*endfinally*/];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    return WebApiClient;
}(api_ts_1.AbstractApiClient));
exports.WebApiClient = WebApiClient;
