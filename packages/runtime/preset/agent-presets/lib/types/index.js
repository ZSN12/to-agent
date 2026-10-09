"use strict";
/**
 * Agent presets: each session composes its model-facing plugin set from one
 * preset `cordis.yml`, mounted ONCE per preset under a standing scope and
 * joined by every agent that names it.
 *
 * The standing mount is what makes a preset one composition rather than one
 * per session: its plugin instances, tool registrations, prompt sections, and
 * projection units exist exactly once, keyed per session inside the plugins
 * themselves (they predate presets and were written for a shared world). An
 * agent joins by having its scope key parented to the mount's
 * ({@link bindScopeParent}), which makes the mount's registrations visible to
 * that agent's views and the mount's listeners receive that agent's events —
 * and a host reader with no agent at all (a cold transcript read) resolves
 * the same standing registrations by preset id.
 *
 * This package owns the preset vocabulary, filesystem discovery, and the
 * guarded standing mount. It does not decide when an agent is created — the
 * agent factory's `setup(agentCtx)` hook is the one supported call site,
 * because only there is the join installed while the agent is still
 * unpublished, so a rejected composition rolls the whole creation back.
 * @module @z/dsh-agent-presets
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
exports.AgentPresets = exports.UnknownPresetError = exports.PresetMountError = exports.resolveSessionPreset = exports.writableRoot = exports.readComposition = exports.PresetNotWritableError = exports.PresetExistsError = exports.InvalidPresetIdError = exports.deleteComposition = exports.copyComposition = exports.standingMountFor = exports.serviceForAgent = exports.mountPreset = exports.livePresetMounts = exports.leakedServices = exports.inactiveRows = exports.renderPresetMetadata = exports.readPresetMetadata = exports.METADATA_FILE = exports.scanRoot = exports.discoverPresets = exports.COMPOSITION_FILE = exports.AgentPresetSettingsSchema = exports.SETTINGS_NAMESPACE = void 0;
var promises_1 = require("node:fs/promises");
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var dsh_scope_1 = require("@z/dsh-scope");
var dsh_settings_1 = require("@z/dsh-settings");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
var discovery_ts_1 = require("./discovery.ts");
var authoring_ts_1 = require("./authoring.ts");
var mount_ts_1 = require("./mount.ts");
var authoring_ts_2 = require("./authoring.ts");
var preset_ts_1 = require("./preset.ts");
/** Settings namespace carrying the user's chosen default preset. */
exports.SETTINGS_NAMESPACE = 'agent-presets';
/** Runtime schema for the user-writable slice. */
exports.AgentPresetSettingsSchema = schemastery_1.default.object({
    default: schemastery_1.default.string(),
});
var discovery_ts_2 = require("./discovery.ts");
Object.defineProperty(exports, "COMPOSITION_FILE", { enumerable: true, get: function () { return discovery_ts_2.COMPOSITION_FILE; } });
Object.defineProperty(exports, "discoverPresets", { enumerable: true, get: function () { return discovery_ts_2.discoverPresets; } });
Object.defineProperty(exports, "scanRoot", { enumerable: true, get: function () { return discovery_ts_2.scanRoot; } });
var metadata_ts_1 = require("./metadata.ts");
Object.defineProperty(exports, "METADATA_FILE", { enumerable: true, get: function () { return metadata_ts_1.METADATA_FILE; } });
Object.defineProperty(exports, "readPresetMetadata", { enumerable: true, get: function () { return metadata_ts_1.readPresetMetadata; } });
Object.defineProperty(exports, "renderPresetMetadata", { enumerable: true, get: function () { return metadata_ts_1.renderPresetMetadata; } });
var mount_ts_2 = require("./mount.ts");
Object.defineProperty(exports, "inactiveRows", { enumerable: true, get: function () { return mount_ts_2.inactiveRows; } });
Object.defineProperty(exports, "leakedServices", { enumerable: true, get: function () { return mount_ts_2.leakedServices; } });
Object.defineProperty(exports, "livePresetMounts", { enumerable: true, get: function () { return mount_ts_2.livePresetMounts; } });
Object.defineProperty(exports, "mountPreset", { enumerable: true, get: function () { return mount_ts_2.mountPreset; } });
Object.defineProperty(exports, "serviceForAgent", { enumerable: true, get: function () { return mount_ts_2.serviceForAgent; } });
Object.defineProperty(exports, "standingMountFor", { enumerable: true, get: function () { return mount_ts_2.standingMountFor; } });
var authoring_ts_3 = require("./authoring.ts");
Object.defineProperty(exports, "copyComposition", { enumerable: true, get: function () { return authoring_ts_3.copyComposition; } });
Object.defineProperty(exports, "deleteComposition", { enumerable: true, get: function () { return authoring_ts_3.deleteComposition; } });
Object.defineProperty(exports, "InvalidPresetIdError", { enumerable: true, get: function () { return authoring_ts_3.InvalidPresetIdError; } });
Object.defineProperty(exports, "PresetExistsError", { enumerable: true, get: function () { return authoring_ts_3.PresetExistsError; } });
Object.defineProperty(exports, "PresetNotWritableError", { enumerable: true, get: function () { return authoring_ts_3.PresetNotWritableError; } });
Object.defineProperty(exports, "readComposition", { enumerable: true, get: function () { return authoring_ts_3.readComposition; } });
Object.defineProperty(exports, "writableRoot", { enumerable: true, get: function () { return authoring_ts_3.writableRoot; } });
var session_ts_1 = require("./session.ts");
Object.defineProperty(exports, "resolveSessionPreset", { enumerable: true, get: function () { return session_ts_1.resolveSessionPreset; } });
var preset_ts_2 = require("./preset.ts");
Object.defineProperty(exports, "PresetMountError", { enumerable: true, get: function () { return preset_ts_2.PresetMountError; } });
Object.defineProperty(exports, "UnknownPresetError", { enumerable: true, get: function () { return preset_ts_2.UnknownPresetError; } });
/**
 * Registry over the deployment's agent presets.
 *
 * Discovery is unmemoized: `list()` and `resolve()` re-read the roots on every
 * call so a preset authored while the process runs is visible immediately,
 * and a preset deleted underneath a picker disappears from the next read.
 */
var AgentPresets = /** @class */ (function (_super) {
    __extends(AgentPresets, _super);
    function AgentPresets(ctx, config) {
        var _this = _super.call(this, ctx, 'agentPresets') || this;
        _this.config = config;
        /**
         * Standing mounts by preset id, single-flight so two agents racing the
         * first use of one preset share one composition. A settled failure is
         * removed so a later session retries a preset whose file has been fixed; a
         * settled success serves until the composition FILE visibly changes — each
         * generation records its file stamp, and a stale stamp starts the next
         * generation for sessions created afterwards. Sessions already joined keep
         * the generation they run on; a superseded one is never disposed while the
         * process lives (reclaimed only by whole-tree teardown), so editing files
         * is bounded by how often compositions change, not by session count.
         */
        _this.standing = new Map();
        /**
         * Parent bindings of the agents this roster composed, keyed by the agent's
         * scope key. The binding is dsh-scope's only re-link capability; holding it
         * here makes this service the sole authority that can move an agent between
         * standing compositions. WeakMap: entries die with their agents.
         */
        _this.bindings = new WeakMap();
        _this.selfCtx = ctx;
        _this.resolvedRoots = config.includeUserRoot
            ? __spreadArray(__spreadArray([], config.roots, true), [{ path: (0, dsh_home_paths_1.dshHomePath)(discovery_ts_1.USER_PRESET_DIR), trust: 'user' }], false) : __spreadArray([], config.roots, true);
        // Deliberately not `installSettingsSection`: that helper exists to re-judge
        // what a consumer DERIVED from the source — memoized resolutions,
        // registration-level facts — across attach, detach, and change. Nothing
        // here is derived. `defaultId` reads through on every call, so both of its
        // hooks would be no-ops and the source thunk would restate this field.
        ctx.inject(['settings'], function (settingsCtx) {
            _this.settings = settingsCtx.settings.register((0, dsh_settings_1.settingsNamespace)(exports.SETTINGS_NAMESPACE), exports.AgentPresetSettingsSchema, { base: { default: config.default } });
            _this.settingsService = settingsCtx.settings;
            settingsCtx.effect(function () { return function () {
                _this.settings = undefined;
                _this.settingsService = undefined;
            }; }, 'agentPresets.settings()');
        });
        // Advisory, not fatal: a synchronous `agent/created` listener that throws
        // VETOES publication, and this service must not, because composing an agent
        // outside the roster is legal — `recompose` binds exactly such a bare agent
        // below, and the ACP, SDK-server, and headless entry points all create one.
        // The invariant companion is the check that fails loud, at assembly. Why an
        // unjoined agent matters at all has one home: the [Agent
        // Note](../../../../.agents/notes/implemented/architecture/2026-08-10-host-plane-ownership-after-presets.md).
        //
        // Known false positive: a session created bare and bound later by
        // `recompose` is warned about once, before its first bind. No shipped flow
        // does that today — the Web surface mounts in `setup` and children join
        // through `composeFrom` before publication.
        ctx.on('agent/created', function (_a) {
            var agent = _a.agent;
            if (_this.resolvedRoots.length === 0)
                return;
            if (_this.composedPreset(agent.ctx) !== undefined)
                return;
            ctx.logger.warn("agent \"".concat(agent.id, "\" was published without joining an agent preset; ")
                + 'its tools, prompt sections, and skill catalog resolve against the empty global layer '
                + '(join through AgentPresets.mount() or composeFrom() in the agent factory setup)');
        });
        // The durable record is the commit point. Its public notification carries
        // only the stable identity needed by clients, never the live Session.
        ctx.on('session/event', function (session, event) {
            if (event.type !== 'agent-preset/selected')
                return;
            ctx.emit('agent-preset/selected', session.id, event.data.agentPreset);
        });
        return _this;
    }
    Object.defineProperty(AgentPresets.prototype, "defaultId", {
        /**
         * The preset id mounted when a caller names none.
         *
         * Read per call rather than cached: the settings document is hot-reloaded, so
         * changing the default takes effect on the next session created and leaves
         * every running session on the preset it was composed from.
         */
        get: function () {
            var _a, _b;
            return (_b = (_a = this.settings) === null || _a === void 0 ? void 0 : _a.get().default) !== null && _b !== void 0 ? _b : this.config.default;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Every preset the configured roots currently supply.
     * @returns the presets, first-root-wins per id.
     */
    AgentPresets.prototype.list = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, discovery_ts_1.discoverPresets)(this.resolvedRoots)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Resolve one preset by id.
     *
     * A broken preset resolves — deleting one, reading one, and reporting one
     * all need the row — and the mounting paths refuse it AFTER resolution
     * through {@link resolveMountable}.
     * @param id - the preset id, or `undefined` for {@link defaultId}.
     * @returns the resolved preset.
     * @throws when no configured root supplies that id.
     */
    AgentPresets.prototype.resolve = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var wanted, presets, found;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        wanted = id !== null && id !== void 0 ? id : this.defaultId;
                        return [4 /*yield*/, this.list()];
                    case 1:
                        presets = _a.sent();
                        found = presets.find(function (preset) { return preset.id === wanted; });
                        if (found === undefined) {
                            throw new preset_ts_1.UnknownPresetError(wanted, presets.map(function (preset) { return preset.id; }));
                        }
                        return [2 /*return*/, found];
                }
            });
        });
    };
    /**
     * Resolve one preset that is about to compose an agent, refusing a broken
     * one with its discovery-reported reason. Failing here rather than inside
     * the loader keeps the answer the same for every unloadable shape — ghost
     * directory, unparsable YAML, rowless list — and spends no mount attempt
     * on a composition discovery already read as unusable.
     * @param id - the preset id, or `undefined` for {@link defaultId}.
     * @returns the resolved, mountable preset.
     * @throws when the preset is unknown or discovery reports it broken.
     */
    AgentPresets.prototype.resolveMountable = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var preset;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.resolve(id)];
                    case 1:
                        preset = _a.sent();
                        if (preset.broken !== undefined) {
                            throw new preset_ts_1.PresetMountError(preset.id, preset.broken);
                        }
                        return [2 /*return*/, preset];
                }
            });
        });
    };
    /**
     * Compose one agent from a preset: ensure the preset's standing mount, then
     * parent the agent's scope key to it so the mount's registrations and
     * listeners cover this agent.
     *
     * Call from the agent factory's `setup(agentCtx)`; a rejection there rolls
     * the agent creation back, so a broken preset never yields a half-composed
     * session.
     * @param agentCtx - the agent's scope context.
     * @param id - the preset id, or `undefined` for {@link defaultId}.
     * @returns the preset that was composed, for the caller to record.
     * @throws when the preset is unknown or its composition is unusable.
     */
    AgentPresets.prototype.mount = function (agentCtx, id) {
        return __awaiter(this, void 0, void 0, function () {
            var agentKey, preset, standing;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        agentKey = (0, dsh_scope_1.scopeOf)(agentCtx);
                        if (agentKey === undefined) {
                            throw new Error('agent-presets: refusing to compose an unscoped context; the scope key is what joins an agent to its preset');
                        }
                        return [4 /*yield*/, this.resolveMountable(id)];
                    case 1:
                        preset = _a.sent();
                        return [4 /*yield*/, this.ensureStanding(preset)
                            // The one bind of this agent's ancestry. The binding is the only re-link
                            // authority, held privately so nothing outside this roster can move a
                            // composed agent to another preset; a later recompose layer re-links
                            // through it under the caller-owned blank-session contract.
                        ];
                    case 2:
                        standing = _a.sent();
                        // The one bind of this agent's ancestry. The binding is the only re-link
                        // authority, held privately so nothing outside this roster can move a
                        // composed agent to another preset; a later recompose layer re-links
                        // through it under the caller-owned blank-session contract.
                        this.bindings.set(agentKey, (0, dsh_scope_1.bindScopeParent)(agentKey, standing.key));
                        return [2 /*return*/, preset];
                }
            });
        });
    };
    /**
     * Join one agent to the SAME standing composition another already runs on.
     *
     * This is how a child agent inherits its parent's capabilities. It is a bind,
     * not a mount: the parent's generation is already composed, so the child gets
     * that exact instance — the same plugin objects, the same tool registrations,
     * the same prompt sections. Re-resolving the parent's preset by id instead
     * would re-read the roster, and a composition file edited since the parent
     * started would hand the child a DIFFERENT generation than the one its
     * parent's history was produced under (and a preset deleted since would fail
     * the child outright while its parent keeps running).
     *
     * Synchronous, and with no composition failure mode of its own — it reads no
     * roster, mounts nothing, and touches no file — which is what lets a child
     * creation window use it: the two in-process subagent drivers compose their
     * children inside a synchronous `setup`. It still rejects a caller error, as
     * the `@throws` below record.
     *
     * A parent that joined no preset — a rosterless deployment — yields no join
     * and no error: there, the model-facing rows sit in the host composition and
     * the child already sees them through the global layer.
     * @param agentCtx - the joining agent's scope context.
     * @param parentCtx - the scope context of the agent whose composition to join.
     * @returns the preset id joined, or undefined when the parent joined none.
     * @throws when `agentCtx` carries no scope, or has already joined a preset.
     */
    AgentPresets.prototype.composeFrom = function (agentCtx, parentCtx) {
        var agentKey = (0, dsh_scope_1.scopeOf)(agentCtx);
        if (agentKey === undefined) {
            throw new Error('agent-presets: refusing to compose an unscoped context; the scope key is what joins an agent to its preset');
        }
        var standing = (0, mount_ts_1.standingMountFor)(parentCtx);
        if (standing === undefined)
            return undefined;
        this.bindings.set(agentKey, (0, dsh_scope_1.bindScopeParent)(agentKey, standing.key));
        return standing.presetId;
    };
    /**
     * The preset one live agent runs on.
     *
     * Read from the live scope chain rather than from the session, so it answers
     * for an agent whose session has not recorded a preset yet — a child agent
     * whose durable header is being built from its parent's composition.
     * @param agentCtx - the agent's scope context.
     * @returns the preset id, or undefined when the agent joined none.
     */
    AgentPresets.prototype.composedPreset = function (agentCtx) {
        var _a;
        return (_a = (0, mount_ts_1.standingMountFor)(agentCtx)) === null || _a === void 0 ? void 0 : _a.presetId;
    };
    Object.defineProperty(AgentPresets.prototype, "roots", {
        /**
         * The roots this roster scans, which is not `config.roots`: it is every
         * configured root in order, then the harness-home user root unless
         * `includeUserRoot` is false. Read this — not the config field — to answer
         * whether a roster is composed at all, so one derivation decides it.
         */
        get: function () {
            return this.resolvedRoots;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(AgentPresets.prototype, "authorable", {
        /** Whether this deployment has a root locally authored presets go to. */
        get: function () {
            return this.resolvedRoots.some(function (root) { return root.trust === 'user'; });
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Read one preset's composition text.
     * @param id - the preset id.
     * @returns the composition exactly as stored.
     * @throws when no configured root supplies that id.
     */
    AgentPresets.prototype.read = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = authoring_ts_1.readComposition;
                        return [4 /*yield*/, this.resolve(id)];
                    case 1: return [4 /*yield*/, _a.apply(void 0, [_b.sent()])];
                    case 2: return [2 /*return*/, _b.sent()];
                }
            });
        });
    };
    /**
     * Create a locally authored preset by copying an existing one whole.
     *
     * Copy is the only authoring write. Composition text never crosses this
     * seam: the source is named by id and its directory is copied as it stands,
     * so the copy is exactly as loadable as its source and authoring grants no
     * capability the roster did not already carry. The copy is NOT mounted to
     * validate — a source that mounts today yields a copy that mounts today.
     * @param from - the preset the copy starts from; shipped presets are the
     * primary source, so any trust is accepted.
     * @param id - the new preset's id, which becomes its directory name.
     * @param name - display name for the copy; absent falls back to the id.
     * @throws when the source is unknown, the id is unusable or already taken,
     * or the deployment configures no writable root.
     */
    AgentPresets.prototype.copy = function (from, id, name) {
        return __awaiter(this, void 0, void 0, function () {
            var source;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.resolve(from)
                        // The roster check refuses ids any root supplies — shipped ones included,
                        // since a user directory named like a shipped preset is shadowed by it.
                        // The disk check inside copyComposition only sees the writable root.
                    ];
                    case 1:
                        source = _a.sent();
                        return [4 /*yield*/, this.list()];
                    case 2:
                        // The roster check refuses ids any root supplies — shipped ones included,
                        // since a user directory named like a shipped preset is shadowed by it.
                        // The disk check inside copyComposition only sees the writable root.
                        if ((_a.sent()).some(function (preset) { return preset.id === id; })) {
                            throw new authoring_ts_2.PresetExistsError(id);
                        }
                        return [4 /*yield*/, (0, authoring_ts_1.copyComposition)(this.resolvedRoots, source, id, name)
                            // A settled mount under this id can only be stale (its preset was deleted
                            // from disk outside `remove`); the new preset must not inherit it. Every
                            // session already joined keeps the generation it runs on regardless.
                        ];
                    case 3:
                        _a.sent();
                        // A settled mount under this id can only be stale (its preset was deleted
                        // from disk outside `remove`); the new preset must not inherit it. Every
                        // session already joined keeps the generation it runs on regardless.
                        this.standing.delete(id);
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Delete a locally authored preset.
     * @param id - the preset id.
     * @throws when the preset is unknown or ships with the deployment.
     */
    AgentPresets.prototype.remove = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b;
            var _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _a = authoring_ts_1.deleteComposition;
                        _b = [this.resolvedRoots];
                        return [4 /*yield*/, this.resolve(id)];
                    case 1: return [4 /*yield*/, _a.apply(void 0, _b.concat([_e.sent()]))
                        // Sessions on the deleted preset keep their standing mount; only new
                        // sessions see the roster without it.
                    ];
                    case 2:
                        _e.sent();
                        // Sessions on the deleted preset keep their standing mount; only new
                        // sessions see the roster without it.
                        this.standing.delete(id);
                        // Storing a default that does not exist YET is deliberate — the roster is a
                        // live directory, so a name absent now may exist by the time a session asks
                        // for it, and `resolve` reports it then. A default this call just deleted is
                        // not that case: nothing will ever supply it again, and left in place every
                        // session created without an explicit pick would fail to start. Clearing it
                        // exposes the deployment's own default underneath, which is the layering.
                        if (((_c = this.settings) === null || _c === void 0 ? void 0 : _c.get().default) !== id)
                            return [2 /*return*/];
                        return [4 /*yield*/, ((_d = this.settingsService) === null || _d === void 0 ? void 0 : _d.mutate((0, dsh_settings_1.settingsNamespace)(exports.SETTINGS_NAMESPACE), [{ op: 'unset', path: ['default'] }]))];
                    case 3:
                        _e.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * One agent's instance of a service its preset mounted.
     *
     * A preset publishes services behind `isolate` realms, which are invisible
     * outside the group that declares them — including to the host. This is how a
     * caller holding the agent reads one anyway: a request that is ABOUT a
     * session but arrives from outside it, which is every browser RPC.
     *
     * Read addressing only. A host row that `inject`s a service cannot use this,
     * because injection resolves before any session exists and has no agent to
     * key by; such a service belongs on the host plane instead.
     * @param agent - the agent whose composition to look inside.
     * @param name - the service name as the preset's rows resolve it.
     * @returns the agent's instance, or undefined when its preset mounts none.
     */
    AgentPresets.prototype.serviceFor = function (agent, name) {
        return (0, mount_ts_1.serviceForAgent)(this.ctx, agent, name);
    };
    /**
     * Re-link one agent to a different preset's standing composition.
     *
     * Only valid while the agent has produced nothing: swapping tools mid
     * conversation would leave logged tool calls the new composition cannot
     * make. The CALLER owns that check — this method does not read session
     * history.
     *
     * The swap is a parent re-link, not an unmount: standing mounts are shared
     * and permanent, so the old composition stays for its other agents and the
     * new one is ensured BEFORE the link moves. An unknown or unusable preset
     * therefore throws with the agent exactly as it was — there is no torn-down
     * state to restore. The re-link runs through the binding this roster kept
     * from the agent's mount — dsh-scope's only re-link authority. An agent
     * that never composed one has nothing to re-link: the switch is then the
     * agent's first bind, exactly a mount.
     * @param agentCtx - the agent's scope context.
     * @param id - the preset to compose the agent from instead.
     * @returns the preset now installed.
     * @throws when the preset is unknown or its composition is unusable.
     */
    AgentPresets.prototype.recompose = function (agentCtx, id) {
        return __awaiter(this, void 0, void 0, function () {
            var agentKey, preset, standing, binding;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        agentKey = (0, dsh_scope_1.scopeOf)(agentCtx);
                        if (agentKey === undefined) {
                            throw new Error('agent-presets: refusing to recompose an unscoped context');
                        }
                        return [4 /*yield*/, this.resolveMountable(id)];
                    case 1:
                        preset = _a.sent();
                        return [4 /*yield*/, this.ensureStanding(preset)];
                    case 2:
                        standing = _a.sent();
                        binding = this.bindings.get(agentKey);
                        if (binding === undefined) {
                            this.bindings.set(agentKey, (0, dsh_scope_1.bindScopeParent)(agentKey, standing.key));
                        }
                        else {
                            binding.rebind(standing.key);
                        }
                        return [2 /*return*/, preset];
                }
            });
        });
    };
    /**
     * The standing scope key of one preset, for a host reader with no agent.
     *
     * A cold transcript read resolves tool presenters against the composition
     * the session recorded, and the standing mount makes that possible without
     * resuming anything: ensuring the mount composes plugins but starts no
     * agent, no session, and no turn.
     * @param id - the preset id, or `undefined` for {@link defaultId}.
     * @returns the standing scope key readers pass as a registry view scope.
     * @throws when the preset is unknown or its composition is unusable.
     */
    AgentPresets.prototype.standingKeyFor = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var preset;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.resolveMountable(id)];
                    case 1:
                        preset = _a.sent();
                        return [4 /*yield*/, this.ensureStanding(preset)];
                    case 2: return [2 /*return*/, (_a.sent()).key];
                }
            });
        });
    };
    /** Resolve (or create, single-flight) the standing mount of one preset. */
    AgentPresets.prototype.ensureStanding = function (preset) {
        return __awaiter(this, void 0, void 0, function () {
            var pending, mounted, current, created;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pending = this.standing.get(preset.id);
                        if (!(pending !== undefined)) return [3 /*break*/, 3];
                        return [4 /*yield*/, pending
                            // Files are the only composition editor (authoring is copy/delete), so
                            // the stamp is what notices an edit: a changed file starts the next
                            // generation here, for this and later sessions. An unreadable stamp
                            // serves the current generation — a mount must survive its file
                            // disappearing, and failing the session over a stat would not.
                        ];
                    case 1:
                        mounted = _a.sent();
                        return [4 /*yield*/, compositionStamp(preset.path)];
                    case 2:
                        current = _a.sent();
                        if (current === undefined || sameStamp(mounted.stamp, current))
                            return [2 /*return*/, mounted
                                // TODO: reclaim the superseded generation once the last agent joined to
                                // it is gone. The subtree is not inert — `dsh-skill-filesystem` watches its
                                // roots — and the settings-page authoring flow turns "a composition
                                // changed" into a per-save event. This needs a joined-agent count on
                                // StandingMount, incremented in `mount`/`composeFrom`/`recompose` and
                                // decremented when the agent's scope key dies.
                                // Guarded delete: a caller that raced this one may have already started
                                // the next generation, and dropping THAT pointer would fork a third.
                            ];
                        // TODO: reclaim the superseded generation once the last agent joined to
                        // it is gone. The subtree is not inert — `dsh-skill-filesystem` watches its
                        // roots — and the settings-page authoring flow turns "a composition
                        // changed" into a per-save event. This needs a joined-agent count on
                        // StandingMount, incremented in `mount`/`composeFrom`/`recompose` and
                        // decremented when the agent's scope key dies.
                        // Guarded delete: a caller that raced this one may have already started
                        // the next generation, and dropping THAT pointer would fork a third.
                        if (this.standing.get(preset.id) === pending)
                            this.standing.delete(preset.id);
                        return [2 /*return*/, this.ensureStanding(preset)];
                    case 3:
                        created = (function () { return __awaiter(_this, void 0, void 0, function () {
                            var key, scope, stamp, error_1;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        key = { agentPreset: preset.id };
                                        scope = (0, dsh_scope_1.createScope)(this.selfCtx, key);
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 4, , 6]);
                                        return [4 /*yield*/, compositionStamp(preset.path)];
                                    case 2:
                                        stamp = _a.sent();
                                        if (stamp === undefined) {
                                            throw new preset_ts_1.PresetMountError(preset.id, "composition file is unreadable: ".concat(preset.path));
                                        }
                                        return [4 /*yield*/, (0, mount_ts_1.mountPreset)(scope.ctx, preset)];
                                    case 3:
                                        _a.sent();
                                        return [2 /*return*/, { key: key, scope: scope, stamp: stamp }];
                                    case 4:
                                        error_1 = _a.sent();
                                        this.standing.delete(preset.id);
                                        return [4 /*yield*/, scope.dispose()];
                                    case 5:
                                        _a.sent();
                                        throw error_1;
                                    case 6: return [2 /*return*/];
                                }
                            });
                        }); })();
                        this.standing.set(preset.id, created);
                        return [2 /*return*/, created];
                }
            });
        });
    };
    AgentPresets.inject = ['loader'];
    /** Runtime schema for the preset roster. */
    AgentPresets.Config = schemastery_1.default.object({
        default: schemastery_1.default.string().required(),
        roots: schemastery_1.default.array(schemastery_1.default.object({
            path: schemastery_1.default.string().required(),
            trust: schemastery_1.default.union(['system', 'user']).default('user'),
        })).default([]),
        includeUserRoot: schemastery_1.default.boolean().default(true),
    });
    return AgentPresets;
}(cordis_1.Service));
exports.AgentPresets = AgentPresets;
/** Read one composition file's stamp, or undefined when it cannot be statted. */
function compositionStamp(path) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, mtimeMs, size, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, promises_1.stat)(path)];
                case 1:
                    _a = _c.sent(), mtimeMs = _a.mtimeMs, size = _a.size;
                    return [2 /*return*/, { mtimeMs: mtimeMs, size: size }];
                case 2:
                    _b = _c.sent();
                    // Deleted, replaced by an unreadable entry, or otherwise unstattable all
                    // mean the same to the caller: the file offers no identity to compare.
                    return [2 /*return*/, undefined];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/** Whether two stamps name the same file state. */
function sameStamp(a, b) {
    return a.mtimeMs === b.mtimeMs && a.size === b.size;
}
exports.default = AgentPresets;
