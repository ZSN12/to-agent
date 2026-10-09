"use strict";
/**
 * Caller identity, workspace authorization, and visible lineage projection.
 *
 * @module @z/dsh-tool-session-query/workspace-access
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
exports.workspaceAccess = void 0;
var dsh_llm_1 = require("@z/dsh-llm");
var node_child_process_1 = require("node:child_process");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var dsh_session_1 = require("@z/dsh-session");
var service_boundary_ts_1 = require("./service-boundary.ts");
function callerOf(exec) {
    var agent = exec.agent;
    if (agent === undefined) {
        throw new dsh_llm_1.HarnessError('session query tools require an agent-bound caller', 'SESSION_QUERY_TOOL_MISSING_AGENT');
    }
    var identities = new Map();
    return {
        id: agent.session.id,
        header: agent.session.header,
        events: agent.session.events,
        repositoryIdentity: function (cwd) {
            var pending = identities.get(cwd);
            if (pending === undefined) {
                pending = resolveRepositoryIdentity(cwd);
                identities.set(cwd, pending);
            }
            return pending;
        },
    };
}
function targetId(args, caller) {
    return args.session_id === undefined ? caller.id : (0, dsh_session_1.SessionId)(args.session_id);
}
function authorizeTarget(ctx, caller, target, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var records, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (target === caller.id)
                        return [2 /*return*/];
                    return [4 /*yield*/, service_boundary_ts_1.serviceBoundary.call(ctx, signal, 'target authorization', function () {
                            return ctx.sessionQuery.filterSessions([{ kind: 'id', values: [target] }], signal);
                        })];
                case 1:
                    records = _b.sent();
                    _a = records.length !== 1;
                    if (_a) return [3 /*break*/, 3];
                    return [4 /*yield*/, recordAuthorized(records[0], caller)];
                case 2:
                    _a = !(_b.sent());
                    _b.label = 3;
                case 3:
                    if (_a) {
                        throw service_boundary_ts_1.serviceBoundary.unauthorizedTarget();
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function recordAuthorized(record, caller) {
    return headerAuthorized(record.header, caller);
}
function headerAuthorized(header, caller) {
    return __awaiter(this, void 0, void 0, function () {
        var callerCwd, targetCwd, _a, callerRoot, targetRoot;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    callerCwd = caller.header.cwd;
                    targetCwd = header.cwd;
                    // A session cannot become a different workspace merely by reusing its id.
                    if (header.id === caller.id)
                        return [2 /*return*/, targetCwd === callerCwd];
                    if (callerCwd === undefined || targetCwd === undefined)
                        return [2 /*return*/, false];
                    if (targetCwd === callerCwd)
                        return [2 /*return*/, true];
                    return [4 /*yield*/, Promise.all([
                            caller.repositoryIdentity(callerCwd),
                            caller.repositoryIdentity(targetCwd),
                        ])];
                case 1:
                    _a = _b.sent(), callerRoot = _a[0], targetRoot = _a[1];
                    return [2 /*return*/, callerRoot !== null && callerRoot === targetRoot];
            }
        });
    });
}
function assertObservedTargetAuthorized(caller, target, observed) {
    var _this = this;
    return (function () { return __awaiter(_this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = observed.id !== target;
                    if (_a) return [3 /*break*/, 2];
                    return [4 /*yield*/, headerAuthorized(observed, caller)];
                case 1:
                    _a = !(_b.sent());
                    _b.label = 2;
                case 2:
                    if (_a) {
                        throw service_boundary_ts_1.serviceBoundary.unauthorizedTarget();
                    }
                    return [2 /*return*/];
            }
        });
    }); })();
}
function authorizeSessionIds(ctx, caller, ids, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var unique, authorized, other, records, requested, _i, records_1, record, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    unique = __spreadArray([], new Set(ids), true);
                    authorized = new Set();
                    if (unique.includes(caller.id))
                        authorized.add(caller.id);
                    other = unique.filter(function (id) { return id !== caller.id; });
                    if (other.length === 0)
                        return [2 /*return*/, authorized];
                    return [4 /*yield*/, service_boundary_ts_1.serviceBoundary.call(ctx, signal, 'session-id authorization', function () {
                            return ctx.sessionQuery.filterSessions([{ kind: 'id', values: other }], signal);
                        })];
                case 1:
                    records = _b.sent();
                    requested = new Set(other);
                    _i = 0, records_1 = records;
                    _b.label = 2;
                case 2:
                    if (!(_i < records_1.length)) return [3 /*break*/, 6];
                    record = records_1[_i];
                    _a = requested.has(record.header.id);
                    if (!_a) return [3 /*break*/, 4];
                    return [4 /*yield*/, recordAuthorized(record, caller)];
                case 3:
                    _a = (_b.sent());
                    _b.label = 4;
                case 4:
                    if (_a) {
                        authorized.add(record.header.id);
                    }
                    _b.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 2];
                case 6: return [2 /*return*/, authorized];
            }
        });
    });
}
function resolveRepositoryIdentity(cwd) {
    return __awaiter(this, void 0, void 0, function () {
        var physicalCwd, _a, commonDirectory, physicalCommonDirectory, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, promises_1.realpath)(cwd)];
                case 1:
                    physicalCwd = _c.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _a = _c.sent();
                    physicalCwd = node_path_1.default.resolve(cwd);
                    return [3 /*break*/, 3];
                case 3: return [4 /*yield*/, readGitCommonDirectory(cwd)];
                case 4:
                    commonDirectory = _c.sent();
                    if (commonDirectory === null)
                        return [2 /*return*/, "directory:".concat(physicalCwd)];
                    _c.label = 5;
                case 5:
                    _c.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, (0, promises_1.realpath)(node_path_1.default.resolve(cwd, commonDirectory))];
                case 6:
                    physicalCommonDirectory = _c.sent();
                    return [3 /*break*/, 8];
                case 7:
                    _b = _c.sent();
                    physicalCommonDirectory = node_path_1.default.resolve(cwd, commonDirectory);
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/, "git:".concat(physicalCommonDirectory)];
            }
        });
    });
}
function readGitCommonDirectory(cwd) {
    return new Promise(function (resolve) {
        (0, node_child_process_1.execFile)('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: cwd, timeout: 1500, windowsHide: true, encoding: 'utf8' }, function (error, stdout) {
            var value = typeof stdout === 'string' ? stdout.trim() : '';
            resolve(error === null && value.length > 0 ? value : null);
        });
    });
}
function readTitles(ctx, caller, ids, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var result, observations, _i, observations_1, observation;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    result = new Map();
                    return [4 /*yield*/, service_boundary_ts_1.serviceBoundary.call(ctx, signal, 'title observation', function () {
                            return ctx.sessionQuery.readTitleSnapshots(ids, signal);
                        })];
                case 1:
                    observations = _c.sent();
                    _i = 0, observations_1 = observations;
                    _c.label = 2;
                case 2:
                    if (!(_i < observations_1.length)) return [3 /*break*/, 5];
                    observation = observations_1[_i];
                    if (observation.status === 'rejected') {
                        result.set(observation.sessionId, unavailableTitle(ctx, observation.reason));
                        return [3 /*break*/, 4];
                    }
                    return [4 /*yield*/, assertObservedTargetAuthorized(caller, observation.sessionId, observation.value.session)];
                case 3:
                    _c.sent();
                    result.set(observation.sessionId, { text: (_b = (_a = observation.value.title) === null || _a === void 0 ? void 0 : _a.title) !== null && _b !== void 0 ? _b : 'untitled' });
                    _c.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, result];
            }
        });
    });
}
function readTitle(ctx, caller, id, signal) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, readTitles(ctx, caller, [id], signal)];
                case 1: return [2 /*return*/, (_a.sent()).get(id)];
            }
        });
    });
}
function unavailableTitle(ctx, error) {
    var sanitized = service_boundary_ts_1.serviceBoundary.sanitizeError(ctx, 'title observation item', error);
    if (sanitized.code === 'SESSION_QUERY_TOOL_UNAUTHORIZED')
        throw sanitized;
    return { text: 'untitled', unavailableCode: sanitized.code };
}
function authorizeDescendants(nodes, caller) {
    return __awaiter(this, void 0, void 0, function () {
        var result, pending, _i, _a, node, current, projected, _b, _c, child;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    result = [];
                    for (_i = 0, _a = __spreadArray([], nodes, true).reverse(); _i < _a.length; _i++) {
                        node = _a[_i];
                        pending = { node: node, target: result, next: pending };
                    }
                    _d.label = 1;
                case 1:
                    if (!(pending !== undefined)) return [3 /*break*/, 3];
                    current = pending;
                    pending = current.next;
                    return [4 /*yield*/, recordAuthorized(current.node.session, caller)];
                case 2:
                    if (!(_d.sent())) {
                        current.target.push(null);
                        return [3 /*break*/, 1];
                    }
                    projected = {
                        record: current.node.session,
                        descendants: [],
                    };
                    current.target.push(projected);
                    for (_b = 0, _c = __spreadArray([], current.node.descendants, true).reverse(); _b < _c.length; _b++) {
                        child = _c[_b];
                        pending = {
                            node: child,
                            target: projected.descendants,
                            next: pending,
                        };
                    }
                    return [3 /*break*/, 1];
                case 3: return [2 /*return*/, result];
            }
        });
    });
}
function visitDescendants(nodes) {
    var pending, _i, _a, node, current, _b, _c, child;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                for (_i = 0, _a = __spreadArray([], nodes, true).reverse(); _i < _a.length; _i++) {
                    node = _a[_i];
                    pending = { node: node, depth: 0, next: pending };
                }
                _d.label = 1;
            case 1:
                if (!(pending !== undefined)) return [3 /*break*/, 3];
                current = pending;
                pending = current.next;
                return [4 /*yield*/, current];
            case 2:
                _d.sent();
                if (current.node === null)
                    return [3 /*break*/, 1];
                for (_b = 0, _c = __spreadArray([], current.node.descendants, true).reverse(); _b < _c.length; _b++) {
                    child = _c[_b];
                    pending = {
                        node: child,
                        depth: current.depth + 1,
                        next: pending,
                    };
                }
                return [3 /*break*/, 1];
            case 3: return [2 /*return*/];
        }
    });
}
function descendantIds(nodes) {
    var ids = [];
    for (var _i = 0, _a = visitDescendants(nodes); _i < _a.length; _i++) {
        var node = _a[_i].node;
        if (node !== null)
            ids.push(node.record.header.id);
    }
    return ids;
}
function titleText(view) {
    return view.unavailableCode === undefined
        ? view.text
        : "".concat(view.text, " (title unavailable: ").concat(view.unavailableCode, ")");
}
/** Workspace-scoped caller authorization, title access, and lineage projection. */
exports.workspaceAccess = {
    callerOf: callerOf,
    targetId: targetId,
    authorizeTarget: authorizeTarget,
    recordAuthorized: recordAuthorized,
    assertObservedTargetAuthorized: assertObservedTargetAuthorized,
    authorizeSessionIds: authorizeSessionIds,
    readTitles: readTitles,
    readTitle: readTitle,
    authorizeDescendants: authorizeDescendants,
    visitDescendants: visitDescendants,
    descendantIds: descendantIds,
    titleText: titleText,
};
