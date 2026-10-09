"use strict";
/**
 * @z/dsh-host-apiproxy — the API gateway every client shape shares:
 * the ApiProxy contract (api/: types + zod schemas, browser-safe), the fetch
 * carrier pair (fetch/: toFetchHandler on the host side, AbstractApiClient +
 * platform subclasses on the client side), and the host-side implementation
 * (api-proxy.ts: createApiProxy + the ApiProxyService gateway plugin providing
 * `ctx.apiProxy`). Transport-agnostic by design: this package registers no
 * routes — physical carriers wrap `ctx.apiProxy` themselves.
 *
 * The gateway consumes `ctx.agentDefaultModel`, the transport-independent default
 * shared with direct entry points. Switching models persists through that
 * service; sessions that have already logged a selection remain unchanged.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiProxyService = exports.createApiProxy = exports.InProcessApiClient = exports.AbstractApiClient = exports.toFetchHandler = exports.RpcId = void 0;
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var api_proxy_ts_1 = require("./api-proxy.ts");
var session_export_ts_1 = require("./session-export.ts");
var rpc_ts_1 = require("./api/rpc.ts");
Object.defineProperty(exports, "RpcId", { enumerable: true, get: function () { return rpc_ts_1.RpcId; } });
var handler_ts_1 = require("./fetch/handler.ts");
Object.defineProperty(exports, "toFetchHandler", { enumerable: true, get: function () { return handler_ts_1.toFetchHandler; } });
var client_ts_1 = require("./fetch/client.ts");
Object.defineProperty(exports, "AbstractApiClient", { enumerable: true, get: function () { return client_ts_1.AbstractApiClient; } });
Object.defineProperty(exports, "InProcessApiClient", { enumerable: true, get: function () { return client_ts_1.InProcessApiClient; } });
var api_proxy_ts_2 = require("./api-proxy.ts");
Object.defineProperty(exports, "createApiProxy", { enumerable: true, get: function () { return api_proxy_ts_2.createApiProxy; } });
/**
 * The API gateway service: implements the ApiProxy contract over the composed
 * host context and provides it as `ctx.apiProxy`. The Host cwd is the default
 * project directory.
 */
var ApiProxyService = /** @class */ (function (_super) {
    __extends(ApiProxyService, _super);
    function ApiProxyService(ctx, config) {
        var _this = _super.call(this, ctx, 'apiProxy') || this;
        var api = (0, api_proxy_ts_1.createApiProxy)(ctx, __assign(__assign(__assign({ defaultModelSelection: function () { return ctx.agentDefaultModel.currentSelection(); }, saveDefaultModelSelection: function (selection) { return ctx.agentDefaultModel.saveSelection(selection); }, cwd: process.cwd() }, config.nativeOpen === undefined ? {} : { canOpenPath: function () { return config.nativeOpen; } }), (config.sessionExportCompressionLevel === undefined
            ? {}
            : { sessionExportCompressionLevel: config.sessionExportCompressionLevel })), (config.coldBlankProbeMaxBytes === undefined
            ? {}
            : { coldBlankProbeMaxBytes: config.coldBlankProbeMaxBytes })));
        _this.sessions = api.sessions;
        _this.subagents = api.subagents;
        _this.workspace = api.workspace;
        _this.host = api.host;
        _this.goals = api.goals;
        _this.skills = api.skills;
        _this.agentPresets = api.agentPresets;
        _this.settings = api.settings;
        _this.credentials = api.credentials;
        _this.authorization = api.authorization;
        _this.llm = api.llm;
        _this.mcp = api.mcp;
        _this.events = api.events;
        _this.downloads = api.downloads;
        // createApiProxy returns closures (no `this` capture), so the bind is
        // behavior-neutral.
        _this.respond = api.respond.bind(api);
        return _this;
    }
    ApiProxyService.inject = [
        'agentDefaultModel', 'agents', 'attachments', 'directoryPicker', 'llm', 'sessions', 'subagents', 'sessionQuery',
        'tools', 'userQuestions', 'workspaceRegistry',
    ];
    ApiProxyService.Config = schemastery_1.default.object({
        nativeOpen: schemastery_1.default.boolean(),
        sessionExportCompressionLevel: schemastery_1.default.number().step(1).min(0).max(9)
            .default(session_export_ts_1.DEFAULT_SESSION_LOG_COMPRESSION_LEVEL),
        coldBlankProbeMaxBytes: schemastery_1.default.natural().default(api_proxy_ts_1.DEFAULT_COLD_BLANK_PROBE_MAX_BYTES),
    });
    return ApiProxyService;
}(cordis_1.Service));
exports.ApiProxyService = ApiProxyService;
exports.default = ApiProxyService;
