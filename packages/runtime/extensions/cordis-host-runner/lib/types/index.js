"use strict";
/**
 * Dynamic Cordis Plugin service: immutable package definitions, one active run
 * per Plugin, human-approved Client activation, and Host/Client invocation.
 * @module @z/dsh-cordis-host-runner
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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
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
exports.DynamicCordisRunnerService = exports.HOST_BUILTIN_INSPECTION = exports.CordisInspectRegistryService = void 0;
exports.CordisDynamicPluginId = CordisDynamicPluginId;
exports.CordisDynamicPackageId = CordisDynamicPackageId;
exports.CordisDynamicPluginRunId = CordisDynamicPluginRunId;
exports.ApprovalRequestId = ApprovalRequestId;
var schemastery_1 = require("@z/schemastery");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_typert_protocol_1 = require("@z/dsh-typert-protocol");
var guard_ts_1 = require("./guard.ts");
var inspect_registry_ts_1 = require("./inspect-registry.ts");
var lifecycle_ts_1 = require("./lifecycle.ts");
var registry_ts_1 = require("./registry.ts");
var sandbox_ts_1 = require("./sandbox.ts");
var inspect_registry_ts_2 = require("./inspect-registry.ts");
Object.defineProperty(exports, "CordisInspectRegistryService", { enumerable: true, get: function () { return inspect_registry_ts_2.CordisInspectRegistryService; } });
var sandbox_ts_2 = require("./sandbox.ts");
Object.defineProperty(exports, "HOST_BUILTIN_INSPECTION", { enumerable: true, get: function () { return sandbox_ts_2.HOST_BUILTIN_INSPECTION; } });
/**
 * Brand a Host-minted Plugin ID.
 * @param id - opaque identifier minted by the Host registry.
 * @returns the branded Plugin identifier.
 */
function CordisDynamicPluginId(id) {
    return id;
}
/**
 * Brand a Host-minted Package ID.
 * @param id - opaque identifier minted by the Host registry.
 * @returns the branded Package identifier.
 */
function CordisDynamicPackageId(id) {
    return id;
}
/**
 * Brand a Host-minted Plugin Run ID.
 * @param id - opaque identifier minted by the Host registry.
 * @returns the branded Plugin Run identifier.
 */
function CordisDynamicPluginRunId(id) {
    return id;
}
/**
 * Brand a Host-minted approval request ID.
 * @param id - opaque identifier minted by the Host registry.
 * @returns the branded approval request identifier.
 */
function ApprovalRequestId(id) {
    return id;
}
/** Dynamic Plugin registry and Host-half lifecycle. */
var DynamicCordisRunnerService = function () {
    var _a;
    var _classSuper = dsh_typert_protocol_1.TypertRemoteService;
    var _instanceExtraInitializers = [];
    var _undefineFromPanel_decorators;
    var _runHostHalf_decorators;
    var _getClientCode_decorators;
    var _resolveRequestRun_decorators;
    var _settleUserRun_decorators;
    var _stopFromPanel_decorators;
    var _syncInspectManifest_decorators;
    var _resolveInspectQuery_decorators;
    var _inventory_decorators;
    var _reportRenderFailure_decorators;
    var _reportClientGuardFailure_decorators;
    var _invoke_decorators;
    return _a = /** @class */ (function (_super) {
            __extends(DynamicCordisRunnerService, _super);
            /** Create the service under the Host composition. */
            function DynamicCordisRunnerService(ctx, config) {
                var _this = _super.call(this, ctx, 'dynamicCordisRunner') || this;
                _this.rootCtx = __runInitializers(_this, _instanceExtraInitializers);
                _this.registry = new registry_ts_1.DynamicCordisRegistry();
                _this.starting = new Map();
                _this.rootCtx = ctx;
                _this.resolved = config;
                _this.inspectRegistry = new inspect_registry_ts_1.CordisInspectRegistryService(ctx);
                return _this;
            }
            /**
             * Define a new Plugin's first Package or append a Package to an existing Plugin.
             * @param request - Session ownership, Plugin selection, metadata, and source code.
             * @returns Host-minted Plugin and Package identities with declared-half metadata.
             */
            DynamicCordisRunnerService.prototype.define = function (request) {
                var name = request.name.trim();
                var purpose = request.purpose.trim();
                if (name.length === 0)
                    throw new Error('cordis_define needs a non-empty `name`');
                if (purpose.length === 0)
                    throw new Error('cordis_define needs a non-empty `purpose`');
                if (request.code.host === undefined && request.code.client === undefined) {
                    throw new Error('cordis_define needs `code.host`, `code.client`, or both');
                }
                if (request.code.host !== undefined)
                    (0, sandbox_ts_1.precheckCode)(request.code.host, 'code.host');
                if (request.code.client !== undefined)
                    (0, sandbox_ts_1.precheckCode)(request.code.client, 'code.client');
                var plugin;
                if (request.plugin.kind === 'new') {
                    var prefix = request.plugin.idPrefix.trim();
                    if (!/^[a-z]{3,6}$/.test(prefix)) {
                        throw new Error('cordis_define `plugin.idPrefix` must contain 3–6 lowercase English letters');
                    }
                    var pluginId = (0, types_ts_1.CordisDynamicPluginId)(this.registry.mintPluginId(prefix));
                    plugin = {
                        pluginId: pluginId,
                        sessionId: request.sessionId,
                        packages: new Map(),
                        approvedClientPackages: new Set(),
                        clientVersionUpdatesApproved: false,
                    };
                    this.registry.add(plugin);
                }
                else {
                    var found = this.registry.get(request.plugin.pluginId);
                    if (found === undefined || found.sessionId !== request.sessionId) {
                        throw new Error(missingPluginMessage(request.plugin.pluginId));
                    }
                    plugin = found;
                }
                var packageId = (0, types_ts_1.CordisDynamicPackageId)(this.registry.mintPackageId());
                var definition = __assign(__assign({ packageId: packageId, name: name, purpose: purpose }, request.code.host === undefined ? {} : { hostCode: request.code.host }), request.code.client === undefined ? {} : { clientCode: request.code.client });
                plugin.packages.set(packageId, definition);
                return {
                    pluginId: plugin.pluginId,
                    packageId: packageId,
                    name: name,
                    purpose: purpose,
                    hasHostHalf: definition.hostCode !== undefined,
                    hasClientHalf: definition.clientCode !== undefined,
                };
            };
            /**
             * Remove a Plugin, its active run, and all immutable Packages.
             * @param agent - Agent whose Session must own the Plugin.
             * @param pluginId - Stable Plugin identity to remove.
             * @returns Whether removal succeeded and whether it stopped an active run.
             */
            DynamicCordisRunnerService.prototype.undefine = function (agent, pluginId) {
                return __awaiter(this, void 0, void 0, function () {
                    var plugin, wasRunning;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                plugin = this.owned(agent, pluginId);
                                if (plugin === undefined)
                                    return [2 /*return*/, { ok: false, reason: 'plugin-missing', message: missingPluginMessage(pluginId) }];
                                wasRunning = plugin.run !== undefined;
                                this.cancelPending(pluginId, "dynamic plugin \"".concat(pluginId, "\" was removed before approval"));
                                if (!(plugin.run !== undefined)) return [3 /*break*/, 2];
                                return [4 /*yield*/, this.retract(plugin)];
                            case 1:
                                _b.sent();
                                _b.label = 2;
                            case 2:
                                this.registry.delete(pluginId);
                                return [2 /*return*/, { ok: true, wasRunning: wasRunning }];
                        }
                    });
                });
            };
            /**
             * Remove a Plugin from the user panel and queue the resulting state change for the model's next step.
             * @param agent - Agent whose Session owns the Plugin and receives the context.
             * @param pluginId - Stable Plugin identity to remove.
             * @returns Whether removal succeeded and whether it stopped an active run.
             */
            DynamicCordisRunnerService.prototype.undefineFromPanel = function (agent, pluginId) {
                return __awaiter(this, void 0, void 0, function () {
                    var result;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0: return [4 /*yield*/, this.undefine(agent, pluginId)];
                            case 1:
                                result = _b.sent();
                                if (result.ok) {
                                    this.injectUserContext(agent, "The user removed Cordis Plugin ".concat(pluginId, " and all of its Packages. The Plugin no longer exists."));
                                }
                                return [2 /*return*/, result];
                        }
                    });
                });
            };
            /**
             * Start or update one Package for a model tool call. An unauthorized Client
             * Package waits for approval; Plugin-wide authorization covers later versions.
             * @param agent - Agent whose Session must own the Plugin.
             * @param pluginId - Stable Plugin identity to activate.
             * @param packageId - Immutable Package version to activate.
             * @param mode - Whether to run the current version or switch versions.
             * @param signal - Tool-call cancellation signal while the activation request is being created.
             * @returns The successful activation identity or an actionable refusal.
             */
            DynamicCordisRunnerService.prototype.run = function (agent, pluginId, packageId, mode, signal) {
                return __awaiter(this, void 0, void 0, function () {
                    var plan, attempt, started, requestId, requiresApproval;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                plan = this.resolvePlan(agent, pluginId, packageId, mode);
                                if (!plan.ok)
                                    return [2 /*return*/, plan.response];
                                if ((signal === null || signal === void 0 ? void 0 : signal.aborted) === true) {
                                    return [2 /*return*/, {
                                            ok: false,
                                            reason: 'cancelled',
                                            message: "the run request for dynamic plugin \"".concat(pluginId, "\" was cancelled before activation"),
                                        }];
                                }
                                if (this.registry.pendingRequestFor(pluginId) !== undefined) {
                                    return [2 /*return*/, { ok: false, reason: 'transition-in-flight', message: "dynamic plugin \"".concat(pluginId, "\" already has a pending run request") }];
                                }
                                attempt = this.createAttempt(plan);
                                plan.plugin.nextPackageId = packageId;
                                plan.plugin.latestRun = attempt;
                                if (!(plan.definition.clientCode === undefined)) return [3 /*break*/, 2];
                                return [4 /*yield*/, this.activate(plan, undefined, false, attempt)];
                            case 1:
                                started = _b.sent();
                                if (started.ok)
                                    return [2 /*return*/, this.runResponse(plan.plugin, started)];
                                this.failAttempt(plan.plugin, attempt, 'host-load', started);
                                return [2 /*return*/, __assign(__assign({}, started), { reason: 'host-half-failed' })];
                            case 2:
                                requestId = (0, types_ts_1.ApprovalRequestId)(this.registry.mintApprovalRequestId());
                                requiresApproval = !plan.plugin.clientVersionUpdatesApproved
                                    && !plan.plugin.approvedClientPackages.has(packageId);
                                attempt.approvalRequestId = requestId;
                                attempt.requiresApproval = requiresApproval;
                                attempt.status = requiresApproval ? 'awaiting-approval' : 'starting-host';
                                this.registry.armRequest(requestId, {
                                    agentId: agent.id,
                                    pluginId: pluginId,
                                    packageId: packageId,
                                    pluginRunId: attempt.pluginRunId,
                                    mode: mode,
                                    requiresApproval: requiresApproval,
                                });
                                this.ctx.emit('cordis/request-run', {
                                    requestId: requestId,
                                    agentId: agent.id,
                                    pluginId: pluginId,
                                    packageId: packageId,
                                    mode: mode,
                                    name: plan.definition.name,
                                    purpose: plan.definition.purpose,
                                    requiresApproval: requiresApproval,
                                });
                                return [2 /*return*/, __assign(__assign({ ok: true, status: requiresApproval ? 'awaiting-approval' : 'starting', pluginId: pluginId, packageId: packageId, pluginRunId: attempt.pluginRunId, mode: mode, waitingFor: [] }, plan.plugin.currentPackageId === undefined ? {} : { currentPackageId: plan.plugin.currentPackageId }), { nextPackageId: packageId })];
                        }
                    });
                });
            };
            /**
             * Start Host code for an approved request or a direct panel gesture.
             * @param agent - Agent whose Session must own the Plugin.
             * @param pluginId - Stable Plugin identity to activate.
             * @param packageId - Immutable Package version to activate.
             * @param mode - Whether to run the current version or switch versions.
             * @param requestId - Model-driven request identity, or null for a direct user gesture.
             * @param approveFutureVersions - Whether this approval covers later Packages of the same Plugin.
             * @returns The exact Host activation or a failure message.
             */
            DynamicCordisRunnerService.prototype.runHostHalf = function (agent, pluginId, packageId, mode, requestId, approveFutureVersions) {
                return __awaiter(this, void 0, void 0, function () {
                    var plan, attempt, pending, latest, expectedStatus, pending, attached, attaching, started;
                    var _b, _c, _d;
                    return __generator(this, function (_e) {
                        switch (_e.label) {
                            case 0:
                                plan = this.resolvePlan(agent, pluginId, packageId, mode, requestId === null);
                                if (!plan.ok)
                                    return [2 /*return*/, { ok: false, message: plan.response.message }];
                                if (requestId !== null) {
                                    pending = this.registry.peekRequest(requestId);
                                    if (pending === undefined || pending.pluginId !== pluginId || pending.packageId !== packageId || pending.mode !== mode) {
                                        return [2 /*return*/, { ok: false, message: "run request \"".concat(requestId, "\" does not authorize ").concat(pluginId, "/").concat(packageId) }];
                                    }
                                    latest = plan.plugin.latestRun;
                                    expectedStatus = pending.requiresApproval ? 'awaiting-approval' : 'starting-host';
                                    if (latest === undefined || latest.pluginRunId !== pending.pluginRunId
                                        || (latest.status !== expectedStatus && (!pending.requiresApproval && latest.status !== 'client-pending'))) {
                                        return [2 /*return*/, { ok: false, message: "run request \"".concat(requestId, "\" no longer identifies the latest run of ").concat(pluginId) }];
                                    }
                                    attempt = latest;
                                    if (pending.requiresApproval) {
                                        plan.plugin.approvedClientPackages.add(packageId);
                                        if (approveFutureVersions)
                                            plan.plugin.clientVersionUpdatesApproved = true;
                                    }
                                }
                                else {
                                    pending = this.registry.pendingRequestFor(pluginId);
                                    if (pending !== undefined)
                                        return [2 /*return*/, { ok: false, message: "dynamic plugin \"".concat(pluginId, "\" has pending run request ").concat(pending) }];
                                    attached = ((_b = plan.plugin.run) === null || _b === void 0 ? void 0 : _b.packageId) === packageId
                                        && ((_c = plan.plugin.latestRun) === null || _c === void 0 ? void 0 : _c.pluginRunId) === plan.plugin.run.pluginRunId
                                        ? plan.plugin.latestRun
                                        : undefined;
                                    attempt = attached !== null && attached !== void 0 ? attached : this.createAttempt(plan);
                                    if (attached === undefined) {
                                        plan.plugin.nextPackageId = packageId;
                                        plan.plugin.latestRun = attempt;
                                    }
                                    if (plan.definition.clientCode !== undefined)
                                        plan.plugin.approvedClientPackages.add(packageId);
                                }
                                attaching = attempt.pluginRunId === ((_d = plan.plugin.run) === null || _d === void 0 ? void 0 : _d.pluginRunId);
                                if (!attaching) {
                                    attempt.status = 'starting-host';
                                    if (attempt.host.status !== 'absent')
                                        attempt.host = { status: 'pending', waitingFor: [] };
                                }
                                return [4 /*yield*/, this.activate(plan, requestId !== null && requestId !== void 0 ? requestId : undefined, attaching, attempt)];
                            case 1:
                                started = _e.sent();
                                if (!started.ok)
                                    this.failAttempt(plan.plugin, attempt, 'host-load', started);
                                return [2 /*return*/, started];
                        }
                    });
                });
            };
            /**
             * Fetch Client code for the exact active run.
             * @param agent - Agent whose Session must own the Plugin.
             * @param pluginId - Stable Plugin identity to read.
             * @param pluginRunId - Exact active run authorized to receive source.
             * @returns Client source and its Plugin, Package, and run identities.
             */
            DynamicCordisRunnerService.prototype.getClientCode = function (agent, pluginId, pluginRunId) {
                var plugin = this.owned(agent, pluginId);
                if (plugin === undefined)
                    throw new Error(missingPluginMessage(pluginId));
                var run = plugin.run;
                if (run === undefined || run.pluginRunId !== pluginRunId) {
                    throw new Error("dynamic plugin \"".concat(pluginId, "\" is not running activation \"").concat(pluginRunId, "\""));
                }
                var definition = plugin.packages.get(run.packageId);
                if ((definition === null || definition === void 0 ? void 0 : definition.clientCode) === undefined)
                    throw new Error("package \"".concat(run.packageId, "\" has no Client half"));
                return {
                    code: definition.clientCode,
                    name: definition.name,
                    pluginId: pluginId,
                    packageId: run.packageId,
                    pluginRunId: pluginRunId,
                };
            };
            /**
             * Resolve one model-driven Client activation request.
             * @param requestId - Request identity to settle once.
             * @param resolution - Browser refusal or exact Client activation result.
             * @returns Whether the still-pending request accepted this resolution.
             */
            DynamicCordisRunnerService.prototype.resolveRequestRun = function (requestId, resolution) {
                return __awaiter(this, void 0, void 0, function () {
                    var pending, plugin, settled;
                    var _b, _c;
                    return __generator(this, function (_d) {
                        switch (_d.label) {
                            case 0:
                                pending = this.registry.peekRequest(requestId);
                                if (pending === undefined)
                                    return [2 /*return*/, { accepted: false }];
                                plugin = this.registry.get(pending.pluginId);
                                if (resolution.ok && ((_b = plugin === null || plugin === void 0 ? void 0 : plugin.run) === null || _b === void 0 ? void 0 : _b.pluginRunId) !== resolution.pluginRunId)
                                    return [2 /*return*/, { accepted: false }];
                                if (!resolution.ok && resolution.pluginRunId !== undefined
                                    && ((_c = plugin === null || plugin === void 0 ? void 0 : plugin.run) === null || _c === void 0 ? void 0 : _c.pluginRunId) !== resolution.pluginRunId)
                                    return [2 /*return*/, { accepted: false }];
                                this.registry.claimRequest(requestId);
                                return [4 /*yield*/, this.settleActivation(plugin, resolution, requestId)];
                            case 1:
                                settled = _d.sent();
                                this.announceResolved(requestId, resolution, pending.requiresApproval ? undefined : 'completed');
                                this.steerRunOutcome(pending, settled);
                                return [2 /*return*/, { accepted: true }];
                        }
                    });
                });
            };
            /**
             * Settle a direct panel run after this page loaded or failed its Client half.
             * @param agent - Agent whose Session must own the Plugin.
             * @param pluginId - Stable Plugin identity being settled.
             * @param resolution - Exact Client activation result from the acting page.
             * @returns The committed activation or its failure.
             */
            DynamicCordisRunnerService.prototype.settleUserRun = function (agent, pluginId, resolution) {
                return __awaiter(this, void 0, void 0, function () {
                    var plugin, settled;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                plugin = this.owned(agent, pluginId);
                                if (plugin === undefined)
                                    return [2 /*return*/, { ok: false, reason: 'plugin-missing', message: missingPluginMessage(pluginId) }];
                                return [4 /*yield*/, this.settleActivation(plugin, resolution)];
                            case 1:
                                settled = _b.sent();
                                this.injectUserRunOutcome(agent, pluginId, settled);
                                return [2 /*return*/, settled];
                        }
                    });
                });
            };
            /**
             * Stop the active run while retaining every Package version.
             * @param agent - Agent whose Session must own the Plugin.
             * @param pluginId - Stable Plugin identity to stop.
             * @returns Success or the reason no run was stopped.
             */
            DynamicCordisRunnerService.prototype.stop = function (agent, pluginId) {
                return __awaiter(this, void 0, void 0, function () {
                    var plugin, pending;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                plugin = this.owned(agent, pluginId);
                                if (plugin === undefined)
                                    return [2 /*return*/, { ok: false, reason: 'plugin-missing', message: missingPluginMessage(pluginId) }];
                                pending = this.registry.pendingRequestFor(pluginId);
                                if (plugin.run === undefined && pending === undefined) {
                                    return [2 /*return*/, { ok: false, reason: 'not-running', message: "dynamic plugin \"".concat(pluginId, "\" is not running") }];
                                }
                                if (pending !== undefined)
                                    this.cancelPending(pluginId, "dynamic plugin \"".concat(pluginId, "\" was stopped before approval"));
                                if (!(plugin.run !== undefined)) return [3 /*break*/, 2];
                                return [4 /*yield*/, this.retract(plugin)];
                            case 1:
                                _b.sent();
                                _b.label = 2;
                            case 2:
                                if (plugin.latestRun !== undefined) {
                                    plugin.latestRun.status = 'stopped';
                                    if (plugin.latestRun.host.status !== 'absent')
                                        plugin.latestRun.host = { status: 'stopped', waitingFor: [] };
                                    if (plugin.latestRun.client.status !== 'absent')
                                        plugin.latestRun.client = { status: 'stopped', waitingFor: [] };
                                }
                                return [2 /*return*/, { ok: true }];
                        }
                    });
                });
            };
            /**
             * Stop a Plugin from the user panel and queue the resulting state change for the model's next step.
             * @param agent - Agent whose Session owns the Plugin and receives the context.
             * @param pluginId - Stable Plugin identity to stop.
             * @returns Success or the reason no run was stopped.
             */
            DynamicCordisRunnerService.prototype.stopFromPanel = function (agent, pluginId) {
                return __awaiter(this, void 0, void 0, function () {
                    var result, plugin;
                    var _b;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0: return [4 /*yield*/, this.stop(agent, pluginId)];
                            case 1:
                                result = _c.sent();
                                if (!result.ok)
                                    return [2 /*return*/, result];
                                plugin = this.owned(agent, pluginId);
                                this.injectUserContext(agent, "The user stopped Cordis Plugin ".concat(pluginId, ". Its Packages remain defined; currentPackageId is ")
                                    + "".concat((_b = plugin === null || plugin === void 0 ? void 0 : plugin.currentPackageId) !== null && _b !== void 0 ? _b : 'none', "."));
                                return [2 /*return*/, result];
                        }
                    });
                });
            };
            /**
             * Replace the Host mirror of the Client inspect provider directory.
             * @param providers - complete Client provider manifest.
             * @returns null after accepting the manifest.
             */
            DynamicCordisRunnerService.prototype.syncInspectManifest = function (providers) {
                this.inspectRegistry.syncClientManifest(providers);
                return null;
            };
            /**
             * Claim one pending Client inspect query with its live result.
             * @param agent - Session that owns the query.
             * @param requestId - exact pending query identity.
             * @param resolution - provider result or structured refusal.
             * @returns whether this answer won the query.
             */
            DynamicCordisRunnerService.prototype.resolveInspectQuery = function (agent, requestId, resolution) {
                return this.inspectRegistry.resolveClientQuery(agent, requestId, resolution);
            };
            /**
             * Frame-wide inventory, grouped as one row per stable Plugin.
             * @returns Source-free metadata for every process-local Plugin.
             */
            /* jscpd:ignore-start */
            DynamicCordisRunnerService.prototype.inventory = function () {
                return this.registry.all().map(function (plugin) { return (__assign(__assign(__assign(__assign({ pluginId: plugin.pluginId, agentId: plugin.sessionId, packages: __spreadArray([], plugin.packages.values(), true).map(function (definition) { return ({
                        packageId: definition.packageId,
                        name: definition.name,
                        purpose: definition.purpose,
                        hasHostHalf: definition.hostCode !== undefined,
                        hasClientHalf: definition.clientCode !== undefined,
                    }); }) }, plugin.currentPackageId === undefined ? {} : { currentPackageId: plugin.currentPackageId }), plugin.nextPackageId === undefined ? {} : { nextPackageId: plugin.nextPackageId }), plugin.run === undefined ? {} : {
                    activeRun: { pluginRunId: plugin.run.pluginRunId, packageId: plugin.run.packageId },
                }), plugin.latestRun === undefined ? {} : { latestRun: cloneAttempt(plugin.latestRun) })); });
            };
            /* jscpd:ignore-end */
            /**
             * Read one Session's Host-rich state for inspection and result rendering.
             * @param agent - Agent whose Session selects visible Plugins.
             * @returns Plugin versions, active runs, Host fibers, and render failures.
             */
            DynamicCordisRunnerService.prototype.snapshot = function (agent) {
                return this.registry.ofSession(agent.id).map(function (plugin) { return (__assign(__assign(__assign(__assign(__assign({ pluginId: plugin.pluginId }, plugin.currentPackageId === undefined ? {} : { currentPackageId: plugin.currentPackageId }), plugin.nextPackageId === undefined ? {} : { nextPackageId: plugin.nextPackageId }), { packages: __spreadArray([], plugin.packages.values(), true).map(function (definition) { return ({
                        packageId: definition.packageId,
                        name: definition.name,
                        purpose: definition.purpose,
                        hasHostHalf: definition.hostCode !== undefined,
                        hasClientHalf: definition.clientCode !== undefined,
                    }); }) }), plugin.run === undefined ? {} : {
                    activeRun: __assign(__assign(__assign({ pluginRunId: plugin.run.pluginRunId, packageId: plugin.run.packageId }, plugin.run.fiber === undefined ? {} : { fiber: plugin.run.fiber }), { handlers: __spreadArray([], plugin.run.handlers.keys(), true) }), plugin.run.renderFailure === undefined ? {} : { renderFailure: plugin.run.renderFailure }),
                }), plugin.latestRun === undefined ? {} : { latestRun: cloneAttempt(plugin.latestRun) })); });
            };
            /**
             * Read source-free context for an explicit `@pluginId` user gesture.
             * @param agent - Agent whose Session must own the Plugin.
             * @param pluginId - Stable Plugin identity referenced by the user.
             * @returns The preferred modification base, or undefined when unavailable.
             */
            DynamicCordisRunnerService.prototype.reference = function (agent, pluginId) {
                var _b, _c;
                var plugin = this.owned(agent, pluginId);
                if (plugin === undefined)
                    return undefined;
                var packageId = (_c = (_b = plugin.nextPackageId) !== null && _b !== void 0 ? _b : plugin.currentPackageId) !== null && _c !== void 0 ? _c : __spreadArray([], plugin.packages.keys(), true).at(-1);
                if (packageId === undefined)
                    return undefined;
                var definition = plugin.packages.get(packageId);
                if (definition === undefined)
                    return undefined;
                return __assign(__assign(__assign(__assign({ pluginId: pluginId, packageId: packageId, name: definition.name, purpose: definition.purpose }, plugin.currentPackageId === undefined ? {} : { currentPackageId: plugin.currentPackageId }), plugin.nextPackageId === undefined ? {} : { nextPackageId: plugin.nextPackageId }), plugin.run === undefined ? {} : {
                    activeRun: { pluginRunId: plugin.run.pluginRunId, packageId: plugin.run.packageId },
                }), plugin.latestRun === undefined ? {} : { latestRun: cloneAttempt(plugin.latestRun) });
            };
            /**
             * List source-free Plugin summaries owned by one Session.
             * @param agent - Agent whose Session selects visible Plugins.
             * @returns one summary per Plugin in creation order.
             */
            DynamicCordisRunnerService.prototype.listPlugins = function (agent) {
                var _this = this;
                return this.registry.ofSession(agent.id).map(function (plugin) { return _this.inspectPlugin(agent, plugin.pluginId); });
            };
            /**
             * Inspect one Plugin without returning Package source.
             * @param agent - Agent whose Session must own the Plugin.
             * @param pluginId - stable Plugin identity.
             * @returns version pointers, latest run, and all Package summaries.
             */
            DynamicCordisRunnerService.prototype.inspectPlugin = function (agent, pluginId) {
                var plugin = this.owned(agent, pluginId);
                if (plugin === undefined)
                    throw new Error(missingPluginMessage(pluginId));
                var reference = this.reference(agent, pluginId);
                if (reference === undefined)
                    throw new Error("dynamic plugin \"".concat(pluginId, "\" has no package"));
                return __assign(__assign({}, reference), { packages: __spreadArray([], plugin.packages.values(), true).map(function (definition) { return ({
                        packageId: definition.packageId,
                        name: definition.name,
                        purpose: definition.purpose,
                        hasHostHalf: definition.hostCode !== undefined,
                        hasClientHalf: definition.clientCode !== undefined,
                    }); }) });
            };
            /**
             * Read one exact immutable Package and its Host and Client source.
             * @param agent - Agent whose Session must own the Plugin.
             * @param pluginId - Stable Plugin identity that owns the Package.
             * @param packageId - Exact immutable Package identity to inspect.
             * @returns Package metadata, source, and the Plugin's lifecycle pointers.
             */
            DynamicCordisRunnerService.prototype.inspectPackage = function (agent, pluginId, packageId) {
                var plugin = this.owned(agent, pluginId);
                if (plugin === undefined)
                    throw new Error(missingPluginMessage(pluginId));
                var definition = plugin.packages.get(packageId);
                if (definition === undefined) {
                    throw new Error("dynamic package \"".concat(packageId, "\" does not exist on plugin \"").concat(pluginId, "\""));
                }
                return __assign(__assign(__assign(__assign({ pluginId: pluginId, packageId: packageId, name: definition.name, purpose: definition.purpose, code: __assign(__assign({}, definition.hostCode === undefined ? {} : { host: definition.hostCode }), definition.clientCode === undefined ? {} : { client: definition.clientCode }) }, plugin.currentPackageId === undefined ? {} : { currentPackageId: plugin.currentPackageId }), plugin.nextPackageId === undefined ? {} : { nextPackageId: plugin.nextPackageId }), plugin.run === undefined ? {} : {
                    activeRun: { pluginRunId: plugin.run.pluginRunId, packageId: plugin.run.packageId },
                }), plugin.latestRun === undefined ? {} : { latestRun: cloneAttempt(plugin.latestRun) });
            };
            /**
             * Record a post-load render failure for the exact active run.
             * @param agent - Agent whose Session must own the Plugin.
             * @param pluginId - Stable Plugin identity that rendered.
             * @param pluginRunId - Exact active run that produced the failure.
             * @param failure - Slot, message, and entry-retirement result.
             * @returns Null after recording or ignoring a stale report.
             */
            DynamicCordisRunnerService.prototype.reportRenderFailure = function (agent, pluginId, pluginRunId, failure) {
                return __awaiter(this, void 0, void 0, function () {
                    var plugin, run, definition, shouldSteer, attempt;
                    var _b;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                plugin = this.owned(agent, pluginId);
                                if (((_b = plugin === null || plugin === void 0 ? void 0 : plugin.run) === null || _b === void 0 ? void 0 : _b.pluginRunId) === pluginRunId) {
                                    run = plugin.run;
                                    definition = plugin.packages.get(plugin.run.packageId);
                                    shouldSteer = run.renderFailure === undefined;
                                    run.renderFailure = failure;
                                    attempt = plugin.latestRun;
                                    if ((attempt === null || attempt === void 0 ? void 0 : attempt.pluginRunId) === pluginRunId) {
                                        attempt.error = this.diagnostic(plugin, attempt, 'client-render', failure);
                                        attempt.client = { status: 'failed', waitingFor: attempt.client.waitingFor, error: failure.message };
                                        attempt.status = 'failed';
                                    }
                                    if (definition !== undefined && shouldSteer) {
                                        this.steerRenderFailure(agent, plugin, definition, pluginRunId, failure);
                                    }
                                }
                                return [4 /*yield*/, Promise.resolve(null)];
                            case 1: return [2 /*return*/, _c.sent()];
                        }
                    });
                });
            };
            /**
             * Report a Client guard rejection that happened after the Package completed activation.
             * @param agent - Agent whose Session must own the Plugin.
             * @param pluginId - Stable Plugin identity whose Client code was rejected.
             * @param pluginRunId - Exact active run that produced the rejection.
             * @param failure - Original guard message and stack.
             * @returns Null after reporting or ignoring a stale/startup failure.
             */
            DynamicCordisRunnerService.prototype.reportClientGuardFailure = function (agent, pluginId, pluginRunId, failure) {
                return __awaiter(this, void 0, void 0, function () {
                    var plugin, run;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                plugin = this.owned(agent, pluginId);
                                run = plugin === null || plugin === void 0 ? void 0 : plugin.run;
                                if (plugin !== undefined && (run === null || run === void 0 ? void 0 : run.pluginRunId) === pluginRunId) {
                                    this.steerGuardFailure(plugin, run, 'Client', failure);
                                }
                                return [4 /*yield*/, Promise.resolve(null)];
                            case 1: return [2 /*return*/, _b.sent()];
                        }
                    });
                });
            };
            /**
             * Invoke an active Host method while rejecting stale Client runs.
             * @param pluginId - Stable Plugin identity that owns the method.
             * @param pluginRunId - Exact active run authorizing the call.
             * @param method - Registered Host handler name.
             * @param args - JSON argument delivered to the handler.
             * @returns The JSON result or a typed invocation failure.
             */
            DynamicCordisRunnerService.prototype.invoke = function (pluginId, pluginRunId, method, args) {
                return __awaiter(this, void 0, void 0, function () {
                    var plugin, run, handler, error_1, failure;
                    var _b;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                plugin = this.registry.get(pluginId);
                                if (plugin === undefined || plugin.run === undefined) {
                                    return [2 /*return*/, { ok: false, code: 'plugin-not-running', message: "dynamic plugin \"".concat(pluginId, "\" is not running") }];
                                }
                                run = plugin.run;
                                if (run.pluginRunId !== pluginRunId) {
                                    return [2 /*return*/, { ok: false, code: 'stale-run', message: "activation \"".concat(pluginRunId, "\" is no longer active") }];
                                }
                                handler = run.handlers.get(method);
                                if (handler === undefined) {
                                    return [2 /*return*/, { ok: false, code: 'method-not-found', message: "dynamic plugin \"".concat(pluginId, "\" registered no Host method \"").concat(method, "\"") }];
                                }
                                _c.label = 1;
                            case 1:
                                _c.trys.push([1, 3, , 4]);
                                _b = { ok: true };
                                return [4 /*yield*/, handler(args)];
                            case 2: return [2 /*return*/, (_b.value = (_c.sent()), _b)];
                            case 3:
                                error_1 = _c.sent();
                                failure = errorDetails(error_1);
                                this.steerHostHandlerFailure(plugin, run, method, failure);
                                return [2 /*return*/, __assign({ ok: false, code: 'handler-error' }, failure)];
                            case 4: return [2 /*return*/];
                        }
                    });
                });
            };
            DynamicCordisRunnerService.prototype.resolvePlan = function (agent, pluginId, packageId, mode, allowActiveAttach) {
                if (allowActiveAttach === void 0) { allowActiveAttach = false; }
                var plugin = this.owned(agent, pluginId);
                if (plugin === undefined)
                    return { ok: false, response: { ok: false, reason: 'plugin-missing', message: missingPluginMessage(pluginId) } };
                var definition = plugin.packages.get(packageId);
                if (definition === undefined) {
                    return { ok: false, response: { ok: false, reason: 'package-missing', message: "plugin \"".concat(pluginId, "\" has no package \"").concat(packageId, "\"") } };
                }
                var current = plugin.currentPackageId;
                if (mode === 'update' && (current === undefined || current === packageId)) {
                    return {
                        ok: false,
                        response: {
                            ok: false,
                            reason: 'invalid-mode',
                            message: current === undefined
                                ? "plugin \"".concat(pluginId, "\" has no successful version yet; start \"").concat(packageId, "\" with mode \"run\"")
                                : "package \"".concat(packageId, "\" is already current; use mode \"run\""),
                        },
                    };
                }
                if (mode === 'run' && current !== undefined && current !== packageId) {
                    return {
                        ok: false,
                        response: {
                            ok: false,
                            reason: 'invalid-mode',
                            message: "package \"".concat(packageId, "\" differs from current \"").concat(current, "\"; use mode \"update\""),
                        },
                    };
                }
                if (!allowActiveAttach && this.starting.has(pluginId)) {
                    return { ok: false, response: { ok: false, reason: 'transition-in-flight', message: "plugin \"".concat(pluginId, "\" is already starting") } };
                }
                return { ok: true, plugin: plugin, definition: definition, mode: mode };
            };
            DynamicCordisRunnerService.prototype.activate = function (plan, requestId, allowActiveAttach, attempt) {
                var _this = this;
                var inFlight = this.starting.get(plan.plugin.pluginId);
                if (inFlight !== undefined)
                    return inFlight;
                var starting = this.startFresh(plan, requestId, allowActiveAttach, attempt);
                this.starting.set(plan.plugin.pluginId, starting);
                return starting.finally(function () { _this.starting.delete(plan.plugin.pluginId); });
            };
            DynamicCordisRunnerService.prototype.startFresh = function (plan, requestId, allowActiveAttach, attempt) {
                return __awaiter(this, void 0, void 0, function () {
                    var plugin, definition, mode, run, failure;
                    var _b;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                plugin = plan.plugin, definition = plan.definition, mode = plan.mode;
                                if (allowActiveAttach
                                    && ((_b = plugin.run) === null || _b === void 0 ? void 0 : _b.packageId) === definition.packageId
                                    && plugin.run.pluginRunId === attempt.pluginRunId) {
                                    return [2 /*return*/, {
                                            ok: true,
                                            pluginId: plugin.pluginId,
                                            packageId: definition.packageId,
                                            pluginRunId: plugin.run.pluginRunId,
                                            waitingFor: missingFor(this.ctx, plugin.run),
                                            startedHere: false,
                                        }];
                                }
                                if (!(plugin.run !== undefined)) return [3 /*break*/, 2];
                                return [4 /*yield*/, this.retract(plugin)];
                            case 1:
                                _c.sent();
                                _c.label = 2;
                            case 2:
                                if (mode === 'update' || plugin.currentPackageId === undefined)
                                    plugin.nextPackageId = definition.packageId;
                                run = __assign({ pluginRunId: attempt.pluginRunId, packageId: definition.packageId, handlers: new Map(), handlerDisposers: [], reportedRuntimeErrors: new Set() }, requestId === undefined ? {} : { startedForRequest: requestId });
                                if (!(definition.hostCode !== undefined)) return [3 /*break*/, 4];
                                return [4 /*yield*/, this.startHost(plugin, definition.hostCode, run)];
                            case 3:
                                failure = _c.sent();
                                if (failure !== undefined)
                                    return [2 /*return*/, __assign({ ok: false }, failure)];
                                _c.label = 4;
                            case 4:
                                plugin.run = run;
                                this.ctx.emit('cordis/dynamic-package', {
                                    pluginId: plugin.pluginId,
                                    packageId: definition.packageId,
                                    pluginRunId: run.pluginRunId,
                                    name: definition.name,
                                });
                                attempt.host = {
                                    status: run.fiber === undefined ? 'absent' : missingFor(this.ctx, run).length === 0 ? 'running' : 'waiting',
                                    waitingFor: missingFor(this.ctx, run),
                                };
                                if (definition.clientCode === undefined) {
                                    this.commitActivation(plugin, run);
                                }
                                else {
                                    attempt.status = 'client-pending';
                                    attempt.client = { status: 'pending', waitingFor: [] };
                                }
                                return [2 /*return*/, {
                                        ok: true,
                                        pluginId: plugin.pluginId,
                                        packageId: definition.packageId,
                                        pluginRunId: run.pluginRunId,
                                        waitingFor: missingFor(this.ctx, run),
                                        startedHere: true,
                                    }];
                        }
                    });
                });
            };
            DynamicCordisRunnerService.prototype.startHost = function (plugin, hostCode, run) {
                return __awaiter(this, void 0, void 0, function () {
                    var handle, sandbox, evaluated, _b, error_2, _i, _c, dispose;
                    var _this = this;
                    return __generator(this, function (_d) {
                        switch (_d.label) {
                            case 0:
                                handle = function (method, fn) {
                                    var normalized = (0, guard_ts_1.normalizeHandler)(method, fn);
                                    run.handlers.set(normalized.method, normalized.handler);
                                    var dispose = function () {
                                        if (run.handlers.get(normalized.method) === normalized.handler)
                                            run.handlers.delete(normalized.method);
                                    };
                                    run.handlerDisposers.push(dispose);
                                    return dispose;
                                };
                                _d.label = 1;
                            case 1:
                                _d.trys.push([1, 4, , 5]);
                                sandbox = (0, sandbox_ts_1.createSandbox)(plugin.pluginId, { handle: handle });
                                return [4 /*yield*/, (0, sandbox_ts_1.evaluateHostCode)(sandbox, hostCode, plugin.pluginId, this.resolved.vmTimeoutMs)];
                            case 2:
                                evaluated = _d.sent();
                                if (!(0, guard_ts_1.isPlugin)(evaluated)) {
                                    throw new Error(evaluated === undefined
                                        ? 'the Host half returned `undefined` — did you forget `return`?'
                                        : 'the Host half must return a Plugin function or an object with apply(ctx)');
                                }
                                _b = run;
                                return [4 /*yield*/, (0, lifecycle_ts_1.startHostHalf)(this.requireGroup(), evaluated, function (error) { _this.steerGuardFailure(plugin, run, 'Host', errorDetails(error)); })];
                            case 3:
                                _b.fiber = _d.sent();
                                return [2 /*return*/, undefined];
                            case 4:
                                error_2 = _d.sent();
                                for (_i = 0, _c = run.handlerDisposers.splice(0); _i < _c.length; _i++) {
                                    dispose = _c[_i];
                                    dispose();
                                }
                                return [2 /*return*/, errorDetails(error_2)];
                            case 5: return [2 /*return*/];
                        }
                    });
                });
            };
            DynamicCordisRunnerService.prototype.settleActivation = function (plugin, resolution, requestId) {
                return __awaiter(this, void 0, void 0, function () {
                    var attempt, run_1, ownsRun, run;
                    var _b, _c, _d, _e, _f;
                    return __generator(this, function (_g) {
                        switch (_g.label) {
                            case 0:
                                if (plugin === undefined)
                                    return [2 /*return*/, { ok: false, reason: 'plugin-missing', message: 'the dynamic plugin was removed during activation' }];
                                attempt = plugin.latestRun;
                                if (!!resolution.ok) return [3 /*break*/, 3];
                                if (resolution.reason === 'rejected') {
                                    if (attempt !== undefined) {
                                        attempt.status = 'rejected';
                                        attempt.error = this.diagnostic(plugin, attempt, 'approval', (_b = resolution.message) !== null && _b !== void 0 ? _b : 'the run request was declined');
                                        attempt.client = { status: 'stopped', waitingFor: [] };
                                    }
                                    return [2 /*return*/, { ok: false, reason: 'rejected', message: (_c = resolution.message) !== null && _c !== void 0 ? _c : 'the run request was declined' }];
                                }
                                run_1 = plugin.run;
                                ownsRun = run_1 !== undefined
                                    && resolution.pluginRunId === run_1.pluginRunId
                                    && (requestId === undefined || run_1.startedForRequest === requestId)
                                    && resolution.startedHere !== false;
                                if (!ownsRun) return [3 /*break*/, 2];
                                return [4 /*yield*/, this.retract(plugin)];
                            case 1:
                                _g.sent();
                                _g.label = 2;
                            case 2:
                                if (attempt !== undefined && (resolution.pluginRunId === undefined || attempt.pluginRunId === resolution.pluginRunId)) {
                                    this.failAttempt(plugin, attempt, resolution.reason === 'host-half-failed' ? 'host-apply' : 'client-apply', __assign({ message: (_d = resolution.message) !== null && _d !== void 0 ? _d : resolution.reason }, resolution.stack === undefined ? {} : { stack: resolution.stack }));
                                }
                                return [2 /*return*/, __assign({ ok: false, reason: resolution.reason, message: (_e = resolution.message) !== null && _e !== void 0 ? _e : resolution.reason }, resolution.stack === undefined ? {} : { stack: resolution.stack })];
                            case 3:
                                run = plugin.run;
                                if (run === undefined || run.pluginRunId !== resolution.pluginRunId) {
                                    return [2 /*return*/, { ok: false, reason: 'client-half-failed', message: "activation \"".concat(resolution.pluginRunId, "\" is no longer active") }];
                                }
                                if (attempt !== undefined && attempt.pluginRunId === run.pluginRunId) {
                                    attempt.client = {
                                        status: resolution.waitingFor === undefined || resolution.waitingFor.length === 0 ? 'running' : 'waiting',
                                        waitingFor: (_f = resolution.waitingFor) !== null && _f !== void 0 ? _f : [],
                                    };
                                }
                                this.commitActivation(plugin, run);
                                return [2 /*return*/, __assign(__assign({}, this.runResponse(plugin, {
                                        ok: true,
                                        pluginId: plugin.pluginId,
                                        packageId: run.packageId,
                                        pluginRunId: run.pluginRunId,
                                        waitingFor: missingFor(this.ctx, run),
                                        startedHere: false,
                                    })), resolution.waitingFor === undefined ? {} : { clientWaitingFor: resolution.waitingFor })];
                        }
                    });
                });
            };
            DynamicCordisRunnerService.prototype.commitActivation = function (plugin, run) {
                plugin.currentPackageId = run.packageId;
                delete plugin.nextPackageId;
                delete run.startedForRequest;
                var attempt = plugin.latestRun;
                if ((attempt === null || attempt === void 0 ? void 0 : attempt.pluginRunId) === run.pluginRunId) {
                    attempt.status = attempt.host.status === 'waiting' || attempt.client.status === 'waiting' ? 'waiting' : 'running';
                    delete attempt.approvalRequestId;
                    delete attempt.requiresApproval;
                    delete attempt.error;
                }
            };
            DynamicCordisRunnerService.prototype.runResponse = function (plugin, started) {
                var _b;
                return {
                    ok: true,
                    status: 'running',
                    pluginId: plugin.pluginId,
                    packageId: started.packageId,
                    pluginRunId: started.pluginRunId,
                    waitingFor: started.waitingFor,
                    currentPackageId: started.packageId,
                    mode: ((_b = plugin.latestRun) === null || _b === void 0 ? void 0 : _b.pluginRunId) === started.pluginRunId ? plugin.latestRun.mode : 'run',
                };
            };
            DynamicCordisRunnerService.prototype.announceResolved = function (requestId, resolution, override) {
                var outcome = override !== null && override !== void 0 ? override : (resolution.ok ? 'approved' : resolution.reason === 'rejected' ? 'rejected' : 'failed');
                this.ctx.emit('cordis/request-run-resolved', { requestId: requestId, outcome: outcome });
            };
            DynamicCordisRunnerService.prototype.steerRunOutcome = function (pending, settled) {
                var _b, _c, _d;
                var agents = this.rootCtx.get('agents');
                var agent = agents === null || agents === void 0 ? void 0 : agents.get(pending.agentId);
                if (agent === undefined)
                    return;
                var plugin = this.registry.get(pending.pluginId);
                var identity = "".concat(pending.pluginId, "/").concat(pending.packageId, " (").concat(pending.pluginRunId, ")");
                var text;
                if (settled.ok) {
                    text = "Cordis ".concat(pending.mode, " ").concat(identity, " completed successfully. ")
                        + "currentPackageId is ".concat((_b = settled.currentPackageId) !== null && _b !== void 0 ? _b : pending.packageId, ". Continue using the running Plugin.");
                }
                else if (settled.reason === 'rejected') {
                    text = "The user rejected Cordis ".concat(pending.mode, " ").concat(identity, ". ")
                        + 'Do not request the same activation again unless the user asks.';
                }
                else {
                    var returnedStatus = pending.requiresApproval ? 'awaiting-approval' : 'starting';
                    text = "Cordis ".concat(pending.mode, " ").concat(identity, " failed after cordis_run returned ").concat(returnedStatus, ": ")
                        + "".concat(settled.reason, "\n").concat(formatErrorDetails(settled), "\n")
                        + "currentPackageId: ".concat((_c = plugin === null || plugin === void 0 ? void 0 : plugin.currentPackageId) !== null && _c !== void 0 ? _c : 'none', "\n")
                        + "nextPackageId: ".concat((_d = plugin === null || plugin === void 0 ? void 0 : plugin.nextPackageId) !== null && _d !== void 0 ? _d : pending.packageId, "\n")
                        + 'Inspect the failed Package, correct it on the same Plugin when needed, and retry the activation autonomously.';
                }
                agent.steer((0, dsh_llm_1.createUserMessage)({
                    content: [{ type: 'text', text: text }],
                    source: { kind: 'plugin', plugin: 'cordis-host-runner' },
                }));
            };
            DynamicCordisRunnerService.prototype.steerRenderFailure = function (agent, plugin, definition, pluginRunId, failure) {
                agent.steer((0, dsh_llm_1.createUserMessage)({
                    content: [{
                            type: 'text',
                            text: "Cordis Client UI ".concat(plugin.pluginId, "/").concat(definition.packageId, " (").concat(pluginRunId, ") failed while rendering ")
                                + "Slot \"".concat(failure.slot, "\" after activation.\n")
                                + "".concat(formatErrorDetails(failure), "\n")
                                + "entryAbdicated: ".concat(failure.abdicated, "\n")
                                + 'Inspect the failed Package, fix the Client code by defining a new Package on the same Plugin, and '
                                + 'activate that Package autonomously with cordis_run mode:"update".',
                        }],
                    source: { kind: 'plugin', plugin: 'cordis-host-runner' },
                }));
            };
            DynamicCordisRunnerService.prototype.steerHostHandlerFailure = function (plugin, run, method, failure) {
                var reportKey = "Host\0handler\0".concat(method, "\0").concat(failure.message);
                if (!this.claimRuntimeFailure(plugin, run, reportKey))
                    return;
                var agents = this.rootCtx.get('agents');
                var agent = agents === null || agents === void 0 ? void 0 : agents.get(plugin.sessionId);
                if (agent === undefined)
                    return;
                agent.steer((0, dsh_llm_1.createUserMessage)({
                    content: [{
                            type: 'text',
                            text: "Cordis Host handler ".concat(plugin.pluginId, "/").concat(run.packageId, " (").concat(run.pluginRunId, ") failed when the Client called ")
                                + "host.call(".concat(JSON.stringify(method), ").\n")
                                + "".concat(formatErrorDetails(failure), "\n")
                                + 'The Plugin remains running. Inspect this Package, correct the Host code on the same Plugin, and activate '
                                + 'the new Package autonomously with cordis_run mode:"update". If the handler needs a Service, either declare '
                                + 'that Service in the returned Plugin inject list or read it with ctx.get(name) and handle undefined.',
                        }],
                    source: { kind: 'plugin', plugin: 'cordis-host-runner' },
                }));
            };
            /* jscpd:ignore-start */
            DynamicCordisRunnerService.prototype.steerGuardFailure = function (plugin, run, platform, failure) {
                var reportKey = "".concat(platform, "\0guard\0").concat(failure.message);
                if (!this.claimRuntimeFailure(plugin, run, reportKey))
                    return;
                var agents = this.rootCtx.get('agents');
                var agent = agents === null || agents === void 0 ? void 0 : agents.get(plugin.sessionId);
                if (agent === undefined)
                    return;
                agent.steer((0, dsh_llm_1.createUserMessage)({
                    content: [{
                            type: 'text',
                            text: "Cordis ".concat(platform, " guard rejected runtime code in ").concat(plugin.pluginId, "/").concat(run.packageId, " ")
                                + "(".concat(run.pluginRunId, ") after activation.\n").concat(formatErrorDetails(failure), "\n")
                                + 'The Plugin remains running. Inspect this Package, define a corrected Package on the same Plugin, and '
                                + 'activate it autonomously with cordis_run mode:"update".',
                        }],
                    source: { kind: 'plugin', plugin: 'cordis-host-runner' },
                }));
            };
            /* jscpd:ignore-end */
            DynamicCordisRunnerService.prototype.claimRuntimeFailure = function (plugin, run, key) {
                var attempt = plugin.latestRun;
                if (plugin.run !== run || (attempt === null || attempt === void 0 ? void 0 : attempt.pluginRunId) !== run.pluginRunId
                    || (attempt.status !== 'running' && attempt.status !== 'waiting'))
                    return false;
                if (run.reportedRuntimeErrors.has(key))
                    return false;
                run.reportedRuntimeErrors.add(key);
                return true;
            };
            DynamicCordisRunnerService.prototype.injectUserRunOutcome = function (agent, pluginId, settled) {
                var _b, _c;
                var plugin = this.owned(agent, pluginId);
                var text;
                if (settled.ok) {
                    text = "The user manually ran Cordis Plugin ".concat(pluginId, ", Package ").concat(settled.packageId, ", ")
                        + "as ".concat(settled.pluginRunId, ". The activation succeeded; currentPackageId is ").concat(settled.currentPackageId, ".");
                }
                else {
                    var attempt = plugin === null || plugin === void 0 ? void 0 : plugin.latestRun;
                    text = "The user manually ran Cordis Plugin ".concat(pluginId)
                        + "".concat(attempt === undefined ? '' : ", Package ".concat(attempt.packageId, ", as ").concat(attempt.pluginRunId), ", but it failed: ")
                        + "".concat(settled.reason, "\n").concat(formatErrorDetails(settled), "\n")
                        + "currentPackageId: ".concat((_b = plugin === null || plugin === void 0 ? void 0 : plugin.currentPackageId) !== null && _b !== void 0 ? _b : 'none', "\n")
                        + "nextPackageId: ".concat((_c = plugin === null || plugin === void 0 ? void 0 : plugin.nextPackageId) !== null && _c !== void 0 ? _c : 'none');
                }
                this.injectUserContext(agent, text);
            };
            DynamicCordisRunnerService.prototype.injectUserContext = function (agent, text) {
                var agents = this.rootCtx.get('agents');
                if ((agents === null || agents === void 0 ? void 0 : agents.get(agent.id)) !== agent)
                    return;
                agent.inject((0, dsh_llm_1.createUserMessage)({
                    content: [{ type: 'text', text: text }],
                    source: { kind: 'plugin', plugin: 'cordis-host-runner' },
                }));
            };
            DynamicCordisRunnerService.prototype.cancelPending = function (pluginId, message) {
                var _b;
                var requestId = this.registry.pendingRequestFor(pluginId);
                if (requestId === undefined)
                    return;
                var pending = this.registry.claimRequest(requestId);
                if (pending === undefined)
                    return;
                var plugin = this.registry.get(pluginId);
                if (((_b = plugin === null || plugin === void 0 ? void 0 : plugin.latestRun) === null || _b === void 0 ? void 0 : _b.pluginRunId) === pending.pluginRunId) {
                    plugin.latestRun.status = 'cancelled';
                    plugin.latestRun.error = this.diagnostic(plugin, plugin.latestRun, 'approval', message);
                    delete plugin.latestRun.approvalRequestId;
                    delete plugin.latestRun.requiresApproval;
                }
                this.announceResolved(requestId, { ok: false, reason: 'rejected' }, 'cancelled');
            };
            DynamicCordisRunnerService.prototype.createAttempt = function (plan) {
                return {
                    pluginRunId: (0, types_ts_1.CordisDynamicPluginRunId)(this.registry.mintPluginRunId()),
                    packageId: plan.definition.packageId,
                    mode: plan.mode,
                    status: 'starting-host',
                    host: {
                        status: plan.definition.hostCode === undefined ? 'absent' : 'pending',
                        waitingFor: [],
                    },
                    client: {
                        status: plan.definition.clientCode === undefined ? 'absent' : 'pending',
                        waitingFor: [],
                    },
                };
            };
            DynamicCordisRunnerService.prototype.failAttempt = function (plugin, attempt, phase, failure) {
                attempt.status = 'failed';
                attempt.error = this.diagnostic(plugin, attempt, phase, failure);
                if (phase.startsWith('host'))
                    attempt.host = { status: 'failed', waitingFor: [], error: failure.message };
                else
                    attempt.client = { status: 'failed', waitingFor: [], error: failure.message };
            };
            DynamicCordisRunnerService.prototype.diagnostic = function (plugin, attempt, phase, failure) {
                var details = typeof failure === 'string' ? { message: failure } : failure;
                return __assign(__assign({ phase: phase }, details), { pluginId: plugin.pluginId, packageId: attempt.packageId, pluginRunId: attempt.pluginRunId });
            };
            DynamicCordisRunnerService.prototype.retract = function (plugin) {
                return __awaiter(this, void 0, void 0, function () {
                    var run, _i, _b, dispose;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                run = plugin.run;
                                if (run === undefined)
                                    return [2 /*return*/];
                                delete plugin.run;
                                for (_i = 0, _b = run.handlerDisposers.splice(0); _i < _b.length; _i++) {
                                    dispose = _b[_i];
                                    dispose();
                                }
                                if (!(run.fiber !== undefined)) return [3 /*break*/, 2];
                                return [4 /*yield*/, run.fiber.dispose()];
                            case 1:
                                _c.sent();
                                _c.label = 2;
                            case 2:
                                this.ctx.emit('cordis/dynamic-retract', {
                                    pluginId: plugin.pluginId,
                                    packageId: run.packageId,
                                    pluginRunId: run.pluginRunId,
                                });
                                return [2 /*return*/];
                        }
                    });
                });
            };
            DynamicCordisRunnerService.prototype.owned = function (agent, pluginId) {
                var plugin = this.registry.get(pluginId);
                return (plugin === null || plugin === void 0 ? void 0 : plugin.sessionId) === agent.id ? plugin : undefined;
            };
            DynamicCordisRunnerService.prototype.requireGroup = function () {
                var _b;
                (_b = this.group) !== null && _b !== void 0 ? _b : (this.group = this.rootCtx.plugin({ name: 'cordis-dynamic', apply: function () { } }));
                return this.group;
            };
            return DynamicCordisRunnerService;
        }(_classSuper)),
        (function () {
            var _b;
            var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create((_b = _classSuper[Symbol.metadata]) !== null && _b !== void 0 ? _b : null) : void 0;
            _undefineFromPanel_decorators = [(0, dsh_typert_protocol_1.Remote)('undefineFromPanel')];
            _runHostHalf_decorators = [(0, dsh_typert_protocol_1.Remote)('runHostHalf')];
            _getClientCode_decorators = [(0, dsh_typert_protocol_1.Remote)('getClientCode')];
            _resolveRequestRun_decorators = [(0, dsh_typert_protocol_1.Remote)('resolveRequestRun')];
            _settleUserRun_decorators = [(0, dsh_typert_protocol_1.Remote)('settleUserRun')];
            _stopFromPanel_decorators = [(0, dsh_typert_protocol_1.Remote)('stopFromPanel')];
            _syncInspectManifest_decorators = [(0, dsh_typert_protocol_1.Remote)('syncInspectManifest')];
            _resolveInspectQuery_decorators = [(0, dsh_typert_protocol_1.Remote)('resolveInspectQuery')];
            _inventory_decorators = [(0, dsh_typert_protocol_1.Remote)('inventory')];
            _reportRenderFailure_decorators = [(0, dsh_typert_protocol_1.Remote)('reportRenderFailure')];
            _reportClientGuardFailure_decorators = [(0, dsh_typert_protocol_1.Remote)('reportClientGuardFailure')];
            _invoke_decorators = [(0, dsh_typert_protocol_1.Remote)('invoke')];
            __esDecorate(_a, null, _undefineFromPanel_decorators, { kind: "method", name: "undefineFromPanel", static: false, private: false, access: { has: function (obj) { return "undefineFromPanel" in obj; }, get: function (obj) { return obj.undefineFromPanel; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _runHostHalf_decorators, { kind: "method", name: "runHostHalf", static: false, private: false, access: { has: function (obj) { return "runHostHalf" in obj; }, get: function (obj) { return obj.runHostHalf; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _getClientCode_decorators, { kind: "method", name: "getClientCode", static: false, private: false, access: { has: function (obj) { return "getClientCode" in obj; }, get: function (obj) { return obj.getClientCode; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _resolveRequestRun_decorators, { kind: "method", name: "resolveRequestRun", static: false, private: false, access: { has: function (obj) { return "resolveRequestRun" in obj; }, get: function (obj) { return obj.resolveRequestRun; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _settleUserRun_decorators, { kind: "method", name: "settleUserRun", static: false, private: false, access: { has: function (obj) { return "settleUserRun" in obj; }, get: function (obj) { return obj.settleUserRun; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _stopFromPanel_decorators, { kind: "method", name: "stopFromPanel", static: false, private: false, access: { has: function (obj) { return "stopFromPanel" in obj; }, get: function (obj) { return obj.stopFromPanel; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _syncInspectManifest_decorators, { kind: "method", name: "syncInspectManifest", static: false, private: false, access: { has: function (obj) { return "syncInspectManifest" in obj; }, get: function (obj) { return obj.syncInspectManifest; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _resolveInspectQuery_decorators, { kind: "method", name: "resolveInspectQuery", static: false, private: false, access: { has: function (obj) { return "resolveInspectQuery" in obj; }, get: function (obj) { return obj.resolveInspectQuery; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _inventory_decorators, { kind: "method", name: "inventory", static: false, private: false, access: { has: function (obj) { return "inventory" in obj; }, get: function (obj) { return obj.inventory; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _reportRenderFailure_decorators, { kind: "method", name: "reportRenderFailure", static: false, private: false, access: { has: function (obj) { return "reportRenderFailure" in obj; }, get: function (obj) { return obj.reportRenderFailure; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _reportClientGuardFailure_decorators, { kind: "method", name: "reportClientGuardFailure", static: false, private: false, access: { has: function (obj) { return "reportClientGuardFailure" in obj; }, get: function (obj) { return obj.reportClientGuardFailure; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _invoke_decorators, { kind: "method", name: "invoke", static: false, private: false, access: { has: function (obj) { return "invoke" in obj; }, get: function (obj) { return obj.invoke; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a.inject = ['tools'],
        _a.Config = schemastery_1.default.object({
            vmTimeoutMs: schemastery_1.default.number().min(1).default(5000),
        }),
        _a;
}();
exports.DynamicCordisRunnerService = DynamicCordisRunnerService;
function missingFor(ctx, run) {
    return run.fiber === undefined ? [] : (0, lifecycle_ts_1.missingServices)(ctx, run.fiber);
}
function missingPluginMessage(id) {
    return "no dynamic plugin \"".concat(id, "\" in this process \u2014 it may have been removed or lost on DSH restart");
}
function errorDetails(error) {
    if (typeof error !== 'object' || error === null)
        return { message: String(error) };
    var message = 'message' in error && typeof error.message === 'string'
        ? error.message
        : Object.prototype.toString.call(error);
    var stack = 'stack' in error && typeof error.stack === 'string' ? error.stack : undefined;
    return __assign({ message: message }, stack === undefined ? {} : { stack: stack });
}
function formatErrorDetails(failure) {
    return "message: ".concat(failure.message)
        + (failure.stack === undefined ? '' : "\nstack:\n".concat(failure.stack));
}
function cloneAttempt(attempt) {
    return __assign(__assign(__assign({}, attempt), { host: __assign(__assign({}, attempt.host), { waitingFor: __spreadArray([], attempt.host.waitingFor, true) }), client: __assign(__assign({}, attempt.client), { waitingFor: __spreadArray([], attempt.client.waitingFor, true) }) }), attempt.error === undefined ? {} : { error: __assign({}, attempt.error) });
}
exports.default = DynamicCordisRunnerService;
