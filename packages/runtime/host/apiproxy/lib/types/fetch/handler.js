"use strict";
/**
 * Server side of the fetch carrier: maps an ApiProxy onto a pure
 * WHATWG Request->Response function. Two-level parse: full form (type/rpcId/method +
 * path==method) -> payload dispatched per method. HTTP status expresses only the carrier
 * (404 unknown path / 415 non-JSON media type / 400 non-JSON body / 500 handler crash);
 * business errors are always 200 + ServerResponse.
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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toFetchHandler = toFetchHandler;
var node_crypto_1 = require("node:crypto");
var downloads_schema_ts_1 = require("../api/downloads.schema.ts");
var authorization_schema_ts_1 = require("../api/authorization.schema.ts");
var rpc_ts_1 = require("../api/rpc.ts");
var rpc_schema_ts_1 = require("../api/rpc.schema.ts");
var sessions_schema_ts_1 = require("../api/sessions.schema.ts");
var host_schema_ts_1 = require("../api/host.schema.ts");
var workspace_schema_ts_1 = require("../api/workspace.schema.ts");
var skills_schema_ts_1 = require("../api/skills.schema.ts");
var agent_presets_schema_ts_1 = require("../api/agent-presets.schema.ts");
var goals_schema_ts_1 = require("../api/goals.schema.ts");
var settings_schema_ts_1 = require("../api/settings.schema.ts");
var credentials_schema_ts_1 = require("../api/credentials.schema.ts");
var llm_schema_ts_1 = require("../api/llm.schema.ts");
var mcp_schema_ts_1 = require("../api/mcp.schema.ts");
var subagents_schema_ts_1 = require("../api/subagents.schema.ts");
var UNARY_ROUTES = {
    'session.list': { schema: sessions_schema_ts_1.sessionListRequestSchema, invoke: function (api, r) { return api.sessions.list(r); } },
    'session.search': { schema: sessions_schema_ts_1.sessionSearchRequestSchema, invoke: function (api, r, signal) { return api.sessions.search(r, signal); } },
    'session.create': { schema: sessions_schema_ts_1.sessionCreateRequestSchema, invoke: function (api, r) { return api.sessions.create(r); } },
    'session.history': { schema: sessions_schema_ts_1.sessionHistoryRequestSchema, invoke: function (api, r) { return api.sessions.history(r); } },
    'session.models': { schema: sessions_schema_ts_1.sessionModelsRequestSchema, invoke: function (api, r) { return api.sessions.models(r); } },
    'session.selectModel': { schema: sessions_schema_ts_1.sessionSelectModelRequestSchema, invoke: function (api, r) { return api.sessions.selectModel(r); } },
    'session.rename': { schema: sessions_schema_ts_1.sessionRenameRequestSchema, invoke: function (api, r) { return api.sessions.rename(r); } },
    'session.fork': { schema: sessions_schema_ts_1.sessionForkRequestSchema, invoke: function (api, r) { return api.sessions.fork(r); } },
    'session.prompt': { schema: sessions_schema_ts_1.sessionPromptRequestSchema, invoke: function (api, r) { return api.sessions.prompt(r); } },
    'session.attachment': { schema: sessions_schema_ts_1.sessionAttachmentRequestSchema, invoke: function (api, r) { return api.sessions.attachment(r); } },
    'session.updateQueue': { schema: sessions_schema_ts_1.sessionUpdateQueueRequestSchema, invoke: function (api, r) { return api.sessions.updateQueue(r); } },
    'session.cancel': { schema: sessions_schema_ts_1.sessionCancelRequestSchema, invoke: function (api, r) { return api.sessions.cancel(r); } },
    'subagent.list': { schema: subagents_schema_ts_1.subagentListRequestSchema, invoke: function (api, r, signal) { return api.subagents.list(r, signal); } },
    'subagent.history': { schema: subagents_schema_ts_1.subagentHistoryRequestSchema, invoke: function (api, r, signal) { return api.subagents.history(r, signal); } },
    'subagent.prompt': { schema: subagents_schema_ts_1.subagentPromptRequestSchema, invoke: function (api, r, signal) { return api.subagents.prompt(r, signal); } },
    'subagent.interrupt': { schema: subagents_schema_ts_1.subagentInterruptRequestSchema, invoke: function (api, r) { return api.subagents.interrupt(r); } },
    'host.describe': { schema: host_schema_ts_1.hostDescribeRequestSchema, invoke: function (api, r) { return api.host.describe(r); } },
    'host.pickDirectory': { schema: host_schema_ts_1.hostPickDirectoryRequestSchema, invoke: function (api, r, signal) { return api.host.pickDirectory(r, signal); } },
    'host.listDirectory': { schema: host_schema_ts_1.hostListDirectoryRequestSchema, invoke: function (api, r, signal) { return api.host.listDirectory(r, signal); } },
    'host.createDirectory': { schema: host_schema_ts_1.hostCreateDirectoryRequestSchema, invoke: function (api, r) { return api.host.createDirectory(r); } },
    'host.openPath': { schema: host_schema_ts_1.hostOpenPathRequestSchema, invoke: function (api, r, signal) { return api.host.openPath(r, signal); } },
    'workspace.list': { schema: workspace_schema_ts_1.workspaceListRequestSchema, invoke: function (api, r) { return api.workspace.list(r); } },
    'workspace.create': { schema: workspace_schema_ts_1.workspaceCreateRequestSchema, invoke: function (api, r) { return api.workspace.create(r); } },
    'workspace.rename': { schema: workspace_schema_ts_1.workspaceRenameRequestSchema, invoke: function (api, r) { return api.workspace.rename(r); } },
    'workspace.delete': { schema: workspace_schema_ts_1.workspaceDeleteRequestSchema, invoke: function (api, r) { return api.workspace.delete(r); } },
    'workspace.insertBefore': { schema: workspace_schema_ts_1.workspaceInsertBeforeRequestSchema, invoke: function (api, r) { return api.workspace.insertBefore(r); } },
    'workspace.insertSessionBefore': { schema: workspace_schema_ts_1.workspaceInsertSessionBeforeRequestSchema, invoke: function (api, r) { return api.workspace.insertSessionBefore(r); } },
    'workspace.archiveSession': { schema: workspace_schema_ts_1.workspaceArchiveSessionRequestSchema, invoke: function (api, r) { return api.workspace.archiveSession(r); } },
    'skill.list': { schema: skills_schema_ts_1.skillListRequestSchema, invoke: function (api, r) { return api.skills.list(r); } },
    'agentPreset.list': { schema: agent_presets_schema_ts_1.agentPresetListRequestSchema, invoke: function (api, r) { return api.agentPresets.list(r); } },
    'agentPreset.select': { schema: agent_presets_schema_ts_1.agentPresetSelectRequestSchema, invoke: function (api, r) { return api.agentPresets.select(r); } },
    'agentPreset.read': { schema: agent_presets_schema_ts_1.agentPresetReadRequestSchema, invoke: function (api, r) { return api.agentPresets.read(r); } },
    'agentPreset.copy': { schema: agent_presets_schema_ts_1.agentPresetCopyRequestSchema, invoke: function (api, r) { return api.agentPresets.copy(r); } },
    'agentPreset.openDocument': { schema: agent_presets_schema_ts_1.agentPresetOpenDocumentRequestSchema, invoke: function (api, r, signal) { return api.agentPresets.openDocument(r, signal); } },
    'agentPreset.remove': { schema: agent_presets_schema_ts_1.agentPresetRemoveRequestSchema, invoke: function (api, r) { return api.agentPresets.remove(r); } },
    'goal.create': { schema: goals_schema_ts_1.goalCreateRequestSchema, invoke: function (api, r) { return api.goals.create(r); } },
    'goal.edit': { schema: goals_schema_ts_1.goalEditRequestSchema, invoke: function (api, r) { return api.goals.edit(r); } },
    'goal.pause': { schema: goals_schema_ts_1.goalPauseRequestSchema, invoke: function (api, r) { return api.goals.pause(r); } },
    'goal.resume': { schema: goals_schema_ts_1.goalResumeRequestSchema, invoke: function (api, r) { return api.goals.resume(r); } },
    'goal.complete': { schema: goals_schema_ts_1.goalCompleteRequestSchema, invoke: function (api, r) { return api.goals.complete(r); } },
    'goal.clear': { schema: goals_schema_ts_1.goalClearRequestSchema, invoke: function (api, r) { return api.goals.clear(r); } },
    'settings.describe': { schema: settings_schema_ts_1.settingsDescribeRequestSchema, invoke: function (api, r) { return api.settings.describe(r); } },
    'settings.openDocument': { schema: settings_schema_ts_1.settingsOpenDocumentRequestSchema, invoke: function (api, r, signal) { return api.settings.openDocument(r, signal); } },
    'settings.update': { schema: settings_schema_ts_1.settingsUpdateRequestSchema, invoke: function (api, r) { return api.settings.update(r); } },
    'settings.replace': { schema: settings_schema_ts_1.settingsReplaceRequestSchema, invoke: function (api, r) { return api.settings.replace(r); } },
    'settings.mutate': { schema: settings_schema_ts_1.settingsMutateRequestSchema, invoke: function (api, r) { return api.settings.mutate(r); } },
    'credentials.describe': { schema: credentials_schema_ts_1.credentialsDescribeRequestSchema, invoke: function (api, r) { return api.credentials.describe(r); } },
    'credentials.set': { schema: credentials_schema_ts_1.credentialsSetRequestSchema, invoke: function (api, r) { return api.credentials.set(r); } },
    'credentials.unset': { schema: credentials_schema_ts_1.credentialsUnsetRequestSchema, invoke: function (api, r) { return api.credentials.unset(r); } },
    'llm.providers': { schema: llm_schema_ts_1.llmProvidersRequestSchema, invoke: function (api, r) { return api.llm.providers(r); } },
    'llm.models': { schema: llm_schema_ts_1.llmModelsRequestSchema, invoke: function (api, r) { return api.llm.models(r); } },
    'llm.discoverModels': { schema: llm_schema_ts_1.llmDiscoverModelsRequestSchema, invoke: function (api, r, signal) { return api.llm.discoverModels(r, signal); } },
    'mcp.list': { schema: mcp_schema_ts_1.mcpListRequestSchema, invoke: function (api, r) { return api.mcp.list(r); } },
    'mcp.call': { schema: mcp_schema_ts_1.mcpCallRequestSchema, invoke: function (api, r, signal) { return api.mcp.call(r, signal); } },
    'authorization.list': { schema: authorization_schema_ts_1.authorizationListRequestSchema, invoke: function (api, r) { return api.authorization.list(r); } },
    'authorization.begin': { schema: authorization_schema_ts_1.authorizationBeginRequestSchema, invoke: function (api, r, signal) { return api.authorization.begin(r, signal); } },
    'authorization.cancel': { schema: authorization_schema_ts_1.authorizationCancelRequestSchema, invoke: function (api, r) { return api.authorization.cancel(r); } },
    'authorization.answer': { schema: authorization_schema_ts_1.authorizationAnswerRequestSchema, invoke: function (api, r) { return api.authorization.answer(r); } },
    'authorization.logout': { schema: authorization_schema_ts_1.authorizationLogoutRequestSchema, invoke: function (api, r) { return api.authorization.logout(r); } },
};
/** Route lookup that narrows an arbitrary path segment to a map key (single cast point for the string→key refinement). */
function methodFor(path) {
    return Object.hasOwn(UNARY_ROUTES, path) ? path : undefined;
}
/**
 * Sentinel rpcId for error responses to envelopes whose own rpcId is unreadable: the response
 * must still be a valid ServerResponse (a self-violating shape would turn the server's explicit
 * bad-request report into a client-side parse failure). Fixed value, documented here as wire contract.
 */
var INVALID_REQUEST_RPC_ID = (0, rpc_ts_1.RpcId)('invalid-request');
/** Wrap a business error as a ServerResponse full form (rpcId backfilled; an unreadable rpcId uses the invalid-request sentinel). */
function errorResponse(rpcId, error) {
    var body = { type: 'server-response', rpcId: rpcId, result: { ok: false, error: error } };
    return Response.json(body);
}
/** Complete the impl's narrow form into a ServerResponse full form. */
function fullResponse(narrow) {
    var body = { type: 'server-response', rpcId: narrow.rpcId, result: narrow.result };
    return Response.json(body);
}
/**
 * Parse the payload and invoke one unary route. Generic over the map key so
 * the row's schema/invoke pairing typechecks; the only cast collapses the
 * Wire<> widening back to the exact payload (undefined-valued properties and
 * absent ones are indistinguishable after JSON transport).
 */
// K appears once in the signature but ties the UNARY_ROUTES[K] row lookup to its own
// schema/invoke pairing; a union parameter degrades the row to an uninvokable intersection.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
function handleUnary(api, method, message, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var route, payload, _a, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    route = UNARY_ROUTES[method];
                    payload = route.schema.safeParse(message.payload);
                    if (!payload.success) {
                        return [2 /*return*/, errorResponse(message.rpcId, { code: 'bad-request', message: "invalid payload for ".concat(method), details: { issues: payload.error.issues } })];
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    _a = fullResponse;
                    return [4 /*yield*/, route.invoke(api, { rpcId: message.rpcId, payload: payload.data }, signal)];
                case 2: return [2 /*return*/, _a.apply(void 0, [_b.sent()])];
                case 3:
                    error_1 = _b.sent();
                    // The impl never throws business errors; reaching here means the implementation itself crashed — 500, carrier layer.
                    return [2 /*return*/, new Response("handler failure: ".concat(String(error_1)), { status: 500 })];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/** SSE frame: complete the narrow RpcRequest<frame> into a ServerRequest full form (method = frame type). */
function fullFrame(narrow) {
    return { type: 'server-request', rpcId: narrow.rpcId, method: narrow.payload.type, payload: narrow.payload };
}
/**
 * Wrap a frame stream as an SSE Response; stops when req.signal aborts. An
 * impl throw mid-stream emits one stream/error frame and then closes.
 */
function sseResponse(frames) {
    var encoder = new TextEncoder();
    var stream = new ReadableStream({
        start: function (controller) {
            return __awaiter(this, void 0, void 0, function () {
                var heartbeat, _a, frames_1, frames_1_1, narrow, e_1_1, error_2, failure;
                var _b, e_1, _c, _d;
                var _e;
                return __generator(this, function (_f) {
                    switch (_f.label) {
                        case 0:
                            heartbeat = setInterval(function () {
                                try {
                                    controller.enqueue(encoder.encode(': keepalive\n\n'));
                                }
                                catch ( /* stream was cancelled or closed */_a) { /* stream was cancelled or closed */ }
                            }, 15000);
                            (_e = heartbeat.unref) === null || _e === void 0 ? void 0 : _e.call(heartbeat);
                            _f.label = 1;
                        case 1:
                            _f.trys.push([1, 14, 15, 16]);
                            // Send an SSE comment line on open so clients/proxies see a live channel (the host
                            // stream has no baseline frames and would otherwise emit zero bytes while idle;
                            // a comment line is not a frame, so client frame parsing skips it naturally).
                            controller.enqueue(encoder.encode(': connected\n\n'));
                            _f.label = 2;
                        case 2:
                            _f.trys.push([2, 7, 8, 13]);
                            _a = true, frames_1 = __asyncValues(frames);
                            _f.label = 3;
                        case 3: return [4 /*yield*/, frames_1.next()];
                        case 4:
                            if (!(frames_1_1 = _f.sent(), _b = frames_1_1.done, !_b)) return [3 /*break*/, 6];
                            _d = frames_1_1.value;
                            _a = false;
                            narrow = _d;
                            controller.enqueue(encoder.encode("data: ".concat(JSON.stringify(fullFrame(narrow)), "\n\n")));
                            _f.label = 5;
                        case 5:
                            _a = true;
                            return [3 /*break*/, 3];
                        case 6: return [3 /*break*/, 13];
                        case 7:
                            e_1_1 = _f.sent();
                            e_1 = { error: e_1_1 };
                            return [3 /*break*/, 13];
                        case 8:
                            _f.trys.push([8, , 11, 12]);
                            if (!(!_a && !_b && (_c = frames_1.return))) return [3 /*break*/, 10];
                            return [4 /*yield*/, _c.call(frames_1)];
                        case 9:
                            _f.sent();
                            _f.label = 10;
                        case 10: return [3 /*break*/, 12];
                        case 11:
                            if (e_1) throw e_1.error;
                            return [7 /*endfinally*/];
                        case 12: return [7 /*endfinally*/];
                        case 13: return [3 /*break*/, 16];
                        case 14:
                            error_2 = _f.sent();
                            failure = { type: 'stream/error', error: { code: 'internal', message: String(error_2), details: {} } };
                            try {
                                controller.enqueue(encoder.encode("data: ".concat(JSON.stringify(fullFrame({ rpcId: (0, rpc_ts_1.RpcId)((0, node_crypto_1.randomUUID)()), payload: failure })), "\n\n")));
                            }
                            catch (_g) {
                                // Consumer already cancelled the stream: enqueue-after-cancel is the
                                // only reachable error, and there is no one left to tell.
                            }
                            return [3 /*break*/, 16];
                        case 15:
                            clearInterval(heartbeat);
                            try {
                                controller.close();
                            }
                            catch ( /* already cancelled by the consumer: a double close is the only reachable error */_h) { /* already cancelled by the consumer: a double close is the only reachable error */ }
                            return [7 /*endfinally*/];
                        case 16: return [2 /*return*/];
                    }
                });
            });
        },
    });
    return new Response(stream, {
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
    });
}
/**
 * Wraps an ApiProxy into a pure fetch function (isomorphic point: feed the returned fetch straight to InProcessApiClient).
 * @param api - the host-side ApiProxy implementation.
 * @returns an object holding `fetch(Request)`; paths outside /api/ return 404.
 */
function toFetchHandler(api) {
    return {
        // Signature matches global fetch: the isomorphic point hands this function to InProcessApiClient as its transport aspect,
        // Clients call in (url, init) form — normalize to Request before handling.
        fetch: function (input, init) {
            return __awaiter(this, void 0, void 0, function () {
                var req, url, path, parsed, response, mediaType, body, _a, parsed, _b, _c, method, envelope, rawId, rpcId, message;
                var _d, _e, _f;
                return __generator(this, function (_g) {
                    switch (_g.label) {
                        case 0:
                            req = input instanceof Request ? input : new Request(input, init);
                            url = new URL(req.url);
                            path = url.pathname;
                            // No-envelope read channels (SSE GET streams + host-only download):
                            // physical routes that answer directly, without a wire envelope.
                            if (path === '/api/events.mux' && req.method === 'GET') {
                                return [2 /*return*/, sseResponse(api.events.mux({ rpcId: (0, rpc_ts_1.RpcId)((0, node_crypto_1.randomUUID)()), payload: {} }, req.signal))];
                            }
                            if (path === '/api/events.host' && req.method === 'GET') {
                                return [2 /*return*/, sseResponse(api.events.host({ rpcId: (0, rpc_ts_1.RpcId)((0, node_crypto_1.randomUUID)()), payload: {} }, req.signal))];
                            }
                            if (!(path === '/api/session.export' && (req.method === 'GET' || req.method === 'HEAD'))) return [3 /*break*/, 3];
                            parsed = downloads_schema_ts_1.sessionLogQuerySchema.safeParse(Object.fromEntries(url.searchParams));
                            if (!parsed.success) {
                                return [2 /*return*/, new Response('missing or invalid sessionId query parameter', { status: 400 })];
                            }
                            return [4 /*yield*/, api.downloads.sessionLog(parsed.data, req.signal)];
                        case 1:
                            response = _g.sent();
                            if (req.method === 'GET')
                                return [2 /*return*/, response];
                            return [4 /*yield*/, ((_d = response.body) === null || _d === void 0 ? void 0 : _d.cancel())];
                        case 2:
                            _g.sent();
                            return [2 /*return*/, new Response(null, { status: response.status, headers: response.headers })];
                        case 3:
                            if (req.method !== 'POST' || !path.startsWith('/api/')) {
                                return [2 /*return*/, new Response('not found', { status: 404 })];
                            }
                            mediaType = (_f = (_e = req.headers.get('content-type')) === null || _e === void 0 ? void 0 : _e.split(';', 1)[0]) === null || _f === void 0 ? void 0 : _f.trim().toLowerCase();
                            if (mediaType !== 'application/json') {
                                return [2 /*return*/, new Response('content type must be application/json', { status: 415 })];
                            }
                            _g.label = 4;
                        case 4:
                            _g.trys.push([4, 6, , 7]);
                            return [4 /*yield*/, req.json()];
                        case 5:
                            body = _g.sent();
                            return [3 /*break*/, 7];
                        case 6:
                            _a = _g.sent();
                            // 400 = carrier layer (body is not even JSON); valid JSON with a bad shape goes 200 + bad-request.
                            return [2 /*return*/, new Response('body is not JSON', { status: 400 })];
                        case 7:
                            if (!(path === '/api/respond')) return [3 /*break*/, 9];
                            parsed = rpc_schema_ts_1.clientResponseSchema.safeParse(body);
                            if (!parsed.success)
                                return [2 /*return*/, Response.json({ accepted: false, reason: 'bad-response' })];
                            _c = (_b = Response).json;
                            return [4 /*yield*/, api.respond(parsed.data)];
                        case 8: return [2 /*return*/, _c.apply(_b, [_g.sent()])];
                        case 9:
                            method = methodFor(path.slice('/api/'.length));
                            if (method === undefined)
                                return [2 /*return*/, new Response('not found', { status: 404 })];
                            envelope = rpc_schema_ts_1.clientRequestSchema.safeParse(body);
                            if (!envelope.success) {
                                rawId = body === null || body === void 0 ? void 0 : body.rpcId;
                                rpcId = typeof rawId === 'string' ? (0, rpc_ts_1.RpcId)(rawId) : INVALID_REQUEST_RPC_ID;
                                return [2 /*return*/, errorResponse(rpcId, { code: 'bad-request', message: 'invalid client-request message', details: { issues: envelope.error.issues } })];
                            }
                            message = envelope.data;
                            if (message.method !== method) {
                                return [2 /*return*/, errorResponse(message.rpcId, { code: 'bad-request', message: "method \"".concat(message.method, "\" does not match path \"").concat(method, "\""), details: { issues: [] } })];
                            }
                            return [2 /*return*/, handleUnary(api, method, message, req.signal)];
                    }
                });
            });
        },
    };
}
