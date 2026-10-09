"use strict";
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
exports.Config = exports.inject = exports.name = exports.MUX_EVENTS_PATH = exports.HOST_EVENTS_PATH = exports.API_PATH = exports.HostConnectionService = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_host_apiproxy_1 = require("@z/dsh-host-apiproxy");
var api_path_ts_1 = require("./api-path.ts");
var http_bridge_ts_1 = require("./http-bridge.ts");
var api_request_trust_ts_1 = require("./api-request-trust.ts");
var rpc_host_ts_1 = require("./rpc-host.ts");
var websocket_downlink_ts_1 = require("./websocket-downlink.ts");
var rpc_host_ts_2 = require("./rpc-host.ts");
Object.defineProperty(exports, "HostConnectionService", { enumerable: true, get: function () { return rpc_host_ts_2.HostConnectionService; } });
var api_path_ts_2 = require("./api-path.ts");
Object.defineProperty(exports, "API_PATH", { enumerable: true, get: function () { return api_path_ts_2.API_PATH; } });
Object.defineProperty(exports, "HOST_EVENTS_PATH", { enumerable: true, get: function () { return api_path_ts_2.HOST_EVENTS_PATH; } });
Object.defineProperty(exports, "MUX_EVENTS_PATH", { enumerable: true, get: function () { return api_path_ts_2.MUX_EVENTS_PATH; } });
/** Stable Cordis plugin name. */
exports.name = 'client-connection';
/** Headroom for RPC JSON fields around aggregate base64 image payloads. */
var REQUEST_ENVELOPE_HEADROOM_BYTES = 1024 * 1024;
function assertImageBodyCapacity(ctx, maxRequestBodyBytes) {
    var attachments = ctx.get('attachments');
    if (attachments === undefined)
        return;
    var requiredImageBodyBytes = Math.ceil(attachments.imageLimits.maxMessageImageBytes * 4 / 3) + REQUEST_ENVELOPE_HEADROOM_BYTES;
    if (maxRequestBodyBytes < requiredImageBodyBytes) {
        throw new Error("client-connection maxRequestBodyBytes (".concat(String(maxRequestBodyBytes), ") must be at least ")
            + "".concat(String(requiredImageBodyBytes), " for the configured aggregate image limit"));
    }
}
/** Services required before providing Connection; API Proxy is an optional `/api` fallback. */
exports.inject = ['webServer'];
exports.Config = schemastery_1.default.object({
    trustedHosts: schemastery_1.default.array(String).default([]),
    maxRequestBodyBytes: schemastery_1.default.natural().min(1).default(http_bridge_ts_1.DEFAULT_MAX_REQUEST_BODY_BYTES),
});
/**
 * Methods gated to loopback even on a trusted-host deployment. Native dialogs
 * act on the host machine; the settings and credential domains mutate the
 * user's configuration and secret store, and READING them is equally
 * privileged — `settings.describe` returns every exposed namespace's
 * configuration and `credentials.describe` reports whether an arbitrary
 * environment-variable name is configured and where from, which is
 * reconnaissance no anonymous caller should have. `trustedHosts` is a
 * DNS-rebinding fence, explicitly not authentication, so the whole
 * configuration plane stays loopback-same-origin until a real authentication
 * layer exists. `llm.discoverModels` belongs to that plane on both counts: it
 * carries a draft credential, and it makes the HOST issue a GET to a URL the
 * caller chose and reports back the status or the parsed body — an anonymous
 * LAN caller would have a probe for whatever the host can reach and the
 * browser cannot.
 *
 * The model catalog (`llm.providers`, `llm.models`) is deliberately NOT here:
 * it carries provider ids, display names, and model lists — no endpoints,
 * keys, or key state — and a LAN client's model picker legitimately needs it.
 */
var PRIVILEGED_METHODS = new Set([
    // A preset composition names the plugins a session runs, so reading one is
    // reconnaissance; copy and remove rearrange what the deployment offers, and
    // openDocument drives the host desktop — all more than the roster beside
    // them. (Authoring is copy-only, so no method here accepts composition text
    // or a path; the pin is about who may manage the roster at all.)
    //
    // CHOOSING one is not pinned, and `agentPreset.list` is not either. Picking a
    // preset looks like escalation — one of them mounts the toolset that edits the
    // live runtime — but `session.create` already takes an `agentPreset`, so
    // pinning only the switch would leave the same capability one method over.
    // The deeper reason is that the capability is not the preset's to grant: the
    // deployment's own default already carries `bash` and the filesystem tools, so
    // any caller that may start a session at all can already run commands as this
    // process. Pinning the switch would be a fence beside an open gate.
    'agentPreset.read',
    'agentPreset.copy',
    'agentPreset.openDocument',
    'agentPreset.remove',
    'host.pickDirectory',
    'host.openPath',
    'settings.describe',
    'settings.openDocument',
    'settings.update',
    'settings.replace',
    'settings.mutate',
    'credentials.describe',
    'credentials.set',
    'credentials.unset',
    'llm.discoverModels',
]);
/**
 * Mounts the API gateway under the browser transport prefix. Every request on
 * the prefix passes the browser-trust fence first (DNS-rebinding and
 * cross-site defense — [api-request-trust](./api-request-trust.ts));
 * privileged methods additionally pass it with an empty trust list, which
 * pins them to loopback.
 * @param ctx - Host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 */
function apply(ctx, config) {
    var _this = this;
    var _a, _b;
    // The Loader resolves schema defaults; hand-built test contexts may pass none.
    var trustedHosts = (_a = config === null || config === void 0 ? void 0 : config.trustedHosts) !== null && _a !== void 0 ? _a : [];
    var maxRequestBodyBytes = (_b = config === null || config === void 0 ? void 0 : config.maxRequestBodyBytes) !== null && _b !== void 0 ? _b : http_bridge_ts_1.DEFAULT_MAX_REQUEST_BODY_BYTES;
    // Config boundary: a malformed entry fails the load loudly here rather than
    // silently authorizing its hostname prefix at request time.
    for (var _i = 0, trustedHosts_1 = trustedHosts; _i < trustedHosts_1.length; _i++) {
        var entry = trustedHosts_1[_i];
        (0, api_request_trust_ts_1.assertTrustedAuthority)(entry);
    }
    if (ctx.get('apiProxy') !== undefined)
        assertImageBodyCapacity(ctx, maxRequestBodyBytes);
    var connection = new rpc_host_ts_1.HostConnectionService(ctx, trustedHosts);
    var fetchHandler = connection.createSharedFetchHandler(api_path_ts_1.API_PATH, {
        fetch: function (request) {
            return __awaiter(this, void 0, void 0, function () {
                var pathname, method, apiProxy;
                return __generator(this, function (_a) {
                    pathname = new URL(request.url).pathname;
                    method = pathname.startsWith("".concat(api_path_ts_1.API_PATH, "/"))
                        ? pathname.slice(api_path_ts_1.API_PATH.length + 1)
                        : undefined;
                    if (method !== undefined
                        && PRIVILEGED_METHODS.has(method)
                        && !(0, api_request_trust_ts_1.isTrustedApiRequest)(request, [])) {
                        return [2 /*return*/, new Response('forbidden', { status: 403 })];
                    }
                    if (request.method === 'GET' && (pathname === api_path_ts_1.MUX_EVENTS_PATH || pathname === api_path_ts_1.HOST_EVENTS_PATH)) {
                        return [2 /*return*/, new Response('upgrade required', {
                                status: 426,
                                headers: { connection: 'Upgrade', upgrade: 'websocket' },
                            })];
                    }
                    apiProxy = ctx.get('apiProxy');
                    if (apiProxy === undefined)
                        return [2 /*return*/, new Response('not found', { status: 404 })];
                    return [2 /*return*/, (0, dsh_host_apiproxy_1.toFetchHandler)(apiProxy).fetch(request)];
                });
            });
        },
    });
    var route = {
        kind: 'prefix',
        path: api_path_ts_1.API_PATH,
        handler: function (req, res) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(0, api_request_trust_ts_1.isTrustedApiRequest)(req, trustedHosts)) {
                            res.writeHead(403);
                            res.end('forbidden');
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, (0, http_bridge_ts_1.bridge)(req, res, fetchHandler, maxRequestBodyBytes)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); },
    };
    ctx.effect(function () { return ctx.webServer.register(route); }, 'client-connection: /api route');
    ctx.inject(['apiProxy'], function (apiCtx) {
        assertImageBodyCapacity(apiCtx, maxRequestBodyBytes);
        var downlinks = new websocket_downlink_ts_1.WebSocketDownlinks(apiCtx.apiProxy);
        var registerDownlink = function (path, handle) {
            apiCtx.effect(function () { return apiCtx.webServer.registerUpgrade({
                path: path,
                handler: function (req, socket, head) {
                    if (!(0, api_request_trust_ts_1.isTrustedApiRequest)(req, trustedHosts)) {
                        (0, websocket_downlink_ts_1.rejectWebSocketUpgrade)(socket);
                        return;
                    }
                    return handle(req, socket, head);
                },
            }); }, "client-connection: ".concat(path, " WebSocket"));
        };
        apiCtx.effect(function () { return function () { return downlinks.close(); }; }, 'client-connection: WebSocket downlinks');
        registerDownlink(api_path_ts_1.MUX_EVENTS_PATH, function (req, socket, head) { downlinks.handleMux(req, socket, head); });
        registerDownlink(api_path_ts_1.HOST_EVENTS_PATH, function (req, socket, head) { downlinks.handleHost(req, socket, head); });
    });
}
