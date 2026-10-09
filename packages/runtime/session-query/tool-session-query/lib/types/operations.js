"use strict";
/**
 * Tool operation orchestration over session-query service capabilities.
 *
 * @module @z/dsh-tool-session-query/operations
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
exports.operations = void 0;
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_session_query_1 = require("@z/dsh-session-query");
var input_ts_1 = require("./input.ts");
var presentation_ts_1 = require("./presentation.ts");
var service_boundary_ts_1 = require("./service-boundary.ts");
var workspace_access_ts_1 = require("./workspace-access.ts");
function executeSessionSearch(ctx, args, exec, maxResults) {
    return __awaiter(this, void 0, void 0, function () {
        var caller, cwd, query, sessionFilters, eventFilters, requestedParentIds, authorizedParentIds_1, _a, parentValues, collected, parentIds, authorizedParents, titles;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    caller = workspace_access_ts_1.workspaceAccess.callerOf(exec);
                    cwd = caller.header.cwd;
                    if (cwd === undefined) {
                        throw new dsh_llm_1.HarnessError('cross-session search is unavailable because the caller session has no workspace', 'SESSION_QUERY_TOOL_UNAUTHORIZED');
                    }
                    query = input_ts_1.toolInput.normalizeQuery(args.query);
                    sessionFilters = input_ts_1.toolInput.buildSessionFilters(args);
                    eventFilters = input_ts_1.toolInput.buildEventFilters({
                        seqFrom: args.event_seq_from,
                        seqTo: args.event_seq_to,
                        timeFrom: args.event_time_from,
                        timeTo: args.event_time_to,
                        eventTypes: args.event_types,
                        surfaces: args.event_surfaces,
                    });
                    requestedParentIds = input_ts_1.toolInput.materializeParentSessionIds(args.parent_session_ids);
                    if (!(requestedParentIds !== undefined || args.include_root_sessions === true)) return [3 /*break*/, 4];
                    if (!(requestedParentIds === undefined)) return [3 /*break*/, 1];
                    _a = new Set();
                    return [3 /*break*/, 3];
                case 1: return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.authorizeSessionIds(ctx, caller, requestedParentIds, exec.signal)];
                case 2:
                    _a = _c.sent();
                    _c.label = 3;
                case 3:
                    authorizedParentIds_1 = _a;
                    parentValues = (_b = requestedParentIds === null || requestedParentIds === void 0 ? void 0 : requestedParentIds.filter(function (id) { return authorizedParentIds_1.has(id); })) !== null && _b !== void 0 ? _b : [];
                    if (args.include_root_sessions === true)
                        parentValues.push(null);
                    if (parentValues.length === 0)
                        return [2 /*return*/, presentation_ts_1.presentation.formatEmptySessionSearch()];
                    sessionFilters.push({ kind: 'parent', values: parentValues });
                    _c.label = 4;
                case 4: return [4 /*yield*/, collectPages(maxResults, exec.signal, function (cursor) { return service_boundary_ts_1.serviceBoundary.call(ctx, exec.signal, 'session search', function () {
                        return ctx.sessionQuery.searchSessions(__assign({ query: query, sessionFilters: sessionFilters, eventFilters: eventFilters }, cursor === undefined ? {} : { cursor: cursor }), { signal: exec.signal });
                    }); }, function (hit) { return hit.header.id !== caller.id && workspace_access_ts_1.workspaceAccess.recordAuthorized(hit, caller); })];
                case 5:
                    collected = _c.sent();
                    parentIds = collected.items
                        .map(function (hit) { return hit.header.parentSession; })
                        .filter(function (id) { return id !== undefined; });
                    return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.authorizeSessionIds(ctx, caller, parentIds, exec.signal)];
                case 6:
                    authorizedParents = _c.sent();
                    return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.readTitles(ctx, caller, collected.items.map(function (hit) { return hit.header.id; }), exec.signal)];
                case 7:
                    titles = _c.sent();
                    return [2 /*return*/, presentation_ts_1.presentation.formatSessionSearch(collected, titles, authorizedParents)];
            }
        });
    });
}
function executeEventSearch(ctx, args, exec, maxResults) {
    return __awaiter(this, void 0, void 0, function () {
        var caller, sessionId, query, range, stepStart, title, filters, collected;
        var _this = this;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    caller = workspace_access_ts_1.workspaceAccess.callerOf(exec);
                    sessionId = workspace_access_ts_1.workspaceAccess.targetId(args, caller);
                    return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.authorizeTarget(ctx, caller, sessionId, exec.signal)];
                case 1:
                    _b.sent();
                    query = input_ts_1.toolInput.normalizeQuery(args.query);
                    range = input_ts_1.toolInput.sequenceRange(args.seq_from, args.seq_to);
                    if (sessionId === caller.id) {
                        stepStart = caller.events.findLast(function (event) { return event.type === 'step/start'; });
                        if (stepStart === undefined) {
                            throw new dsh_llm_1.HarnessError('current-session search requires an active step boundary', 'SESSION_QUERY_TOOL_NO_CURRENT_STEP');
                        }
                        range.to = Math.min((_a = range.to) !== null && _a !== void 0 ? _a : Number.MAX_SAFE_INTEGER, stepStart.seq - 1);
                    }
                    return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.readTitle(ctx, caller, sessionId, exec.signal)];
                case 2:
                    title = _b.sent();
                    if (range.from !== undefined && range.to !== undefined && range.from > range.to) {
                        return [2 /*return*/, presentation_ts_1.presentation.formatEventSearch(sessionId, title, { items: [], capped: false })];
                    }
                    filters = input_ts_1.toolInput.buildEventFilters({
                        seqFrom: range.from,
                        seqTo: range.to,
                        timeFrom: args.time_from,
                        timeTo: args.time_to,
                        eventTypes: args.event_types,
                        surfaces: args.surfaces,
                    });
                    return [4 /*yield*/, collectPages(maxResults, exec.signal, function (cursor) { return __awaiter(_this, void 0, void 0, function () {
                            var page;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, service_boundary_ts_1.serviceBoundary.call(ctx, exec.signal, 'event search', function () {
                                            return ctx.sessionQuery.searchEvents(__assign({ sessionId: sessionId, query: query, filters: filters }, cursor === undefined ? {} : { cursor: cursor }), { signal: exec.signal });
                                        })];
                                    case 1:
                                        page = _a.sent();
                                        return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.assertObservedTargetAuthorized(caller, sessionId, page.session)];
                                    case 2:
                                        _a.sent();
                                        return [2 /*return*/, page];
                                }
                            });
                        }); }, function () { return true; })];
                case 3:
                    collected = _b.sent();
                    return [2 /*return*/, presentation_ts_1.presentation.formatEventSearch(sessionId, title, collected)];
            }
        });
    });
}
function executeSessionTrace(ctx, args, exec) {
    return __awaiter(this, void 0, void 0, function () {
        var caller, sessionId, trace, ancestors, ancestorBoundary, _i, _a, ancestor, descendants, visibleIds, titles;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    caller = workspace_access_ts_1.workspaceAccess.callerOf(exec);
                    sessionId = workspace_access_ts_1.workspaceAccess.targetId(args, caller);
                    return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.authorizeTarget(ctx, caller, sessionId, exec.signal)];
                case 1:
                    _b.sent();
                    return [4 /*yield*/, service_boundary_ts_1.serviceBoundary.call(ctx, exec.signal, 'session lineage trace', function () {
                            return ctx.sessionQuery.traceSession(sessionId, exec.signal);
                        })];
                case 2:
                    trace = _b.sent();
                    return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.assertObservedTargetAuthorized(caller, sessionId, trace.target.header)];
                case 3:
                    _b.sent();
                    ancestors = [];
                    ancestorBoundary = false;
                    _i = 0, _a = trace.ancestors;
                    _b.label = 4;
                case 4:
                    if (!(_i < _a.length)) return [3 /*break*/, 7];
                    ancestor = _a[_i];
                    return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.recordAuthorized(ancestor, caller)];
                case 5:
                    if (!(_b.sent())) {
                        ancestorBoundary = true;
                        return [3 /*break*/, 7];
                    }
                    ancestors.push(ancestor);
                    _b.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 4];
                case 7:
                    if (ancestors.length === trace.ancestors.length && !trace.complete)
                        ancestorBoundary = true;
                    return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.authorizeDescendants(trace.descendants, caller)];
                case 8:
                    descendants = _b.sent();
                    visibleIds = __spreadArray(__spreadArray([
                        trace.target.header.id
                    ], ancestors.map(function (record) { return record.header.id; }), true), workspace_access_ts_1.workspaceAccess.descendantIds(descendants), true);
                    return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.readTitles(ctx, caller, visibleIds, exec.signal)];
                case 9:
                    titles = _b.sent();
                    return [2 /*return*/, presentation_ts_1.presentation.formatSessionTrace(trace, ancestors, ancestorBoundary, descendants, titles)];
            }
        });
    });
}
function executeEventTrace(ctx, args, exec) {
    return __awaiter(this, void 0, void 0, function () {
        var caller, sessionId, trace, title;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    input_ts_1.toolInput.assertNonNegativeSafeInteger('seq', args.seq);
                    caller = workspace_access_ts_1.workspaceAccess.callerOf(exec);
                    sessionId = workspace_access_ts_1.workspaceAccess.targetId(args, caller);
                    return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.authorizeTarget(ctx, caller, sessionId, exec.signal)];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, service_boundary_ts_1.serviceBoundary.call(ctx, exec.signal, 'event trace', function () {
                            return ctx.sessionQuery.traceEvent({ sessionId: sessionId, seq: args.seq }, exec.signal);
                        })];
                case 2:
                    trace = _a.sent();
                    return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.assertObservedTargetAuthorized(caller, sessionId, trace.session)];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.readTitle(ctx, caller, sessionId, exec.signal)];
                case 4:
                    title = _a.sent();
                    return [2 /*return*/, presentation_ts_1.presentation.formatEventTrace(sessionId, title, trace)];
            }
        });
    });
}
function executeEventRead(ctx, args, exec) {
    return __awaiter(this, void 0, void 0, function () {
        var caller, sessionId, window, title;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    input_ts_1.toolInput.assertNonNegativeSafeInteger('seq', args.seq);
                    if (args.before !== undefined)
                        input_ts_1.toolInput.assertNonNegativeSafeInteger('before', args.before);
                    if (args.after !== undefined)
                        input_ts_1.toolInput.assertNonNegativeSafeInteger('after', args.after);
                    caller = workspace_access_ts_1.workspaceAccess.callerOf(exec);
                    sessionId = workspace_access_ts_1.workspaceAccess.targetId(args, caller);
                    return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.authorizeTarget(ctx, caller, sessionId, exec.signal)];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, service_boundary_ts_1.serviceBoundary.call(ctx, exec.signal, 'event read', function () {
                            return ctx.sessionQuery.readEvent(__assign(__assign({ sessionId: sessionId, seq: args.seq }, args.before === undefined ? {} : { before: args.before }), args.after === undefined ? {} : { after: args.after }), exec.signal);
                        })];
                case 2:
                    window = _a.sent();
                    return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.assertObservedTargetAuthorized(caller, sessionId, window.session)];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, workspace_access_ts_1.workspaceAccess.readTitle(ctx, caller, sessionId, exec.signal)];
                case 4:
                    title = _a.sent();
                    return [2 /*return*/, presentation_ts_1.presentation.formatEventRead(sessionId, title, window)];
            }
        });
    });
}
function collectPages(maxResults, signal, request, accept) {
    return __awaiter(this, void 0, void 0, function () {
        var items, seen, cursor, page, _i, _a, item;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    items = [];
                    seen = new Set();
                    _b.label = 1;
                case 1:
                    if (!true) return [3 /*break*/, 7];
                    signal.throwIfAborted();
                    return [4 /*yield*/, request(cursor)];
                case 2:
                    page = _b.sent();
                    signal.throwIfAborted();
                    _i = 0, _a = page.items;
                    _b.label = 3;
                case 3:
                    if (!(_i < _a.length)) return [3 /*break*/, 6];
                    item = _a[_i];
                    return [4 /*yield*/, accept(item)];
                case 4:
                    if (!(_b.sent()))
                        return [3 /*break*/, 5];
                    if (items.length === maxResults) {
                        return [2 /*return*/, { items: items, capped: true }];
                    }
                    items.push(item);
                    _b.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6:
                    if (page.nextCursor === undefined)
                        return [2 /*return*/, { items: items, capped: false }];
                    if (seen.has(page.nextCursor)) {
                        throw new dsh_session_query_1.SessionQueryError('session-search provider repeated a continuation cursor', 'SESSION_QUERY_INVALID_CURSOR');
                    }
                    seen.add(page.nextCursor);
                    cursor = page.nextCursor;
                    return [3 /*break*/, 1];
                case 7: return [2 /*return*/];
            }
        });
    });
}
/** Five model-facing session-query operation implementations. */
exports.operations = {
    executeSessionSearch: executeSessionSearch,
    executeEventSearch: executeEventSearch,
    executeSessionTrace: executeSessionTrace,
    executeEventTrace: executeEventTrace,
    executeEventRead: executeEventRead,
};
