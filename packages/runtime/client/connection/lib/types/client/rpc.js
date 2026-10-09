"use strict";
/** Browser caller for generic Connection unary RPC channels. */
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
exports.createWebConnectionRpc = createWebConnectionRpc;
var api_1 = require("@z/dsh-host-apiproxy/api");
var random_uuid_ts_1 = require("./random-uuid.ts");
var INTERNAL_BASE = 'http://dsh.internal';
var CHANNEL_PATTERN = /^\/[A-Za-z0-9._~-]+$/;
var ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
/**
 * Create the browser-backed generic RPC caller.
 * @param doFetch - transport override; defaults to the page's global fetch.
 * @returns caller that owns request correlation and response-envelope validation.
 */
function createWebConnectionRpc(doFetch) {
    var send = doFetch !== null && doFetch !== void 0 ? doFetch : (function (input, init) { return globalThis.fetch(input, init); });
    return {
        call: function (channel, endpoint, payload, signal) {
            return __awaiter(this, void 0, void 0, function () {
                var rpcId, message, response, full, _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            assertTarget(channel, endpoint);
                            rpcId = (0, api_1.RpcId)((0, random_uuid_ts_1.randomUuid)());
                            message = {
                                type: 'client-request',
                                rpcId: rpcId,
                                method: endpoint,
                                payload: payload,
                            };
                            return [4 /*yield*/, send(new URL("".concat(channel, "/").concat(endpoint), resolveBase()), __assign({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(message) }, signal === undefined ? {} : { signal: signal }))];
                        case 1:
                            response = _c.sent();
                            if (!response.ok) {
                                throw new Error("transport failure for ".concat(channel, "/").concat(endpoint, ": HTTP ").concat(response.status));
                            }
                            _b = (_a = api_1.serverResponseSchema).parse;
                            return [4 /*yield*/, response.json()];
                        case 2:
                            full = _b.apply(_a, [_c.sent()]);
                            if (full.rpcId !== rpcId) {
                                throw new Error("rpcId mismatch for ".concat(endpoint, ": sent ").concat(rpcId, ", got ").concat(full.rpcId));
                            }
                            return [2 /*return*/, full.result];
                    }
                });
            });
        },
    };
}
function resolveBase() {
    var location = globalThis.location;
    return (location === null || location === void 0 ? void 0 : location.origin) !== undefined && location.origin !== 'null' ? location.origin : INTERNAL_BASE;
}
function assertTarget(channel, endpoint) {
    var segments = endpoint.split('/');
    if (!CHANNEL_PATTERN.test(channel)
        || segments.some(function (segment) {
            return segment === '' || segment === '.' || segment === '..' || !ENDPOINT_SEGMENT_PATTERN.test(segment);
        })) {
        throw new Error("connection: invalid RPC target ".concat(JSON.stringify("".concat(channel, "/").concat(endpoint))));
    }
}
