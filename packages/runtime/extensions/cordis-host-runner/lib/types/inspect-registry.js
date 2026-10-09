"use strict";
/** Host registry for model-visible, read-only Cordis capability queries. */
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CordisInspectRegistryService = void 0;
var cordis_1 = require("@z/cordis");
var dsh_session_1 = require("@z/dsh-session");
var dsh_tools_1 = require("@z/dsh-tools");
/** Registry and cross-page router behind the two model-facing inspect tools. */
var CordisInspectRegistryService = /** @class */ (function (_super) {
    __extends(CordisInspectRegistryService, _super);
    /** Register the process-global Host registry. */
    function CordisInspectRegistryService(ctx) {
        var _this = _super.call(this, ctx, 'cordisInspect') || this;
        _this.providers = new Map();
        _this.pending = new Map();
        _this.nextRequest = 1;
        return _this;
    }
    /**
     * Register one Host provider.
     * @param registration - manifest and local query handler.
     * @returns idempotent disposer.
     */
    CordisInspectRegistryService.prototype.register = function (registration) {
        var _this = this;
        var manifest = validateManifest(registration.manifest);
        if (this.providers.has(manifest.id))
            throw new Error("Host Cordis inspect provider \"".concat(manifest.id, "\" is already registered"));
        var stored = __assign(__assign({}, registration), { manifest: manifest });
        this.providers.set(manifest.id, stored);
        return function () {
            if (_this.providers.get(manifest.id) === stored)
                _this.providers.delete(manifest.id);
        };
    };
    /**
     * Replace the mirrored Client provider directory.
     * @param providers - complete Client manifest snapshot.
     */
    CordisInspectRegistryService.prototype.syncClientManifest = function (providers) {
        var ids = new Set();
        var validated = providers.map(function (provider) {
            var manifest = validateManifest(provider);
            if (ids.has(manifest.id))
                throw new Error("Client Cordis inspect manifest repeats provider \"".concat(manifest.id, "\""));
            ids.add(manifest.id);
            return manifest;
        });
        this.clientManifest = Object.freeze(validated);
    };
    /**
     * Return the complete known Host and Client provider directory.
     * @returns Host providers followed by the Client providers.
     */
    CordisInspectRegistryService.prototype.list = function () {
        var _a;
        return __spreadArray(__spreadArray([], __spreadArray([], this.providers.values(), true).map(function (provider) { return view('host', provider.manifest); }), true), ((_a = this.clientManifest) !== null && _a !== void 0 ? _a : []).map(function (provider) { return view('client', provider); }), true);
    };
    /**
     * Execute one provider query on its owning platform.
     * @param platform - Host or Client runtime.
     * @param providerId - provider selected from {@link list}.
     * @param methodName - declared method name.
     * @param input - optional lossless JSON input.
     * @param agent - requesting Agent and scope.
     * @param signal - tool-call cancellation.
     * @returns provider JSON data.
     */
    CordisInspectRegistryService.prototype.query = function (platform, providerId, methodName, input, agent, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var registration, method, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(platform === 'host')) return [3 /*break*/, 2];
                        registration = this.providers.get(providerId);
                        if (registration === undefined)
                            throw new Error("Host Cordis inspect provider \"".concat(providerId, "\" is not registered"));
                        method = findMethod(registration.manifest, methodName);
                        validateInput('Host', providerId, method, input);
                        signal.throwIfAborted();
                        return [4 /*yield*/, registration.query(methodName, input, { agent: agent, signal: signal })];
                    case 1:
                        data = _a.sent();
                        signal.throwIfAborted();
                        return [2 /*return*/, validateOutput('Host', providerId, method, data)];
                    case 2: return [4 /*yield*/, this.queryClient(providerId, methodName, input, agent, signal)];
                    case 3: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Accept the first valid Client response for a pending query.
     * @param agent - Agent whose Session owns the query.
     * @param requestId - Pending Client query identity.
     * @param resolution - Client provider result or failure.
     * @returns whether this response settled the still-pending query.
     */
    CordisInspectRegistryService.prototype.resolveClientQuery = function (agent, requestId, resolution) {
        var pending = this.pending.get(requestId);
        if (pending === undefined || pending.request.agentId !== agent.id)
            return { accepted: false };
        if (!resolution.ok)
            return { accepted: false };
        try {
            resolution = {
                ok: true,
                data: validateOutput('Client', pending.request.provider, pending.method, resolution.data),
            };
        }
        catch (_a) {
            return { accepted: false };
        }
        this.pending.delete(requestId);
        pending.settle(resolution);
        this.ctx.emit('cordis/inspect-query-resolved', { requestId: requestId });
        return { accepted: true };
    };
    CordisInspectRegistryService.prototype.queryClient = function (providerId, methodName, input, agent, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var provider, method, requestId, request, result, onAbort, resolution;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        provider = (_a = this.clientManifest) === null || _a === void 0 ? void 0 : _a.find(function (candidate) { return candidate.id === providerId; });
                        if (provider === undefined)
                            throw new Error("Client Cordis inspect provider \"".concat(providerId, "\" is not registered"));
                        method = findMethod(provider, methodName);
                        validateInput('Client', providerId, method, input);
                        signal.throwIfAborted();
                        requestId = "inspect-".concat(this.nextRequest++);
                        request = __assign({ requestId: requestId, agentId: agent.id, provider: providerId, method: methodName }, input === undefined ? {} : { input: input });
                        result = new Promise(function (resolve) {
                            _this.pending.set(requestId, { request: request, method: method, settle: resolve });
                        });
                        onAbort = function () {
                            var pending = _this.pending.get(requestId);
                            if (pending === undefined)
                                return;
                            _this.pending.delete(requestId);
                            pending.settle({ ok: false, reason: 'cancelled', message: "Client inspect query ".concat(providerId, ".").concat(methodName, " was cancelled") });
                            _this.ctx.emit('cordis/inspect-query-resolved', { requestId: requestId });
                        };
                        signal.addEventListener('abort', onAbort, { once: true });
                        if (signal.aborted)
                            onAbort();
                        else
                            this.ctx.emit('cordis/inspect-query', request);
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, , 3, 4]);
                        return [4 /*yield*/, result];
                    case 2:
                        resolution = _b.sent();
                        if (!resolution.ok)
                            throw new Error("".concat(providerId, ".").concat(methodName, ": ").concat(resolution.message));
                        return [2 /*return*/, resolution.data];
                    case 3:
                        signal.removeEventListener('abort', onAbort);
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return CordisInspectRegistryService;
}(cordis_1.Service));
exports.CordisInspectRegistryService = CordisInspectRegistryService;
function view(platform, manifest) {
    return __assign(__assign({ platform: platform }, manifest), { methods: __spreadArray([], manifest.methods, true) });
}
function validateManifest(manifest) {
    if (manifest.id.trim() === '')
        throw new Error('Cordis inspect provider id must not be empty');
    if (manifest.description.trim() === '')
        throw new Error("Cordis inspect provider \"".concat(manifest.id, "\" needs a description"));
    var names = new Set();
    var methods = manifest.methods.map(function (method) {
        if (method.name.trim() === '')
            throw new Error("Cordis inspect provider \"".concat(manifest.id, "\" has an empty method name"));
        if (names.has(method.name))
            throw new Error("Cordis inspect provider \"".concat(manifest.id, "\" repeats method \"").concat(method.name, "\""));
        if (method.description.trim() === '')
            throw new Error("Cordis inspect method ".concat(manifest.id, ".").concat(method.name, " needs a description"));
        (0, dsh_tools_1.assertSupportedJsonSchema)(method.inputSchema);
        (0, dsh_tools_1.assertSupportedJsonSchema)(method.outputSchema);
        names.add(method.name);
        return Object.freeze(__assign({}, method));
    });
    return Object.freeze(__assign(__assign({}, manifest), { methods: Object.freeze(methods) }));
}
function findMethod(manifest, name) {
    var method = manifest.methods.find(function (candidate) { return candidate.name === name; });
    if (method === undefined)
        throw new Error("Cordis inspect provider \"".concat(manifest.id, "\" has no method \"").concat(name, "\""));
    return method;
}
function validateInput(platform, provider, method, input) {
    var violations = (0, dsh_tools_1.validateJsonSchemaValue)(method.inputSchema, input !== null && input !== void 0 ? input : {}, 'input');
    if (violations.length > 0)
        throw new Error("".concat(platform, " Cordis inspect ").concat(provider, ".").concat(method.name, " rejected input: ").concat(violations.join('; ')));
}
function validateOutput(platform, provider, method, data) {
    var snapshot = (0, dsh_session_1.snapshotJsonValue)(data);
    if (snapshot === undefined)
        throw new Error("".concat(platform, " Cordis inspect ").concat(provider, ".").concat(method.name, " returned a non-JSON value"));
    var violations = (0, dsh_tools_1.validateJsonSchemaValue)(method.outputSchema, snapshot, 'output');
    if (violations.length > 0)
        throw new Error("".concat(platform, " Cordis inspect ").concat(provider, ".").concat(method.name, " returned invalid output: ").concat(violations.join('; ')));
    return snapshot;
}
