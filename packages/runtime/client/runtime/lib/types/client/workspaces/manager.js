"use strict";
/** Workspace baseline, incremental-frame, and unary-action owner. */
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
exports.WorkspaceManager = void 0;
var api_1 = require("@z/dsh-host-apiproxy/api");
var notifier_ts_1 = require("../sessions/notifier.ts");
var workspace_ts_1 = require("./workspace.ts");
/** Workspace object cluster driven by one list baseline and changed-frame upserts. */
var WorkspaceManager = /** @class */ (function () {
    /** @param api - shared wire client. */
    function WorkspaceManager(api) {
        var _this = this;
        this.api = api;
        this.items = [];
        this.itemViewsSource = null;
        this.itemViewsCache = [];
        // Full-snapshot state (list response / unary response / changed frame all
        // carry the complete set), so deltas never merge — installs replace.
        this.archivedSessionIds = [];
        this.state = 'idle';
        this.phase = 'pending';
        this.error = null;
        this.inflight = null;
        this.refreshFrames = null;
        /**
         * True once a frame or unary echo installed the archive set while a list
         * request was in flight: that install is newer than the pending baseline,
         * so the baseline's (older) set must not roll it back — the archive
         * mirror of replaying refreshFrames over the item baseline.
         */
        this.archivedSupersedesRefresh = false;
        /** Latest local reorder request; only its unary echo may install order. */
        this.orderRequestGeneration = 0;
        /** Increments on order frames so a later remote commit outranks an older unary echo. */
        this.orderFrameGeneration = 0;
        /** Last complete order accepted from a Host baseline, frame, or current unary echo. */
        this.committedOrder = [];
        /**
         * Ids this process has seen removed, kept for the connection's lifetime so
         * a late changed frame or a stale baseline row cannot resurrect a deleted
         * row. Correctness rests on Host ids never being reused (the registry mints
         * a fresh `randomUUID` per record, including when the same directory is
         * registered again) — a path-derived id scheme would turn these entries
         * into permanent blindfolds and must clear them instead.
         */
        this.removedIds = new Set();
        this.notifier = new notifier_ts_1.Notifier(function () {
            _this.snapshotCache = _this.buildSnapshot();
        });
        this.snapshotCache = this.buildSnapshot();
    }
    /**
     * Refresh from workspace.list. The first successful response establishes
     * Host order; later responses re-establish the durable order so reconnects
     * adopt reorders committed while this client was offline. Frames arriving
     * during the RPC are replayed over its response.
     * @returns the shared in-flight refresh.
     */
    WorkspaceManager.prototype.refresh = function () {
        var _this = this;
        if (this.inflight !== null)
            return this.inflight;
        this.state = 'loading';
        this.error = null;
        var frames = [];
        this.refreshFrames = frames;
        this.notifier.markDirty();
        this.inflight = (function () { return __awaiter(_this, void 0, void 0, function () {
            var result, items, _i, frames_1, delta, error_1, folded;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, 3, 4]);
                        return [4 /*yield*/, this.api.workspace.list({})];
                    case 1:
                        result = (_a.sent()).result;
                        if (result.ok) {
                            items = result.value.items;
                            items = items.filter(function (workspace) { return !_this.removedIds.has(workspace.workspaceId); });
                            for (_i = 0, frames_1 = frames; _i < frames_1.length; _i++) {
                                delta = frames_1[_i];
                                items = applyWorkspaceDelta(items, delta);
                            }
                            this.installViews(items);
                            if (!this.archivedSupersedesRefresh)
                                this.installArchived(result.value.archivedSessionIds);
                            this.state = 'idle';
                            this.phase = 'ready';
                        }
                        else {
                            this.state = 'error';
                            this.error = result.error;
                        }
                        return [3 /*break*/, 4];
                    case 2:
                        error_1 = _a.sent();
                        this.state = 'error';
                        folded = (0, api_1.transportError)(error_1);
                        /* v8 ignore next -- transportError always returns the failure branch. */
                        this.error = folded.ok ? null : folded.error;
                        return [3 /*break*/, 4];
                    case 3:
                        this.refreshFrames = null;
                        this.archivedSupersedesRefresh = false;
                        this.inflight = null;
                        this.notifier.markDirty();
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        }); })();
        return this.inflight;
    };
    /**
     * Create or resolve a real Workspace, then publish its returned snapshot
     * without waiting for the changed frame.
     * @param input - the existing absolute path to adopt.
     * @returns the wire result.
     */
    WorkspaceManager.prototype.create = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var workspace, completion, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        workspace = new workspace_ts_1.Workspace(this.api, input);
                        completion = workspace.materialize();
                        if (completion === undefined)
                            throw new Error('a local Workspace must be materializable');
                        return [4 /*yield*/, completion];
                    case 1:
                        result = _a.sent();
                        if (result.ok)
                            this.upsert(result.value.workspace, workspace);
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Rename a Workspace, then publish its returned snapshot without waiting
     * for the changed frame.
     * @param workspaceId - target workspace.
     * @param title - new display title.
     * @returns the wire result.
     */
    WorkspaceManager.prototype.rename = function (workspaceId, title) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.api.workspace.rename({ workspaceId: workspaceId, title: title })];
                    case 1:
                        result = (_a.sent()).result;
                        if (result.ok)
                            this.upsert(result.value.workspace);
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Delete a Workspace registration and remove its local projection from the
     * unary response without waiting for the Host frame.
     * @param workspaceId - target workspace.
     * @returns the wire result.
     */
    WorkspaceManager.prototype.delete = function (workspaceId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.api.workspace.delete({ workspaceId: workspaceId })];
                    case 1:
                        result = (_a.sent()).result;
                        if (result.ok)
                            this.remove(workspaceId, true);
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Move a Workspace within the registry display order and install the full
     * returned order without waiting for the Host frame.
     * @param workspaceId - Workspace to move.
     * @param beforeWorkspaceId - Anchor workspace; omitted appends.
     * @returns the wire result.
     */
    WorkspaceManager.prototype.insertBefore = function (workspaceId, beforeWorkspaceId) {
        return __awaiter(this, void 0, void 0, function () {
            var requestGeneration, frameGeneration, localOrder, result, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        requestGeneration = ++this.orderRequestGeneration;
                        frameGeneration = this.orderFrameGeneration;
                        localOrder = this.itemViews().map(function (workspace) { return workspace.workspaceId; });
                        this.installOrder(insertIdBefore(localOrder, workspaceId, beforeWorkspaceId));
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        ;
                        return [4 /*yield*/, this.api.workspace.insertBefore(__assign({ workspaceId: workspaceId }, beforeWorkspaceId === undefined ? {} : { beforeWorkspaceId: beforeWorkspaceId }))];
                    case 2:
                        (result = (_a.sent()).result);
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _a.sent();
                        if (requestGeneration === this.orderRequestGeneration
                            && frameGeneration === this.orderFrameGeneration) {
                            this.installOrder(this.committedOrder);
                        }
                        throw error_2;
                    case 4:
                        if (result.ok && requestGeneration === this.orderRequestGeneration
                            && frameGeneration === this.orderFrameGeneration) {
                            this.installOrder(result.value.workspaceIds, true);
                        }
                        else if (!result.ok && requestGeneration === this.orderRequestGeneration
                            && frameGeneration === this.orderFrameGeneration) {
                            this.installOrder(this.committedOrder);
                        }
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Move a session within its Workspace's manual order, then publish the
     * returned snapshot without waiting for the changed frame.
     * @param workspaceId - owning workspace.
     * @param sessionId - accounted session to move.
     * @param beforeSessionId - accounted anchor to insert before; omitted appends.
     * @returns the wire result.
     */
    WorkspaceManager.prototype.insertSessionBefore = function (workspaceId, sessionId, beforeSessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.api.workspace.insertSessionBefore(__assign({ workspaceId: workspaceId, sessionId: sessionId }, beforeSessionId === undefined ? {} : { beforeSessionId: beforeSessionId }))];
                    case 1:
                        result = (_a.sent()).result;
                        if (result.ok)
                            this.upsert(result.value.workspace);
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Archive one session in the registry-global set, then install the
     * returned full set without waiting for the changed frame.
     * @param sessionId - session to archive.
     * @returns the wire result.
     */
    WorkspaceManager.prototype.archiveSession = function (sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.api.workspace.archiveSession({ sessionId: sessionId })];
                    case 1:
                        result = (_a.sent()).result;
                        if (result.ok)
                            this.installArchived(result.value.archivedSessionIds);
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Host-frame entry. Non-workspace frames are ignored so the runtime can
     * fan one host stream out to both object managers.
     * @param envelope - host stream envelope.
     */
    WorkspaceManager.prototype.handleHostEnvelope = function (envelope) {
        if (envelope.payload.type === 'host/workspace-changed')
            this.upsert(envelope.payload.workspace);
        else if (envelope.payload.type === 'host/workspace-removed')
            this.remove(envelope.payload.workspaceId);
        else if (envelope.payload.type === 'host/workspace-order-changed') {
            this.orderFrameGeneration++;
            this.installOrder(envelope.payload.workspaceIds, true);
        }
        else if (envelope.payload.type === 'host/archived-sessions-changed') {
            this.installArchived(envelope.payload.archivedSessionIds);
        }
    };
    /** Re-pull the baseline after each connection generation. */
    WorkspaceManager.prototype.handleConnected = function () {
        void this.refresh();
    };
    /**
     * Subscribe to workspace snapshot invalidation.
     * @param listener - snapshot invalidation callback.
     * @returns unsubscribe function.
     */
    WorkspaceManager.prototype.subscribe = function (listener) {
        return this.notifier.subscribe(listener);
    };
    /**
     * Read the cached workspace snapshot after flushing pending notifications.
     * @returns the cached workspace snapshot.
     */
    WorkspaceManager.prototype.getSnapshot = function () {
        this.notifier.ensureFresh();
        return this.snapshotCache;
    };
    WorkspaceManager.prototype.buildSnapshot = function () {
        return {
            items: this.itemViews(),
            archivedSessionIds: this.archivedSessionIds,
            state: this.state,
            phase: this.phase,
            error: this.error,
        };
    };
    /**
     * Replace the archive set when membership actually changed (array identity
     * backs Object.is short-circuits). Host snapshots are append-ordered, so
     * positional comparison is exact, not merely heuristic.
     */
    WorkspaceManager.prototype.installArchived = function (archivedSessionIds) {
        var _this = this;
        if (this.refreshFrames !== null)
            this.archivedSupersedesRefresh = true;
        if (archivedSessionIds.length === this.archivedSessionIds.length
            && archivedSessionIds.every(function (id, index) { return id === _this.archivedSessionIds[index]; }))
            return;
        this.archivedSessionIds = __spreadArray([], archivedSessionIds, true);
        this.notifier.markDirty();
    };
    /** Reorder known Workspace objects, optionally recording a Host-committed sequence. */
    WorkspaceManager.prototype.installOrder = function (workspaceIds, committed) {
        var _this = this;
        var _a;
        if (committed === void 0) { committed = false; }
        if (committed) {
            (_a = this.refreshFrames) === null || _a === void 0 ? void 0 : _a.push({ type: 'order', workspaceIds: workspaceIds });
            this.committedOrder = __spreadArray([], workspaceIds, true);
        }
        var rank = new Map(workspaceIds.map(function (id, index) { return [id, index]; }));
        var items = __spreadArray([], this.items, true).sort(function (left, right) {
            var _a, _b, _c, _d;
            var leftId = (_a = left.getSnapshot().view) === null || _a === void 0 ? void 0 : _a.workspaceId;
            var rightId = (_b = right.getSnapshot().view) === null || _b === void 0 ? void 0 : _b.workspaceId;
            return (leftId === undefined ? Number.MAX_SAFE_INTEGER : (_c = rank.get(leftId)) !== null && _c !== void 0 ? _c : Number.MAX_SAFE_INTEGER)
                - (rightId === undefined ? Number.MAX_SAFE_INTEGER : (_d = rank.get(rightId)) !== null && _d !== void 0 ? _d : Number.MAX_SAFE_INTEGER);
        });
        if (items.every(function (item, index) { return item === _this.items[index]; }))
            return;
        this.items = items;
        this.notifier.markDirty();
    };
    /** Upsert one Host view, optionally retaining the local object that materialized it. */
    WorkspaceManager.prototype.upsert = function (view, identity) {
        var _a, _b, _c;
        if (this.removedIds.has(view.workspaceId))
            return;
        (_a = this.refreshFrames) === null || _a === void 0 ? void 0 : _a.push({ type: 'upsert', workspace: view });
        var index = this.items.findIndex(function (item) { var _a; return ((_a = item.getSnapshot().view) === null || _a === void 0 ? void 0 : _a.workspaceId) === view.workspaceId; });
        // Mutation responses and changed frames race (two carriers, no ordering):
        // reject a snapshot strictly older than the installed projection so a
        // late unary response cannot roll back a newer frame.
        var installed = index === -1 ? undefined : (_b = this.items[index]) === null || _b === void 0 ? void 0 : _b.getSnapshot().view;
        if (installed !== undefined && Date.parse(view.updatedAt) < Date.parse(installed.updatedAt))
            return;
        if (!this.committedOrder.includes(view.workspaceId)) {
            this.committedOrder = __spreadArray([view.workspaceId], this.committedOrder, true);
        }
        if (identity !== undefined) {
            this.items = index === -1
                ? __spreadArray([identity], this.items, true) : this.items.map(function (item, position) { return position === index ? identity : item; });
        }
        else if (index === -1) {
            this.items = __spreadArray([new workspace_ts_1.Workspace(this.api, view)], this.items, true);
        }
        else {
            (_c = this.items[index]) === null || _c === void 0 ? void 0 : _c.adopt(view);
            this.items = __spreadArray([], this.items, true);
        }
        this.notifier.markDirty();
    };
    /** Remove one id idempotently and retain a tombstone against late echoes. */
    WorkspaceManager.prototype.remove = function (workspaceId, direct) {
        var _a;
        if (direct === void 0) { direct = false; }
        (_a = this.refreshFrames) === null || _a === void 0 ? void 0 : _a.push({ type: 'remove', workspaceId: workspaceId });
        this.removedIds.add(workspaceId);
        this.committedOrder = this.committedOrder.filter(function (id) { return id !== workspaceId; });
        var items = this.items.filter(function (item) { var _a; return ((_a = item.getSnapshot().view) === null || _a === void 0 ? void 0 : _a.workspaceId) !== workspaceId; });
        if (items.length === this.items.length) {
            // The Host frame may have removed the row first but left its batched
            // notification pending. A successful unary echo still flushes that
            // committed state before the user action resolves.
            if (direct)
                this.notifier.notifyNow();
            return;
        }
        this.items = items;
        if (direct)
            this.notifier.notifyNow();
        else
            this.notifier.markDirty();
    };
    WorkspaceManager.prototype.installViews = function (views) {
        var _a;
        var existing = new Map(this.items.flatMap(function (workspace) {
            var view = workspace.getSnapshot().view;
            return view === undefined ? [] : [[view.workspaceId, workspace]];
        }));
        var installed = new Map();
        for (var _i = 0, views_1 = views; _i < views_1.length; _i++) {
            var view = views_1[_i];
            var duplicate = installed.get(view.workspaceId);
            if (duplicate !== undefined) {
                duplicate.adopt(view);
                continue;
            }
            var workspace = (_a = existing.get(view.workspaceId)) !== null && _a !== void 0 ? _a : new workspace_ts_1.Workspace(this.api, view);
            workspace.adopt(view);
            installed.set(view.workspaceId, workspace);
        }
        this.items = __spreadArray([], installed.values(), true);
        this.committedOrder = views.map(function (view) { return view.workspaceId; });
    };
    WorkspaceManager.prototype.itemViews = function () {
        if (this.itemViewsSource === this.items)
            return this.itemViewsCache;
        this.itemViewsSource = this.items;
        this.itemViewsCache = this.items.flatMap(function (workspace) {
            var view = workspace.getSnapshot().view;
            return view === undefined ? [] : [view];
        });
        return this.itemViewsCache;
    };
    return WorkspaceManager;
}());
exports.WorkspaceManager = WorkspaceManager;
/** Known ids retain their position; a newly created Workspace enters first. */
function upsertWorkspace(items, workspace) {
    var index = items.findIndex(function (item) { return item.workspaceId === workspace.workspaceId; });
    return index === -1
        ? __spreadArray([workspace], items, true) : items.map(function (item, position) { return position === index ? workspace : item; });
}
/** Replay one ordered delta over a baseline: upsert in place, or drop the removed id. */
function applyWorkspaceDelta(items, delta) {
    if (delta.type === 'upsert')
        return upsertWorkspace(items, delta.workspace);
    if (delta.type === 'remove') {
        return items.filter(function (workspace) { return workspace.workspaceId !== delta.workspaceId; });
    }
    var rank = new Map(delta.workspaceIds.map(function (id, index) { return [id, index]; }));
    return __spreadArray([], items, true).sort(function (left, right) {
        var _a, _b;
        return ((_a = rank.get(left.workspaceId)) !== null && _a !== void 0 ? _a : Number.MAX_SAFE_INTEGER)
            - ((_b = rank.get(right.workspaceId)) !== null && _b !== void 0 ? _b : Number.MAX_SAFE_INTEGER);
    });
}
/** Move one known id before an optional anchor; unknown ids leave the order unchanged. */
function insertIdBefore(ids, id, beforeId) {
    if (!ids.includes(id) || (beforeId !== undefined && !ids.includes(beforeId)) || beforeId === id) {
        return __spreadArray([], ids, true);
    }
    var without = ids.filter(function (candidate) { return candidate !== id; });
    var at = beforeId === undefined ? without.length : without.indexOf(beforeId);
    return __spreadArray(__spreadArray(__spreadArray([], without.slice(0, at), true), [id], false), without.slice(at), true);
}
