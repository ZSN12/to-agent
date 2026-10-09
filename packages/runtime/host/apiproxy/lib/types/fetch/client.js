"use strict";
/**
 * Client side of the fetch carrier. AbstractApiClient holds every protocol invariant: rpcId minting,
 * four-quadrant envelope wrap/unwrap, zod parsing, in-process SSE frame decoding, and the payload-direct
 * IApiClient domain methods (business code never mints). Platform differences ride two aspects:
 * abstract doFetch (transport) + overridable onEnvelope (tap). ApiProxy (the impl face) is untouched.
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
exports.InProcessApiClient = exports.AbstractApiClient = void 0;
var rpc_ts_1 = require("../api/rpc.ts");
var rpc_schema_ts_1 = require("../api/rpc.schema.ts");
var events_schema_ts_1 = require("../api/events.schema.ts");
var host_schema_ts_1 = require("../api/host.schema.ts");
var sessions_schema_ts_1 = require("../api/sessions.schema.ts");
var workspace_schema_ts_1 = require("../api/workspace.schema.ts");
var skills_schema_ts_1 = require("../api/skills.schema.ts");
var agent_presets_schema_ts_1 = require("../api/agent-presets.schema.ts");
var goals_schema_ts_1 = require("../api/goals.schema.ts");
var settings_schema_ts_1 = require("../api/settings.schema.ts");
var credentials_schema_ts_1 = require("../api/credentials.schema.ts");
var llm_schema_ts_1 = require("../api/llm.schema.ts");
var mcp_schema_ts_1 = require("../api/mcp.schema.ts");
var authorization_schema_ts_1 = require("../api/authorization.schema.ts");
var subagents_schema_ts_1 = require("../api/subagents.schema.ts");
/**
 * S→C second-level parse table: value schema by method (the response-path
 * mirror of the handler's request table; key coverage compiler-enforced against RpcMethodMap).
 */
var UNARY_VALUE_SCHEMAS = {
    'session.list': sessions_schema_ts_1.sessionListValueSchema,
    'session.search': sessions_schema_ts_1.sessionSearchValueSchema,
    'session.create': sessions_schema_ts_1.sessionCreateValueSchema,
    'session.history': sessions_schema_ts_1.sessionHistoryValueSchema,
    'session.models': sessions_schema_ts_1.sessionModelsValueSchema,
    'session.selectModel': sessions_schema_ts_1.sessionSelectModelValueSchema,
    'session.rename': sessions_schema_ts_1.sessionRenameValueSchema,
    'session.fork': sessions_schema_ts_1.sessionForkValueSchema,
    'session.prompt': sessions_schema_ts_1.sessionPromptValueSchema,
    'session.attachment': sessions_schema_ts_1.sessionAttachmentValueSchema,
    'session.updateQueue': sessions_schema_ts_1.sessionUpdateQueueValueSchema,
    'session.cancel': sessions_schema_ts_1.sessionCancelValueSchema,
    'subagent.list': subagents_schema_ts_1.subagentListValueSchema,
    'subagent.history': subagents_schema_ts_1.subagentHistoryValueSchema,
    'subagent.prompt': subagents_schema_ts_1.subagentPromptValueSchema,
    'subagent.interrupt': subagents_schema_ts_1.subagentInterruptValueSchema,
    'host.describe': host_schema_ts_1.hostDescribeValueSchema,
    'host.pickDirectory': host_schema_ts_1.hostPickDirectoryValueSchema,
    'host.listDirectory': host_schema_ts_1.hostListDirectoryValueSchema,
    'host.createDirectory': host_schema_ts_1.hostCreateDirectoryValueSchema,
    'host.openPath': host_schema_ts_1.hostOpenPathValueSchema,
    'workspace.list': workspace_schema_ts_1.workspaceListValueSchema,
    'workspace.create': workspace_schema_ts_1.workspaceCreateValueSchema,
    'workspace.rename': workspace_schema_ts_1.workspaceRenameValueSchema,
    'workspace.delete': workspace_schema_ts_1.workspaceDeleteValueSchema,
    'workspace.insertBefore': workspace_schema_ts_1.workspaceInsertBeforeValueSchema,
    'workspace.insertSessionBefore': workspace_schema_ts_1.workspaceInsertSessionBeforeValueSchema,
    'workspace.archiveSession': workspace_schema_ts_1.workspaceArchiveSessionValueSchema,
    'skill.list': skills_schema_ts_1.skillListValueSchema,
    'agentPreset.list': agent_presets_schema_ts_1.agentPresetListValueSchema,
    'agentPreset.select': agent_presets_schema_ts_1.agentPresetSelectValueSchema,
    'agentPreset.read': agent_presets_schema_ts_1.agentPresetReadValueSchema,
    'agentPreset.copy': agent_presets_schema_ts_1.agentPresetCopyValueSchema,
    'agentPreset.openDocument': agent_presets_schema_ts_1.agentPresetOpenDocumentValueSchema,
    'agentPreset.remove': agent_presets_schema_ts_1.agentPresetRemoveValueSchema,
    'goal.create': goals_schema_ts_1.goalCreateValueSchema,
    'goal.edit': goals_schema_ts_1.goalEditValueSchema,
    'goal.pause': goals_schema_ts_1.goalPauseValueSchema,
    'goal.resume': goals_schema_ts_1.goalResumeValueSchema,
    'goal.complete': goals_schema_ts_1.goalCompleteValueSchema,
    'goal.clear': goals_schema_ts_1.goalClearValueSchema,
    'settings.describe': settings_schema_ts_1.settingsDescribeValueSchema,
    'settings.openDocument': settings_schema_ts_1.settingsOpenDocumentValueSchema,
    'settings.update': settings_schema_ts_1.settingsUpdateValueSchema,
    'settings.replace': settings_schema_ts_1.settingsReplaceValueSchema,
    'settings.mutate': settings_schema_ts_1.settingsMutateValueSchema,
    'credentials.describe': credentials_schema_ts_1.credentialsDescribeValueSchema,
    'credentials.set': credentials_schema_ts_1.credentialsSetValueSchema,
    'credentials.unset': credentials_schema_ts_1.credentialsUnsetValueSchema,
    'llm.providers': llm_schema_ts_1.llmProvidersValueSchema,
    'llm.models': llm_schema_ts_1.llmModelsValueSchema,
    'llm.discoverModels': llm_schema_ts_1.llmDiscoverModelsValueSchema,
    'mcp.list': mcp_schema_ts_1.mcpListValueSchema,
    'mcp.call': mcp_schema_ts_1.mcpCallValueSchema,
    'authorization.list': authorization_schema_ts_1.authorizationListValueSchema,
    'authorization.begin': authorization_schema_ts_1.authorizationBeginValueSchema,
    'authorization.cancel': authorization_schema_ts_1.authorizationCancelValueSchema,
    'authorization.answer': authorization_schema_ts_1.authorizationAnswerValueSchema,
    'authorization.logout': authorization_schema_ts_1.authorizationLogoutValueSchema,
};
/** Default timeout for bounded unary calls (rpc-compare 2026-07-19: a hung host must not leave callers pending forever). */
var DEFAULT_TIMEOUT_MS = 30000;
/** URL base for in-process handler injection (fake authority, opencode precedent). */
var INTERNAL_BASE = 'http://dsh.internal';
/**
 * Abstract fetch-carrier client. Subclasses supply the transport (doFetch) and may refine the
 * per-message tap (onEnvelope) — platform aspects stay in subclasses, protocol invariants stay
 * here. Envelope observation is a first-class aspect of this data middle layer: the instance
 * owns a microtask-batched buffer (frame storms must not cost one consumer update per frame),
 * and observers subscribe via subscribeEnvelopes. The isomorphic point survives: an in-process
 * subclass whose doFetch is toFetchHandler(api).fetch never touches the network.
 */
var AbstractApiClient = /** @class */ (function () {
    /** @param timeoutMs - timeout for bounded unary calls; user-paced calls and streams do not use it. */
    function AbstractApiClient(timeoutMs) {
        if (timeoutMs === void 0) { timeoutMs = DEFAULT_TIMEOUT_MS; }
        var _this = this;
        this.timeoutMs = timeoutMs;
        /** Instance-owned observation buffer (module-level state would leak across instances/tests). */
        this.envelopeBatch = [];
        this.flushScheduled = false;
        this.envelopeListeners = new Set();
        // ---- IApiClient API (arrow properties so destructured/passed references stay bound) ----
        this.sessions = {
            list: function (payload, signal) { return _this.callUnary('session.list', payload, signal); },
            search: function (payload, signal) { return _this.callUnary('session.search', payload, signal); },
            create: function (payload, signal) { return _this.callUnary('session.create', payload, signal); },
            history: function (payload, signal) { return _this.callUnary('session.history', payload, signal); },
            models: function (payload, signal) { return _this.callUnary('session.models', payload, signal); },
            selectModel: function (payload, signal) { return _this.callUnary('session.selectModel', payload, signal); },
            rename: function (payload, signal) { return _this.callUnary('session.rename', payload, signal); },
            fork: function (payload, signal) { return _this.callUnary('session.fork', payload, signal); },
            // Command-only maintenance resolves after actual work (e.g. a large
            // history summary), not a quick chat admission. Caller/connection abort
            // still cancels it; the transport health deadline is inappropriate.
            prompt: function (payload, signal) { return _this.callUnary('session.prompt', payload, signal, payload.commandOnly === true ? 'caller-signal-only' : 'default'); },
            attachment: function (payload, signal) { return _this.callUnary('session.attachment', payload, signal); },
            updateQueue: function (payload, signal) { return _this.callUnary('session.updateQueue', payload, signal); },
            cancel: function (payload, signal) { return _this.callUnary('session.cancel', payload, signal); },
        };
        this.subagents = {
            list: function (payload, signal) { return _this.callUnary('subagent.list', payload, signal); },
            history: function (payload, signal) { return _this.callUnary('subagent.history', payload, signal); },
            prompt: function (payload, signal) { return _this.callUnary('subagent.prompt', payload, signal); },
            interrupt: function (payload, signal) { return _this.callUnary('subagent.interrupt', payload, signal); },
        };
        this.host = {
            describe: function (payload, signal) { return _this.callUnary('host.describe', payload, signal); },
            // A native system dialog is user-paced and may legitimately stay open
            // longer than the normal unary deadline. Caller/connection aborts remain.
            pickDirectory: function (payload, signal) { return _this.callUnary('host.pickDirectory', payload, signal, 'caller-signal-only'); },
            listDirectory: function (payload, signal) { return _this.callUnary('host.listDirectory', payload, signal); },
            createDirectory: function (payload, signal) { return _this.callUnary('host.createDirectory', payload, signal); },
            openPath: function (payload, signal) { return _this.callUnary('host.openPath', payload, signal); },
        };
        this.workspace = {
            list: function (payload, signal) { return _this.callUnary('workspace.list', payload, signal); },
            create: function (payload, signal) { return _this.callUnary('workspace.create', payload, signal); },
            rename: function (payload, signal) { return _this.callUnary('workspace.rename', payload, signal); },
            delete: function (payload, signal) { return _this.callUnary('workspace.delete', payload, signal); },
            insertBefore: function (payload, signal) { return _this.callUnary('workspace.insertBefore', payload, signal); },
            insertSessionBefore: function (payload, signal) { return _this.callUnary('workspace.insertSessionBefore', payload, signal); },
            archiveSession: function (payload, signal) { return _this.callUnary('workspace.archiveSession', payload, signal); },
        };
        this.skills = {
            list: function (payload, signal) { return _this.callUnary('skill.list', payload, signal); },
        };
        // Annotated like every sibling, and load-bearing rather than cosmetic:
        // inferring this member inlines `AgentPresetEntry` into the emitted
        // declaration by the specifier TS picks — the host `index.ts` — which drags
        // the whole gateway, and with it the host `Context` merges, into every
        // Client program that imports this carrier.
        this.agentPresets = {
            list: function (payload, signal) { return _this.callUnary('agentPreset.list', payload, signal); },
            select: function (payload, signal) { return _this.callUnary('agentPreset.select', payload, signal); },
            read: function (payload, signal) { return _this.callUnary('agentPreset.read', payload, signal); },
            copy: function (payload, signal) { return _this.callUnary('agentPreset.copy', payload, signal); },
            openDocument: function (payload, signal) { return _this.callUnary('agentPreset.openDocument', payload, signal); },
            remove: function (payload, signal) { return _this.callUnary('agentPreset.remove', payload, signal); },
        };
        this.goals = {
            create: function (payload, signal) { return _this.callUnary('goal.create', payload, signal); },
            edit: function (payload, signal) { return _this.callUnary('goal.edit', payload, signal); },
            pause: function (payload, signal) { return _this.callUnary('goal.pause', payload, signal); },
            resume: function (payload, signal) { return _this.callUnary('goal.resume', payload, signal); },
            complete: function (payload, signal) { return _this.callUnary('goal.complete', payload, signal); },
            clear: function (payload, signal) { return _this.callUnary('goal.clear', payload, signal); },
        };
        this.settings = {
            describe: function (payload, signal) { return _this.callUnary('settings.describe', payload, signal); },
            openDocument: function (payload, signal) { return _this.callUnary('settings.openDocument', payload, signal); },
            update: function (payload, signal) { return _this.callUnary('settings.update', payload, signal); },
            replace: function (payload, signal) { return _this.callUnary('settings.replace', payload, signal); },
            mutate: function (payload, signal) { return _this.callUnary('settings.mutate', payload, signal); },
        };
        this.credentials = {
            describe: function (payload, signal) { return _this.callUnary('credentials.describe', payload, signal); },
            set: function (payload, signal) { return _this.callUnary('credentials.set', payload, signal); },
            unset: function (payload, signal) { return _this.callUnary('credentials.unset', payload, signal); },
        };
        this.llm = {
            providers: function (payload, signal) { return _this.callUnary('llm.providers', payload, signal); },
            models: function (payload, signal) { return _this.callUnary('llm.models', payload, signal); },
            discoverModels: function (payload, signal) { return _this.callUnary('llm.discoverModels', payload, signal); },
        };
        this.mcp = {
            list: function (payload, signal) { return _this.callUnary('mcp.list', payload, signal); },
            call: function (payload, signal) { return _this.callUnary('mcp.call', payload, signal); },
        };
        this.authorization = {
            list: function (payload, signal) { return _this.callUnary('authorization.list', payload, signal); },
            begin: function (payload, signal) { return _this.callUnary('authorization.begin', payload, signal, 'caller-signal-only'); },
            cancel: function (payload, signal) { return _this.callUnary('authorization.cancel', payload, signal); },
            answer: function (payload, signal) { return _this.callUnary('authorization.answer', payload, signal); },
            logout: function (payload, signal) { return _this.callUnary('authorization.logout', payload, signal); },
        };
        this.events = {
            mux: function (payload, signal, onOpen) { return _this.openMux(payload, signal, onOpen); },
            host: function (payload, signal, onOpen) { return _this.openHost(payload, signal, onOpen); },
        };
    }
    /**
     * Subscribe to batched envelope observation (diagnostics/logging consumers).
     * Batches follow microtask boundaries; a listener throw is isolated (observation
     * must never break the carrier).
     * @param listener - receives each flushed batch in arrival order.
     * @returns unsubscribe function.
     */
    AbstractApiClient.prototype.subscribeEnvelopes = function (listener) {
        var _this = this;
        this.envelopeListeners.add(listener);
        return function () {
            _this.envelopeListeners.delete(listener);
        };
    };
    /** Per-message tap: feeds the instance buffer. Subclasses may override to observe unbatched (call super to keep batching). */
    AbstractApiClient.prototype.onEnvelope = function (message) {
        var _this = this;
        if (this.envelopeListeners.size === 0)
            return;
        this.envelopeBatch.push(message);
        if (this.flushScheduled)
            return;
        this.flushScheduled = true;
        queueMicrotask(function () {
            _this.flushScheduled = false;
            // Never empty here: a flush is only ever scheduled by the push above,
            // and this callback is the sole drain point.
            var batch = _this.envelopeBatch;
            _this.envelopeBatch = [];
            for (var _i = 0, _a = _this.envelopeListeners; _i < _a.length; _i++) {
                var notify = _a[_i];
                try {
                    notify(batch);
                }
                catch (error) {
                    console.error('[apiproxy] envelope listener threw:', error);
                }
            }
        });
    };
    /** Browser = same-origin (a fake authority would fail DNS on real requests); no-location env (Node) = fake authority. */
    AbstractApiClient.prototype.resolveBase = function () {
        var loc = globalThis.location;
        return (loc === null || loc === void 0 ? void 0 : loc.origin) !== undefined && loc.origin !== 'null' ? loc.origin : INTERNAL_BASE;
    };
    AbstractApiClient.prototype.mintRpcId = function () {
        // crypto.randomUUID is a Web API (browser + Node ≥19): keeps this base platform-neutral.
        return (0, rpc_ts_1.RpcId)(crypto.randomUUID());
    };
    /**
     * Shared POST leg of both C→S carriers (callUnary/respond): JSON body,
     * optional default timeout merged with the caller's external signal, non-2xx → transport throw.
     */
    AbstractApiClient.prototype.postJson = function (path_1, body_1, signal_1) {
        return __awaiter(this, arguments, void 0, function (path, body, signal, timeoutPolicy) {
            var requestSignal, response;
            if (timeoutPolicy === void 0) { timeoutPolicy = 'default'; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        requestSignal = timeoutPolicy === 'default'
                            ? signal === undefined
                                ? AbortSignal.timeout(this.timeoutMs)
                                : AbortSignal.any([AbortSignal.timeout(this.timeoutMs), signal])
                            : signal;
                        return [4 /*yield*/, this.doFetch(new URL(path, this.resolveBase()), __assign({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, requestSignal === undefined ? {} : { signal: requestSignal }))];
                    case 1:
                        response = _a.sent();
                        if (!response.ok)
                            throw new Error("transport failure for ".concat(path, ": HTTP ").concat(response.status));
                        return [2 /*return*/, response];
                }
            });
        });
    };
    /**
     * Unary protocol path: mint → tap → POST full form → envelope parse → verify
     * echo → value parse → tap → narrow. Virtual so a fake carrier (fixture) can
     * override transport at this layer.
     */
    AbstractApiClient.prototype.callUnary = function (method_1, payload_1, signal_1) {
        return __awaiter(this, arguments, void 0, function (method, payload, signal, timeoutPolicy) {
            var message, response, full, _a, _b, value;
            if (timeoutPolicy === void 0) { timeoutPolicy = 'default'; }
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        message = { type: 'client-request', rpcId: this.mintRpcId(), method: method, payload: payload };
                        this.onEnvelope(message);
                        return [4 /*yield*/, this.postJson("/api/".concat(method), message, signal, timeoutPolicy)];
                    case 1:
                        response = _c.sent();
                        _b = (_a = rpc_schema_ts_1.serverResponseSchema).parse;
                        return [4 /*yield*/, response.json()];
                    case 2:
                        full = _b.apply(_a, [_c.sent()]);
                        this.onEnvelope(full);
                        if (full.rpcId !== message.rpcId)
                            throw new Error("rpcId mismatch for ".concat(method, ": sent ").concat(message.rpcId, ", got ").concat(full.rpcId));
                        if (!full.result.ok)
                            return [2 /*return*/, { rpcId: full.rpcId, result: full.result }
                                // Second-level S→C parse: the ok value must match the method's Value schema (mirror of the
                                // handler's request-payload parse). The cast collapses the Wire<> widening, same as the handler side.
                            ];
                        value = UNARY_VALUE_SCHEMAS[method].parse(full.result.value);
                        return [2 /*return*/, { rpcId: full.rpcId, result: { ok: true, value: value } }];
                }
            });
        });
    };
    /** Mux stream opener; virtual for the same override reason as callUnary. */
    AbstractApiClient.prototype.openMux = function (_payload, signal, onOpen) {
        return this.readSse('/api/events.mux', signal, events_schema_ts_1.muxFrameSchema, onOpen);
    };
    /** Host stream opener; virtual. */
    AbstractApiClient.prototype.openHost = function (_payload, signal, onOpen) {
        return this.readSse('/api/events.host', signal, events_schema_ts_1.hostFrameSchema, onOpen);
    };
    /**
     * SSE protocol path: streaming fetch (not EventSource), '\n\n' framing, ServerRequest envelope +
     * frame-schema parse, tap, narrow yield. onOpen fires once the response headers are in and the
     * body is readable — the stream-established signal, before any frame arrives. A frame that fails
     * either parse level is reported and skipped (one corrupt frame must not kill the stream; the
     * client's gap detection covers whatever the frame carried).
     */
    AbstractApiClient.prototype.readSse = function (path, signal, frameSchema, onOpen) {
        return __asyncGenerator(this, arguments, function readSse_1() {
            var response, reader, decoder, buffer, _a, done, value, boundary, chunk, data, full, frame;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, __await(this.doFetch(new URL(path, this.resolveBase()), { signal: signal }))];
                    case 1:
                        response = _b.sent();
                        if (!response.ok || response.body === null)
                            throw new Error("transport failure for ".concat(path, ": HTTP ").concat(response.status));
                        onOpen === null || onOpen === void 0 ? void 0 : onOpen();
                        reader = response.body.getReader();
                        decoder = new TextDecoder();
                        buffer = '';
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, , 12, 14]);
                        _b.label = 3;
                    case 3:
                        if (!true) return [3 /*break*/, 11];
                        return [4 /*yield*/, __await(reader.read())];
                    case 4:
                        _a = _b.sent(), done = _a.done, value = _a.value;
                        if (!done) return [3 /*break*/, 6];
                        return [4 /*yield*/, __await(void 0)];
                    case 5: return [2 /*return*/, _b.sent()];
                    case 6:
                        buffer += decoder.decode(value, { stream: true });
                        boundary = void 0;
                        _b.label = 7;
                    case 7:
                        if (!((boundary = buffer.indexOf('\n\n')) !== -1)) return [3 /*break*/, 10];
                        chunk = buffer.slice(0, boundary);
                        buffer = buffer.slice(boundary + 2);
                        data = chunk.split('\n').filter(function (line) { return line.startsWith('data: '); }).map(function (line) { return line.slice(6); }).join('');
                        if (data === '')
                            return [3 /*break*/, 7];
                        full = void 0;
                        frame = void 0;
                        try {
                            full = rpc_schema_ts_1.serverRequestSchema.parse(JSON.parse(data));
                            frame = frameSchema.parse(full.payload);
                        }
                        catch (error) {
                            console.error("[apiproxy] dropping malformed SSE frame on ".concat(path, ":"), error);
                            return [3 /*break*/, 7];
                        }
                        this.onEnvelope(full);
                        return [4 /*yield*/, __await({ rpcId: full.rpcId, payload: frame })];
                    case 8: return [4 /*yield*/, _b.sent()];
                    case 9:
                        _b.sent();
                        return [3 /*break*/, 7];
                    case 10: return [3 /*break*/, 3];
                    case 11: return [3 /*break*/, 14];
                    case 12: return [4 /*yield*/, __await(reader.cancel().catch(function () { return undefined; }))];
                    case 13:
                        _b.sent();
                        return [7 /*endfinally*/];
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    AbstractApiClient.prototype.respond = function (message, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var response, _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        this.onEnvelope(message);
                        return [4 /*yield*/, this.postJson('/api/respond', message, signal)];
                    case 1:
                        response = _c.sent();
                        _b = (_a = rpc_schema_ts_1.rpcReceiptSchema).parse;
                        return [4 /*yield*/, response.json()];
                    case 2: return [2 /*return*/, _b.apply(_a, [_c.sent()])];
                }
            });
        });
    };
    return AbstractApiClient;
}());
exports.AbstractApiClient = AbstractApiClient;
/**
 * In-process client over an injected fetch-shaped handler (the isomorphic point:
 * `new InProcessApiClient(toFetchHandler(api))` never touches the network). Lives here because
 * in-process injection is this package's own capability (handler and client are both local).
 */
var InProcessApiClient = /** @class */ (function (_super) {
    __extends(InProcessApiClient, _super);
    function InProcessApiClient(handler, timeoutMs) {
        var _this = _super.call(this, timeoutMs) || this;
        _this.handler = handler;
        return _this;
    }
    /**
     * Faithful to real fetch: reject on signal abort even when the in-process
     * handler ignores the signal (a hung impl must not defeat timeout/cancel).
     */
    InProcessApiClient.prototype.doFetch = function (input, init) {
        var _this = this;
        var _a;
        var signal = (_a = init === null || init === void 0 ? void 0 : init.signal) !== null && _a !== void 0 ? _a : undefined;
        if (signal === undefined)
            return this.handler.fetch(input, init);
        if (signal.aborted)
            return Promise.reject(abortError(signal));
        return new Promise(function (resolve, reject) {
            var onAbort = function () { reject(abortError(signal)); };
            signal.addEventListener('abort', onAbort, { once: true });
            _this.handler.fetch(input, init)
                .then(resolve, reject)
                .finally(function () { signal.removeEventListener('abort', onAbort); });
        });
    };
    return InProcessApiClient;
}(AbstractApiClient));
exports.InProcessApiClient = InProcessApiClient;
/** Mirror fetch's abort rejection: the signal's reason when present, else a DOMException-style AbortError. */
function abortError(signal) {
    var reason = signal.reason;
    if (reason instanceof Error)
        return reason;
    if (typeof reason === 'string')
        return new Error(reason);
    return new Error('This operation was aborted');
}
