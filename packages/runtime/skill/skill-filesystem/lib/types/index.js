"use strict";
/**
 * Local filesystem skill provider.
 *
 * This package is one implementation of the `ctx.skills` provider registry. It
 * discovers directory-bundle and flat Markdown skills from project, custom, and
 * user roots, parses YAML frontmatter, and loads bodies through `ctx.fs` when a
 * filesystem service is present.
 *
 * @module @z/dsh-skill-filesystem
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
exports.FileSystemSkillProvider = exports.Config = exports.inject = exports.name = void 0;
exports.apply = apply;
var promises_1 = require("node:fs/promises");
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var node_os_1 = require("node:os");
var chokidar_1 = require("chokidar");
var schemastery_1 = require("@z/schemastery");
var yaml_1 = require("yaml");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
var dsh_skill_1 = require("@z/dsh-skill");
var PROJECT_DSH_RANK = 100;
var PROJECT_AGENTS_RANK = 200;
var CUSTOM_RANK = 300;
var USER_DSH_RANK = 400;
var USER_AGENTS_RANK = 500;
var DEFAULT_WATCH_STABILITY_THRESHOLD_MS = 200;
var DEFAULT_WATCH_POLL_INTERVAL_MS = 100;
var DEFAULT_WATCH_MAX_PROJECTS = 128;
exports.name = 'skill-filesystem';
exports.inject = ['skills'];
exports.Config = schemastery_1.default.object({
    providerName: schemastery_1.default.string().min(1).default('filesystem'),
    includeDefaultRoots: schemastery_1.default.boolean().default(true),
    dshHome: schemastery_1.default.string(),
    agentsHome: schemastery_1.default.string(),
    customSkillDirs: schemastery_1.default.array(schemastery_1.default.string()).default([]),
    watch: schemastery_1.default.boolean().default(true),
    watchUsePolling: schemastery_1.default.boolean().default(false),
    watchStabilityThresholdMs: schemastery_1.default.number().default(DEFAULT_WATCH_STABILITY_THRESHOLD_MS),
    watchPollIntervalMs: schemastery_1.default.number().default(DEFAULT_WATCH_POLL_INTERVAL_MS),
    watchMaxProjects: schemastery_1.default.number().default(DEFAULT_WATCH_MAX_PROJECTS),
    watchFollowSymlinks: schemastery_1.default.boolean().default(true),
    bundledSkillDir: schemastery_1.default.string(),
});
/** Register the local filesystem skill provider on `ctx.skills`. */
function apply(ctx, config) {
    if (config === void 0) { config = {}; }
    var provider;
    ctx.skills.registerProvider(function (control) {
        provider = new FileSystemSkillProvider(ctx, control, config);
        return provider;
    });
    ctx.effect(function () {
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, provider.dispose()];
                            case 1:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    }); }); }];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }, 'skill-filesystem watcher');
    ctx.on('fs/observed', function (target, _observation, actor) {
        if (mutationToolName(actor) === undefined)
            return;
        provider.observeHostMutation(target.displayPath);
    });
}
/** Provider that maps local project/user skill roots into `ctx.skills`. */
var FileSystemSkillProvider = /** @class */ (function () {
    function FileSystemSkillProvider(ctx, control, config) {
        if (config === void 0) { config = {}; }
        var _this = this;
        var _a, _b, _c, _d, _e, _f;
        this.ctx = ctx;
        this.name = (_a = config.providerName) !== null && _a !== void 0 ? _a : 'filesystem';
        this.includeDefaultRoots = (_b = config.includeDefaultRoots) !== null && _b !== void 0 ? _b : true;
        this.dshHome = (0, dsh_home_paths_1.resolveDshHome)(config.dshHome);
        this.agentsHome = (0, node_path_1.resolve)((_d = (_c = config.agentsHome) !== null && _c !== void 0 ? _c : process.env.DSH_AGENTS_HOME) !== null && _d !== void 0 ? _d : (0, node_path_1.join)((0, node_os_1.homedir)(), '.agents'));
        this.customSkillDirs = ((_e = config.customSkillDirs) !== null && _e !== void 0 ? _e : []).map(function (root) { return (0, node_path_1.resolve)(root); });
        this.watchManager = new SkillWatchManager(ctx, control.invalidate, resolveWatchConfig(config));
        control.signal.addEventListener('abort', function () { void _this.dispose(); }, { once: true });
        // The environment bundled root is a default root: an isolated provider
        // must see only its explicit roots, or every such provider would
        // re-discover the app's bundled skills under its own provider name.
        var bundledSkillDir = (_f = config.bundledSkillDir) !== null && _f !== void 0 ? _f : (this.includeDefaultRoots ? process.env.DSH_BUNDLED_SKILL_DIR : undefined);
        this.bundledSkillDir = bundledSkillDir === undefined ? undefined : (0, node_path_1.resolve)(bundledSkillDir);
    }
    /**
     * Discover local skill summaries for a cwd-sensitive workspace.
     * @param options - lookup options; `cwd` selects the project roots to scan.
     * @returns local provider candidates with stable root ranks; watcher startup
     *   failure returns readable candidates as an incomplete observation.
     */
    FileSystemSkillProvider.prototype.list = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var roots, complete, error_1, candidates, _i, roots_1, root, _a, _b, skill;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.roots(options.cwd)];
                    case 1:
                        roots = _c.sent();
                        complete = true;
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.watchManager.observeRoots(roots)];
                    case 3:
                        _c.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _c.sent();
                        if (this.disposal !== undefined)
                            throw error_1;
                        complete = false;
                        return [3 /*break*/, 5];
                    case 5:
                        candidates = [];
                        _i = 0, roots_1 = roots;
                        _c.label = 6;
                    case 6:
                        if (!(_i < roots_1.length)) return [3 /*break*/, 11];
                        root = roots_1[_i];
                        _a = 0;
                        return [4 /*yield*/, discoverRoot(root, this.ctx, this.name)];
                    case 7:
                        _b = _c.sent();
                        _c.label = 8;
                    case 8:
                        if (!(_a < _b.length)) return [3 /*break*/, 10];
                        skill = _b[_a];
                        candidates.push(skill);
                        _c.label = 9;
                    case 9:
                        _a++;
                        return [3 /*break*/, 8];
                    case 10:
                        _i++;
                        return [3 /*break*/, 6];
                    case 11: return [2 /*return*/, complete ? candidates : { candidates: candidates, complete: complete }];
                }
            });
        });
    };
    /**
     * Load a complete local skill body from the candidate's file locator.
     * @param candidate - the winning candidate returned by this provider.
     * @param options - lookup options whose signal cancels filesystem reads.
     * @returns the full local skill, or `undefined` if the file disappeared.
     */
    FileSystemSkillProvider.prototype.get = function (candidate, options) {
        return __awaiter(this, void 0, void 0, function () {
            var locator, parsed;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        locator = candidate.locator;
                        return [4 /*yield*/, parseSkillFile(locator.path, this.ctx, options.signal, candidate.source === 'bundled')];
                    case 1:
                        parsed = _a.sent();
                        if (parsed === undefined)
                            return [2 /*return*/, undefined];
                        return [2 /*return*/, __assign(__assign(__assign(__assign({ name: parsed.name, description: parsed.description }, parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}), { invocation: parsed.invocation, source: candidate.source, provider: this.name, resourceBase: { kind: 'directory', path: locator.directory }, path: locator.path }), parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}), { content: parsed.content })];
                }
            });
        });
    };
    /**
     * Invalidate this provider synchronously after a first-party filesystem mutation.
     * @param path - host display path observed after a model-facing write or edit.
     */
    FileSystemSkillProvider.prototype.observeHostMutation = function (path) {
        this.watchManager.observeHostMutation(path);
    };
    /**
     * Close every host watcher and contain late filesystem callbacks.
     * @returns a shared promise that settles when every watcher reaches quiescence.
     */
    FileSystemSkillProvider.prototype.dispose = function () {
        var _a;
        (_a = this.disposal) !== null && _a !== void 0 ? _a : (this.disposal = this.watchManager.dispose());
        return this.disposal;
    };
    FileSystemSkillProvider.prototype.roots = function (cwd) {
        return __awaiter(this, void 0, void 0, function () {
            var roots, projectRoot;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        roots = [];
                        if (!(this.includeDefaultRoots && cwd !== undefined)) return [3 /*break*/, 2];
                        return [4 /*yield*/, findProjectRoot((0, node_path_1.resolve)(cwd), optionalFileSystem(this.ctx))];
                    case 1:
                        projectRoot = _a.sent();
                        roots.push({ path: (0, node_path_1.join)(projectRoot, '.dsh/skills'), source: 'project-dsh', rank: PROJECT_DSH_RANK, projectRoot: projectRoot }, { path: (0, node_path_1.join)(projectRoot, '.agents/skills'), source: 'project-agents', rank: PROJECT_AGENTS_RANK, projectRoot: projectRoot });
                        _a.label = 2;
                    case 2:
                        roots.push.apply(roots, this.customSkillDirs.map(function (path) { return ({ path: path, source: 'custom', rank: CUSTOM_RANK }); }));
                        if (this.includeDefaultRoots) {
                            roots.push({ path: (0, node_path_1.join)(this.dshHome, 'skills'), source: 'user-dsh', rank: USER_DSH_RANK, skipSystem: true }, { path: (0, node_path_1.join)(this.agentsHome, 'skills'), source: 'user-agents', rank: USER_AGENTS_RANK });
                        }
                        if (this.bundledSkillDir !== undefined) {
                            roots.push({ path: this.bundledSkillDir, source: 'bundled', rank: dsh_skill_1.BUNDLED_SKILL_RANK, trustedHost: true });
                        }
                        return [2 /*return*/, roots];
                }
            });
        });
    };
    return FileSystemSkillProvider;
}());
exports.FileSystemSkillProvider = FileSystemSkillProvider;
/** Owns bounded host watchers while discovery and reads remain on the filesystem service. */
var SkillWatchManager = /** @class */ (function () {
    function SkillWatchManager(ctx, invalidate, config) {
        this.ctx = ctx;
        this.invalidate = invalidate;
        this.config = config;
        this.roots = new Map();
        this.projects = new Map();
        this.lifecycle = new AbortController();
        this.closing = false;
        this.invalidationQueued = false;
    }
    SkillWatchManager.prototype.observeRoots = function (roots) {
        return __awaiter(this, void 0, void 0, function () {
            var projectRoots, pending, _i, roots_2, root, grouped, _a, projectRoots_1, _b, projectRoot, grouped, owner, paths, _c, grouped_1, root, evictedProject, oldest, _d, projectRoot, paths, owner, _e, paths_1, path;
            var _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        if (this.closing)
                            return [2 /*return*/];
                        projectRoots = new Map();
                        pending = [];
                        for (_i = 0, roots_2 = roots; _i < roots_2.length; _i++) {
                            root = roots_2[_i];
                            if (root.projectRoot === undefined) {
                                pending.push(this.retainRoot(root, "shared:".concat(root.path)));
                                continue;
                            }
                            grouped = (_f = projectRoots.get(root.projectRoot)) !== null && _f !== void 0 ? _f : [];
                            grouped.push(root);
                            projectRoots.set(root.projectRoot, grouped);
                        }
                        for (_a = 0, projectRoots_1 = projectRoots; _a < projectRoots_1.length; _a++) {
                            _b = projectRoots_1[_a], projectRoot = _b[0], grouped = _b[1];
                            owner = "project:".concat(projectRoot);
                            this.projects.delete(projectRoot);
                            paths = new Set(grouped.map(function (root) { return root.path; }));
                            this.projects.set(projectRoot, paths);
                            for (_c = 0, grouped_1 = grouped; _c < grouped_1.length; _c++) {
                                root = grouped_1[_c];
                                pending.push(this.retainRoot(root, owner));
                            }
                        }
                        evictedProject = false;
                        while (this.projects.size > this.config.maxProjects) {
                            oldest = this.projects.entries().next();
                            /* v8 ignore next -- the loop condition proves one project exists. */
                            if (oldest.done)
                                break;
                            _d = oldest.value, projectRoot = _d[0], paths = _d[1];
                            this.projects.delete(projectRoot);
                            owner = "project:".concat(projectRoot);
                            for (_e = 0, paths_1 = paths; _e < paths_1.length; _e++) {
                                path = paths_1[_e];
                                pending.push(this.releaseRoot(path, owner));
                            }
                            evictedProject = true;
                        }
                        return [4 /*yield*/, Promise.all(pending)];
                    case 1:
                        _g.sent();
                        if (evictedProject)
                            this.invalidate();
                        return [2 /*return*/];
                }
            });
        });
    };
    SkillWatchManager.prototype.observeHostMutation = function (path) {
        if (this.closing)
            return;
        var normalized = (0, node_path_1.resolve)(path);
        if (!__spreadArray([], this.roots.values(), true).some(function (state) { return isPotentialSkillPath(state.root, normalized); }))
            return;
        this.invalidate();
    };
    SkillWatchManager.prototype.dispose = function () {
        return __awaiter(this, void 0, void 0, function () {
            var states;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.closing = true;
                        this.lifecycle.abort(new Error('skill-filesystem watcher disposed'));
                        states = __spreadArray([], this.roots.values(), true);
                        this.roots.clear();
                        this.projects.clear();
                        return [4 /*yield*/, Promise.all(states.map(function (state) { return __awaiter(_this, void 0, void 0, function () {
                                var watcher;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, settleWatcherOpening(state.opening)];
                                        case 1:
                                            _a.sent();
                                            watcher = state.watcher;
                                            state.watcher = undefined;
                                            if (!(watcher !== undefined)) return [3 /*break*/, 3];
                                            return [4 /*yield*/, this.closeWatcher(watcher)];
                                        case 2:
                                            _a.sent();
                                            _a.label = 3;
                                        case 3: return [2 /*return*/];
                                    }
                                });
                            }); }))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    SkillWatchManager.prototype.retainRoot = function (root, owner) {
        return __awaiter(this, void 0, void 0, function () {
            var state;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        state = this.roots.get(root.path);
                        if (state === undefined) {
                            state = { root: root, owners: new Set(), watcher: undefined, opening: undefined, unhealthy: true };
                            this.roots.set(root.path, state);
                        }
                        state.owners.add(owner);
                        if (!this.config.enabled) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.ensureWatcher(state)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    SkillWatchManager.prototype.releaseRoot = function (path, owner) {
        return __awaiter(this, void 0, void 0, function () {
            var state, watcher;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        state = this.roots.get(path);
                        /* v8 ignore next -- Concurrent cwd observations can evict the same shared root before this release settles. */
                        if (state === undefined)
                            return [2 /*return*/];
                        state.owners.delete(owner);
                        if (state.owners.size > 0)
                            return [2 /*return*/];
                        this.roots.delete(path);
                        return [4 /*yield*/, settleWatcherOpening(state.opening)];
                    case 1:
                        _a.sent();
                        watcher = state.watcher;
                        state.watcher = undefined;
                        if (!(watcher !== undefined)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.closeWatcher(watcher)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    SkillWatchManager.prototype.ensureWatcher = function (state) {
        /* v8 ignore next -- A scheduled rewatch can reach this guard only when teardown wins its await. */
        if (this.closing || !this.config.enabled)
            return Promise.resolve();
        if (state.opening !== undefined)
            return state.opening;
        var opening = this.ensureCurrentWatcher(state);
        state.opening = opening;
        void opening.then(function () {
            state.opening = undefined;
        }, function () {
            state.opening = undefined;
        });
        return opening;
    };
    SkillWatchManager.prototype.ensureCurrentWatcher = function (state) {
        return __awaiter(this, void 0, void 0, function () {
            var watcher, current;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        watcher = state.watcher;
                        if (!(watcher !== undefined && !state.unhealthy)) return [3 /*break*/, 2];
                        return [4 /*yield*/, resolveRootWatchMode(state.root.path, this.config.followSymlinks)
                            // A child unlink can publish an empty catalog before root unlinkDir arrives.
                            // Discovery therefore revalidates the retained handle independently.
                            // oxlint-disable-next-line typescript/no-unnecessary-condition -- watcher callbacks can mark unhealthy while the probe awaits
                        ];
                    case 1:
                        current = _a.sent();
                        // A child unlink can publish an empty catalog before root unlinkDir arrives.
                        // Discovery therefore revalidates the retained handle independently.
                        // oxlint-disable-next-line typescript/no-unnecessary-condition -- watcher callbacks can mark unhealthy while the probe awaits
                        if (!state.unhealthy && sameWatchMode(watcher.mode, current))
                            return [2 /*return*/];
                        _a.label = 2;
                    case 2: return [4 /*yield*/, this.replaceWatcher(state)];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    SkillWatchManager.prototype.replaceWatcher = function (state) {
        return __awaiter(this, void 0, void 0, function () {
            var previous, watcher, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        previous = state.watcher;
                        state.watcher = undefined;
                        if (!(previous !== undefined)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.closeWatcher(previous)
                            /* v8 ignore next -- Teardown can win while an unhealthy watcher is still closing. */
                        ];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        /* v8 ignore next -- Teardown can win while an unhealthy watcher is still closing. */
                        if (this.closing || state.owners.size === 0)
                            return [2 /*return*/];
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 7, , 8]);
                        return [4 /*yield*/, this.openStableWatcher(state)
                            /* v8 ignore next -- The loop returns no handle only when teardown wins between awaited probes. */
                        ];
                    case 4:
                        watcher = _a.sent();
                        /* v8 ignore next -- The loop returns no handle only when teardown wins between awaited probes. */
                        if (watcher === undefined)
                            return [2 /*return*/];
                        if (!(this.closing || state.owners.size === 0)) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.closeWatcher(watcher)];
                    case 5:
                        _a.sent();
                        return [2 /*return*/];
                    case 6:
                        /* v8 ignore stop */
                        state.watcher = watcher;
                        state.unhealthy = false;
                        return [3 /*break*/, 8];
                    case 7:
                        error_2 = _a.sent();
                        // oxlint-disable-next-line typescript/no-unnecessary-condition -- teardown can race awaited watcher startup
                        if (!this.closing) {
                            state.unhealthy = true;
                            this.ctx.logger.warn("skill-filesystem: failed to watch ".concat(state.root.path, ": ").concat(errorMessage(error_2)));
                        }
                        throw error_2;
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    // TODO(file-watch-service): Extract Chokidar and missing-root observation below into a Cordis
    // service; keep skill filtering and invalidation here.
    SkillWatchManager.prototype.openStableWatcher = function (state) {
        return __awaiter(this, void 0, void 0, function () {
            var mode, watcher, _a, current;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!(!this.closing && state.owners.size > 0)) return [3 /*break*/, 7];
                        return [4 /*yield*/, resolveRootWatchMode(state.root.path, this.config.followSymlinks)];
                    case 1:
                        mode = _b.sent();
                        if (!(mode.kind === 'ancestor')) return [3 /*break*/, 2];
                        _a = this.openAncestorWatcher(state, mode);
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, this.openRootWatcher(state, mode)];
                    case 3:
                        _a = _b.sent();
                        _b.label = 4;
                    case 4:
                        watcher = _a;
                        return [4 /*yield*/, resolveRootWatchMode(state.root.path, this.config.followSymlinks)
                            /* v8 ignore else -- A host path transition between the two probes is timing-dependent. */
                        ];
                    case 5:
                        current = _b.sent();
                        /* v8 ignore else -- A host path transition between the two probes is timing-dependent. */
                        if (sameWatchMode(mode, current))
                            return [2 /*return*/, watcher
                                /* v8 ignore next -- Covered by the same host path transition guard. */
                            ];
                        /* v8 ignore next -- Covered by the same host path transition guard. */
                        return [4 /*yield*/, this.closeWatcher(watcher)];
                    case 6:
                        /* v8 ignore next -- Covered by the same host path transition guard. */
                        _b.sent();
                        return [3 /*break*/, 0];
                    case 7: 
                    /* v8 ignore next -- The loop exits only when teardown wins between awaited probes. */
                    return [2 /*return*/, undefined];
                }
            });
        });
    };
    SkillWatchManager.prototype.openAncestorWatcher = function (state, mode) {
        var _this = this;
        var listener = function (_current, _previous) {
            void _this.handleAncestorWatchEvent(state, mode);
        };
        (0, node_fs_1.watchFile)(mode.nextPath, {
            persistent: false,
            interval: this.config.pollIntervalMs,
        }, listener);
        return {
            mode: mode,
            close: function () {
                (0, node_fs_1.unwatchFile)(mode.nextPath, listener);
            },
        };
    };
    SkillWatchManager.prototype.handleAncestorWatchEvent = function (state, mode) {
        return __awaiter(this, void 0, void 0, function () {
            var current, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, resolveRootWatchMode(state.root.path, this.config.followSymlinks)];
                    case 1:
                        current = _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_3 = _a.sent();
                        /* v8 ignore start -- Non-absence stat failures need a platform permission or I/O fault. */
                        if (!this.closing && state.owners.size > 0)
                            this.handleWatcherError(state, error_3);
                        return [2 /*return*/];
                    case 3:
                        if (this.closing || state.owners.size === 0 || sameWatchMode(mode, current))
                            return [2 /*return*/];
                        this.queueInvalidation();
                        state.unhealthy = true;
                        this.scheduleRewatch(state);
                        return [2 /*return*/];
                }
            });
        });
    };
    SkillWatchManager.prototype.openRootWatcher = function (state, mode) {
        return __awaiter(this, void 0, void 0, function () {
            var watcher, handle, ready, readiness, signal, onAbort, onError, _loop_1, _i, _a, event_1, error_4;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        watcher = chokidar_1.default.watch(mode.anchor, {
                            // Chokidar owns late native fs.watch errors only for persistent watchers;
                            // this provider's effect explicitly closes every handle at teardown.
                            persistent: true,
                            ignoreInitial: true,
                            depth: 1,
                            followSymlinks: this.config.followSymlinks,
                            atomic: true,
                            awaitWriteFinish: {
                                stabilityThreshold: this.config.stabilityThresholdMs,
                                pollInterval: this.config.pollIntervalMs,
                            },
                            usePolling: this.config.usePolling,
                            interval: this.config.pollIntervalMs,
                        });
                        handle = {
                            mode: mode,
                            close: function () { return watcher.close(); },
                        };
                        ready = false;
                        readiness = Promise.withResolvers();
                        signal = this.lifecycle.signal;
                        if (!signal.aborted) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.closeWatcher(handle)];
                    case 1:
                        _b.sent();
                        signal.throwIfAborted();
                        _b.label = 2;
                    case 2:
                        onAbort = function () { readiness.reject(signal.reason); };
                        signal.addEventListener('abort', onAbort, { once: true });
                        onError = function (error) {
                            if (!ready) {
                                readiness.reject(error);
                                return;
                            }
                            _this.handleWatcherError(state, error);
                        };
                        watcher.on('error', onError);
                        watcher.once('ready', function () {
                            ready = true;
                            readiness.resolve(undefined);
                        });
                        _loop_1 = function (event_1) {
                            watcher.on(event_1, function (path) { _this.handleWatchEvent(state, mode, event_1, path); });
                        };
                        for (_i = 0, _a = ['add', 'addDir', 'change', 'unlink', 'unlinkDir']; _i < _a.length; _i++) {
                            event_1 = _a[_i];
                            _loop_1(event_1);
                        }
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 5, 7, 8]);
                        return [4 /*yield*/, readiness.promise];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 5:
                        error_4 = _b.sent();
                        return [4 /*yield*/, this.closeWatcher(handle)];
                    case 6:
                        _b.sent();
                        throw error_4;
                    case 7:
                        signal.removeEventListener('abort', onAbort);
                        return [7 /*endfinally*/];
                    case 8: return [2 /*return*/, handle];
                }
            });
        });
    };
    SkillWatchManager.prototype.handleWatchEvent = function (state, mode, event, path) {
        var target = (0, node_path_1.resolve)(path);
        if (this.closing || !isRelevantWatchEvent(__assign(__assign({}, state.root), { path: mode.anchor }), event, target))
            return;
        this.queueInvalidation();
        if (target === mode.anchor && event === 'unlinkDir') {
            state.unhealthy = true;
            this.scheduleRewatch(state);
        }
    };
    SkillWatchManager.prototype.handleWatcherError = function (state, error) {
        if (this.closing)
            return;
        this.ctx.logger.warn("skill-filesystem: watcher for ".concat(state.root.path, " failed: ").concat(errorMessage(error)));
        state.unhealthy = true;
        this.queueInvalidation();
        this.scheduleRewatch(state);
    };
    SkillWatchManager.prototype.scheduleRewatch = function (state) {
        var _this = this;
        var _a;
        var currentOpening = (_a = state.opening) !== null && _a !== void 0 ? _a : Promise.resolve();
        void (function () { return __awaiter(_this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, settleWatcherOpening(currentOpening)];
                    case 1:
                        _b.sent();
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.ensureWatcher(state)];
                    case 3:
                        _b.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        _a = _b.sent();
                        // Watch startup logged the retry failure; the next incomplete discovery retries it again.
                        return [2 /*return*/];
                    case 5:
                        this.queueInvalidation();
                        return [2 /*return*/];
                }
            });
        }); })();
    };
    SkillWatchManager.prototype.queueInvalidation = function () {
        var _this = this;
        if (this.closing || this.invalidationQueued)
            return;
        this.invalidationQueued = true;
        queueMicrotask(function () {
            _this.invalidationQueued = false;
            /* v8 ignore next -- Effect teardown can win this queued microtask before provider disposal emits. */
            if (_this.closing)
                return;
            _this.invalidate();
        });
    };
    SkillWatchManager.prototype.closeWatcher = function (watcher) {
        return __awaiter(this, void 0, void 0, function () {
            var error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, watcher.close()];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_5 = _a.sent();
                        this.ctx.logger.warn("skill-filesystem: failed to close watcher: ".concat(errorMessage(error_5)));
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return SkillWatchManager;
}());
function settleWatcherOpening(opening) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (opening === undefined)
                        return [2 /*return*/];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, opening];
                case 2:
                    _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function resolveWatchConfig(config) {
    var _a, _b, _c, _d, _e, _f;
    var stabilityThresholdMs = (_a = config.watchStabilityThresholdMs) !== null && _a !== void 0 ? _a : DEFAULT_WATCH_STABILITY_THRESHOLD_MS;
    var pollIntervalMs = (_b = config.watchPollIntervalMs) !== null && _b !== void 0 ? _b : DEFAULT_WATCH_POLL_INTERVAL_MS;
    var maxProjects = (_c = config.watchMaxProjects) !== null && _c !== void 0 ? _c : DEFAULT_WATCH_MAX_PROJECTS;
    assertPositiveInteger('watchStabilityThresholdMs', stabilityThresholdMs);
    assertPositiveInteger('watchPollIntervalMs', pollIntervalMs);
    assertPositiveInteger('watchMaxProjects', maxProjects);
    return {
        enabled: (_d = config.watch) !== null && _d !== void 0 ? _d : true,
        usePolling: (_e = config.watchUsePolling) !== null && _e !== void 0 ? _e : false,
        stabilityThresholdMs: stabilityThresholdMs,
        pollIntervalMs: pollIntervalMs,
        maxProjects: maxProjects,
        followSymlinks: (_f = config.watchFollowSymlinks) !== null && _f !== void 0 ? _f : true,
    };
}
function resolveRootWatchMode(root, followSymlinks) {
    return __awaiter(this, void 0, void 0, function () {
        var candidate, info, preserveRootLink, _a, anchor, _b, firstSegment, error_6, parent_1;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    candidate = root;
                    _c.label = 1;
                case 1:
                    if (!true) return [3 /*break*/, 12];
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 10, , 11]);
                    return [4 /*yield*/, (0, promises_1.stat)(candidate)];
                case 3:
                    info = _c.sent();
                    if (!info.isDirectory()) return [3 /*break*/, 9];
                    _a = candidate === root
                        && !followSymlinks;
                    if (!_a) return [3 /*break*/, 5];
                    return [4 /*yield*/, (0, promises_1.lstat)(candidate)];
                case 4:
                    _a = (_c.sent()).isSymbolicLink();
                    _c.label = 5;
                case 5:
                    preserveRootLink = _a;
                    if (!preserveRootLink) return [3 /*break*/, 6];
                    _b = (0, node_path_1.resolve)(candidate);
                    return [3 /*break*/, 8];
                case 6: return [4 /*yield*/, (0, dsh_home_paths_1.canonicalizeWatchPath)(candidate)];
                case 7:
                    _b = _c.sent();
                    _c.label = 8;
                case 8:
                    anchor = _b;
                    if (candidate === root)
                        return [2 /*return*/, { kind: 'root', anchor: anchor }];
                    firstSegment = (0, node_path_1.relative)(candidate, root).split(node_path_1.sep)[0];
                    /* v8 ignore next -- candidate is a strict ancestor of root. */
                    if (firstSegment === undefined || firstSegment.length === 0)
                        return [2 /*return*/, { kind: 'root', anchor: anchor }];
                    return [2 /*return*/, { kind: 'ancestor', anchor: anchor, nextPath: (0, node_path_1.join)(anchor, firstSegment) }];
                case 9: return [3 /*break*/, 11];
                case 10:
                    error_6 = _c.sent();
                    /* v8 ignore next -- Non-absence stat failures are platform/permission-specific and propagate as incomplete discovery. */
                    if (!isAbsentPathError(error_6))
                        throw error_6;
                    return [3 /*break*/, 11];
                case 11:
                    parent_1 = (0, node_path_1.dirname)(candidate);
                    /* v8 ignore next -- Traversal reaches the existing filesystem root before this fallback. */
                    if (parent_1 === candidate)
                        return [2 /*return*/, { kind: 'ancestor', anchor: candidate, nextPath: root }];
                    candidate = parent_1;
                    return [3 /*break*/, 1];
                case 12: return [2 /*return*/];
            }
        });
    });
}
function sameWatchMode(left, right) {
    return left.kind === right.kind
        && left.anchor === right.anchor
        && (left.kind === 'root' || (right.kind === 'ancestor' && left.nextPath === right.nextPath));
}
function isRelevantWatchEvent(root, event, path) {
    var _a;
    var segments = containedSegments(root.path, path);
    if (segments === undefined)
        return false;
    if (segments.length === 0)
        return event === 'addDir' || event === 'unlinkDir';
    if (root.skipSystem === true && segments[0] === '.system')
        return false;
    if (segments.length === 1) {
        if (event === 'addDir' || event === 'unlinkDir')
            return true;
        return ((_a = segments[0]) === null || _a === void 0 ? void 0 : _a.endsWith('.md')) === true;
    }
    return segments.length === 2
        && segments[1] === 'SKILL.md'
        && event !== 'addDir'
        && event !== 'unlinkDir';
}
function isPotentialSkillPath(root, path) {
    var _a;
    var segments = containedSegments(root.path, path);
    if (segments === undefined || segments.length === 0 || segments.length > 2)
        return false;
    if (root.skipSystem === true && segments[0] === '.system')
        return false;
    return segments.length === 1
        ? ((_a = segments[0]) === null || _a === void 0 ? void 0 : _a.endsWith('.md')) === true
        : segments[1] === 'SKILL.md';
}
function containedSegments(root, path) {
    var child = (0, node_path_1.relative)(root, path);
    if (child.length === 0)
        return [];
    if (child === '..' || child.startsWith("..".concat(node_path_1.sep)) || (0, node_path_1.isAbsolute)(child))
        return undefined;
    return child.split(node_path_1.sep);
}
function mutationToolName(actor) {
    if (actor === undefined || !('name' in actor))
        return undefined;
    var value = actor.name;
    return value === 'edit' || value === 'write' ? value : undefined;
}
function assertPositiveInteger(field, value) {
    if (!Number.isInteger(value) || value < 1) {
        throw new TypeError("skill-filesystem: ".concat(field, " must be a positive integer"));
    }
}
function isAbsentPathError(error) {
    return hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR');
}
function isAbsentSkillPathError(error) {
    return isAbsentPathError(error)
        || hasErrorCode(error, 'FS_NOT_FOUND')
        || hasErrorCode(error, 'FS_NOT_DIRECTORY');
}
function hasErrorCode(error, code) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
function discoverRoot(root, ctx, provider) {
    return __awaiter(this, void 0, void 0, function () {
        var skills, entries, _i, _a, entry, locator, parsed;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    skills = [];
                    return [4 /*yield*/, listSkillRootEntries(root, ctx)];
                case 1:
                    entries = _b.sent();
                    _i = 0, _a = entries.sort(function (a, b) { return a.name.localeCompare(b.name); });
                    _b.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 5];
                    entry = _a[_i];
                    if (root.skipSystem && entry.name === '.system')
                        return [3 /*break*/, 4];
                    locator = entry.type === 'directory'
                        ? { path: (0, node_path_1.join)(entry.path, 'SKILL.md'), directory: entry.path }
                        : entry.type === 'file' && entry.name.endsWith('.md')
                            ? { path: entry.path, directory: root.path }
                            : undefined;
                    if (locator === undefined)
                        return [3 /*break*/, 4];
                    return [4 /*yield*/, parseSkillFile(locator.path, ctx, undefined, root.trustedHost === true)];
                case 3:
                    parsed = _b.sent();
                    if (parsed === undefined)
                        return [3 /*break*/, 4];
                    skills.push(__assign(__assign(__assign({ name: parsed.name, description: parsed.description }, parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}), { invocation: parsed.invocation, provider: provider, source: root.source, rank: root.rank, locator: locator, resourceBase: { kind: 'directory', path: locator.directory }, path: locator.path }), parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}));
                    _b.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, skills];
            }
        });
    });
}
function listSkillRootEntries(root, ctx) {
    return __awaiter(this, void 0, void 0, function () {
        var fs;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    fs = optionalFileSystem(ctx);
                    if (!(fs !== undefined && root.trustedHost !== true)) return [3 /*break*/, 2];
                    return [4 /*yield*/, listSkillRootEntriesFromFileSystem(root, fs)];
                case 1: return [2 /*return*/, _a.sent()];
                case 2: return [4 /*yield*/, listSkillRootEntriesFromNode(root, ctx)];
                case 3: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
function listSkillRootEntriesFromFileSystem(root, fs) {
    return __awaiter(this, void 0, void 0, function () {
        var error_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fsListDir(fs, root.path)];
                case 1: return [2 /*return*/, (_a.sent()).map(entryFromFs)];
                case 2:
                    error_7 = _a.sent();
                    if (isAbsentSkillPathError(error_7))
                        return [2 /*return*/, []];
                    throw error_7;
                case 3: return [2 /*return*/];
            }
        });
    });
}
function fsListDir(fs, path) {
    return __awaiter(this, void 0, void 0, function () {
        var target;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs.resolve(path)];
                case 1:
                    target = _a.sent();
                    return [4 /*yield*/, fs.listDir(target)];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
function entryFromFs(entry) {
    return { name: entry.name, type: entry.type, path: entry.target.displayPath };
}
function listSkillRootEntriesFromNode(root, ctx) {
    return __awaiter(this, void 0, void 0, function () {
        var entries, error_8, result, _i, entries_1, entry, path, type;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, promises_1.readdir)(root.path, { withFileTypes: true, encoding: 'utf8' })];
                case 1:
                    entries = _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    error_8 = _a.sent();
                    /* v8 ignore else -- Native non-absence directory failures are provider-dependent; the ctx.fs path pins incomplete discovery. */
                    if (isAbsentSkillPathError(error_8))
                        return [2 /*return*/, []
                            /* v8 ignore next -- Same native error branch as above. */
                        ];
                    /* v8 ignore next -- Same native error branch as above. */
                    throw error_8;
                case 3:
                    result = [];
                    _i = 0, entries_1 = entries;
                    _a.label = 4;
                case 4:
                    if (!(_i < entries_1.length)) return [3 /*break*/, 7];
                    entry = entries_1[_i];
                    path = (0, node_path_1.join)(root.path, entry.name);
                    return [4 /*yield*/, nodeEntryKind(path, entry, ctx)];
                case 5:
                    type = _a.sent();
                    result.push({ name: entry.name, type: type !== null && type !== void 0 ? type : 'other', path: path });
                    _a.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 4];
                case 7: return [2 /*return*/, result];
            }
        });
    });
}
function parseSkillFile(path_1, ctx_1, signal_1) {
    return __awaiter(this, arguments, void 0, function (path, ctx, signal, trustedHost) {
        var raw, parsed, name, description, invocation;
        if (trustedHost === void 0) { trustedHost = false; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, readSkillText(ctx, path, signal, trustedHost)];
                case 1:
                    raw = _a.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    if (raw === undefined) {
                        return [2 /*return*/, undefined];
                    }
                    try {
                        parsed = parseFrontmatter(raw);
                    }
                    catch (error) {
                        ctx.logger.warn("skill file ".concat(path, " ignored: invalid YAML frontmatter: ").concat(errorMessage(error)));
                        return [2 /*return*/, undefined];
                    }
                    if (!parsed) {
                        ctx.logger.warn("skill file ".concat(path, " ignored: missing YAML frontmatter"));
                        return [2 /*return*/, undefined];
                    }
                    name = stringField(parsed.data, 'name');
                    description = stringField(parsed.data, 'description');
                    if (name === undefined || description === undefined) {
                        ctx.logger.warn("skill file ".concat(path, " ignored: frontmatter requires name and description"));
                        return [2 /*return*/, undefined];
                    }
                    if (!(0, dsh_skill_1.isSkillName)(name)) {
                        ctx.logger.warn("skill file ".concat(path, " ignored: invalid skill name \"").concat(name, "\""));
                        return [2 /*return*/, undefined];
                    }
                    try {
                        invocation = parseInvocationPolicy(parsed.data);
                    }
                    catch (error) {
                        ctx.logger.warn("skill file ".concat(path, " ignored: invalid invocation frontmatter: ").concat(errorMessage(error)));
                        return [2 /*return*/, undefined];
                    }
                    return [2 /*return*/, __assign(__assign(__assign(__assign({ name: name, description: description }, optionalString(parsed.data, 'whenToUse')), { invocation: invocation }), optionalMetadata(parsed.data)), { content: parsed.body.trim() })];
            }
        });
    });
}
function optionalFileSystem(ctx) {
    return ctx.get('fs');
}
function readSkillText(ctx_1, path_1, signal_1) {
    return __awaiter(this, arguments, void 0, function (ctx, path, signal, trustedHost) {
        var fs, error_9;
        if (trustedHost === void 0) { trustedHost = false; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    fs = optionalFileSystem(ctx);
                    if (!(fs !== undefined && !trustedHost)) return [3 /*break*/, 2];
                    return [4 /*yield*/, readSkillTextFromFileSystem(ctx, fs, path, signal)];
                case 1: return [2 /*return*/, _a.sent()];
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, (0, promises_1.readFile)(path, { encoding: 'utf8', signal: signal })];
                case 3: return [2 /*return*/, _a.sent()];
                case 4:
                    error_9 = _a.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    if (isAbsentSkillPathError(error_9))
                        return [2 /*return*/, undefined];
                    throw error_9;
                case 5: return [2 /*return*/];
            }
        });
    });
}
function readSkillTextFromFileSystem(ctx, fs, path, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var target, error_10, info, error_11, error_12;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // A missing or temporarily inaccessible skill file is not fatal to discovery.
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fs.resolve(path)];
                case 2:
                    target = _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_10 = _a.sent();
                    if (isAbsentSkillPathError(error_10))
                        return [2 /*return*/, undefined];
                    throw error_10;
                case 4:
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, fs.stat(target, signal)];
                case 6:
                    info = _a.sent();
                    return [3 /*break*/, 8];
                case 7:
                    error_11 = _a.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    if (isAbsentSkillPathError(error_11))
                        return [2 /*return*/, undefined];
                    throw error_11;
                case 8:
                    if (info === undefined || info.type !== 'file')
                        return [2 /*return*/, undefined];
                    _a.label = 9;
                case 9:
                    _a.trys.push([9, 11, , 12]);
                    return [4 /*yield*/, fs.readText(target, signal)];
                case 10: return [2 /*return*/, _a.sent()];
                case 11:
                    error_12 = _a.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    if (isAbsentSkillPathError(error_12))
                        return [2 /*return*/, undefined];
                    if (!hasErrorCode(error_12, 'FS_NOT_TEXT'))
                        throw error_12;
                    ctx.logger.warn("skill file ".concat(path, " ignored: ").concat(fsReadErrorMessage(target, error_12)));
                    return [2 /*return*/, undefined];
                case 12: return [2 /*return*/];
            }
        });
    });
}
function fsReadErrorMessage(target, error) {
    return "failed to read text file at ".concat(target.displayPath, ": ").concat(errorMessage(error));
}
function nodeEntryKind(fullPath, entry, ctx) {
    return __awaiter(this, void 0, void 0, function () {
        var info, error_13;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (entry.isDirectory())
                        return [2 /*return*/, 'directory'];
                    if (entry.isFile())
                        return [2 /*return*/, 'file'
                            /* v8 ignore next -- Non-file directory entries such as FIFOs are platform-specific and intentionally skipped. */
                        ];
                    /* v8 ignore next -- Non-file directory entries such as FIFOs are platform-specific and intentionally skipped. */
                    if (!entry.isSymbolicLink())
                        return [2 /*return*/, undefined];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, promises_1.stat)(fullPath)];
                case 2:
                    info = _a.sent();
                    if (info.isDirectory())
                        return [2 /*return*/, 'directory'
                            /* v8 ignore else -- the special-file symlink branch relies on POSIX /dev/null. */
                        ];
                    /* v8 ignore else -- the special-file symlink branch relies on POSIX /dev/null. */
                    if (info.isFile())
                        return [2 /*return*/, 'file'
                            /* v8 ignore next -- The special-file symlink fixture relies on POSIX /dev/null. */
                        ];
                    /* v8 ignore next -- The special-file symlink fixture relies on POSIX /dev/null. */
                    return [2 /*return*/, undefined];
                case 3:
                    error_13 = _a.sent();
                    ctx.logger.warn("skill entry ".concat(fullPath, " ignored: failed to follow symbolic link: ").concat(errorMessage(error_13)));
                    return [2 /*return*/, undefined];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function parseFrontmatter(raw) {
    var firstLineEnd = raw.indexOf('\n');
    if (firstLineEnd < 0)
        return undefined;
    var firstLine = raw.slice(0, firstLineEnd).replace(/\r$/, '');
    if (firstLine !== '---')
        return undefined;
    var start = firstLineEnd + 1;
    var closing = findClosingFrontmatter(raw, start);
    if (closing === undefined)
        return undefined;
    var yaml = raw.slice(start, closing.start);
    var parsed = (0, yaml_1.parse)(yaml);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        return undefined;
    return { data: parsed, body: raw.slice(closing.bodyStart) };
}
function findClosingFrontmatter(raw, start) {
    var lineStart = start;
    while (lineStart <= raw.length) {
        var nextNewline = raw.indexOf('\n', lineStart);
        var lineEnd = nextNewline < 0 ? raw.length : nextNewline;
        var line = raw.slice(lineStart, lineEnd).replace(/\r$/, '');
        if (line === '---') {
            return { start: lineStart, bodyStart: nextNewline < 0 ? raw.length : nextNewline + 1 };
        }
        if (nextNewline < 0)
            return undefined;
        lineStart = nextNewline + 1;
    }
}
function findProjectRoot(cwd, fs) {
    return __awaiter(this, void 0, void 0, function () {
        var current, parent_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    current = cwd;
                    _a.label = 1;
                case 1:
                    if (!true) return [3 /*break*/, 3];
                    return [4 /*yield*/, pathExists((0, node_path_1.join)(current, '.git'), fs)];
                case 2:
                    if (_a.sent()) {
                        return [2 /*return*/, current];
                    }
                    parent_2 = (0, node_path_1.dirname)(current);
                    if (parent_2 === current)
                        return [2 /*return*/, cwd];
                    current = parent_2;
                    return [3 /*break*/, 1];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function pathExists(path, fs) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(fs !== undefined)) return [3 /*break*/, 2];
                    return [4 /*yield*/, pathExistsInFileSystem(path, fs)];
                case 1: return [2 /*return*/, _a.sent()];
                case 2: return [4 /*yield*/, pathExistsInNode(path)];
                case 3: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
function pathExistsInFileSystem(path, fs) {
    return __awaiter(this, void 0, void 0, function () {
        var target, _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fs.resolve(path)];
                case 1:
                    target = _c.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _a = _c.sent();
                    // A backend may reject or hide this candidate; continue walking upward.
                    return [2 /*return*/, false];
                case 3:
                    _c.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, fs.stat(target)];
                case 4: return [2 /*return*/, (_c.sent()) !== undefined];
                case 5:
                    _b = _c.sent();
                    // Transient stat failures make only this git-root candidate unusable.
                    return [2 /*return*/, false];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function pathExistsInNode(path) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, promises_1.access)(path)];
                case 1:
                    _b.sent();
                    return [2 /*return*/, true];
                case 2:
                    _a = _b.sent();
                    // Missing host paths are expected while walking toward the filesystem root.
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function stringField(data, key) {
    var value = data[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function optionalString(data, key) {
    var _a;
    var value = data[key];
    return typeof value === 'string' && value.length > 0 ? (_a = {}, _a[key] = value, _a) : {};
}
function parseInvocationPolicy(data) {
    rejectLegacyInvocationKey(data, 'disableModelInvocation', 'disable-model-invocation');
    rejectLegacyInvocationKey(data, 'modelInvocable', 'disable-model-invocation');
    rejectLegacyInvocationKey(data, 'userInvocable', 'user-invocable');
    var disableModelInvocation = frontmatterBoolean(data, 'disable-model-invocation');
    var userInvocable = frontmatterBoolean(data, 'user-invocable');
    return {
        modelInvocable: disableModelInvocation !== true,
        userInvocable: userInvocable !== false,
    };
}
function rejectLegacyInvocationKey(data, legacy, canonical) {
    if (Object.hasOwn(data, legacy)) {
        throw new Error("frontmatter field \"".concat(legacy, "\" is unsupported; use \"").concat(canonical, "\""));
    }
}
function frontmatterBoolean(data, key) {
    if (!Object.hasOwn(data, key))
        return undefined;
    var value = data[key];
    if (typeof value === 'boolean')
        return value;
    if (value === 1 || value === '1')
        return true;
    if (value === 0 || value === '0')
        return false;
    if (typeof value === 'string') {
        switch (value.toLowerCase()) {
            case 'true':
            case 'yes':
            case 'on':
                return true;
            case 'false':
            case 'no':
            case 'off':
                return false;
        }
    }
    throw new TypeError("frontmatter field \"".concat(key, "\" must be a boolean"));
}
function optionalMetadata(data) {
    var value = data.metadata;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return { metadata: value };
    }
    return {};
}
function errorMessage(error) {
    return String(error);
}
