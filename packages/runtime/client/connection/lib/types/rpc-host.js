"use strict";
/** Host registry and HTTP adapter for generic Connection RPC channels. */
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
exports.HostConnectionService = void 0;
var cordis_1 = require("@z/cordis");
var api_1 = require("@z/dsh-host-apiproxy/api");
var http_bridge_ts_1 = require("./http-bridge.ts");
var api_request_trust_ts_1 = require("./api-request-trust.ts");
var api_path_ts_1 = require("./api-path.ts");
var INVALID_REQUEST_RPC_ID = (0, api_1.RpcId)('invalid-request');
var CHANNEL_PATTERN = /^\/[A-Za-z0-9._~-]+$/;
var ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
/** Host Connection service whose channel registrations belong to the caller fiber. */
var HostConnectionService = /** @class */ (function (_super) {
    __extends(HostConnectionService, _super);
    /**
     * Provide the Host half over the active HTTP server.
     * @param ctx - owning Connection plugin context.
     * @param trustedHosts - deployment authorities accepted by trusted-host channels.
     */
    function HostConnectionService(ctx, trustedHosts) {
        var _this = _super.call(this, ctx, 'connection') || this;
        _this.trustedHosts = trustedHosts;
        _this.interceptors = new Map();
        return _this;
    }
    Object.defineProperty(HostConnectionService.prototype, "rpc", {
        /** Generic channel registry scoped to the Context reading this service. */
        get: function () {
            var _this = this;
            var owner = this.ctx;
            return {
                handle: function (channel, handler, options) { return _this.register(owner, channel, handler, options); },
                intercept: function (channel, matches, handler, options) {
                    return _this.registerInterceptor(owner, channel, matches, handler, options);
                },
            };
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Compose one shared-channel Fetch handler from its interceptor and fallback.
     * @param channel - shared channel mounted by Connection.
     * @param fallback - handler for endpoints not claimed by the interceptor.
     * @returns Fetch handler that selects exactly one target for each request.
     */
    HostConnectionService.prototype.createSharedFetchHandler = function (channel, fallback) {
        var _this = this;
        return {
            fetch: function (request) {
                var endpoint = endpointFromPath(channel, new URL(request.url).pathname);
                var interceptor = _this.interceptors.get(channel);
                if (endpoint === undefined || interceptor === undefined || !interceptor.matches(endpoint)) {
                    return fallback.fetch(request);
                }
                if (interceptor.options.authority === 'loopback' && !(0, api_request_trust_ts_1.isTrustedApiRequest)(request, [])) {
                    return Promise.resolve(new Response('forbidden', { status: 403 }));
                }
                return interceptor.fetchHandler.fetch(request);
            },
        };
    };
    HostConnectionService.prototype.register = function (owner, channel, handler, options) {
        var _this = this;
        assertChannel(channel);
        var trustedHosts = options.authority === 'loopback' ? [] : this.trustedHosts;
        var fetchHandler = rpcFetchHandler(channel, handler);
        var route = {
            kind: 'prefix',
            path: channel,
            handler: function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!(0, api_request_trust_ts_1.isTrustedApiRequest)(req, trustedHosts)) {
                                res.writeHead(403);
                                res.end('forbidden');
                                return [2 /*return*/];
                            }
                            return [4 /*yield*/, (0, http_bridge_ts_1.bridge)(req, res, fetchHandler)];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); },
        };
        return owner.effect(function () { return owner.webServer.register(route); }, "client-connection: ".concat(channel, " rpc channel"));
    };
    HostConnectionService.prototype.registerInterceptor = function (owner, channel, matches, handler, options) {
        var _this = this;
        if (channel !== api_path_ts_1.API_PATH) {
            throw new Error("connection: invalid shared RPC channel ".concat(JSON.stringify(channel)));
        }
        var interceptor = {
            matches: matches,
            fetchHandler: rpcFetchHandler(channel, handler),
            options: options,
        };
        return owner.effect(function () {
            if (_this.interceptors.has(channel)) {
                throw new Error("connection: shared RPC channel ".concat(JSON.stringify(channel), " already has an interceptor"));
            }
            _this.interceptors.set(channel, interceptor);
            return function () {
                _this.interceptors.delete(channel);
            };
        }, "client-connection: ".concat(channel, " rpc interceptor"));
    };
    return HostConnectionService;
}(cordis_1.Service));
exports.HostConnectionService = HostConnectionService;
function rpcFetchHandler(channel, handler) {
    return {
        fetch: function (request) {
            return __awaiter(this, void 0, void 0, function () {
                var endpoint, mediaType, body, _a, envelope, message, result, error_1;
                var _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            endpoint = endpointFromPath(channel, new URL(request.url).pathname);
                            if (request.method !== 'POST' || endpoint === undefined) {
                                return [2 /*return*/, new Response('not found', { status: 404 })];
                            }
                            mediaType = (_c = (_b = request.headers.get('content-type')) === null || _b === void 0 ? void 0 : _b.split(';', 1)[0]) === null || _c === void 0 ? void 0 : _c.trim().toLowerCase();
                            if (mediaType !== 'application/json') {
                                return [2 /*return*/, new Response('content type must be application/json', { status: 415 })];
                            }
                            _d.label = 1;
                        case 1:
                            _d.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, request.json()];
                        case 2:
                            body = _d.sent();
                            return [3 /*break*/, 4];
                        case 3:
                            _a = _d.sent();
                            return [2 /*return*/, new Response('body is not JSON', { status: 400 })];
                        case 4:
                            envelope = api_1.clientRequestSchema.safeParse(body);
                            if (!envelope.success) {
                                return [2 /*return*/, invalidEnvelopeResponse(body, envelope.error.issues)];
                            }
                            message = envelope.data;
                            if (message.method !== endpoint) {
                                return [2 /*return*/, errorResponse(message.rpcId, {
                                        code: 'bad-request',
                                        message: "method ".concat(JSON.stringify(message.method), " does not match endpoint ").concat(JSON.stringify(endpoint)),
                                        details: { issues: [] },
                                    })];
                            }
                            _d.label = 5;
                        case 5:
                            _d.trys.push([5, 7, , 8]);
                            return [4 /*yield*/, handler(endpoint, message.payload, request.signal)];
                        case 6:
                            result = _d.sent();
                            return [2 /*return*/, fullResponse(message.rpcId, result)];
                        case 7:
                            error_1 = _d.sent();
                            return [2 /*return*/, new Response("handler failure: ".concat(String(error_1)), { status: 500 })];
                        case 8: return [2 /*return*/];
                    }
                });
            });
        },
    };
}
function invalidEnvelopeResponse(body, issues) {
    var rawId = body === null || body === void 0 ? void 0 : body.rpcId;
    var rpcId = typeof rawId === 'string' ? (0, api_1.RpcId)(rawId) : INVALID_REQUEST_RPC_ID;
    return errorResponse(rpcId, {
        code: 'bad-request',
        message: 'invalid client-request message',
        details: { issues: issues },
    });
}
function endpointFromPath(channel, pathname) {
    if (!pathname.startsWith("".concat(channel, "/")))
        return undefined;
    var endpoint = pathname.slice(channel.length + 1);
    var segments = endpoint.split('/');
    if (segments.some(function (segment) {
        return segment === '' || segment === '.' || segment === '..' || !ENDPOINT_SEGMENT_PATTERN.test(segment);
    })) {
        return undefined;
    }
    return endpoint;
}
function errorResponse(rpcId, error) {
    return fullResponse(rpcId, { ok: false, error: error });
}
function fullResponse(rpcId, result) {
    var body = { type: 'server-response', rpcId: rpcId, result: result };
    return Response.json(body);
}
function assertChannel(channel) {
    if (!CHANNEL_PATTERN.test(channel) || channel === '/api') {
        throw new Error("connection: invalid or reserved RPC channel ".concat(JSON.stringify(channel)));
    }
}
