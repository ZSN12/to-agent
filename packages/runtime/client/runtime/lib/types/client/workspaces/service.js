"use strict";
/** WorkspaceRuntime projects the Workspace object manager for UI consumers. */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceRuntime = exports.DirectoryBrowseError = exports.WorkspaceCreateError = void 0;
var store_ts_1 = require("../contract/store.ts");
var manager_ts_1 = require("./manager.ts");
/** Structured create failure for UI flows that distinguish Host business errors. */
var WorkspaceCreateError = /** @class */ (function (_super) {
    __extends(WorkspaceCreateError, _super);
    function WorkspaceCreateError(rpcError) {
        var _this = _super.call(this, "workspace create failed: ".concat(rpcError.code, ": ").concat(rpcError.message)) || this;
        _this.rpcError = rpcError;
        _this.name = 'WorkspaceCreateError';
        return _this;
    }
    return WorkspaceCreateError;
}(Error));
exports.WorkspaceCreateError = WorkspaceCreateError;
/** Structured browse failure so the directory browser can branch on Host business codes. */
var DirectoryBrowseError = /** @class */ (function (_super) {
    __extends(DirectoryBrowseError, _super);
    function DirectoryBrowseError(rpcError) {
        var _this = _super.call(this, "directory browse failed: ".concat(rpcError.code, ": ").concat(rpcError.message)) || this;
        _this.rpcError = rpcError;
        _this.name = 'DirectoryBrowseError';
        return _this;
    }
    return DirectoryBrowseError;
}(Error));
exports.DirectoryBrowseError = DirectoryBrowseError;
/** Real Workspace object layer and Host actions. */
var WorkspaceRuntime = /** @class */ (function () {
    /**
     * @param ctx - client root context.
     * @param api - shared wire client.
     * @param sessions - cross-domain sessions face used for recency and blank-session reuse.
     */
    function WorkspaceRuntime(ctx, api, sessions) {
        var _this = this;
        this.api = api;
        this.sessions = sessions;
        /** In-flight blank-session creates keyed by workspace (connectWorkspace coalescing). */
        this.connecting = new Map();
        /** Guards the runtime-owned one-shot initial-selection subscription. */
        this.initialSelectionStarted = false;
        this.manager = new manager_ts_1.WorkspaceManager(api);
        this.list = (0, store_ts_1.createSnapshotStore)({
            items: [], archivedSessionIds: [], state: 'idle', phase: 'pending', error: null,
            baselinesReady: false, recentWorkspaceId: undefined,
        });
        this.manager.subscribe(function () { _this.project(); });
        this.sessions.list.subscribe(function () { _this.project(); });
        ctx.reflect.provide('workspaces', this, undefined);
    }
    /**
     * Resolve the session a New Session flow lands in once this Workspace is
     * chosen: reuse the workspace's existing blank session when one is in the
     * list mirror, else create a fresh one on the host (`session.create` births
     * the full Session+Agent — the client holds no intermediate state). The
     * caller owns navigation: take the returned id to `sessions.open`.
     * Resolution guarantee (both arms): the returned id is already in the list
     * store and `sessions.binding(id)` resolves synchronously — draft hand-off
     * may write the new scope's machine before opening.
     * @param workspaceId - chosen Workspace (must be in the workspace list).
     * @returns the reused or newly created session id.
     */
    WorkspaceRuntime.prototype.connectWorkspace = function (workspaceId) {
        return __awaiter(this, void 0, void 0, function () {
            var workspace, inflight, archived, sessions, _i, _a, id, summary, attempt;
            var _this = this;
            return __generator(this, function (_b) {
                workspace = this.list.getSnapshot().items.find(function (item) { return item.workspaceId === workspaceId; });
                if (workspace === undefined)
                    throw new Error("workspaces.connectWorkspace: unknown workspace ".concat(workspaceId));
                inflight = this.connecting.get(workspaceId);
                if (inflight !== undefined)
                    return [2 /*return*/, inflight
                        // Reuse requires workspace membership (id in sessionIds AND same
                        // canonical cwd — the host's own membership rule), never cwd alone:
                        // a cwd match can belong to no account (sessions the CLI/TUI birthed at
                        // the host cwd, or a deleted/recreated registration) and reusing it
                        // would open a session no grouping surface shows under this workspace.
                        // An archived blank is never reused either: reuse would open a session
                        // no grouping surface can show, so New Session mints a fresh one instead.
                    ];
                archived = this.list.getSnapshot().archivedSessionIds;
                sessions = this.sessions.list.getSnapshot();
                for (_i = 0, _a = sessions.ids; _i < _a.length; _i++) {
                    id = _a[_i];
                    summary = sessions.byId[id];
                    if (summary !== undefined && summary.blank && summary.cwd === workspace.path
                        && workspace.sessionIds.includes(summary.id)
                        && !archived.includes(summary.id))
                        return [2 /*return*/, summary.id];
                }
                attempt = this.sessions.create({ workspaceId: workspaceId })
                    .finally(function () { _this.connecting.delete(workspaceId); });
                this.connecting.set(workspaceId, attempt);
                return [2 /*return*/, attempt];
            });
        });
    };
    /**
     * Follow the first complete Workspace/Session baseline and select a default
     * session exactly once. A restored current session wins; otherwise the most
     * recent Workspace is connected (reusing or creating its blank session).
     * Later explicit clears stay cleared instead of retriggering this startup
     * policy. A failed connect may retry on the next baseline projection.
     * @returns disposer for the baseline subscription; late work cannot navigate after disposal.
     */
    WorkspaceRuntime.prototype.startInitialSelection = function () {
        var _this = this;
        if (this.initialSelectionStarted) {
            throw new Error('workspaces.startInitialSelection: already started');
        }
        this.initialSelectionStarted = true;
        var state = 'waiting';
        var disposed = false;
        var reconcile = function () {
            if (disposed || state !== 'waiting')
                return;
            var workspace = _this.list.getSnapshot();
            if (!workspace.baselinesReady)
                return;
            var current = _this.sessions.list.getSnapshot().current;
            var target = workspace.recentWorkspaceId;
            if (current !== undefined || target === undefined) {
                state = 'done';
                return;
            }
            state = 'connecting';
            void _this.connectWorkspace(target).then(function (sessionId) {
                if (disposed)
                    return;
                if (_this.sessions.list.getSnapshot().current === undefined) {
                    _this.sessions.open(sessionId);
                }
                state = 'done';
            }, function (reason) {
                if (disposed)
                    return;
                state = 'waiting';
                console.warn('initial workspace selection failed:', reason);
            });
        };
        var unsubscribe = this.list.subscribe(reconcile);
        reconcile();
        return function () {
            disposed = true;
            unsubscribe();
        };
    };
    /**
     * The shared New Session action behind the shell entry points (sidebar
     * button, workspace browser).
     *
     * With an explicit `workspaceId` (the scoped create action inside a project
     * group) it connects that Workspace's blank session, landing the new
     * conversation under the chosen project.
     *
     * With no workspace (the top-level sidebar "new session" button) it creates a
     * workspace-less session directly — the Host uses the default cwd and does
     * NOT attach it to any Workspace, so it shows under the ungrouped ("recent")
     * view. This matches the Codex-style flow: a fresh conversation starts free
     * of a project; only an explicit workspace pick places it in a project.
     *
     * Create failures are non-fatal (console diagnostics; the current view stays
     * usable).
     * @param workspaceId - explicit target Workspace for scoped actions.
     */
    WorkspaceRuntime.prototype.startSession = function (workspaceId) {
        var _this = this;
        if (workspaceId !== undefined) {
            void this.connectWorkspace(workspaceId).then(function (sessionId) { _this.sessions.open(sessionId); }, function (reason) { console.warn('new session failed:', reason); });
            return;
        }
        // No workspace: mint a free (ungrouped) session so it lands in "recent".
        void this.sessions.create({}).then(function (sessionId) { _this.sessions.open(sessionId); }, function (reason) { console.warn('new session failed:', reason); });
    };
    /**
     * Register an existing path as a Workspace.
     * @param input - the Host create payload.
     * @returns the created or idempotently resolved Workspace.
     */
    WorkspaceRuntime.prototype.create = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.manager.create(input)];
                    case 1:
                        result = _a.sent();
                        if (!result.ok)
                            throw new WorkspaceCreateError(result.error);
                        return [2 /*return*/, result.value.workspace];
                }
            });
        });
    };
    /**
     * Open the Host's native directory picker (the `native` capability).
     * @returns the selected path, or null when the user cancelled.
     */
    WorkspaceRuntime.prototype.pickDirectory = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.api.host.pickDirectory({})];
                    case 1:
                        response = _a.sent();
                        if (!response.result.ok) {
                            throw new Error("directory picker failed: ".concat(response.result.error.message));
                        }
                        return [2 /*return*/, response.result.value.path];
                }
            });
        });
    };
    /**
     * List one directory level through the Host's `browse` capability.
     * @param path - absolute directory to list; absent lists the Host home directory.
     * @param signal - aborts the wire request (and the Host's scan) when the caller supersedes it.
     * @returns the level's listing with breadcrumb ancestry.
     */
    WorkspaceRuntime.prototype.listDirectory = function (path, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.api.host.listDirectory(path === undefined ? {} : { path: path }, signal)];
                    case 1:
                        response = _a.sent();
                        if (!response.result.ok)
                            throw new DirectoryBrowseError(response.result.error);
                        return [2 /*return*/, response.result.value];
                }
            });
        });
    };
    /**
     * Create one child directory through the Host's `browse` capability.
     * @param path - absolute existing parent directory.
     * @param name - single non-blank path segment.
     * @returns the created directory's absolute path.
     */
    WorkspaceRuntime.prototype.createDirectory = function (path, name) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.api.host.createDirectory({ path: path, name: name })];
                    case 1:
                        response = _a.sent();
                        if (!response.result.ok)
                            throw new DirectoryBrowseError(response.result.error);
                        return [2 /*return*/, response.result.value.path];
                }
            });
        });
    };
    /**
     * Open a filesystem path with the Host operating system's default application.
     * @param path - absolute or host-resolvable path.
     */
    WorkspaceRuntime.prototype.openPath = function (path) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.api.host.openPath({ path: path })];
                    case 1:
                        response = _a.sent();
                        if (!response.result.ok) {
                            throw new Error("path open failed: ".concat(response.result.error.message));
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Rename a Workspace.
     * @param workspaceId - target workspace.
     * @param title - new display title (trimmed non-empty by the Host).
     * @returns the renamed Workspace view.
     */
    WorkspaceRuntime.prototype.rename = function (workspaceId, title) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.manager.rename(workspaceId, title)];
                    case 1:
                        result = _a.sent();
                        if (!result.ok)
                            throw new Error("workspace rename failed: ".concat(result.error.code, ": ").concat(result.error.message));
                        return [2 /*return*/, result.value.workspace];
                }
            });
        });
    };
    /**
     * Delete one Workspace registration. Sessions, session logs, and the
     * directory remain Host-owned outside this operation.
     * @param workspaceId - target workspace.
     */
    WorkspaceRuntime.prototype.delete = function (workspaceId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.manager.delete(workspaceId)];
                    case 1:
                        result = _a.sent();
                        if (!result.ok)
                            throw new Error("workspace delete failed: ".concat(result.error.code, ": ").concat(result.error.message));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Move a Workspace within the durable registry display order.
     * @param workspaceId - Workspace to move.
     * @param beforeWorkspaceId - Anchor workspace; omitted appends.
     */
    WorkspaceRuntime.prototype.insertBefore = function (workspaceId, beforeWorkspaceId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.manager.insertBefore(workspaceId, beforeWorkspaceId)];
                    case 1:
                        result = _a.sent();
                        if (!result.ok)
                            throw new Error("workspace reorder failed: ".concat(result.error.code, ": ").concat(result.error.message));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Archive a session into the registry-global set. Clearing an archived
     * current selection is the projection sweep's job (one rule for the local
     * echo and a remote tab's frame alike).
     * @param sessionId - session to archive.
     */
    WorkspaceRuntime.prototype.archiveSession = function (sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.manager.archiveSession(sessionId)];
                    case 1:
                        result = _a.sent();
                        if (!result.ok)
                            throw new Error("session archive failed: ".concat(result.error.code, ": ").concat(result.error.message));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Move a session within its Workspace's manual order (DOM-insertBefore-like).
     * @param workspaceId - owning workspace.
     * @param sessionId - accounted session to move.
     * @param beforeSessionId - accounted anchor to insert before; omitted appends.
     * @returns the updated Workspace view.
     */
    WorkspaceRuntime.prototype.insertSessionBefore = function (workspaceId, sessionId, beforeSessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.manager.insertSessionBefore(workspaceId, sessionId, beforeSessionId)];
                    case 1:
                        result = _a.sent();
                        if (!result.ok)
                            throw new Error("workspace move failed: ".concat(result.error.code, ": ").concat(result.error.message));
                        return [2 /*return*/, result.value.workspace];
                }
            });
        });
    };
    /**
     * Refresh the workspace baseline, reusing an in-flight pull.
     * @returns completion of the current or newly started workspace baseline pull.
     */
    WorkspaceRuntime.prototype.refresh = function () {
        return this.manager.refresh();
    };
    /**
     * Route a Host stream envelope into the Workspace object layer.
     * @param envelope - validated Host stream envelope.
     */
    WorkspaceRuntime.prototype.handleHostEnvelope = function (envelope) {
        this.manager.handleHostEnvelope(envelope);
    };
    /** Rebuild the Workspace baseline after connection. */
    WorkspaceRuntime.prototype.handleConnected = function () {
        this.manager.handleConnected();
    };
    WorkspaceRuntime.prototype.project = function () {
        var workspace = this.manager.getSnapshot();
        var sessions = this.sessions.list.getSnapshot();
        var baselinesReady = workspace.phase === 'ready' && sessions.phase === 'ready';
        // An archived current selection clears into the New Session view state —
        // a hidden row must not stay open behind the list. Sweeping here covers
        // every install path with one rule: the local unary echo, another tab's
        // changed frame, and a reconnect baseline restoring a persisted
        // selection that was archived while this client was away.
        if (sessions.current !== undefined && workspace.archivedSessionIds.includes(sessions.current)) {
            this.sessions.clear();
        }
        this.list.set({
            items: workspace.items,
            archivedSessionIds: workspace.archivedSessionIds,
            state: workspace.state,
            phase: workspace.phase,
            error: workspace.error,
            baselinesReady: baselinesReady,
            recentWorkspaceId: baselinesReady ? recentWorkspace(workspace.items, sessions.byId) : undefined,
        });
    };
    return WorkspaceRuntime;
}());
exports.WorkspaceRuntime = WorkspaceRuntime;
/** Stable tie-breaking follows Host Workspace order. */
function recentWorkspace(workspaces, sessions) {
    var selected;
    var selectedTime = Number.NEGATIVE_INFINITY;
    for (var _i = 0, workspaces_1 = workspaces; _i < workspaces_1.length; _i++) {
        var workspace = workspaces_1[_i];
        var latest = Number.NEGATIVE_INFINITY;
        for (var _a = 0, _b = workspace.sessionIds; _a < _b.length; _a++) {
            var sessionId = _b[_a];
            var session = sessions[sessionId];
            if (session !== undefined)
                latest = Math.max(latest, session.updatedAt);
        }
        if (latest === Number.NEGATIVE_INFINITY)
            latest = Date.parse(workspace.createdAt);
        if (selected === undefined || latest > selectedTime) {
            selected = workspace.workspaceId;
            selectedTime = latest;
        }
    }
    return selected;
}
