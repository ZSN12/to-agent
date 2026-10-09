"use strict";
/**
 * Session-visible workspace instruction state and dynamic reconciliation.
 *
 * @module @z/dsh-agent-instructions/state
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.name = void 0;
exports.workspaceContextMessage = workspaceContextMessage;
exports.baselineInstructionState = baselineInstructionState;
exports.retainedInstructionVersionUpdates = retainedInstructionVersionUpdates;
exports.applyInstructionVersionUpdates = applyInstructionVersionUpdates;
exports.reconcileInstructionContext = reconcileInstructionContext;
var dsh_llm_1 = require("@z/dsh-llm");
var digest_ts_1 = require("./digest.ts");
var files_ts_1 = require("./files.ts");
var render_ts_1 = require("./render.ts");
exports.name = 'agent-instructions';
function workspaceContextHook(text, changes) {
    return (0, dsh_llm_1.createUserMessage)({
        content: [{ type: 'text', text: text }],
        source: { kind: 'agent-instructions', form: 'instructions', changes: changes },
    });
}
/**
 * Build the user-role message for a rendered baseline.
 * @param text - complete plugin-owned system-reminder text.
 * @returns a user-role prefix message.
 */
function workspaceContextMessage(text) {
    return (0, dsh_llm_1.createUserMessage)({
        content: [{ type: 'text', text: text }],
        source: { kind: 'plugin', plugin: exports.name },
    });
}
function isWorkspaceContextSource(source) {
    return typeof source === 'object' && source !== null
        && 'kind' in source && source.kind === 'agent-instructions'
        && 'changes' in source && Array.isArray(source.changes);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function workspaceInstructionChanges(source) {
    var changes = [];
    for (var _i = 0, _a = source.changes; _i < _a.length; _i++) {
        var value = _a[_i];
        if (!isRecord(value))
            continue;
        if (value.action !== 'set' && value.action !== 'replace' && value.action !== 'remove')
            continue;
        if (typeof value.scope !== 'string' || typeof value.path !== 'string')
            continue;
        if (value.digest !== undefined && typeof value.digest !== 'string')
            continue;
        changes.push(__assign({ action: value.action, scope: value.scope, path: value.path }, value.digest !== undefined ? { digest: value.digest } : {}));
    }
    return changes;
}
function sameInstructionChange(a, b) {
    return a.action === b.action
        && a.scope === b.scope
        && a.path === b.path
        && a.digest === b.digest;
}
function visibleInstructionChanges(agent, authorityMessages) {
    var visibleSeqs = new Set(agent.session.surface.nodes);
    var visible = new Map();
    for (var _i = 0, _a = agent.session.events.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], seq = _b[0], event_1 = _b[1];
        if (event_1.type !== 'user/message' || !isWorkspaceContextSource(event_1.data.source))
            continue;
        var changes = workspaceInstructionChanges(event_1.data.source);
        for (var _c = 0, changes_1 = changes; _c < changes_1.length; _c++) {
            var change = changes_1[_c];
            if (visibleSeqs.has(seq))
                visible.set(change.scope, change);
        }
    }
    for (var _d = 0, authorityMessages_1 = authorityMessages; _d < authorityMessages_1.length; _d++) {
        var message = authorityMessages_1[_d];
        if (!isWorkspaceContextSource(message.source))
            continue;
        for (var _e = 0, _f = workspaceInstructionChanges(message.source); _e < _f.length; _e++) {
            var change = _f[_e];
            visible.set(change.scope, change);
        }
    }
    return visible;
}
/**
 * Convert retained baseline files into comparison and metadata-cache state.
 * @param files - baseline files that survived rendering.
 * @returns latest baseline changes and provider versions keyed by logical scope.
 */
function baselineInstructionState(files) {
    var changes = new Map();
    var versions = new Map();
    for (var _i = 0, files_1 = files; _i < files_1.length; _i++) {
        var file = files_1[_i];
        var digest = (0, digest_ts_1.instructionContentSha1)(file.content);
        var change = {
            action: 'set',
            scope: (0, render_ts_1.instructionScopeKey)(file.displayPath),
            path: file.displayPath,
            digest: digest,
        };
        changes.set(change.scope, change);
        if (file.version !== undefined) {
            versions.set(change.scope, {
                path: file.displayPath,
                version: file.version,
                digest: digest,
                trimmedDigest: (0, digest_ts_1.trimmedInstructionDigest)(file.content),
            });
        }
    }
    return { changes: changes, versions: versions };
}
function versionStatesFor(session, cache) {
    var states = cache.get(session);
    if (states === undefined) {
        states = new Map();
        cache.set(session, states);
    }
    return states;
}
/**
 * Keep only cache updates represented by rendered changes.
 * @param updates - proposed updates from one or more reconciliations.
 * @param renderedChanges - transitions retained by the renderer.
 * @returns updates represented by an exact retained transition.
 */
function retainedInstructionVersionUpdates(updates, renderedChanges) {
    return updates.filter(function (update) { return renderedChanges.some(function (change) { return sameInstructionChange(update.change, change); }); });
}
/**
 * Apply metadata-cache transitions without retaining instruction prose.
 * @param session - owning session.
 * @param updates - ordered set/delete transitions.
 * @param cache - session-isolated metadata cache.
 */
function applyInstructionVersionUpdates(session, updates, cache) {
    if (updates.length === 0)
        return;
    var states = versionStatesFor(session, cache);
    for (var _i = 0, updates_1 = updates; _i < updates_1.length; _i++) {
        var update = updates_1[_i];
        if (update.state === undefined)
            states.delete(update.change.scope);
        else
            states.set(update.change.scope, update.state);
    }
    if (states.size === 0)
        cache.delete(session);
}
function relativeScope(projectRoot, dir) {
    var scope = (0, files_ts_1.relativeDisplay)(projectRoot, dir);
    return scope.length === 0 ? '.' : scope;
}
/**
 * Compare visible state with provider-visible files and render transitions.
 * @param agent - session owner whose visible surface supplies durable state.
 * @param resolved - normalized plugin configuration.
 * @param versionCache - per-session scope metadata used to skip unchanged reads.
 * @param fileSystem - provider used for current file probes.
 * @param options - authoritative claimed context, pending scope hints, touched paths, and baseline participation.
 * @returns rendered context plus deferred cache updates, or undefined when unchanged/unavailable.
 */
function reconcileInstructionContext(agent, resolved, versionCache, fileSystem, options) {
    return __awaiter(this, void 0, void 0, function () {
        var session, effective, cwd, projectRoot, _a, scopes, baselineScopes, addDirScopes, addProjectScopes, _i, _b, dir, _c, baselineScopes_1, scope, _d, _e, message, _f, _g, change, _h, _j, scope, directory, _k, _l, touchedPath, _m, _o, dir, versions, seenAbsolutePaths, keptTrimmedByDir, registerKeptTrimmed, items, versionUpdates, pushRemoval, scopesByDirectory, _p, scopes_1, scope, directory, directoryScopes, _q, scopesByDirectory_1, _r, directory, directoryScopes, probedScopes, _s, directoryScopes_1, scope, previous, itemStart, versionUpdateStart, addedAbsolutePaths, priorVersions, _t, probedScopes_1, scope, previous, probe, _u, priorVersions_1, _v, candidateScope, prior, _w, addedAbsolutePaths_1, absolutePath, probedFile, cached, file, currentDigest, trimmedDigest, nextVersion, action, change, rendered;
        var _x, _y;
        return __generator(this, function (_z) {
            switch (_z.label) {
                case 0:
                    session = agent.session;
                    effective = visibleInstructionChanges(agent, options.authorityMessages);
                    cwd = (_x = session.header.cwd) !== null && _x !== void 0 ? _x : process.cwd();
                    if (!((_y = options.projectRoot) !== null && _y !== void 0)) return [3 /*break*/, 1];
                    _a = _y;
                    return [3 /*break*/, 3];
                case 1: return [4 /*yield*/, (0, files_ts_1.findProjectRoot)(cwd, resolved.projectRootMarkers, fileSystem, options.signal)];
                case 2:
                    _a = _z.sent();
                    _z.label = 3;
                case 3:
                    projectRoot = _a;
                    scopes = new Set();
                    baselineScopes = new Set();
                    addDirScopes = function (target, directory) {
                        for (var _i = 0, _a = resolved.instructionFileCandidates; _i < _a.length; _i++) {
                            var candidate = _a[_i];
                            target.add((0, render_ts_1.candidateScopeKey)(directory, candidate));
                        }
                        for (var _b = 0, _c = resolved.localInstructionFileCandidates; _b < _c.length; _b++) {
                            var candidate = _c[_b];
                            target.add((0, render_ts_1.candidateScopeKey)(directory, candidate));
                        }
                    };
                    addProjectScopes = function (target, dir) {
                        addDirScopes(target, relativeScope(projectRoot, dir));
                    };
                    baselineScopes.add((0, render_ts_1.candidateScopeKey)(render_ts_1.USER_GLOBAL_DIRECTORY, render_ts_1.USER_GLOBAL_FILE));
                    for (_i = 0, _b = (0, files_ts_1.ancestorChain)(projectRoot, cwd); _i < _b.length; _i++) {
                        dir = _b[_i];
                        addProjectScopes(baselineScopes, dir);
                    }
                    if (options.includeBaselineScopes) {
                        for (_c = 0, baselineScopes_1 = baselineScopes; _c < baselineScopes_1.length; _c++) {
                            scope = baselineScopes_1[_c];
                            scopes.add(scope);
                        }
                    }
                    for (_d = 0, _e = options.scopeMessages; _d < _e.length; _d++) {
                        message = _e[_d];
                        /* v8 ignore next -- the plugin passes its workspace-only pending projection. */
                        if (!isWorkspaceContextSource(message.source))
                            continue;
                        for (_f = 0, _g = workspaceInstructionChanges(message.source); _f < _g.length; _f++) {
                            change = _g[_f];
                            if (!options.includeBaselineScopes && baselineScopes.has(change.scope))
                                continue;
                            scopes.add(change.scope);
                        }
                    }
                    for (_h = 0, _j = effective.keys(); _h < _j.length; _h++) {
                        scope = _j[_h];
                        if (!options.includeBaselineScopes && baselineScopes.has(scope))
                            continue;
                        directory = (0, render_ts_1.decodeScopeKey)(scope).directory;
                        if (directory === render_ts_1.USER_GLOBAL_DIRECTORY)
                            scopes.add((0, render_ts_1.candidateScopeKey)(render_ts_1.USER_GLOBAL_DIRECTORY, render_ts_1.USER_GLOBAL_FILE));
                        else
                            addDirScopes(scopes, directory);
                    }
                    for (_k = 0, _l = options.touchedPaths; _k < _l.length; _k++) {
                        touchedPath = _l[_k];
                        for (_m = 0, _o = (0, files_ts_1.descendantDirsBetween)(cwd, touchedPath); _m < _o.length; _m++) {
                            dir = _o[_m];
                            addProjectScopes(scopes, dir);
                        }
                    }
                    versions = versionStatesFor(session, versionCache);
                    seenAbsolutePaths = new Set();
                    keptTrimmedByDir = new Map();
                    registerKeptTrimmed = function (directory, digest) {
                        var digests = keptTrimmedByDir.get(directory);
                        if (digests === undefined) {
                            digests = new Set();
                            keptTrimmedByDir.set(directory, digests);
                        }
                        if (digests.has(digest))
                            return true;
                        digests.add(digest);
                        return false;
                    };
                    items = [];
                    versionUpdates = [];
                    pushRemoval = function (scope, path) {
                        var change = { action: 'remove', scope: scope, path: path };
                        items.push({ change: change, file: { absolutePath: "removed:".concat(scope), displayPath: path, content: '' } });
                        versionUpdates.push({ change: change });
                    };
                    scopesByDirectory = new Map();
                    for (_p = 0, scopes_1 = scopes; _p < scopes_1.length; _p++) {
                        scope = scopes_1[_p];
                        directory = (0, render_ts_1.decodeScopeKey)(scope).directory;
                        directoryScopes = scopesByDirectory.get(directory);
                        if (directoryScopes === undefined)
                            scopesByDirectory.set(directory, [scope]);
                        else
                            directoryScopes.push(scope);
                    }
                    _q = 0, scopesByDirectory_1 = scopesByDirectory;
                    _z.label = 4;
                case 4:
                    if (!(_q < scopesByDirectory_1.length)) return [3 /*break*/, 10];
                    _r = scopesByDirectory_1[_q], directory = _r[0], directoryScopes = _r[1];
                    probedScopes = [];
                    for (_s = 0, directoryScopes_1 = directoryScopes; _s < directoryScopes_1.length; _s++) {
                        scope = directoryScopes_1[_s];
                        if (options.excludedBaselineScopes !== undefined
                            && baselineScopes.has(scope)
                            && options.excludedBaselineScopes.has(scope)) {
                            previous = effective.get(scope);
                            if (previous === undefined || previous.action === 'remove')
                                versions.delete(scope);
                            else
                                pushRemoval(scope, previous.path);
                        }
                        else {
                            probedScopes.push(scope);
                        }
                    }
                    itemStart = items.length;
                    versionUpdateStart = versionUpdates.length;
                    addedAbsolutePaths = [];
                    priorVersions = new Map(probedScopes.map(function (scope) { return [scope, versions.get(scope)]; }));
                    _t = 0, probedScopes_1 = probedScopes;
                    _z.label = 5;
                case 5:
                    if (!(_t < probedScopes_1.length)) return [3 /*break*/, 9];
                    scope = probedScopes_1[_t];
                    previous = effective.get(scope);
                    return [4 /*yield*/, (0, files_ts_1.probeScopeInstruction)(scope, projectRoot, resolved, fileSystem, options.signal)];
                case 6:
                    probe = _z.sent();
                    if (probe.kind === 'unavailable') {
                        if (previous === undefined || previous.action === 'remove')
                            return [3 /*break*/, 8];
                        // Same-directory candidates form one deduplicated authority group. If an
                        // active member cannot be observed, preserve the entire last-good group;
                        // cache warmth must never decide whether a sibling transition is emitted.
                        items.splice(itemStart);
                        versionUpdates.splice(versionUpdateStart);
                        for (_u = 0, priorVersions_1 = priorVersions; _u < priorVersions_1.length; _u++) {
                            _v = priorVersions_1[_u], candidateScope = _v[0], prior = _v[1];
                            if (prior === undefined)
                                versions.delete(candidateScope);
                            else
                                versions.set(candidateScope, prior);
                        }
                        for (_w = 0, addedAbsolutePaths_1 = addedAbsolutePaths; _w < addedAbsolutePaths_1.length; _w++) {
                            absolutePath = addedAbsolutePaths_1[_w];
                            seenAbsolutePaths.delete(absolutePath);
                        }
                        keptTrimmedByDir.delete(directory);
                        return [3 /*break*/, 9];
                    }
                    if (probe.kind === 'absent') {
                        if (previous === undefined || previous.action === 'remove')
                            versions.delete(scope);
                        else
                            pushRemoval(scope, previous.path);
                        return [3 /*break*/, 8];
                    }
                    probedFile = probe.file;
                    if (seenAbsolutePaths.has(probedFile.absolutePath))
                        return [3 /*break*/, 8];
                    seenAbsolutePaths.add(probedFile.absolutePath);
                    addedAbsolutePaths.push(probedFile.absolutePath);
                    cached = versions.get(scope);
                    if (cached !== undefined
                        && cached.path === probedFile.displayPath
                        && cached.version === probedFile.version
                        && previous !== undefined
                        && previous.action !== 'remove'
                        && previous.path === cached.path
                        && previous.digest === cached.digest) {
                        // Unchanged and previously rendered: keep it, but an earlier sibling that
                        // now matches its trimmed content makes this the duplicate to remove.
                        if (registerKeptTrimmed(directory, cached.trimmedDigest))
                            pushRemoval(scope, previous.path);
                        return [3 /*break*/, 8];
                    }
                    return [4 /*yield*/, (0, files_ts_1.readScopeInstruction)(probedFile, resolved.maxSourceBytes, fileSystem, options.signal)];
                case 7:
                    file = _z.sent();
                    if (file === undefined)
                        return [3 /*break*/, 8];
                    currentDigest = (0, digest_ts_1.instructionContentSha1)(file.content);
                    trimmedDigest = (0, digest_ts_1.trimmedInstructionDigest)(file.content);
                    if (registerKeptTrimmed(directory, trimmedDigest)) {
                        // A distinct file whose trimmed content already appeared earlier in this
                        // directory: drop it, removing any copy that was previously rendered.
                        if (previous !== undefined && previous.action !== 'remove')
                            pushRemoval(scope, previous.path);
                        else
                            versions.delete(scope);
                        return [3 /*break*/, 8];
                    }
                    nextVersion = {
                        path: file.displayPath,
                        version: probedFile.version,
                        digest: currentDigest,
                        trimmedDigest: trimmedDigest,
                    };
                    if (previous !== undefined && previous.action !== 'remove' && previous.path === file.displayPath && previous.digest === currentDigest) {
                        versions.set(scope, nextVersion);
                        return [3 /*break*/, 8];
                    }
                    action = previous === undefined || previous.action === 'remove' ? 'set' : 'replace';
                    change = {
                        action: action,
                        scope: scope,
                        path: file.displayPath,
                        digest: currentDigest,
                    };
                    items.push({ change: change, file: file });
                    versionUpdates.push({ change: change, state: nextVersion });
                    _z.label = 8;
                case 8:
                    _t++;
                    return [3 /*break*/, 5];
                case 9:
                    _q++;
                    return [3 /*break*/, 4];
                case 10:
                    if (items.length === 0)
                        return [2 /*return*/, undefined];
                    rendered = (0, render_ts_1.renderInstructionChanges)(items, resolved.maxBytes);
                    // When no transition survived rendering (tiny budgets render notice-only
                    // text), emit nothing and commit nothing — the uncommitted versions make the
                    // next pass retry instead of spamming notice-only contexts.
                    if (rendered.text.length === 0 || rendered.changes.length === 0)
                        return [2 /*return*/, undefined];
                    return [2 /*return*/, {
                            context: workspaceContextHook(rendered.text, rendered.changes),
                            versionUpdates: retainedInstructionVersionUpdates(versionUpdates, rendered.changes),
                        }];
            }
        });
    });
}
