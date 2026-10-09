"use strict";
/**
 * node:http ↔ WHATWG fetch bridge for the /api transport (host side of the
 * web carrier; the fetch-shaped handler itself is transport-agnostic).
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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MAX_REQUEST_BODY_BYTES = void 0;
exports.bridge = bridge;
/** Default carrier cap for all HTTP RPC bodies: sized for the default
 * aggregate image limit (200 MiB) after base64 expansion plus envelope
 * headroom (~267.7 MiB required), rounded up for slack. The bridge buffers
 * each body in memory, so this cap is also the per-request resident bound. */
exports.DEFAULT_MAX_REQUEST_BODY_BYTES = 300 * 1024 * 1024;
/**
 * Bridge one node:http request to the fetch-shaped handler (client close
 * aborts; SSE bodies stream out chunk by chunk).
 * @param req - incoming node:http request (fully read before dispatch).
 * @param res - node:http response the bridge writes and owns to completion.
 * @param apiHandler - fetch-shaped API carrier the request is dispatched to.
 * @param maxRequestBodyBytes - maximum body bytes buffered before dispatch.
 */
function bridge(req_1, res_1, apiHandler_1) {
    return __awaiter(this, arguments, void 0, function (req, res, apiHandler, maxRequestBodyBytes) {
        var abort, declaredLength, chunks, received, chunk, buffer, e_1_1, request, response, _a, _b, _c, chunk, e_2_1;
        var _d, req_2, req_2_1;
        var _e, e_1, _f, _g, _h, e_2, _j, _k;
        var _l, _m;
        if (maxRequestBodyBytes === void 0) { maxRequestBodyBytes = exports.DEFAULT_MAX_REQUEST_BODY_BYTES; }
        return __generator(this, function (_o) {
            switch (_o.label) {
                case 0:
                    abort = new AbortController();
                    // Client-disconnect detection MUST hang off the response, not the request:
                    // since Node 16, IncomingMessage 'close' fires as soon as the request body is
                    // fully consumed (immediately for a bodyless GET), which would abort every SSE
                    // stream right after open. ServerResponse 'close' fires on connection teardown;
                    // writableEnded distinguishes a normal end() from the client going away.
                    res.on('close', function () {
                        if (!res.writableEnded)
                            abort.abort();
                    });
                    declaredLength = req.headers['content-length'];
                    if (declaredLength !== undefined && Number(declaredLength) > maxRequestBodyBytes) {
                        res.writeHead(413, { connection: 'close' });
                        res.end();
                        req.destroy();
                        return [2 /*return*/];
                    }
                    chunks = [];
                    received = 0;
                    _o.label = 1;
                case 1:
                    _o.trys.push([1, 6, 7, 12]);
                    _d = true, req_2 = __asyncValues(req);
                    _o.label = 2;
                case 2: return [4 /*yield*/, req_2.next()];
                case 3:
                    if (!(req_2_1 = _o.sent(), _e = req_2_1.done, !_e)) return [3 /*break*/, 5];
                    _g = req_2_1.value;
                    _d = false;
                    chunk = _g;
                    buffer = chunk;
                    received += buffer.byteLength;
                    if (received > maxRequestBodyBytes) {
                        res.writeHead(413, { connection: 'close' });
                        res.end();
                        req.destroy();
                        return [2 /*return*/];
                    }
                    chunks.push(buffer);
                    _o.label = 4;
                case 4:
                    _d = true;
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 12];
                case 6:
                    e_1_1 = _o.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 12];
                case 7:
                    _o.trys.push([7, , 10, 11]);
                    if (!(!_d && !_e && (_f = req_2.return))) return [3 /*break*/, 9];
                    return [4 /*yield*/, _f.call(req_2)];
                case 8:
                    _o.sent();
                    _o.label = 9;
                case 9: return [3 /*break*/, 11];
                case 10:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 11: return [7 /*endfinally*/];
                case 12:
                    request = new Request(new URL((_l = req.url) !== null && _l !== void 0 ? _l : '/', 'http://dsh.internal'), __assign(__assign({ method: (_m = req.method) !== null && _m !== void 0 ? _m : 'GET', headers: Object.fromEntries(Object.entries(req.headers).filter(function (_a) {
                            var v = _a[1];
                            return typeof v === 'string';
                        })) }, chunks.length > 0 ? { body: Buffer.concat(chunks) } : {}), { signal: abort.signal }));
                    return [4 /*yield*/, apiHandler.fetch(request)];
                case 13:
                    response = _o.sent();
                    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
                    if (response.body === null) {
                        res.end();
                        return [2 /*return*/];
                    }
                    _o.label = 14;
                case 14:
                    _o.trys.push([14, 20, 21, 26]);
                    _a = true, _b = __asyncValues(response.body);
                    _o.label = 15;
                case 15: return [4 /*yield*/, _b.next()];
                case 16:
                    if (!(_c = _o.sent(), _h = _c.done, !_h)) return [3 /*break*/, 19];
                    _k = _c.value;
                    _a = false;
                    chunk = _k;
                    if (!!res.write(chunk)) return [3 /*break*/, 18];
                    return [4 /*yield*/, new Promise(function (resolve) {
                            var done = function () {
                                res.off('drain', done);
                                res.off('close', done);
                                resolve();
                            };
                            res.once('drain', done);
                            res.once('close', done);
                        })];
                case 17:
                    _o.sent();
                    _o.label = 18;
                case 18:
                    _a = true;
                    return [3 /*break*/, 15];
                case 19: return [3 /*break*/, 26];
                case 20:
                    e_2_1 = _o.sent();
                    e_2 = { error: e_2_1 };
                    return [3 /*break*/, 26];
                case 21:
                    _o.trys.push([21, , 24, 25]);
                    if (!(!_a && !_h && (_j = _b.return))) return [3 /*break*/, 23];
                    return [4 /*yield*/, _j.call(_b)];
                case 22:
                    _o.sent();
                    _o.label = 23;
                case 23: return [3 /*break*/, 25];
                case 24:
                    if (e_2) throw e_2.error;
                    return [7 /*endfinally*/];
                case 25: return [7 /*endfinally*/];
                case 26:
                    res.end();
                    return [2 /*return*/];
            }
        });
    });
}
