"use strict";
/**
 * Package-private workspace entity: the single {@link Workspace}
 * implementation. Holds a record snapshot that is swapped in place after each
 * durable mutation; every write funnels through the private `mutate` so
 * `updatedAt` stamping and invalid-account pruning happen exactly once.
 * Not re-exported from the package entrypoint — consumers see only the
 * `Workspace` interface.
 * @module @z/dsh-workspace/src/entity
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
exports.WorkspaceEntity = exports.WorkspaceMoveInvalidError = void 0;
var promises_1 = require("node:fs/promises");
var paths_ts_1 = require("./paths.ts");
/** An insertSessionBefore request named a session or anchor not on the account (storage failures stay plain errors). */
var WorkspaceMoveInvalidError = /** @class */ (function (_super) {
    __extends(WorkspaceMoveInvalidError, _super);
    /**
     * @param message - Which id was unaccounted and where.
     */
    function WorkspaceMoveInvalidError(message) {
        var _this = _super.call(this, message) || this;
        _this.name = 'WorkspaceMoveInvalidError';
        return _this;
    }
    return WorkspaceMoveInvalidError;
}(Error));
exports.WorkspaceMoveInvalidError = WorkspaceMoveInvalidError;
/** Chain-slot abort sentinel thrown by the update fn when the record needs no change; only `mutate` observes it. */
var unchangedSentinel = new Error('workspace record unchanged (internal sentinel)');
/** The single {@link Workspace} implementation; constructed only by the registry. */
var WorkspaceEntity = /** @class */ (function () {
    /**
     * @param host - Registry-owned table, session-path index, and header reads.
     * @param id - The record's stable id.
     * @param record - The validated record snapshot loaded or just written.
     */
    function WorkspaceEntity(host, id, record) {
        this.host = host;
        this.id = id;
        this.record = record;
    }
    Object.defineProperty(WorkspaceEntity.prototype, "path", {
        get: function () {
            return this.record.path;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(WorkspaceEntity.prototype, "title", {
        get: function () {
            return this.record.title;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(WorkspaceEntity.prototype, "createdAt", {
        get: function () {
            return this.record.createdAt;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(WorkspaceEntity.prototype, "updatedAt", {
        get: function () {
            return this.record.updatedAt;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(WorkspaceEntity.prototype, "sessionIds", {
        get: function () {
            var _this = this;
            return this.record.sessionIds.filter(function (id) { return _this.host.sessionPath(id) === _this.record.path; });
        },
        enumerable: false,
        configurable: true
    });
    WorkspaceEntity.prototype.setTitle = function (title) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.mutate(function (record) { return (__assign(__assign({}, record), { title: title })); })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    WorkspaceEntity.prototype.attachSession = function (sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var header, cwd, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.record.sessionIds.includes(sessionId)) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.host.readSessionHeader(sessionId)];
                    case 1:
                        header = _a.sent();
                        if (header.cwd === undefined) {
                            throw new Error("cannot attach session '".concat(sessionId, "' to workspace '").concat(this.record.path, "': ")
                                + 'its stored header carries no cwd to validate against');
                        }
                        cwd = void 0;
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, (0, paths_ts_1.realpathNormalize)(header.cwd)];
                    case 3:
                        cwd = _a.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _a.sent();
                        throw new Error("cannot attach session '".concat(sessionId, "' to workspace '").concat(this.record.path, "': ")
                            + "its cwd '".concat(header.cwd, "' does not resolve, so it cannot be validated"), { cause: error_1 });
                    case 5: return [4 /*yield*/, (0, promises_1.stat)(cwd)];
                    case 6:
                        if (!(_a.sent()).isDirectory()) {
                            throw new Error("cannot attach session '".concat(sessionId, "' to workspace '").concat(this.record.path, "': ")
                                + "its cwd '".concat(header.cwd, "' is not a directory"));
                        }
                        if (cwd !== this.record.path) {
                            throw new Error("cannot attach session '".concat(sessionId, "' to workspace '").concat(this.record.path, "': ")
                                + "its cwd resolves to '".concat(cwd, "'"));
                        }
                        this.host.rememberSessionPath(sessionId, cwd);
                        _a.label = 7;
                    case 7: return [4 /*yield*/, this.mutate(function (record) { return record.sessionIds.includes(sessionId)
                            ? record
                            : __assign(__assign({}, record), { sessionIds: __spreadArray([sessionId], record.sessionIds, true) }); })];
                    case 8:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    WorkspaceEntity.prototype.insertSessionBefore = function (sessionId, beforeSessionId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.mutate(function (record) {
                            if (!record.sessionIds.includes(sessionId)) {
                                throw new WorkspaceMoveInvalidError("cannot move session '".concat(sessionId, "' in workspace '").concat(record.path, "': the session is not accounted"));
                            }
                            if (beforeSessionId !== undefined && !record.sessionIds.includes(beforeSessionId)) {
                                throw new WorkspaceMoveInvalidError("cannot move session '".concat(sessionId, "' before '").concat(beforeSessionId, "' in workspace '").concat(record.path, "': ")
                                    + 'the anchor session is not accounted');
                            }
                            if (beforeSessionId === sessionId)
                                return record;
                            var without = record.sessionIds.filter(function (id) { return id !== sessionId; });
                            var at = beforeSessionId === undefined ? without.length : without.indexOf(beforeSessionId);
                            var sessionIds = __spreadArray(__spreadArray(__spreadArray([], without.slice(0, at), true), [sessionId], false), without.slice(at), true);
                            return sessionIds.every(function (id, index) { return id === record.sessionIds[index]; })
                                ? record
                                : __assign(__assign({}, record), { sessionIds: sessionIds });
                        })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    WorkspaceEntity.prototype.detachSession = function (sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.mutate(function (record) { return record.sessionIds.includes(sessionId)
                            ? __assign(__assign({}, record), { sessionIds: record.sessionIds.filter(function (id) { return id !== sessionId; }) }) : record; })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    WorkspaceEntity.prototype.status = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, promises_1.stat)(this.record.path)];
                    case 1: return [2 /*return*/, (_b.sent()).isDirectory() ? 'ok' : 'missing-dir'];
                    case 2:
                        _a = _b.sent();
                        // Any stat failure (ENOENT, dangling parent, permission loss) means the
                        // directory is not usable right now; the record itself never mutates.
                        return [2 /*return*/, 'missing-dir'];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * The single write path: run `fn` on the domain write chain via
     * `table.update`, stamping `updatedAt` and pruning candidates that no
     * longer pass the id-plus-canonical-cwd membership check, then swap the
     * snapshot.
     *
     * `fn` sees the value current at its chain slot, so membership decisions
     * (attach/detach idempotence) are race-free against queued writes; a fn
     * signalling no change by returning `current` verbatim aborts the slot
     * through the sentinel when pruning also finds nothing, so a no-op neither
     * rewrites the medium nor emits a change event.
     */
    WorkspaceEntity.prototype.mutate = function (fn) {
        return __awaiter(this, void 0, void 0, function () {
            var next, error_2;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.host.table().update(this.id, function (current) {
                                var changed = fn(current);
                                var sessionIds = changed.sessionIds.filter(function (id) { return _this.host.sessionPath(id) === changed.path; });
                                if (changed === current && sessionIds.length === current.sessionIds.length) {
                                    throw unchangedSentinel;
                                }
                                return __assign(__assign({}, changed), { sessionIds: sessionIds, updatedAt: new Date().toISOString() });
                            })];
                    case 1:
                        next = _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_2 = _a.sent();
                        if (error_2 === unchangedSentinel)
                            return [2 /*return*/];
                        throw error_2;
                    case 3:
                        this.record = next;
                        return [2 /*return*/];
                }
            });
        });
    };
    return WorkspaceEntity;
}());
exports.WorkspaceEntity = WorkspaceEntity;
