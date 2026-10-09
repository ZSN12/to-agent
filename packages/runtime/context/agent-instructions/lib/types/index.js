"use strict";
/**
 * Workspace instruction loader for AGENTS.md-compatible files.
 *
 * Baseline instructions enter durable context before the first request; successful fs
 * tool touches project nested, changed, and removed instructions into the inbox.
 * Plugin lifecycle reads use the optional `ctx.fs` provider, so providerless products
 * mount it as a no-op.
 *
 * @module @z/dsh-agent-instructions
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
exports.renderWorkspaceContext = exports.loadBaselineInstructions = exports.discoverBaselineInstructionFiles = exports.name = exports.Config = void 0;
exports.apply = apply;
var node_util_1 = require("node:util");
var dsh_llm_1 = require("@z/dsh-llm");
var config_ts_1 = require("./config.ts");
Object.defineProperty(exports, "Config", { enumerable: true, get: function () { return config_ts_1.Config; } });
var files_ts_1 = require("./files.ts");
var state_ts_1 = require("./state.ts");
Object.defineProperty(exports, "name", { enumerable: true, get: function () { return state_ts_1.name; } });
var files_ts_2 = require("./files.ts");
Object.defineProperty(exports, "discoverBaselineInstructionFiles", { enumerable: true, get: function () { return files_ts_2.discoverBaselineInstructionFiles; } });
Object.defineProperty(exports, "loadBaselineInstructions", { enumerable: true, get: function () { return files_ts_2.loadBaselineInstructions; } });
var render_ts_1 = require("./render.ts");
Object.defineProperty(exports, "renderWorkspaceContext", { enumerable: true, get: function () { return render_ts_1.renderWorkspaceContext; } });
function visibleBaselineSource(agent, authorityMessages) {
    for (var _i = 0, _a = authorityMessages.toReversed(); _i < _a.length; _i++) {
        var message = _a[_i];
        if (message.source.kind === 'agent-instructions' && message.source.baseline === true) {
            return message.source;
        }
    }
    for (var _b = 0, _c = agent.session.surface.nodes.toReversed(); _b < _c.length; _b++) {
        var seq = _c[_b];
        var event_1 = agent.session.events[seq];
        if ((event_1 === null || event_1 === void 0 ? void 0 : event_1.type) === 'user/message'
            && event_1.data.source.kind === 'agent-instructions'
            && event_1.data.source.baseline === true)
            return event_1.data.source;
    }
    return undefined;
}
function isWorkspaceContext(message) {
    return message.source.kind === 'agent-instructions';
}
function sameContextPayload(left, right) {
    return (0, node_util_1.isDeepStrictEqual)(left.content, right.content)
        && (0, node_util_1.isDeepStrictEqual)(left.source, right.source);
}
var FILE_TOUCH_TOOL_NAMES = new Set(['read', 'write', 'edit']);
function filePathFromExecution(exec) {
    if (!FILE_TOUCH_TOOL_NAMES.has(exec.name))
        return undefined;
    if (typeof exec.arguments !== 'object' || exec.arguments === null)
        return undefined;
    if (!('file_path' in exec.arguments) || typeof exec.arguments.file_path !== 'string')
        return undefined;
    var filePath = exec.arguments.file_path.trim();
    return filePath.length > 0 ? filePath : undefined;
}
function apply(ctx, config) {
    var _this = this;
    var resolved = (0, config_ts_1.resolveConfig)(config);
    var instructionVersions = new WeakMap();
    var baselinePreparations = new WeakMap();
    var projectionLifecycle = new AbortController();
    var executionTouches = new Map();
    ctx.effect(function () { return function () {
        projectionLifecycle.abort(new Error('agent-instructions disposed'));
        executionTouches.clear();
    }; }, 'agent-instructions.projectionLifecycle');
    // Emit listeners are not awaited, so each projection must compose against the
    // inbox produced by earlier file results for the same agent.
    var projectionTails = new WeakMap();
    // Execution ancestry and the enclosing durable step are the two commit
    // boundaries before an asynchronous projection may mutate the agent inbox.
    var openSteps = new WeakMap();
    var stepTouches = new WeakMap();
    var compose = function (agent_1, signal_1, claimed_1, pending_1) {
        var args_1 = [];
        for (var _i = 4; _i < arguments.length; _i++) {
            args_1[_i - 4] = arguments[_i];
        }
        return __awaiter(_this, __spreadArray([agent_1, signal_1, claimed_1, pending_1], args_1, true), void 0, function (agent, signal, claimed, pending, touchedPaths) {
            var fileSystem, content, changes, desiredBaseline, authorityMessages, cwd, projectRoot, identity, visibleBaseline, baselinePresent, keepVisibleBaseline, prepared, excludedBaselineScopes, nextPreparation, replacePreviousBaseline, instructions, baseline, observedBaseline, excludedScopes, _a, _b, scope, versionStates, _c, _d, _e, scope, state, baselineContent, replacementScopes_1, replacementRemovals, baselineChanges, update;
            var _f, _g, _h;
            if (touchedPaths === void 0) { touchedPaths = []; }
            return __generator(this, function (_j) {
                switch (_j.label) {
                    case 0:
                        signal.throwIfAborted();
                        if (resolved.maxBytes <= 0 || !Number.isFinite(resolved.maxBytes)) {
                            return [2 /*return*/, undefined];
                        }
                        fileSystem = ctx.get('fs');
                        if (fileSystem === undefined)
                            return [2 /*return*/, undefined];
                        if (touchedPaths.length === 0 && pending.length > 0)
                            return [2 /*return*/, pending[0]];
                        content = [];
                        changes = [];
                        desiredBaseline = false;
                        authorityMessages = __spreadArray([], claimed, true);
                        cwd = (_f = agent.session.header.cwd) !== null && _f !== void 0 ? _f : process.cwd();
                        return [4 /*yield*/, (0, files_ts_1.findProjectRoot)(cwd, resolved.projectRootMarkers, fileSystem, signal)];
                    case 1:
                        projectRoot = _j.sent();
                        identity = (0, config_ts_1.workspaceBaselineIdentity)(resolved, cwd, projectRoot);
                        visibleBaseline = visibleBaselineSource(agent, authorityMessages);
                        baselinePresent = visibleBaseline !== undefined;
                        keepVisibleBaseline = (visibleBaseline === null || visibleBaseline === void 0 ? void 0 : visibleBaseline.baselineIdentity) === identity;
                        prepared = baselinePreparations.get(agent.session);
                        excludedBaselineScopes = keepVisibleBaseline && (prepared === null || prepared === void 0 ? void 0 : prepared.identity) === identity
                            ? prepared.excludedScopes
                            : undefined;
                        if (!(!baselinePresent || !keepVisibleBaseline || excludedBaselineScopes === undefined)) return [3 /*break*/, 3];
                        replacePreviousBaseline = baselinePresent && !keepVisibleBaseline;
                        return [4 /*yield*/, (0, files_ts_1.loadBaselineInstructionSet)({
                                cwd: cwd,
                                dshHome: resolved.dshHome,
                                projectRootMarkers: resolved.projectRootMarkers,
                                maxBytes: resolved.maxBytes,
                                maxSourceBytes: resolved.maxSourceBytes,
                                instructionFileCandidates: resolved.instructionFileCandidates,
                                localInstructionFileCandidates: resolved.localInstructionFileCandidates,
                                projectRoot: projectRoot,
                                replacePreviousBaseline: replacePreviousBaseline,
                                signal: signal,
                            }, fileSystem)];
                    case 2:
                        instructions = _j.sent();
                        baseline = (0, state_ts_1.baselineInstructionState)((_g = instructions === null || instructions === void 0 ? void 0 : instructions.included) !== null && _g !== void 0 ? _g : []);
                        observedBaseline = (0, state_ts_1.baselineInstructionState)((_h = instructions === null || instructions === void 0 ? void 0 : instructions.observed) !== null && _h !== void 0 ? _h : []);
                        excludedScopes = new Set(observedBaseline.changes.keys());
                        for (_a = 0, _b = baseline.changes.keys(); _a < _b.length; _a++) {
                            scope = _b[_a];
                            excludedScopes.delete(scope);
                        }
                        excludedBaselineScopes = excludedScopes;
                        nextPreparation = { identity: identity, excludedScopes: excludedScopes };
                        versionStates = instructionVersions.get(agent.session);
                        if (versionStates === undefined && baseline.versions.size > 0) {
                            versionStates = new Map();
                            instructionVersions.set(agent.session, versionStates);
                        }
                        for (_c = 0, _d = baseline.versions; _c < _d.length; _c++) {
                            _e = _d[_c], scope = _e[0], state = _e[1];
                            versionStates === null || versionStates === void 0 ? void 0 : versionStates.set(scope, state);
                        }
                        if (!keepVisibleBaseline && instructions !== undefined && instructions.rendered.text.length > 0) {
                            baselineContent = (0, state_ts_1.workspaceContextMessage)(instructions.rendered.text).content;
                            content.push.apply(content, baselineContent);
                            replacementScopes_1 = new Set(baseline.changes.keys());
                            replacementRemovals = replacePreviousBaseline
                                ? visibleBaseline.changes.flatMap(function (change) { return (change.action === 'remove' || replacementScopes_1.has(change.scope)
                                    ? []
                                    : [{ action: 'remove', scope: change.scope, path: change.path }]); })
                                : [];
                            baselineChanges = __spreadArray(__spreadArray([], replacementRemovals, true), baseline.changes.values(), true);
                            changes.push.apply(changes, baselineChanges);
                            authorityMessages.push((0, dsh_llm_1.createUserMessage)({
                                content: baselineContent,
                                source: {
                                    kind: 'agent-instructions',
                                    form: 'instructions',
                                    baseline: true,
                                    baselineIdentity: identity,
                                    changes: baselineChanges,
                                },
                            }));
                            desiredBaseline = true;
                        }
                        _j.label = 3;
                    case 3: return [4 /*yield*/, (0, state_ts_1.reconcileInstructionContext)(agent, resolved, instructionVersions, fileSystem, __assign(__assign({ authorityMessages: authorityMessages, scopeMessages: pending, includeBaselineScopes: keepVisibleBaseline }, keepVisibleBaseline ? { excludedBaselineScopes: excludedBaselineScopes } : {}), { touchedPaths: touchedPaths, projectRoot: projectRoot, signal: signal }))];
                    case 4:
                        update = _j.sent();
                        if (update !== undefined) {
                            content.push.apply(content, update.context.content);
                            /* v8 ignore next -- reconciliation constructs only agent-instructions contexts. */
                            if (update.context.source.kind === 'agent-instructions') {
                                changes.push.apply(changes, update.context.source.changes);
                            }
                            (0, state_ts_1.applyInstructionVersionUpdates)(agent.session, update.versionUpdates, instructionVersions);
                        }
                        if (nextPreparation !== undefined)
                            baselinePreparations.set(agent.session, nextPreparation);
                        if (content.length === 0)
                            return [2 /*return*/, undefined];
                        return [2 /*return*/, (0, dsh_llm_1.createUserMessage)({
                                content: content,
                                source: __assign(__assign(__assign({ kind: 'agent-instructions', form: 'instructions' }, desiredBaseline ? { baseline: true } : {}), desiredBaseline ? { baselineIdentity: identity } : {}), { changes: changes }),
                            })];
                }
            });
        });
    };
    var syncInbox = function (agent, claimed, desired) {
        var pending = agent.inbox.nextStep.filter(isWorkspaceContext);
        var alreadySupplied = desired !== undefined && (claimed.some(function (message) { return sameContextPayload(message, desired); })
            || agent.session.surface.nodes.some(function (seq) {
                var event = agent.session.events[seq];
                return (event === null || event === void 0 ? void 0 : event.type) === 'user/message' && sameContextPayload(event.data, desired);
            }));
        if (desired === undefined || alreadySupplied) {
            for (var _i = 0, pending_1 = pending; _i < pending_1.length; _i++) {
                var message = pending_1[_i];
                agent.inbox.remove(message.id);
            }
            return;
        }
        var reusable = pending.find(function (message) { return sameContextPayload(message, desired); });
        if (reusable !== undefined) {
            for (var _a = 0, pending_2 = pending; _a < pending_2.length; _a++) {
                var message = pending_2[_a];
                if (message !== reusable)
                    agent.inbox.remove(message.id);
            }
            return;
        }
        var replaced = pending[0];
        if (replaced === undefined)
            agent.inbox.prepend('next-step', desired);
        else
            agent.inbox.replace(replaced.id, desired);
        for (var _b = 0, _c = pending.slice(1); _b < _c.length; _b++) {
            var message = _c[_b];
            agent.inbox.remove(message.id);
        }
    };
    var composeAndSync = function (agent_1, signal_1, claimed_1) {
        var args_1 = [];
        for (var _i = 3; _i < arguments.length; _i++) {
            args_1[_i - 3] = arguments[_i];
        }
        return __awaiter(_this, __spreadArray([agent_1, signal_1, claimed_1], args_1, true), void 0, function (agent, signal, claimed, touchedPaths) {
            var pending, desired;
            if (touchedPaths === void 0) { touchedPaths = []; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pending = agent.inbox.nextStep.filter(isWorkspaceContext);
                        return [4 /*yield*/, compose(agent, signal, claimed, pending, touchedPaths)];
                    case 1:
                        desired = _a.sent();
                        signal.throwIfAborted();
                        syncInbox(agent, claimed, desired);
                        return [2 /*return*/];
                }
            });
        });
    };
    var queueProjection = function (agent, touchedPath) {
        var _a;
        var previous = (_a = projectionTails.get(agent)) !== null && _a !== void 0 ? _a : Promise.resolve();
        var current = previous.then(function () { return composeAndSync(agent, projectionLifecycle.signal, [], [touchedPath]); })
            .catch(function (error) {
            if (!projectionLifecycle.signal.aborted)
                ctx.logger.warn('workspace instruction refresh failed: %o', error);
        });
        projectionTails.set(agent, current);
        void current.then(function () {
            if (projectionTails.get(agent) === current)
                projectionTails.delete(agent);
        });
    };
    var waitForProjections = function (agent) { return __awaiter(_this, void 0, void 0, function () {
        var projection;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!((projection = projectionTails.get(agent)) !== undefined)) return [3 /*break*/, 2];
                    return [4 /*yield*/, projection];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 0];
                case 2: return [2 /*return*/];
            }
        });
    }); };
    var stepIsOpen = function (session) {
        var known = openSteps.get(session);
        if (known !== undefined)
            return known;
        var open = false;
        for (var _i = 0, _a = session.events; _i < _a.length; _i++) {
            var event_2 = _a[_i];
            if (event_2.type === 'step/start')
                open = true;
            else if (event_2.type === 'step/end' || event_2.type === 'turn/end')
                open = false;
        }
        openSteps.set(session, open);
        return open;
    };
    var projectTouch = function (touch) {
        var session = touch.agent.session;
        if (!stepIsOpen(session)) {
            queueProjection(touch.agent, touch.path);
            return;
        }
        var pending = stepTouches.get(session);
        if (pending === undefined)
            stepTouches.set(session, [touch]);
        else
            pending.push(touch);
    };
    ctx.on('session/event', function (session, event) {
        if (event.type === 'step/start') {
            openSteps.set(session, true);
            return;
        }
        if (event.type === 'turn/end') {
            openSteps.set(session, false);
            return;
        }
        if (event.type !== 'step/end')
            return;
        openSteps.set(session, false);
        var pending = stepTouches.get(session);
        if (pending === undefined)
            return;
        stepTouches.delete(session);
        for (var _i = 0, pending_3 = pending; _i < pending_3.length; _i++) {
            var touch = pending_3[_i];
            queueProjection(touch.agent, touch.path);
        }
    });
    ctx.on('agent/pre-step', function (_a, next_1) { return __awaiter(_this, [_a, next_1], void 0, function (_b, next) {
        var decision, pending, desired, _i, pending_4, message, lastClaimedIndex, entered;
        var agent = _b.agent, messages = _b.messages, step = _b.step, signal = _b.signal;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, next()];
                case 1:
                    decision = _c.sent();
                    return [4 /*yield*/, waitForProjections(agent)];
                case 2:
                    _c.sent();
                    pending = agent.inbox.nextStep.filter(isWorkspaceContext);
                    return [4 /*yield*/, compose(agent, signal, messages, pending)];
                case 3:
                    desired = _c.sent();
                    signal.throwIfAborted();
                    // An empty first entry owns a no-step turn; keep context pending instead
                    // of turning it into a standalone request. Later entries may be tool continuations.
                    if (decision.kind === 'reject' || (step === 1 && decision.messages.length === 0)) {
                        syncInbox(agent, messages, desired);
                        return [2 /*return*/, decision];
                    }
                    // A proceeding step settles the pending context: it either enters below as
                    // `desired`, or its payload is already covered by the batch, so nothing stays pending.
                    for (_i = 0, pending_4 = pending; _i < pending_4.length; _i++) {
                        message = pending_4[_i];
                        agent.inbox.remove(message.id);
                    }
                    if (desired === undefined || decision.messages.some(function (message) { return sameContextPayload(message, desired); })) {
                        return [2 /*return*/, decision];
                    }
                    lastClaimedIndex = decision.messages.findLastIndex(function (message) { return messages.includes(message); });
                    entered = decision.messages.toSpliced(lastClaimedIndex + 1, 0, desired);
                    return [2 /*return*/, { kind: 'enter', messages: entered }];
            }
        });
    }); });
    ctx.on('tools/result', function (exec, result) {
        var _a;
        var touches = (_a = executionTouches.get(exec.token)) !== null && _a !== void 0 ? _a : [];
        executionTouches.delete(exec.token);
        if (!result.isError && exec.agent !== undefined && !exec.signal.aborted) {
            var ownPath = filePathFromExecution(exec);
            if (ownPath !== undefined)
                touches.push({ agent: exec.agent, path: ownPath });
        }
        if (exec.parent !== undefined) {
            if (touches.length > 0) {
                var parentTouches = executionTouches.get(exec.parent);
                if (parentTouches === undefined)
                    executionTouches.set(exec.parent, touches);
                else
                    parentTouches.push.apply(parentTouches, touches);
            }
            return;
        }
        for (var _i = 0, touches_1 = touches; _i < touches_1.length; _i++) {
            var touch = touches_1[_i];
            projectTouch(touch);
        }
    });
}
