"use strict";
/**
 * Workspace entity registry (`ctx.workspaceRegistry`): durable workspace records,
 * stable registry order, and header-validated session membership over the
 * domain data form.
 * @module @z/dsh-workspace
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
exports.WorkspaceRegistry = exports.WorkspaceOrderInvalidError = exports.WorkspaceUnknownSessionError = exports.realpathNormalize = exports.workspaceDomainSpec = exports.workspaceRecord = exports.workspaceDomainState = exports.WorkspaceMoveInvalidError = void 0;
exports.WorkspaceId = WorkspaceId;
var node_crypto_1 = require("node:crypto");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var cordis_1 = require("@z/cordis");
var entity_ts_1 = require("./entity.ts");
var entity_ts_2 = require("./entity.ts");
Object.defineProperty(exports, "WorkspaceMoveInvalidError", { enumerable: true, get: function () { return entity_ts_2.WorkspaceMoveInvalidError; } });
var paths_ts_1 = require("./paths.ts");
var spec_ts_1 = require("./spec.ts");
var spec_ts_2 = require("./spec.ts");
Object.defineProperty(exports, "workspaceDomainState", { enumerable: true, get: function () { return spec_ts_2.workspaceDomainState; } });
Object.defineProperty(exports, "workspaceRecord", { enumerable: true, get: function () { return spec_ts_2.workspaceRecord; } });
Object.defineProperty(exports, "workspaceDomainSpec", { enumerable: true, get: function () { return spec_ts_2.workspaceDomainSpec; } });
var paths_ts_2 = require("./paths.ts");
Object.defineProperty(exports, "realpathNormalize", { enumerable: true, get: function () { return paths_ts_2.realpathNormalize; } });
/**
 * Brand a string as a {@link WorkspaceId}.
 * @param id - Raw workspace id string.
 * @returns the same string, branded at compile time.
 */
function WorkspaceId(id) {
    return id;
}
/**
 * An archiveSession request named a session neither live nor in session
 * persistence — a definite miss only; storage faults propagate as themselves.
 */
var WorkspaceUnknownSessionError = /** @class */ (function (_super) {
    __extends(WorkspaceUnknownSessionError, _super);
    /**
     * @param sessionId - The unknown session id.
     */
    function WorkspaceUnknownSessionError(sessionId) {
        var _this = _super.call(this, "cannot archive session '".concat(sessionId, "': live sessions and session persistence hold no such session")) || this;
        _this.sessionId = sessionId;
        _this.name = 'WorkspaceUnknownSessionError';
        return _this;
    }
    return WorkspaceUnknownSessionError;
}(Error));
exports.WorkspaceUnknownSessionError = WorkspaceUnknownSessionError;
/** A workspace reorder named a source or anchor absent from the durable registry order. */
var WorkspaceOrderInvalidError = /** @class */ (function (_super) {
    __extends(WorkspaceOrderInvalidError, _super);
    /**
     * @param workspaceId - Missing source or anchor id.
     */
    function WorkspaceOrderInvalidError(workspaceId) {
        var _this = _super.call(this, "cannot reorder unknown workspace '".concat(workspaceId, "'")) || this;
        _this.workspaceId = workspaceId;
        _this.name = 'WorkspaceOrderInvalidError';
        return _this;
    }
    return WorkspaceOrderInvalidError;
}(Error));
exports.WorkspaceOrderInvalidError = WorkspaceOrderInvalidError;
var sameIds = function (left, right) {
    return left.length === right.length && left.every(function (id, index) { return id === right[index]; });
};
var compareHeaders = function (left, right) {
    return right.createdAt - left.createdAt || String(left.id).localeCompare(String(right.id));
};
/**
 * Durable workspace registry. Startup waits for `sessionPersistence`, builds
 * one canonical-cwd header index, and completes the one-time history
 * bootstrap before the service becomes active. The persistence dependency is
 * mandatory so an unavailable peer can never be mistaken for an empty
 * history and commit the initialized marker.
 */
var WorkspaceRegistry = /** @class */ (function (_super) {
    __extends(WorkspaceRegistry, _super);
    function WorkspaceRegistry(ctx) {
        var _this = _super.call(this, ctx, 'workspaceRegistry') || this;
        _this.entities = new Map();
        _this.headers = new Map();
        _this.sessionPaths = new Map();
        _this.invalidSessionPaths = new Map();
        _this.operationTail = Promise.resolve();
        _this.host = {
            table: function () { return _this.requireTable(); },
            sessionPath: function (id) { return _this.sessionPaths.get(id); },
            readSessionHeader: function (id) { return _this.readSessionHeader(id); },
            rememberSessionPath: function (id, path) {
                _this.sessionPaths.set(id, path);
                _this.invalidSessionPaths.delete(id);
            },
        };
        return _this;
    }
    /** Open the domain, finish bootstrap when required, and rebuild the ordered cache. */
    WorkspaceRegistry.prototype[cordis_1.Service.init] = function () {
        return __awaiter(this, void 0, void 0, function () {
            var domain, headers;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ctx.storageDomain.open(spec_ts_1.workspaceDomainSpec)];
                    case 1:
                        domain = _a.sent();
                        this.ctx.effect(function () { return function () { return domain.close(); }; }, 'workspace.domainClose');
                        this.table = domain.table('workspaces');
                        this.global = domain.global;
                        this.state = domain.global.get();
                        return [4 /*yield*/, this.recoverPendingMutation()];
                    case 2:
                        _a.sent();
                        this.validateStoredState(this.state);
                        return [4 /*yield*/, this.ctx.sessionPersistence.list()];
                    case 3:
                        headers = _a.sent();
                        if (!!this.state.initialized) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.replaceHeaderIndex(headers)];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, this.bootstrap(headers)];
                    case 5:
                        _a.sent();
                        return [3 /*break*/, 8];
                    case 6: return [4 /*yield*/, this.replaceHeaderIndex(headers)];
                    case 7:
                        _a.sent();
                        _a.label = 8;
                    case 8: return [4 /*yield*/, this.indexLiveSessions()];
                    case 9:
                        _a.sent();
                        this.validateStoredState(this.requireState());
                        this.rebuildEntities();
                        this.reportFilteredCandidates();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Create or reuse a workspace for an existing directory. The path is
     * canonicalized through `fs.realpath`; a nonexistent path rejects with the
     * original error and a non-directory rejects. Repeated calls for the same
     * canonical path return the existing entity without changing its title.
     * A newly created workspace is prepended to the durable registry order.
     * Different canonical paths may share a display title.
     * @param path - Existing directory to own, in any path spelling.
     * @param title - Display title used only when a new record is created.
     * @returns the existing or newly durable workspace.
     */
    // TODO: `title` lost its last production caller when the gateway's
    // create-by-name branch was deleted
    // (.agents/notes/implemented/simplification/2026-07-31-one-route-to-add-a-workspace.md);
    // drop the parameter with its @param clause and the `create(path, title?)`
    // lines in this package's README pair.
    WorkspaceRegistry.prototype.create = function (path, title) {
        return __awaiter(this, void 0, void 0, function () {
            var canonical;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, paths_ts_1.realpathNormalize)(path)];
                    case 1:
                        canonical = _a.sent();
                        return [4 /*yield*/, (0, promises_1.stat)(canonical)];
                    case 2:
                        if (!(_a.sent()).isDirectory()) {
                            throw new Error("cannot create a workspace at '".concat(canonical, "': path is not a directory"));
                        }
                        return [4 /*yield*/, this.enqueueOperation(function () { return _this.createCanonical(canonical, title); })];
                    case 3: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Look up a workspace by id.
     * @param id - Workspace id.
     * @returns the workspace, or `undefined` when unknown.
     */
    WorkspaceRegistry.prototype.get = function (id) {
        return this.entities.get(id);
    };
    /**
     * Synchronous workspace projection in durable registry order. Every
     * entity's `sessionIds` getter is already filtered by the startup/live
     * canonical-cwd header index; this method performs no persistence reads.
     * @returns a fresh ordered array of workspace entities.
     */
    WorkspaceRegistry.prototype.list = function () {
        var _this = this;
        return this.requireState().workspaceIds.map(function (id) {
            var entity = _this.entities.get(id);
            if (entity === undefined) {
                throw new Error("workspace registry order references missing workspace '".concat(id, "'"));
            }
            return entity;
        });
    };
    /**
     * Delete one workspace registration while retaining its directory and every
     * session log. The durable order is updated before the table deletion; a
     * failed table write restores the prior order and keeps the entity
     * published. Unknown ids are an idempotent no-op for domain callers.
     * @param id - Workspace registration to remove.
     * @returns `true` when a record was deleted, `false` when it was unknown.
     */
    WorkspaceRegistry.prototype.delete = function (id) {
        var _this = this;
        return this.enqueueOperation(function () { return _this.deleteKnown(id); });
    };
    /**
     * Move one workspace within the durable display order, DOM-insertBefore-like.
     * With an anchor it lands before that workspace; without one it appends.
     * @param id - Workspace to move.
     * @param beforeId - Workspace anchor; omitted appends.
     * @returns the complete committed workspace order.
     */
    WorkspaceRegistry.prototype.insertBefore = function (id, beforeId) {
        var _this = this;
        return this.enqueueOperation(function () { return __awaiter(_this, void 0, void 0, function () {
            var state, without, at, workspaceIds;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        state = this.requireState();
                        if (!state.workspaceIds.includes(id))
                            throw new WorkspaceOrderInvalidError(id);
                        if (beforeId !== undefined && !state.workspaceIds.includes(beforeId)) {
                            throw new WorkspaceOrderInvalidError(beforeId);
                        }
                        if (beforeId === id)
                            return [2 /*return*/, state.workspaceIds];
                        without = state.workspaceIds.filter(function (workspaceId) { return workspaceId !== id; });
                        at = beforeId === undefined ? without.length : without.indexOf(beforeId);
                        workspaceIds = __spreadArray(__spreadArray(__spreadArray([], without.slice(0, at), true), [id], false), without.slice(at), true);
                        if (sameIds(workspaceIds, state.workspaceIds))
                            return [2 /*return*/, state.workspaceIds];
                        return [4 /*yield*/, this.setState(__assign(__assign({}, state), { workspaceIds: workspaceIds }))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, workspaceIds];
                }
            });
        }); });
    };
    Object.defineProperty(WorkspaceRegistry.prototype, "archivedSessionIds", {
        /**
         * The registry-global archive set: sessions hidden from every grouping
         * surface. Archiving never touches workspace accounting — an archived
         * session keeps its `sessionIds` slot so unarchiving restores its position.
         * @returns the archived session ids in archive order.
         */
        get: function () {
            return this.requireState().archivedSessionIds;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Archive one session durably. The session must exist (live or in session
     * persistence); its workspace accounting — or lack of one — is irrelevant.
     * An already archived id resolves without writing.
     * @param sessionId - The session to archive.
     * @returns resolution after durability.
     */
    WorkspaceRegistry.prototype.archiveSession = function (sessionId) {
        var _this = this;
        return this.enqueueOperation(function () { return __awaiter(_this, void 0, void 0, function () {
            var state;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // The chain slot serializes against every other registry write, so this
                        // check-then-write pair cannot interleave with another archive.
                        if (this.requireState().archivedSessionIds.includes(sessionId))
                            return [2 /*return*/];
                        return [4 /*yield*/, this.sessionKnown(sessionId)];
                    case 1:
                        if (!(_a.sent())) {
                            throw new WorkspaceUnknownSessionError(sessionId);
                        }
                        state = this.requireState();
                        return [4 /*yield*/, this.setState(__assign(__assign({}, state), { archivedSessionIds: __spreadArray(__spreadArray([], state.archivedSessionIds, true), [sessionId], false) }))];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    };
    /**
     * Whether a session is live, header-indexed, or present in a fresh
     * persistence listing. Only a definite miss returns false — a failing
     * `sessionPersistence.list()` propagates so storage faults never
     * masquerade as an unknown session.
     */
    WorkspaceRegistry.prototype.sessionKnown = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (((_b = this.ctx.get('sessions')) === null || _b === void 0 ? void 0 : _b.get(id)) !== undefined)
                            return [2 /*return*/, true];
                        if (this.headers.has(id))
                            return [2 /*return*/, true];
                        _a = this.indexHeaders;
                        return [4 /*yield*/, this.ctx.sessionPersistence.list()];
                    case 1: return [4 /*yield*/, _a.apply(this, [_c.sent()])];
                    case 2:
                        _c.sent();
                        return [2 /*return*/, this.headers.has(id)];
                }
            });
        });
    };
    /**
     * Resolve by canonical directory path without creating or mutating a
     * workspace. A missing path rejects during `realpath`; an existing unowned
     * directory returns `undefined`.
     * @param path - Existing directory path in any spelling.
     * @returns the workspace owning the canonical path, when one exists.
     */
    WorkspaceRegistry.prototype.resolveByPath = function (path) {
        return __awaiter(this, void 0, void 0, function () {
            var canonical, _i, _a, entity;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, (0, paths_ts_1.realpathNormalize)(path)];
                    case 1:
                        canonical = _b.sent();
                        for (_i = 0, _a = this.entities.values(); _i < _a.length; _i++) {
                            entity = _a[_i];
                            if (entity.path === canonical)
                                return [2 /*return*/, entity];
                        }
                        return [2 /*return*/, undefined];
                }
            });
        });
    };
    WorkspaceRegistry.prototype.createCanonical = function (canonical, title) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, entity_1, workspaceName, table, state, id, now, record, entity, pendingState, error_1, error_2, rollbackError_1, error_3, rollbackError_2, rollbackError_3;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        for (_i = 0, _a = this.entities.values(); _i < _a.length; _i++) {
                            entity_1 = _a[_i];
                            if (entity_1.path === canonical)
                                return [2 /*return*/, entity_1];
                        }
                        workspaceName = title !== null && title !== void 0 ? title : (0, node_path_1.basename)(canonical);
                        table = this.requireTable();
                        state = this.requireState();
                        id = WorkspaceId((0, node_crypto_1.randomUUID)());
                        now = new Date().toISOString();
                        record = {
                            path: canonical,
                            title: workspaceName,
                            sessionIds: [],
                            createdAt: now,
                            updatedAt: now,
                        };
                        entity = new entity_ts_1.WorkspaceEntity(this.host, id, record);
                        this.entities.set(id, entity);
                        pendingState = __assign(__assign({}, state), { pendingMutation: { operation: 'create', workspaceId: id } });
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.setState(pendingState)];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _b.sent();
                        this.entities.delete(id);
                        throw error_1;
                    case 4:
                        _b.trys.push([4, 6, , 11]);
                        return [4 /*yield*/, table.put(id, record)];
                    case 5:
                        _b.sent();
                        return [3 /*break*/, 11];
                    case 6:
                        error_2 = _b.sent();
                        this.entities.delete(id);
                        _b.label = 7;
                    case 7:
                        _b.trys.push([7, 9, , 10]);
                        return [4 /*yield*/, this.setState(state)];
                    case 8:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 9:
                        rollbackError_1 = _b.sent();
                        throw new AggregateError([error_2, rollbackError_1], "workspace '".concat(id, "' record write and pending-marker rollback both failed"));
                    case 10: throw error_2;
                    case 11:
                        _b.trys.push([11, 13, , 21]);
                        return [4 /*yield*/, this.setState({
                                initialized: true,
                                workspaceIds: __spreadArray([id], state.workspaceIds, true),
                                archivedSessionIds: state.archivedSessionIds,
                            })];
                    case 12:
                        _b.sent();
                        return [3 /*break*/, 21];
                    case 13:
                        error_3 = _b.sent();
                        this.entities.delete(id);
                        _b.label = 14;
                    case 14:
                        _b.trys.push([14, 16, , 17]);
                        return [4 /*yield*/, table.delete(id)];
                    case 15:
                        _b.sent();
                        return [3 /*break*/, 17];
                    case 16:
                        rollbackError_2 = _b.sent();
                        throw new AggregateError([error_3, rollbackError_2], "workspace '".concat(id, "' order write and record rollback both failed; the pending marker remains recoverable"));
                    case 17:
                        _b.trys.push([17, 19, , 20]);
                        return [4 /*yield*/, this.setState(state)];
                    case 18:
                        _b.sent();
                        return [3 /*break*/, 20];
                    case 19:
                        rollbackError_3 = _b.sent();
                        throw new AggregateError([error_3, rollbackError_3], "workspace '".concat(id, "' order write and pending-marker rollback both failed"));
                    case 20: throw error_3;
                    case 21: return [2 /*return*/, entity];
                }
            });
        });
    };
    WorkspaceRegistry.prototype.deleteKnown = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var entity, state, nextState, error_4, rollbackError_4, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        entity = this.entities.get(id);
                        if (entity === undefined)
                            return [2 /*return*/, false];
                        state = this.requireState();
                        nextState = {
                            initialized: true,
                            workspaceIds: state.workspaceIds.filter(function (workspaceId) { return workspaceId !== id; }),
                            archivedSessionIds: state.archivedSessionIds,
                        };
                        return [4 /*yield*/, this.setState(__assign(__assign({}, nextState), { pendingMutation: { operation: 'delete', workspaceId: id } }))];
                    case 1:
                        _a.sent();
                        this.entities.delete(id);
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 9]);
                        return [4 /*yield*/, this.requireTable().delete(id)];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 9];
                    case 4:
                        error_4 = _a.sent();
                        this.entities.set(id, entity);
                        _a.label = 5;
                    case 5:
                        _a.trys.push([5, 7, , 8]);
                        return [4 /*yield*/, this.setState(state)];
                    case 6:
                        _a.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        rollbackError_4 = _a.sent();
                        // The durable marker still says to finish deletion, so the cache must
                        // agree with that recoverable direction rather than republish a row
                        // absent from the persisted order.
                        this.entities.delete(id);
                        throw new AggregateError([error_4, rollbackError_4], "workspace '".concat(id, "' record deletion and registry-order rollback both failed"));
                    case 8: throw error_4;
                    case 9:
                        _a.trys.push([9, 11, , 12]);
                        return [4 /*yield*/, this.setState(nextState)];
                    case 10:
                        _a.sent();
                        return [3 /*break*/, 12];
                    case 11:
                        error_5 = _a.sent();
                        // The deletion committed at the table write and was already published
                        // to Host streams. Keep the durable marker for startup recovery rather
                        // than reporting failure after the requested state became true.
                        this.ctx.logger.warn("workspace '".concat(id, "' was deleted but its pending marker could not be cleared: ").concat(String(error_5)));
                        return [3 /*break*/, 12];
                    case 12: return [2 /*return*/, true];
                }
            });
        });
    };
    /**
     * Complete the one mutation explicitly named by durable state. Unexplained
     * order/table divergence still reaches {@link validateStoredState} and
     * fails loud; this path never guesses which operation created a row from its shape alone.
     */
    WorkspaceRegistry.prototype.recoverPendingMutation = function () {
        return __awaiter(this, void 0, void 0, function () {
            var state, pending;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        state = this.requireState();
                        pending = state.pendingMutation;
                        if (pending === undefined)
                            return [2 /*return*/];
                        if (state.workspaceIds.includes(pending.workspaceId)) {
                            throw new Error("workspace domain is inconsistent: pending ".concat(pending.operation, " workspace ")
                                + "'".concat(pending.workspaceId, "' is still present in registry order"));
                        }
                        return [4 /*yield*/, this.requireTable().delete(pending.workspaceId)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.setState({
                                initialized: state.initialized,
                                workspaceIds: state.workspaceIds,
                                archivedSessionIds: state.archivedSessionIds,
                            })];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    WorkspaceRegistry.prototype.bootstrap = function (headers) {
        return __awaiter(this, void 0, void 0, function () {
            var table, state, groupsByPath, _i, headers_1, header, path, group, groups, byPath, accounted, _a, _b, _c, id, record, _d, _e, sessionId, _loop_1, _f, groups_1, group, groupRank, priorRank, workspaceIds;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        table = this.requireTable();
                        state = this.requireState();
                        groupsByPath = new Map();
                        for (_i = 0, headers_1 = headers; _i < headers_1.length; _i++) {
                            header = headers_1[_i];
                            path = this.sessionPaths.get(header.id);
                            if (path === undefined)
                                continue;
                            group = groupsByPath.get(path);
                            if (group === undefined)
                                groupsByPath.set(path, [header]);
                            else
                                group.push(header);
                        }
                        groups = __spreadArray([], groupsByPath, true).map(function (_a) {
                            var path = _a[0], groupHeaders = _a[1];
                            groupHeaders.sort(compareHeaders);
                            var newest = groupHeaders[0];
                            return { path: path, headers: groupHeaders, newestAt: newest.createdAt };
                        }).sort(function (left, right) {
                            return right.newestAt - left.newestAt || left.path.localeCompare(right.path);
                        });
                        byPath = new Map();
                        accounted = new Map();
                        for (_a = 0, _b = table.entries(); _a < _b.length; _a++) {
                            _c = _b[_a], id = _c[0], record = _c[1];
                            byPath.set(record.path, id);
                            for (_d = 0, _e = record.sessionIds; _d < _e.length; _d++) {
                                sessionId = _e[_d];
                                accounted.set(sessionId, id);
                            }
                        }
                        _loop_1 = function (group) {
                            var id, sessionIds_2, createdAt, record, _h, sessionIds_1, sessionId, current, historical, historicalSet, sessionIds, _j, historical_1, sessionId;
                            return __generator(this, function (_k) {
                                switch (_k.label) {
                                    case 0:
                                        id = byPath.get(group.path);
                                        if (!(id === undefined)) return [3 /*break*/, 2];
                                        sessionIds_2 = group.headers
                                            .map(function (header) { return header.id; })
                                            .filter(function (sessionId) { return !accounted.has(sessionId); });
                                        if (sessionIds_2.length === 0)
                                            return [2 /*return*/, "continue"];
                                        id = WorkspaceId((0, node_crypto_1.randomUUID)());
                                        createdAt = new Date(group.newestAt).toISOString();
                                        record = {
                                            path: group.path,
                                            title: (0, node_path_1.basename)(group.path),
                                            sessionIds: sessionIds_2,
                                            createdAt: createdAt,
                                            updatedAt: createdAt,
                                        };
                                        return [4 /*yield*/, table.put(id, record)];
                                    case 1:
                                        _k.sent();
                                        byPath.set(group.path, id);
                                        for (_h = 0, sessionIds_1 = sessionIds_2; _h < sessionIds_1.length; _h++) {
                                            sessionId = sessionIds_1[_h];
                                            accounted.set(sessionId, id);
                                        }
                                        return [2 /*return*/, "continue"];
                                    case 2:
                                        current = table.get(id);
                                        historical = group.headers
                                            .map(function (header) { return header.id; })
                                            .filter(function (sessionId) { return accounted.get(sessionId) === undefined || accounted.get(sessionId) === id; });
                                        historicalSet = new Set(historical);
                                        sessionIds = __spreadArray(__spreadArray([], historical, true), current.sessionIds.filter(function (sessionId) { return !historicalSet.has(sessionId); }), true);
                                        if (sameSessionIds(current.sessionIds, sessionIds))
                                            return [2 /*return*/, "continue"];
                                        return [4 /*yield*/, table.update(id, function (record) { return (__assign(__assign({}, record), { sessionIds: sessionIds, updatedAt: new Date().toISOString() })); })];
                                    case 3:
                                        _k.sent();
                                        for (_j = 0, historical_1 = historical; _j < historical_1.length; _j++) {
                                            sessionId = historical_1[_j];
                                            accounted.set(sessionId, id);
                                        }
                                        return [2 /*return*/];
                                }
                            });
                        };
                        _f = 0, groups_1 = groups;
                        _g.label = 1;
                    case 1:
                        if (!(_f < groups_1.length)) return [3 /*break*/, 4];
                        group = groups_1[_f];
                        return [5 /*yield**/, _loop_1(group)];
                    case 2:
                        _g.sent();
                        _g.label = 3;
                    case 3:
                        _f++;
                        return [3 /*break*/, 1];
                    case 4:
                        groupRank = new Map(groups.map(function (group) { return [group.path, group.newestAt]; }));
                        priorRank = new Map(state.workspaceIds.map(function (id, index) { return [id, index]; }));
                        workspaceIds = __spreadArray([], table.entries(), true).sort(function (_a, _b) {
                            var _c, _d, _e, _f;
                            var leftId = _a[0], left = _a[1];
                            var rightId = _b[0], right = _b[1];
                            var leftTime = (_c = groupRank.get(left.path)) !== null && _c !== void 0 ? _c : Date.parse(left.createdAt);
                            var rightTime = (_d = groupRank.get(right.path)) !== null && _d !== void 0 ? _d : Date.parse(right.createdAt);
                            return rightTime - leftTime
                                || ((_e = priorRank.get(leftId)) !== null && _e !== void 0 ? _e : Number.MAX_SAFE_INTEGER)
                                    - ((_f = priorRank.get(rightId)) !== null && _f !== void 0 ? _f : Number.MAX_SAFE_INTEGER)
                                || String(leftId).localeCompare(String(rightId));
                        })
                            .map(function (_a) {
                            var id = _a[0];
                            return id;
                        });
                        if (!!sameIds(state.workspaceIds, workspaceIds)) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.setState({ initialized: false, workspaceIds: workspaceIds, archivedSessionIds: state.archivedSessionIds })];
                    case 5:
                        _g.sent();
                        _g.label = 6;
                    case 6: return [4 /*yield*/, this.setState({ initialized: true, workspaceIds: workspaceIds, archivedSessionIds: state.archivedSessionIds })];
                    case 7:
                        _g.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    WorkspaceRegistry.prototype.validateStoredState = function (state) {
        var table = this.requireTable();
        var order = new Set();
        for (var _i = 0, _a = state.workspaceIds; _i < _a.length; _i++) {
            var id = _a[_i];
            if (order.has(id)) {
                throw new Error("workspace domain is inconsistent: registry order repeats workspace '".concat(id, "'"));
            }
            if (table.get(id) === undefined) {
                throw new Error("workspace domain is inconsistent: registry order references missing workspace '".concat(id, "'"));
            }
            order.add(id);
        }
        if (state.initialized && order.size !== table.size) {
            var orphan = __spreadArray([], table.keys(), true).find(function (id) { return !order.has(id); });
            throw new Error("workspace domain is inconsistent: workspace '".concat(orphan, "' is absent from registry order"));
        }
        var paths = new Map();
        var accounted = new Map();
        for (var _b = 0, _c = table.entries(); _b < _c.length; _b++) {
            var _d = _c[_b], id = _d[0], record = _d[1];
            var pathHolder = paths.get(record.path);
            if (pathHolder !== undefined) {
                throw new Error("workspace domain is inconsistent: path '".concat(record.path, "' is claimed ")
                    + "by both workspace '".concat(pathHolder, "' and workspace '").concat(id, "'"));
            }
            paths.set(record.path, id);
            for (var _e = 0, _f = record.sessionIds; _e < _f.length; _e++) {
                var sessionId = _f[_e];
                var holder = accounted.get(sessionId);
                if (holder !== undefined) {
                    throw new Error("workspace domain is inconsistent: session '".concat(sessionId, "' is accounted ")
                        + "by both workspace '".concat(holder, "' and workspace '").concat(id, "'"));
                }
                accounted.set(sessionId, id);
            }
        }
    };
    WorkspaceRegistry.prototype.rebuildEntities = function () {
        this.entities.clear();
        for (var _i = 0, _a = this.requireState().workspaceIds; _i < _a.length; _i++) {
            var id = _a[_i];
            var record = this.requireTable().get(id);
            this.entities.set(id, new entity_ts_1.WorkspaceEntity(this.host, id, record));
        }
    };
    WorkspaceRegistry.prototype.replaceHeaderIndex = function (headers) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.headers.clear();
                        this.sessionPaths.clear();
                        this.invalidSessionPaths.clear();
                        return [4 /*yield*/, this.indexHeaders(headers)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    WorkspaceRegistry.prototype.indexHeaders = function (headers) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, headers_2, header;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _i = 0, headers_2 = headers;
                        _a.label = 1;
                    case 1:
                        if (!(_i < headers_2.length)) return [3 /*break*/, 4];
                        header = headers_2[_i];
                        return [4 /*yield*/, this.indexHeader(header)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    WorkspaceRegistry.prototype.indexHeader = function (header) {
        return __awaiter(this, void 0, void 0, function () {
            var path, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        this.headers.set(header.id, header);
                        this.sessionPaths.delete(header.id);
                        if (header.cwd === undefined) {
                            this.invalidSessionPaths.set(header.id, 'header has no cwd');
                            return [2 /*return*/];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, (0, paths_ts_1.realpathNormalize)(header.cwd)];
                    case 2:
                        path = _b.sent();
                        return [4 /*yield*/, (0, promises_1.stat)(path)];
                    case 3:
                        if (!(_b.sent()).isDirectory()) {
                            this.invalidSessionPaths.set(header.id, "cwd '".concat(header.cwd, "' is not a directory"));
                            return [2 /*return*/];
                        }
                        this.sessionPaths.set(header.id, path);
                        this.invalidSessionPaths.delete(header.id);
                        return [3 /*break*/, 5];
                    case 4:
                        _a = _b.sent();
                        this.invalidSessionPaths.set(header.id, "cwd '".concat(header.cwd, "' does not resolve"));
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    WorkspaceRegistry.prototype.indexLiveSessions = function () {
        return __awaiter(this, void 0, void 0, function () {
            var sessions;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        sessions = this.ctx.get('sessions');
                        if (sessions === undefined)
                            return [2 /*return*/];
                        return [4 /*yield*/, this.indexHeaders(sessions.list().map(function (session) { return session.header; }))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    WorkspaceRegistry.prototype.reportFilteredCandidates = function () {
        var _a;
        for (var _i = 0, _b = this.entities.values(); _i < _b.length; _i++) {
            var entity = _b[_i];
            var record = this.requireTable().get(entity.id);
            for (var _c = 0, _d = record.sessionIds; _c < _d.length; _c++) {
                var sessionId = _d[_c];
                var path = this.sessionPaths.get(sessionId);
                if (path === record.path)
                    continue;
                var reason = (_a = this.invalidSessionPaths.get(sessionId)) !== null && _a !== void 0 ? _a : (this.headers.has(sessionId)
                    ? "canonical cwd '".concat(path, "' differs from workspace path '").concat(record.path, "'")
                    : 'session header is missing');
                this.ctx.logger.warn("workspace '".concat(entity.id, "' filtered session '").concat(sessionId, "' from membership: ").concat(reason));
            }
        }
    };
    WorkspaceRegistry.prototype.readSessionHeader = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var live, cached, headers, header;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        live = (_a = this.ctx.get('sessions')) === null || _a === void 0 ? void 0 : _a.get(id);
                        if (live !== undefined) {
                            this.headers.set(id, live.header);
                            return [2 /*return*/, live.header];
                        }
                        cached = this.headers.get(id);
                        if (cached !== undefined)
                            return [2 /*return*/, cached];
                        return [4 /*yield*/, this.ctx.sessionPersistence.list()];
                    case 1:
                        headers = _b.sent();
                        return [4 /*yield*/, this.indexHeaders(headers)];
                    case 2:
                        _b.sent();
                        header = this.headers.get(id);
                        if (header === undefined) {
                            throw new Error("cannot validate session '".concat(id, "': session persistence holds no such session"));
                        }
                        return [2 /*return*/, header];
                }
            });
        });
    };
    WorkspaceRegistry.prototype.requireTable = function () {
        if (this.table === undefined)
            throw new Error('workspace registry is not started yet');
        return this.table;
    };
    WorkspaceRegistry.prototype.requireState = function () {
        if (this.state === undefined)
            throw new Error('workspace registry is not started yet');
        return this.state;
    };
    WorkspaceRegistry.prototype.setState = function (state) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.global.set(state)];
                    case 1:
                        _a.sent();
                        this.state = state;
                        return [2 /*return*/];
                }
            });
        });
    };
    WorkspaceRegistry.prototype.enqueueOperation = function (operation) {
        var _this = this;
        var result = this.operationTail.then(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: 
                    // A committed delete may leave only its marker cleanup pending. Retry
                    // recovery before another create/delete can overwrite that pending operation record.
                    return [4 /*yield*/, this.recoverPendingMutation()];
                    case 1:
                        // A committed delete may leave only its marker cleanup pending. Retry
                        // recovery before another create/delete can overwrite that pending operation record.
                        _a.sent();
                        return [4 /*yield*/, operation()];
                    case 2: return [2 /*return*/, _a.sent()];
                }
            });
        }); });
        this.operationTail = result.then(function () { }, function () { });
        return result;
    };
    WorkspaceRegistry.inject = ['storageDomain', 'sessionPersistence'];
    return WorkspaceRegistry;
}(cordis_1.Service));
exports.WorkspaceRegistry = WorkspaceRegistry;
var sameSessionIds = function (left, right) {
    return left.length === right.length && left.every(function (id, index) { return id === right[index]; });
};
exports.default = WorkspaceRegistry;
