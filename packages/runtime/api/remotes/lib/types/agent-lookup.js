"use strict";
/** Host BFF policy for resolving Remote Agent and Session identities. */
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
exports.ApiRemoteSubagentSessionOwnership = exports.ApiRemoteSessionNotFound = void 0;
exports.hasApiRemoteSubagentOwner = hasApiRemoteSubagentOwner;
exports.apiRemoteSubagentOwnershipError = apiRemoteSubagentOwnershipError;
exports.inspectApiRemoteSession = inspectApiRemoteSession;
exports.createApiRemoteAgentResolver = createApiRemoteAgentResolver;
var dsh_typert_protocol_1 = require("@z/dsh-typert-protocol");
/** Cold identity absent from the durable session store. */
var ApiRemoteSessionNotFound = /** @class */ (function (_super) {
    __extends(ApiRemoteSessionNotFound, _super);
    function ApiRemoteSessionNotFound() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return ApiRemoteSessionNotFound;
}(Error));
exports.ApiRemoteSessionNotFound = ApiRemoteSessionNotFound;
/** Session identity whose lifecycle belongs to subagent routing. */
var ApiRemoteSubagentSessionOwnership = /** @class */ (function (_super) {
    __extends(ApiRemoteSubagentSessionOwnership, _super);
    /**
     * Construct the ownership fence.
     * @param sessionId - identity reserved to subagent routing.
     */
    function ApiRemoteSubagentSessionOwnership(sessionId) {
        var _this = _super.call(this, "session \"".concat(sessionId, "\" is a subagent session; use subagent delivery")) || this;
        _this.sessionId = sessionId;
        return _this;
    }
    return ApiRemoteSubagentSessionOwnership;
}(Error));
exports.ApiRemoteSubagentSessionOwnership = ApiRemoteSubagentSessionOwnership;
/**
 * Test whether generic Host routing must leave an identity to subagent routing.
 * @param ctx - Host Context carrying the live Agent registry.
 * @param session - attached or live Session metadata.
 * @param agent - live Agent when one is registered.
 * @returns whether generic Remote and legacy API calls must reject the identity.
 */
function hasApiRemoteSubagentOwner(ctx, session, agent) {
    if (session.header.origin === 'subagent')
        return true;
    var parentId = session.header.parentSession;
    if (parentId === undefined || agent === undefined)
        return false;
    var parent = ctx.agents.get(parentId);
    return parent !== undefined && ctx.agents.isOwnedBy(agent.id, parent);
}
/**
 * Build the stable caller-facing ownership rejection.
 * @param sessionId - identity reserved to subagent routing.
 * @returns the existing `agent-busy` RPC shape.
 */
function apiRemoteSubagentOwnershipError(sessionId) {
    return {
        code: 'agent-busy',
        message: "session \"".concat(sessionId, "\" is owned by subagent routing"),
        details: { reason: 'use subagent delivery for this child session' },
    };
}
/**
 * Inspect one cold served session without repairing, resuming, or publishing it.
 * @param ctx - Host Context carrying the optional persistence provider.
 * @param sessionId - durable identity to inspect.
 * @returns detached metadata and events for a servable session.
 * @throws {@link ApiRemoteSessionNotFound} when the identity has no project-backed session.
 */
function inspectApiRemoteSession(ctx, sessionId) {
    return __awaiter(this, void 0, void 0, function () {
        var persistence, meta, inspected;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    persistence = ctx.get('sessionPersistence');
                    if (persistence === undefined) {
                        throw new Error('session persistence is not configured (load a dsh-session-persistence backend)');
                    }
                    return [4 /*yield*/, persistence.list()];
                case 1:
                    meta = (_a.sent()).find(function (candidate) { return candidate.id === sessionId; });
                    if (meta === undefined || meta.cwd === undefined) {
                        throw new ApiRemoteSessionNotFound("session \"".concat(sessionId, "\" not found"));
                    }
                    return [4 /*yield*/, persistence.inspect(sessionId)];
                case 2:
                    inspected = _a.sent();
                    if (inspected.meta.cwd === undefined) {
                        throw new ApiRemoteSessionNotFound("session \"".concat(sessionId, "\" not found"));
                    }
                    return [2 /*return*/, { meta: inspected.meta, events: __spreadArray([], inspected.events, true) }];
            }
        });
    });
}
/**
 * Create the Host's shared Agent resolver and configure Agent/Session Typert lookups.
 * Live Agents are reused, ordinary cold sessions resume once per identity, and
 * subagent-owned identities retain the legacy `agent-busy` fence.
 * @param ctx - owning Host Context.
 * @param options - defaults and Agent-scope setup used only for cold resume.
 * @returns resolver shared by legacy API Proxy methods and Typert lookups.
 */
function createApiRemoteAgentResolver(ctx, options) {
    var _this = this;
    var resumes = new Map();
    var fencedLiveAgent = function (sessionId) {
        var live = ctx.agents.get(sessionId);
        if (live === undefined)
            return undefined;
        if (hasApiRemoteSubagentOwner(ctx, live.session, live)) {
            return { error: apiRemoteSubagentOwnershipError(sessionId) };
        }
        return { agent: live };
    };
    var agentFor = function (sessionId) { return __awaiter(_this, void 0, void 0, function () {
        var fenced, attached, resume, error_1, fenced_1, attached_1;
        var _a;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    fenced = fencedLiveAgent(sessionId);
                    if (fenced !== undefined)
                        return [2 /*return*/, fenced];
                    attached = ctx.sessions.get(sessionId);
                    if (attached !== undefined && hasApiRemoteSubagentOwner(ctx, attached, undefined)) {
                        return [2 /*return*/, { error: apiRemoteSubagentOwnershipError(sessionId) }];
                    }
                    resume = resumes.get(sessionId);
                    if (resume === undefined) {
                        resume = (function () { return __awaiter(_this, void 0, void 0, function () {
                            var inspected, setup, _a, publishedSession, publishedAgent, handle;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        _b.trys.push([0, , 6, 7]);
                                        return [4 /*yield*/, inspectApiRemoteSession(ctx, sessionId)];
                                    case 1:
                                        inspected = _b.sent();
                                        if (hasApiRemoteSubagentOwner(ctx, { header: inspected.meta }, undefined)) {
                                            throw new ApiRemoteSubagentSessionOwnership(sessionId);
                                        }
                                        if (!(options.setup === undefined)) return [3 /*break*/, 2];
                                        _a = undefined;
                                        return [3 /*break*/, 4];
                                    case 2: return [4 /*yield*/, options.setup(inspected)];
                                    case 3:
                                        _a = _b.sent();
                                        _b.label = 4;
                                    case 4:
                                        setup = _a;
                                        publishedSession = ctx.sessions.get(sessionId);
                                        publishedAgent = ctx.agents.get(sessionId);
                                        if (publishedSession !== undefined
                                            && hasApiRemoteSubagentOwner(ctx, publishedSession, publishedAgent)) {
                                            throw new ApiRemoteSubagentSessionOwnership(sessionId);
                                        }
                                        return [4 /*yield*/, ctx.agents.resume(__assign(__assign({ resumeSessionId: sessionId }, options.agentOptions === undefined ? {} : { agentOptions: options.agentOptions() }), setup === undefined ? {} : { setup: setup }))];
                                    case 5:
                                        handle = _b.sent();
                                        return [2 /*return*/, handle.agent];
                                    case 6:
                                        resumes.delete(sessionId);
                                        return [7 /*endfinally*/];
                                    case 7: return [2 /*return*/];
                                }
                            });
                        }); })();
                        resumes.set(sessionId, resume);
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    _a = {};
                    return [4 /*yield*/, resume];
                case 2: return [2 /*return*/, (_a.agent = _b.sent(), _a)];
                case 3:
                    error_1 = _b.sent();
                    if (error_1 instanceof ApiRemoteSessionNotFound) {
                        return [2 /*return*/, { error: { code: 'session-not-found', message: error_1.message, details: { sessionId: sessionId } } }];
                    }
                    if (error_1 instanceof ApiRemoteSubagentSessionOwnership) {
                        return [2 /*return*/, { error: apiRemoteSubagentOwnershipError(error_1.sessionId) }];
                    }
                    fenced_1 = fencedLiveAgent(sessionId);
                    if (fenced_1 !== undefined)
                        return [2 /*return*/, fenced_1];
                    attached_1 = ctx.sessions.get(sessionId);
                    if (attached_1 !== undefined && hasApiRemoteSubagentOwner(ctx, attached_1, undefined)) {
                        return [2 /*return*/, { error: apiRemoteSubagentOwnershipError(sessionId) }];
                    }
                    return [2 /*return*/, {
                            error: {
                                code: 'internal',
                                message: "resume failed for session \"".concat(sessionId, "\": ").concat(String(error_1)),
                                details: {},
                            },
                        }];
                case 4: return [2 /*return*/];
            }
        });
    }); };
    ctx.inject(['typert'], function (typeCtx) {
        var resolveAgent = function (sessionId) { return __awaiter(_this, void 0, void 0, function () {
            var found;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, agentFor(sessionId)];
                    case 1:
                        found = _a.sent();
                        if ('error' in found)
                            throw new dsh_typert_protocol_1.TypertLookupFailure(found.error);
                        return [2 /*return*/, found.agent];
                }
            });
        }); };
        typeCtx.typert.lookups.configure('agent', resolveAgent);
        typeCtx.typert.lookups.configure('session', function (sessionId) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveAgent(sessionId)];
                case 1: return [2 /*return*/, (_a.sent()).session];
            }
        }); }); });
        typeCtx.typert.contexts.configureHost('agent', function (sessionId) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveAgent(sessionId)];
                case 1: return [2 /*return*/, (_a.sent()).ctx];
            }
        }); }); });
    });
    return agentFor;
}
