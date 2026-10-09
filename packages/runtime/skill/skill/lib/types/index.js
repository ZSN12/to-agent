"use strict";
/**
 * Agent skill provider registry.
 *
 * This package owns the Service Definition role of the skill capability seam.
 * Concrete
 * providers such as `@z/dsh-skill-filesystem` decide where skills come
 * from; this service only merges provider catalogs, resolves the winning skill
 * for a name, and exposes the winning summaries and definitions to consumers.
 *
 * @module @z/dsh-skill
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
exports.SkillRegistry = exports.BUNDLED_SKILL_RANK = void 0;
exports.isSkillName = isSkillName;
exports.isModelInvocable = isModelInvocable;
exports.isUserInvocable = isUserInvocable;
exports.renderSkillContent = renderSkillContent;
exports.escapeText = escapeText;
var cordis_1 = require("@z/cordis");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_scope_1 = require("@z/dsh-scope");
var schemastery_1 = require("@z/schemastery");
var SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var DEFAULT_COLLECT_CACHE_ENTRIES = 128;
var MAX_COLLECT_ATTEMPTS = 2;
var RUNTIME_PROVIDER = 'runtime';
var RUNTIME_RANK = 250;
/** Standard precedence rank for packaged skill providers and local bundled roots. */
exports.BUNDLED_SKILL_RANK = 600;
/**
 * Return whether a string is a valid kebab-case skill name.
 * @param name - candidate skill name to validate.
 * @returns whether the name matches the public skill-name grammar.
 */
function isSkillName(name) {
    return SKILL_NAME.test(name);
}
/**
 * Return whether a skill may be advertised to and loaded by a model.
 * @param skill - skill metadata carrying resolved invocation controls.
 * @returns whether the policy permits model invocation.
 */
function isModelInvocable(skill) {
    return skill.invocation.modelInvocable;
}
/**
 * Return whether a skill may be advertised to and loaded by a human-facing command.
 * @param skill - skill metadata carrying resolved invocation controls.
 * @returns whether the policy permits user invocation.
 */
function isUserInvocable(skill) {
    return skill.invocation.userInvocable;
}
/**
 * Render one loaded skill for the model. The output is shared verbatim by the
 * `skill` tool result and the user-explicit invocation injection, so the model
 * sees one canonical `<skill_content>` shape on both paths. The name rides an
 * escaped attribute; the body is embedded verbatim (skills are trusted local
 * content, and user-supplied invocation text stays outside this wrapper).
 * @param skill - name, provider, optional resource base, and body to render.
 * @returns the complete model-facing `<skill_content>` block.
 */
function renderSkillContent(skill) {
    var resourceHint = renderResourceHint(skill);
    return __spreadArray(__spreadArray([
        "<skill_content name=\"".concat(escapeAttr(skill.name), "\">"),
        '<skill_resources>'
    ], resourceHint, true), [
        '</skill_resources>',
        '',
        '<skill_instructions>',
        skill.content,
        '</skill_instructions>',
        '</skill_content>',
    ], false).join('\n');
}
function renderResourceHint(skill) {
    var base = skill.resourceBase;
    if (base === undefined) {
        return [
            "Resources for this skill are managed by provider \"".concat(escapeText(skill.provider), "\"."),
            'Load referenced resources only as needed.',
        ];
    }
    switch (base.kind) {
        case 'directory':
            return [
                "Base directory for this skill: ".concat(escapeText(base.path)),
                'Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.',
            ];
        case 'url':
            return [
                "Base URL for this skill: ".concat(escapeText(base.url)),
                'Resolve relative URLs mentioned by this skill against the base URL before using them. Load referenced resources only as needed.',
            ];
        case 'opaque':
            return [
                "Resources for this skill: ".concat(escapeText(base.description)),
                'Load referenced resources only as needed.',
            ];
        /* v8 ignore start -- SkillResourceBase is a closed union; a future kind must fail compilation here. */
        default:
            return (0, dsh_llm_1.assertNever)(base, 'SkillResourceBase.kind');
        /* v8 ignore stop */
    }
}
function escapeAttr(value) {
    return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
/**
 * Escape model-facing prose embedded inside skill markup so provider-supplied
 * text cannot open or close framing tags.
 * @param value - raw prose to embed.
 * @returns the escaped text.
 */
function escapeText(value) {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
/** One scope's complete skill-registry contribution. */
var SkillLayer = /** @class */ (function () {
    function SkillLayer(scope) {
        /** Runtime skills registered through contexts carrying this scope. */
        this.runtime = new Map();
        this.providers = new dsh_scope_1.NamedEntries(function (name) { return new Error(scope === undefined
            ? "a skill provider named \"".concat(name, "\" is already registered")
            : "a skill provider named \"".concat(name, "\" is already registered in this scope")); });
    }
    /** Whether every contribution table in this aggregate layer is empty. */
    SkillLayer.prototype.isEmpty = function () {
        return this.providers.isEmpty() && this.runtime.size === 0;
    };
    return SkillLayer;
}());
/**
 * Layered registry of skill providers, the host+per-scope shape the tools
 * registry established. A registration files into the layer of its calling
 * context's scope ({@link scopeOf}): host rows and repository plugins land in
 * the global layer, while a plugin mounted by an agent preset's standing
 * composition lands in that preset's layer. A read merges the global layer
 * with the viewing scope's chain — the nearest layer's entry wins a duplicate
 * name outright, and the rank order decides duplicates only within one layer.
 * It exposes sorted invocation-neutral summaries and loads full skill bodies
 * on demand.
 */
var SkillRegistry = /** @class */ (function (_super) {
    __extends(SkillRegistry, _super);
    function SkillRegistry(ctx, config) {
        if (config === void 0) { config = {}; }
        var _a;
        var _this = _super.call(this, ctx, 'skills') || this;
        _this.layers = new dsh_scope_1.ScopedLayers(function (scope) { return new SkillLayer(scope); }, function () { _this.invalidateCache(); });
        _this.collectCache = new Map();
        _this.revision = 0;
        _this.nextProviderOrder = 0;
        /** Stable identities for cache keys; scope keys are opaque identity-compared objects. */
        _this.scopeIds = new WeakMap();
        _this.nextScopeId = 1;
        _this.collectCacheMaxEntries = (_a = config.collectCacheMaxEntries) !== null && _a !== void 0 ? _a : DEFAULT_COLLECT_CACHE_ENTRIES;
        assertPositiveInteger('collectCacheMaxEntries', _this.collectCacheMaxEntries);
        return _this;
    }
    /**
     * Register a borrowed same-process provider synchronously during plugin
     * apply, into the calling context's layer: a scoped context (an agent
     * preset's standing mount) registers for that scope alone, an unscoped
     * context registers globally. Duplicate names within one layer and reserved
     * names throw; remote initialization belongs in `list()`. Fiber disposal
     * unregisters the provider and invalidates catalog caches.
     * @param create - synchronous factory receiving this registration's lifecycle and invalidation control.
     * @returns the exact Cordis effect disposer that unregisters this provider;
     *   composite effects may yield it directly to preserve teardown ordering.
     */
    SkillRegistry.prototype.registerProvider = function (create) {
        var _this = this;
        var lifecycle = new AbortController();
        var registration;
        var provider;
        var control = {
            signal: lifecycle.signal,
            invalidate: function () {
                var _a;
                var active = registration;
                if (active !== undefined && ((_a = active.layer.providers.get(active.name)) === null || _a === void 0 ? void 0 : _a.provider) === provider) {
                    _this.invalidateCache();
                }
            },
        };
        try {
            provider = create(control);
            var name_1 = provider.name;
            if (name_1 === RUNTIME_PROVIDER) {
                throw new Error("\"".concat(RUNTIME_PROVIDER, "\" is reserved for runtime skill registrations"));
            }
            var order_1 = this.nextProviderOrder;
            this.nextProviderOrder += 1;
            return this.layers.effect(this.ctx, function (layer) {
                var undo = layer.providers.insert(name_1, { provider: provider, order: order_1 });
                registration = { layer: layer, name: name_1 };
                return function () {
                    registration = undefined;
                    undo();
                    lifecycle.abort(new Error("skill provider \"".concat(name_1, "\" disposed")));
                };
            }, { label: 'skills.registerProvider()' });
        }
        catch (error) {
            lifecycle.abort(error);
            throw error;
        }
    };
    /**
     * Register a borrowed readonly runtime skill into the calling context's
     * layer. Project entries outrank runtime entries, which outrank user
     * entries, within one layer. Same-name runtime entries in one layer are
     * first-wins; a duplicate logs a warning and receives a no-op disposer so
     * it cannot remove the winner.
     * @param skill - the skill definition input; omitted invocation and provider fields receive defaults.
     * @returns the exact Cordis effect disposer, preserving composite teardown order and invalidating caches.
     */
    SkillRegistry.prototype.register = function (skill) {
        var _a, _b;
        validateRuntimeSkill(skill);
        var scope = (0, dsh_scope_1.scopeOf)(this.ctx);
        var existingLayer = scope === undefined ? this.layers.global : this.layers.peek(scope);
        if (existingLayer !== undefined && existingLayer.runtime.has(skill.name)) {
            this.ctx.logger.warn("runtime skill \"".concat(skill.name, "\" ignored because it is already registered"));
            return function () { };
        }
        var definition = __assign(__assign({}, skill), { invocation: (_a = skill.invocation) !== null && _a !== void 0 ? _a : { modelInvocable: true, userInvocable: true }, provider: (_b = skill.provider) !== null && _b !== void 0 ? _b : RUNTIME_PROVIDER });
        return this.layers.effect(this.ctx, function (layer) {
            layer.runtime.set(definition.name, definition);
            return function () { layer.runtime.delete(definition.name); };
        }, { label: 'skills.register()' });
    };
    /**
     * List invocation-neutral skill summaries for a workspace. Consumers apply
     * model or user invocation policy at their operational boundary. Lookup
     * options and provider candidates are readonly same-process values borrowed
     * throughout discovery.
     * @param options - view options; `scope` selects the viewing agent's layers, `cwd` selects project roots, and `signal` cancels discovery.
     * @returns all sorted winning summaries.
     */
    SkillRegistry.prototype.list = function () {
        return __awaiter(this, arguments, void 0, function (options) {
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.snapshot(options)];
                    case 1: return [2 /*return*/, (_a.sent()).skills];
                }
            });
        });
    };
    /**
     * Observe the current invocation-neutral catalog and whether discovery completed within a stable revision.
     * Incomplete observations are never cached, allowing consumers to retain last-good state and
     * retry on their next request boundary.
     * @param options - view options; `scope` selects the viewing agent's layers, `cwd` selects project roots, and `signal` cancels discovery.
     * @returns sorted summaries plus discovery-completeness state.
     */
    SkillRegistry.prototype.snapshot = function () {
        return __awaiter(this, arguments, void 0, function (options) {
            var collected;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.collect(options)];
                    case 1:
                        collected = _a.sent();
                        return [2 /*return*/, {
                                skills: __spreadArray([], collected.entries.values(), true).map(function (entry) { return toSummary(entry.candidate); })
                                    .sort(compareSkillSummary),
                                complete: collected.cacheable,
                            }];
                }
            });
        });
    };
    /**
     * Load and validate the winning candidate, passing its opaque discovery locator back to the
     * provider. Cancellation is rechecked after selection, including cache hits, and raced against
     * loading so an uncooperative provider cannot hang the caller.
     * @param name - kebab-case skill name.
     * @param options - view options; `scope` selects the viewing agent's layers,
     *   `cwd` selects workspace-sensitive skills, and `signal` cancels work.
     * @returns the full skill, including body content, or `undefined`.
     */
    SkillRegistry.prototype.get = function (name_2) {
        return __awaiter(this, arguments, void 0, function (name, options) {
            var collected, match, definition;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!isSkillName(name))
                            return [2 /*return*/, undefined];
                        return [4 /*yield*/, this.collect(options)];
                    case 1:
                        collected = _a.sent();
                        throwIfAborted(options.signal);
                        match = collected.entries.get(name);
                        if (match === undefined)
                            return [2 /*return*/, undefined];
                        return [4 /*yield*/, waitWithAbort(match.provider.get(match.candidate, options), options.signal)];
                    case 2:
                        definition = _a.sent();
                        if (definition === undefined)
                            return [2 /*return*/, undefined];
                        validateDefinition(definition);
                        if (definition.name !== match.candidate.name) {
                            this.invalidateEntry(match);
                            return [2 /*return*/, undefined];
                        }
                        return [2 /*return*/, definition];
                }
            });
        });
    };
    SkillRegistry.prototype.collect = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var attempt, revision, key, cached, result, oldest;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        throwIfAborted(options.signal);
                        attempt = 1;
                        _a.label = 1;
                    case 1:
                        if (!true) return [3 /*break*/, 3];
                        revision = this.revision;
                        key = this.collectCacheKey(options.cwd, (0, dsh_scope_1.scopeChainOf)(options.scope), revision);
                        cached = this.collectCache.get(key);
                        if (cached !== undefined)
                            return [2 /*return*/, { entries: cached, cacheable: true }];
                        return [4 /*yield*/, this.collectFresh(options)];
                    case 2:
                        result = _a.sent();
                        throwIfAborted(options.signal);
                        if (revision !== this.revision) {
                            if (attempt < MAX_COLLECT_ATTEMPTS) {
                                attempt += 1;
                                return [3 /*break*/, 1];
                            }
                            return [2 /*return*/, { entries: result.entries, cacheable: false }];
                        }
                        if (result.cacheable) {
                            this.collectCache.set(key, result.entries);
                            if (this.collectCache.size > this.collectCacheMaxEntries) {
                                oldest = this.collectCache.keys().next();
                                this.collectCache.delete(oldest.value);
                            }
                        }
                        return [2 /*return*/, result];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    SkillRegistry.prototype.collectFresh = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var layers, merged, cacheable, _i, layers_1, layer, collected, _a, _b, entry;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        layers = __spreadArray([this.layers.global], this.layers.chainLayers(options.scope), true);
                        merged = new Map();
                        cacheable = true;
                        _i = 0, layers_1 = layers;
                        _c.label = 1;
                    case 1:
                        if (!(_i < layers_1.length)) return [3 /*break*/, 4];
                        layer = layers_1[_i];
                        return [4 /*yield*/, this.collectLayer(layer, options)];
                    case 2:
                        collected = _c.sent();
                        if (!collected.cacheable)
                            cacheable = false;
                        for (_a = 0, _b = collected.entries; _a < _b.length; _a++) {
                            entry = _b[_a];
                            merged.set(entry.candidate.name, entry);
                        }
                        _c.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, { entries: merged, cacheable: cacheable }];
                }
            });
        });
    };
    SkillRegistry.prototype.collectLayer = function (layer, options) {
        return __awaiter(this, void 0, void 0, function () {
            var collected, seen, result, _i, _a, entry, skill;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.listLayerCandidates(layer, options)];
                    case 1:
                        collected = _b.sent();
                        collected.entries.sort(compareIndexedCandidates);
                        seen = new Set();
                        result = [];
                        for (_i = 0, _a = collected.entries; _i < _a.length; _i++) {
                            entry = _a[_i];
                            skill = entry.candidate;
                            if (seen.has(skill.name)) {
                                this.ctx.logger.warn("skill \"".concat(skill.name, "\" from ").concat(skill.source, " ignored because a higher-priority skill already exists"));
                                continue;
                            }
                            seen.add(skill.name);
                            result.push(entry);
                        }
                        return [2 /*return*/, { entries: result, cacheable: collected.cacheable }];
                }
            });
        });
    };
    SkillRegistry.prototype.listLayerCandidates = function (layer, options) {
        return __awaiter(this, void 0, void 0, function () {
            var candidates, cacheable, runtimeOrder, _i, _a, skill, _b, _c, _d, provider, order, localOrder, output, error_1, observation, _e, _f, candidate;
            var _g;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        throwIfAborted(options.signal);
                        candidates = [];
                        cacheable = true;
                        runtimeOrder = 0;
                        for (_i = 0, _a = __spreadArray([], layer.runtime.values(), true).sort(function (a, b) { return compareCodePoints(a.name, b.name); }); _i < _a.length; _i++) {
                            skill = _a[_i];
                            candidates.push({
                                candidate: runtimeCandidate(skill),
                                provider: RUNTIME_SKILL_PROVIDER,
                                providerOrder: -1,
                                localOrder: runtimeOrder,
                                layer: layer,
                            });
                            runtimeOrder += 1;
                        }
                        _b = 0, _c = __spreadArray([], layer.providers.values(), true);
                        _h.label = 1;
                    case 1:
                        if (!(_b < _c.length)) return [3 /*break*/, 7];
                        _d = _c[_b], provider = _d.provider, order = _d.order;
                        localOrder = 0;
                        output = void 0;
                        _h.label = 2;
                    case 2:
                        _h.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, waitWithAbort(provider.list(options), options.signal)];
                    case 3:
                        output = _h.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _h.sent();
                        if (((_g = options.signal) === null || _g === void 0 ? void 0 : _g.aborted) === true)
                            throw toError(options.signal.reason);
                        cacheable = false;
                        this.ctx.logger.warn("skill provider \"".concat(provider.name, "\" skipped: ").concat(errorMessage(error_1)));
                        return [3 /*break*/, 5];
                    case 5:
                        if (output === undefined)
                            return [3 /*break*/, 6];
                        observation = normalizeProviderObservation(output, provider.name);
                        if (!observation.complete)
                            cacheable = false;
                        for (_e = 0, _f = observation.candidates; _e < _f.length; _e++) {
                            candidate = _f[_e];
                            validateCandidate(candidate, provider.name);
                            candidates.push({ candidate: candidate, provider: provider, providerOrder: order, localOrder: localOrder, layer: layer });
                            localOrder += 1;
                        }
                        _h.label = 6;
                    case 6:
                        _b++;
                        return [3 /*break*/, 1];
                    case 7: return [2 /*return*/, { entries: candidates, cacheable: cacheable }];
                }
            });
        });
    };
    SkillRegistry.prototype.invalidateCache = function () {
        this.revision += 1;
        this.collectCache.clear();
        this.notifyChange();
    };
    /** Invalidate after a stale definition load, only while the exact registration that produced the entry is still live. */
    SkillRegistry.prototype.invalidateEntry = function (entry) {
        var _a;
        /* v8 ignore else -- A definition load can outlive the exact provider registration it selected. */
        if (((_a = entry.layer.providers.get(entry.provider.name)) === null || _a === void 0 ? void 0 : _a.provider) === entry.provider)
            this.invalidateCache();
    };
    SkillRegistry.prototype.scopeId = function (key) {
        var id = this.scopeIds.get(key);
        if (id === undefined) {
            id = this.nextScopeId;
            this.nextScopeId += 1;
            this.scopeIds.set(key, id);
        }
        return id;
    };
    SkillRegistry.prototype.collectCacheKey = function (cwd, chain, revision) {
        var _this = this;
        return JSON.stringify({ cwd: cwd, scopes: chain.map(function (key) { return _this.scopeId(key); }), revision: revision });
    };
    /** Notify catalog observers without making their refresh work load-bearing. */
    SkillRegistry.prototype.notifyChange = function () {
        var _this = this;
        for (var _i = 0, _a = this.ctx.events.dispatch('emit', ['skills/change']); _i < _a.length; _i++) {
            var callback = _a[_i];
            try {
                var returned = callback();
                void Promise.resolve(returned).catch(function (error) {
                    _this.ctx.logger.warn("skills/change listener rejected: ".concat(errorMessage(error)));
                });
            }
            catch (error) {
                this.ctx.logger.warn("skills/change listener threw: ".concat(errorMessage(error)));
            }
        }
    };
    SkillRegistry.Config = schemastery_1.default.object({
        collectCacheMaxEntries: schemastery_1.default.number().default(DEFAULT_COLLECT_CACHE_ENTRIES),
    });
    return SkillRegistry;
}(cordis_1.Service));
exports.SkillRegistry = SkillRegistry;
function normalizeProviderObservation(output, providerName) {
    if (Array.isArray(output)) {
        return { candidates: output, complete: true };
    }
    if (output === null || typeof output !== 'object') {
        throw invalidProviderObservation(providerName);
    }
    var observation = output;
    if (!Array.isArray(observation.candidates) || typeof observation.complete !== 'boolean') {
        throw invalidProviderObservation(providerName);
    }
    return observation;
}
function invalidProviderObservation(providerName) {
    return new TypeError("skill provider \"".concat(providerName, "\" list() must return an array or { candidates, complete } observation"));
}
var RUNTIME_SKILL_PROVIDER = {
    name: RUNTIME_PROVIDER,
    /* v8 ignore next -- Runtime skills are injected directly by the registry; this provider only owns `get()`. */
    list: function () {
        return Promise.resolve([]);
    },
    get: function (candidate) {
        return Promise.resolve(candidate.locator);
    },
};
function runtimeCandidate(skill) {
    return __assign(__assign(__assign(__assign(__assign(__assign({ name: skill.name, description: skill.description }, skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}), { invocation: skill.invocation, source: skill.source, provider: skill.provider }), skill.resourceBase !== undefined ? { resourceBase: skill.resourceBase } : {}), { rank: RUNTIME_RANK, locator: skill }), skill.path !== undefined ? { path: skill.path } : {}), skill.metadata !== undefined ? { metadata: skill.metadata } : {});
}
function validateCandidate(candidate, providerName) {
    if (typeof candidate.name !== 'string') {
        throw new TypeError("skill provider \"".concat(providerName, "\" returned a non-string skill name"));
    }
    if (!SKILL_NAME.test(candidate.name)) {
        throw new Error("skill provider \"".concat(providerName, "\" returned invalid skill name \"").concat(candidate.name, "\""));
    }
    if (typeof candidate.description !== 'string') {
        throw new TypeError("skill provider \"".concat(providerName, "\" returned skill \"").concat(candidate.name, "\" with a non-string description"));
    }
    if (candidate.description.length === 0) {
        throw new Error("skill provider \"".concat(providerName, "\" returned skill \"").concat(candidate.name, "\" without a description"));
    }
    validateInvocation(candidate.invocation, "skill provider \"".concat(providerName, "\" returned skill \"").concat(candidate.name, "\""));
    if (candidate.whenToUse !== undefined && typeof candidate.whenToUse !== 'string') {
        throw new TypeError("skill provider \"".concat(providerName, "\" returned skill \"").concat(candidate.name, "\" with a non-string whenToUse"));
    }
    if (typeof candidate.source !== 'string') {
        throw new TypeError("skill provider \"".concat(providerName, "\" returned skill \"").concat(candidate.name, "\" with a non-string source"));
    }
    if (typeof candidate.rank !== 'number' || !Number.isFinite(candidate.rank)) {
        throw new Error("skill provider \"".concat(providerName, "\" returned skill \"").concat(candidate.name, "\" with an invalid rank"));
    }
    if (typeof candidate.provider !== 'string') {
        throw new TypeError("skill provider \"".concat(providerName, "\" returned skill \"").concat(candidate.name, "\" with a non-string provider"));
    }
    if (candidate.provider !== providerName) {
        throw new Error("skill provider \"".concat(providerName, "\" returned skill \"").concat(candidate.name, "\" for provider \"").concat(candidate.provider, "\""));
    }
    if (candidate.path !== undefined && typeof candidate.path !== 'string') {
        throw new TypeError("skill provider \"".concat(providerName, "\" returned skill \"").concat(candidate.name, "\" with a non-string path"));
    }
}
function validateRuntimeSkill(skill) {
    if (!SKILL_NAME.test(skill.name))
        throw new Error("invalid skill name \"".concat(skill.name, "\""));
    if (skill.description.length === 0)
        throw new Error("skill \"".concat(skill.name, "\" requires a description"));
    validateInvocation(skill.invocation, "runtime skill \"".concat(skill.name, "\""));
}
/** Validate a definition loaded from a provider-controlled parser or remote source. */
function validateDefinition(skill) {
    var name = skill.name;
    var description = skill.description;
    var whenToUse = skill.whenToUse;
    var invocation = skill.invocation;
    var source = skill.source;
    var provider = skill.provider;
    var content = skill.content;
    var path = skill.path;
    if (typeof name !== 'string')
        throw new TypeError('loaded skill name must be a string');
    if (!SKILL_NAME.test(name))
        throw new Error("loaded skill has invalid name \"".concat(name, "\""));
    if (typeof description !== 'string')
        throw new TypeError("loaded skill \"".concat(name, "\" description must be a string"));
    if (description.length === 0)
        throw new Error("loaded skill \"".concat(name, "\" requires a description"));
    validateInvocation(invocation, "loaded skill \"".concat(name, "\""));
    if (whenToUse !== undefined && typeof whenToUse !== 'string')
        throw new TypeError("loaded skill \"".concat(name, "\" whenToUse must be a string"));
    if (typeof source !== 'string')
        throw new TypeError("loaded skill \"".concat(name, "\" source must be a string"));
    if (typeof provider !== 'string')
        throw new TypeError("loaded skill \"".concat(name, "\" provider must be a string"));
    if (typeof content !== 'string')
        throw new TypeError("loaded skill \"".concat(name, "\" content must be a string"));
    if (path !== undefined && typeof path !== 'string')
        throw new TypeError("loaded skill \"".concat(name, "\" path must be a string"));
}
function toSummary(skill) {
    var name = skill.name, description = skill.description, whenToUse = skill.whenToUse, invocation = skill.invocation, source = skill.source, provider = skill.provider, resourceBase = skill.resourceBase;
    return __assign(__assign(__assign({ name: name, description: description }, whenToUse !== undefined ? { whenToUse: whenToUse } : {}), { invocation: invocation, source: source, provider: provider }), resourceBase !== undefined ? { resourceBase: resourceBase } : {});
}
function validateInvocation(invocation, subject) {
    if (invocation === undefined)
        return;
    if (typeof invocation !== 'object' || invocation === null || Array.isArray(invocation)) {
        throw new TypeError("".concat(subject, " with a non-object invocation policy"));
    }
    var policy = invocation;
    if (typeof policy.modelInvocable !== 'boolean') {
        throw new TypeError("".concat(subject, " with a non-boolean invocation.modelInvocable"));
    }
    if (typeof policy.userInvocable !== 'boolean') {
        throw new TypeError("".concat(subject, " with a non-boolean invocation.userInvocable"));
    }
}
function compareSkillSummary(left, right) {
    return compareCodePoints(left.name, right.name);
}
function compareCodePoints(left, right) {
    if (left < right)
        return -1;
    if (left > right)
        return 1;
    return 0;
}
function compareIndexedCandidates(left, right) {
    return left.candidate.rank - right.candidate.rank
        || left.providerOrder - right.providerOrder
        || left.localOrder - right.localOrder;
}
function assertPositiveInteger(name, value, minimum) {
    if (minimum === void 0) { minimum = 1; }
    if (!Number.isInteger(value) || value < minimum) {
        throw new Error("skill: ".concat(name, " must be an integer greater than or equal to ").concat(minimum));
    }
}
function waitWithAbort(promise, signal) {
    if (signal === undefined)
        return promise;
    throwIfAborted(signal);
    return new Promise(function (resolve, reject) {
        var cleanup = function () {
            signal.removeEventListener('abort', onAbort);
        };
        var onAbort = function () {
            cleanup();
            reject(toError(signal.reason));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        void promise.then(function (value) {
            cleanup();
            resolve(value);
        }, function (error) {
            cleanup();
            reject(toError(error));
        });
    });
}
/** Throw a total Error for an already-aborted lookup. */
function throwIfAborted(signal) {
    if ((signal === null || signal === void 0 ? void 0 : signal.aborted) === true)
        throw toError(signal.reason);
}
/** Normalize an arbitrary abort or provider failure without trusting coercion. */
function toError(error) {
    try {
        if (error instanceof Error)
            return error;
    }
    catch (_a) {
        // A hostile proxy may throw during instanceof; fall through to the total renderer.
    }
    return new Error(errorMessage(error));
}
/** Render an arbitrary provider failure without letting coercion escape containment. */
function errorMessage(error) {
    try {
        return String(error);
    }
    catch (_a) {
        return '[unrenderable thrown value]';
    }
}
exports.default = SkillRegistry;
