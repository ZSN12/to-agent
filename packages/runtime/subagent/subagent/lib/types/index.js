"use strict";
/**
 * Service Definition for the subagent capability seam (`ctx.subagents`): a named-provider registry plus a
 * capability-validating asynchronous start API. Providers establish a
 * child before returning its run, so fulfillment is the single publication and
 * ownership-transfer boundary.
 *
 * Unlike the bash seam (one executor per context, second load throws), MULTIPLE
 * providers coexist here: each registers under a unique name and a caller picks
 * one by name. The shape mirrors the LLM adapter registry
 * (`LlmRuntime.registerAdapter`), not the single-service bash executor.
 *
 * This package owns the Service Definition role of the capability seam. Service Providers
 * (`@z/dsh-subagent-spawn-in-process`, `-fork`, `-acp`) and the model-facing
 * consumer (`@z/dsh-tool-subagent`) are separate packages.
 *
 * Public operations express caller intent: `start` returns one published owned
 * one-shot run, `startContinuable` establishes a durable continuable child, and
 * `followup` delivers later content without exposing whether the child is
 * resident. Continuable children never become a {@link SubagentRun}: the
 * continuation manager holds their `AgentHandle` directly and orders every turn
 * through the child's own inbox, so providers contribute only the detached
 * creation spec and see no handle, turn, or teardown. Child and descendant
 * discovery read the live session store and optional session persistence
 * directly and do not require that continuation runtime.
 *
 * Same-process providers are trusted typed collaborators. Requests, provider
 * descriptors, results, and lifecycle payloads are borrowed immutable values;
 * serialization and hostile-input validation belong at real process, worker,
 * persistence, and model boundaries.
 *
 * @module @z/dsh-subagent
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
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
exports.SubagentRuntime = exports.SubagentDepthError = exports.resolveChildDepth = exports.resolveChildAgentOptions = exports.childSessionMeta = exports.captureDelegatedPolicyOverrides = exports.applyChildComposition = exports.appendDelegatedPolicyOverrides = exports.delegationDepthOf = exports.assertSubagentMaxDepth = exports.settleRun = exports.SubagentError = exports.seedDescriptorTurn = exports.SUBAGENT_DESCRIPTOR_VERSION = exports.snapshotSubagentDescriptor = exports.foldSubagentDescriptor = exports.SubagentRunId = exports.finalAssistantOutput = exports.AssistantOutputFold = void 0;
var cordis_1 = require("@z/cordis");
var dsh_scope_1 = require("@z/dsh-scope");
var dsh_tools_1 = require("@z/dsh-tools");
var error_ts_1 = require("./error.ts");
var depth_ts_1 = require("./depth.ts");
var lifecycle_ts_1 = require("./lifecycle.ts");
var continuation_ts_1 = require("./continuation.ts");
var activation_setup_registry_ts_1 = require("./activation-setup-registry.ts");
var list_children_ts_1 = require("./list-children.ts");
var descriptor_ts_1 = require("./descriptor.ts");
var projection_ts_1 = require("./projection.ts");
__exportStar(require("./out-of-process.ts"), exports);
var assistant_output_ts_1 = require("./assistant-output.ts");
Object.defineProperty(exports, "AssistantOutputFold", { enumerable: true, get: function () { return assistant_output_ts_1.AssistantOutputFold; } });
Object.defineProperty(exports, "finalAssistantOutput", { enumerable: true, get: function () { return assistant_output_ts_1.finalAssistantOutput; } });
var types_ts_1 = require("./types.ts");
Object.defineProperty(exports, "SubagentRunId", { enumerable: true, get: function () { return types_ts_1.SubagentRunId; } });
var descriptor_ts_2 = require("./descriptor.ts");
Object.defineProperty(exports, "foldSubagentDescriptor", { enumerable: true, get: function () { return descriptor_ts_2.foldSubagentDescriptor; } });
Object.defineProperty(exports, "snapshotSubagentDescriptor", { enumerable: true, get: function () { return descriptor_ts_2.snapshotSubagentDescriptor; } });
Object.defineProperty(exports, "SUBAGENT_DESCRIPTOR_VERSION", { enumerable: true, get: function () { return descriptor_ts_2.SUBAGENT_DESCRIPTOR_VERSION; } });
var descriptor_seed_ts_1 = require("./descriptor-seed.ts");
Object.defineProperty(exports, "seedDescriptorTurn", { enumerable: true, get: function () { return descriptor_seed_ts_1.seedDescriptorTurn; } });
var error_ts_2 = require("./error.ts");
Object.defineProperty(exports, "SubagentError", { enumerable: true, get: function () { return error_ts_2.SubagentError; } });
var run_settlement_ts_1 = require("./run-settlement.ts");
Object.defineProperty(exports, "settleRun", { enumerable: true, get: function () { return run_settlement_ts_1.settleRun; } });
var depth_ts_2 = require("./depth.ts");
Object.defineProperty(exports, "assertSubagentMaxDepth", { enumerable: true, get: function () { return depth_ts_2.assertSubagentMaxDepth; } });
Object.defineProperty(exports, "delegationDepthOf", { enumerable: true, get: function () { return depth_ts_2.delegationDepthOf; } });
var child_agent_ts_1 = require("./child-agent.ts");
Object.defineProperty(exports, "appendDelegatedPolicyOverrides", { enumerable: true, get: function () { return child_agent_ts_1.appendDelegatedPolicyOverrides; } });
Object.defineProperty(exports, "applyChildComposition", { enumerable: true, get: function () { return child_agent_ts_1.applyChildComposition; } });
Object.defineProperty(exports, "captureDelegatedPolicyOverrides", { enumerable: true, get: function () { return child_agent_ts_1.captureDelegatedPolicyOverrides; } });
Object.defineProperty(exports, "childSessionMeta", { enumerable: true, get: function () { return child_agent_ts_1.childSessionMeta; } });
Object.defineProperty(exports, "resolveChildAgentOptions", { enumerable: true, get: function () { return child_agent_ts_1.resolveChildAgentOptions; } });
Object.defineProperty(exports, "resolveChildDepth", { enumerable: true, get: function () { return child_agent_ts_1.resolveChildDepth; } });
Object.defineProperty(exports, "SubagentDepthError", { enumerable: true, get: function () { return child_agent_ts_1.SubagentDepthError; } });
/** Named provider registry with one-shot runs, durable discovery, and continuable-child operations. */
var SubagentRuntime = /** @class */ (function (_super) {
    __extends(SubagentRuntime, _super);
    function SubagentRuntime(ctx) {
        var _this = _super.call(this, ctx, 'subagents') || this;
        _this.providers = new Map();
        /** Deployment contributions composed into unpublished continuable children. */
        _this.setupRegistry = new activation_setup_registry_ts_1.default();
        _this.emitLifecycle = (0, lifecycle_ts_1.createLifecycleEmitter)(_this.ctx, function (parent) { return (0, dsh_scope_1.scopeTarget)(_this, parent); });
        ctx.inject(['agents'], function (childCtx) {
            var manager = new continuation_ts_1.default(childCtx, {
                prepareContinuable: function (name, request) { return _this.prepareContinuable(name, request); },
                observeActivation: function (provider, childId, parent) { return _this.observeActivation(provider, childId, parent); },
            }, _this.setupRegistry);
            _this.continuations = manager;
            childCtx.effect(function () { return function () {
                /* v8 ignore else -- one injected binding owns the slot until its fiber disposes. */
                if (_this.continuations === manager)
                    _this.continuations = undefined;
            }; }, 'subagents.continuationBinding()');
        });
        ctx.inject(['sessionProjections'], function (projectionCtx) {
            projectionCtx.sessionProjections.register(projection_ts_1.subagentTimingProjectionDefinition);
            projectionCtx.sessionProjections.register(projection_ts_1.subagentIdentityProjectionDefinition);
        });
        return _this;
    }
    /**
     * Establish one durable continuable child and deliver its initial prompt.
     * Resolves when the child's inbox accepts that prompt, without waiting for the
     * turn to start or for the message to reach the Session log; any earlier
     * failure rejects with no ids and rolls back the child entirely.
     * @param spec - provider, delegation request, and caller cancellation.
     * @returns the durable child id and the accepted prompt's message id.
     * @throws when continuation services are unavailable or materialization fails.
     */
    SubagentRuntime.prototype.startContinuable = function (spec) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.requireContinuations().startContinuable(spec)];
            });
        });
    };
    /**
     * Deliver one later message to a continuable child as its next FIFO turn. A
     * resident child's Agent inbox accepts it directly (waking a `waiting`
     * Activation), while an absent one is cold-resumed from its persisted
     * Session. The Agent inbox is the only queue, so every accepted message has
     * one observable order.
     * @param parent - the exact live direct parent authorizing this delivery.
     * @param childId - durable child session id.
     * @param content - user-role content to deliver.
     * @param options - the message source fields and caller cancellation, which stops the
     *   operation only before inbox acceptance.
     * @returns the accepted message's inbox id.
     * @throws when continuation services are unavailable, parent authority is
     *   rejected, or the message was not admitted.
     */
    SubagentRuntime.prototype.followup = function (parent, childId, content, options) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.requireContinuations().followup(parent, childId, content, options)];
            });
        });
    };
    /**
     * Interrupt one live continuable child's current turn under a human parent
     * address or an exact live ancestor Agent. Fire-and-return: the cancel
     * signal is issued before this returns, but the target may keep running
     * until it observes the signal. Unclaimed pending inbox work, the Activation,
     * and published descendants are preserved; claimed work is not requeued.
     * Once the interrupted driver is idle, a waking send resumes the parked FIFO
     * queue. An absent target — including a one-shot or unknown id —
     * is an accepted no-op, as is a manager-less composition, which cannot own a
     * live Activation.
     * @param targetSessionId - the durable child session id to interrupt.
     * @param authority - the human parent address or exact live ancestor Agent.
     * @throws {SubagentError} `UNAUTHORIZED` when the authority does not own the
     *   live target.
     */
    SubagentRuntime.prototype.interrupt = function (targetSessionId, authority) {
        var _a;
        (_a = this.continuations) === null || _a === void 0 ? void 0 : _a.interrupt(targetSessionId, authority);
    };
    /**
     * Deliver selected content from one live continuable child to its durable
     * direct parent. The child is the authority credential; callers cannot name a
     * recipient. Reporting does not conclude the child's turn or Activation.
     * @param child - exact live reporting child.
     * @param content - selected model-facing content.
     * @param options - parent scheduling and pre-acceptance cancellation.
     * @returns the stable identity of the parent-accepted message.
     * @throws when continuation services are unavailable, sender authorization
     *   fails, or the direct parent is not live.
     */
    SubagentRuntime.prototype.reportFrom = function (child, content, options) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.requireContinuations().reportFrom(child, content, options)];
            });
        });
    };
    /**
     * Compose one deployment capability into every continuable child's
     * unpublished creation context on fresh creation and cold resume. Grants wait
     * for the next Activation; removing the contribution revokes every resident
     * installation immediately.
     * @param contribution - synchronous child-scope installer.
     * @returns the exact Cordis effect disposer.
     */
    SubagentRuntime.prototype.registerContinuableSetup = function (contribution) {
        var _this = this;
        // oxlint-disable-next-line typescript/no-misused-promises -- synchronous cleanup; direct return preserves disposer identity
        return this.ctx.effect(function () { return _this.setupRegistry.register(contribution); }, 'subagents.registerContinuableSetup()');
    };
    /**
     * Close continuable admission below exact live parent Agents, stop only their
     * visible descendant Activations synchronously, then await admitted scoped
     * materializations and release those forests child-first. The scoped cutoff
     * lasts until each exact parent leaves the registry; unrelated parent trees
     * remain live.
     * @param parents - exact host-owned parent Agents entering teardown.
     * @returns once every retained descendant Activation released its `AgentHandle`.
     * @throws an aggregate error after all branches settle when any failed.
     */
    SubagentRuntime.prototype.drainContinuableDescendants = function (parents) {
        return __awaiter(this, void 0, void 0, function () {
            var manager;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        manager = this.continuations;
                        // Absent continuation services means nothing was ever materialized.
                        if (manager === undefined)
                            return [2 /*return*/];
                        return [4 /*yield*/, manager.drainDescendants(parents)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Release selected resident continuable direct children of one exact live
     * parent. Other children of the same parent remain admitted and resident.
     * Absent targets and a manager-less composition are accepted no-ops.
     * @param parent - exact live direct parent authorizing the selected release.
     * @param childIds - durable direct-child ids to release when resident.
     * @returns once every selected Activation released its `AgentHandle`.
     * @throws {SubagentError} `UNAUTHORIZED` when a resident target belongs to a
     *   different parent or the supplied parent identity is stale.
     */
    SubagentRuntime.prototype.drainContinuableChildren = function (parent, childIds) {
        return __awaiter(this, void 0, void 0, function () {
            var manager;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        manager = this.continuations;
                        if (manager === undefined)
                            return [2 /*return*/];
                        return [4 /*yield*/, manager.drainChildren(parent, childIds)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Enumerate the parent's direct session-backed subagents without loading or
     * resuming an Agent and without any query service: the listing merges the live
     * session store with optional session persistence (live-preferred) and
     * serves each child's durable mode/label from the registered `subagent`
     * projection unit down a three-rung ladder — the registry's watermark
     * snapshot for a live child; for a cold one, a durable projection-cache
     * row when the optional cache serves an own-suffix identity (its `seq`
     * gate proves the value postdates the fork seed, where a child's own
     * descriptor is immutable once appended), else one persistence inspection
     * folded through the registry. The
     * projection fold is the single classification authority; per-child
     * diagnostics relay a fold that served no identity or a failed inspection,
     * never a list-time descriptor parse. Absent persistence, enumeration is
     * live-only (a cold child cannot be resumed then either, so its absence is
     * capability absence, not an error). This service consults no Agent
     * registrations, Activations, or providers.
     *
     * Every persistence read receives `signal`, and the listing rechecks
     * cancellation around each of those awaits. Read rejections that settle
     * after an abort become a stable `SubagentError` with code `CANCELLED`.
     * @param parentSessionId - parent session whose direct children are listed.
     * @param signal - caller-owned cancellation forwarded to persistence reads
     *   and observed around every read await.
     * @returns children and per-child diagnostics ordered by `createdAt`, then id.
     * @throws {@link SubagentError} when the projection registry or the session
     *   store is not mounted, or the caller cancels the listing.
     */
    SubagentRuntime.prototype.listChildren = function (parentSessionId, signal) {
        return (0, list_children_ts_1.listChildren)(this.ctx, parentSessionId, signal);
    };
    /**
     * Enumerate the root's complete session-backed subagent tree in stable
     * pre-order from one live-preferred corpus, without loading or resuming an
     * Agent. Ordinary sessions and one-shot children remain traversal nodes so
     * continuable descendants below them are discovered; each returned entry
     * adds its durable `parentId` and root-relative `depth`. Identity resolution,
     * diagnostics, optional persistence, and cancellation follow the same
     * projection-backed contract as {@link listChildren}.
     * @param rootSessionId - session whose complete descendant tree is listed.
     * @param signal - caller-owned cancellation forwarded to persistence reads
     *   and observed around every read await.
     * @returns children and per-candidate diagnostics with tree position, in
     *   stable pre-order.
     * @throws {@link SubagentError} under the same conditions as {@link listChildren}.
     */
    SubagentRuntime.prototype.listDescendants = function (rootSessionId, signal) {
        return (0, list_children_ts_1.listDescendants)(this.ctx, rootSessionId, signal);
    };
    /**
     * Register a provider under its name. Registration is effect-scoped and HMR
     * safe; removing a provider blocks new starts but does not revoke runs that
     * were already returned to their holders.
     * @param provider - the trusted provider implementation.
     * @returns the exact Cordis effect disposer.
     */
    SubagentRuntime.prototype.registerProvider = function (provider) {
        var name = provider.name;
        // oxlint-disable-next-line typescript/no-misused-promises -- synchronous cleanup; direct return preserves disposer identity
        return this.ctx.effect(function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.providers.has(name)) {
                            throw new error_ts_1.SubagentError("a subagent provider named \"".concat(name, "\" is already registered"), 'DUPLICATE_PROVIDER');
                        }
                        this.providers.set(name, provider);
                        return [4 /*yield*/, function () {
                                _this.providers.delete(name);
                                _this.emitLifecycle('subagent/provider-removed', name);
                            }
                            // A throwing added-listener unwinds the yielded rollback, matching the
                            // repository's fail-loud registration semantics.
                        ];
                    case 1:
                        _a.sent();
                        // A throwing added-listener unwinds the yielded rollback, matching the
                        // repository's fail-loud registration semantics.
                        this.ctx.emit('subagent/provider-added', provider);
                        return [2 /*return*/];
                }
            });
        }.bind(this), 'subagents.registerProvider()');
    };
    /**
     * Look up a provider by name.
     * @param name - the provider name.
     * @returns the provider, or undefined when absent.
     */
    SubagentRuntime.prototype.getProvider = function (name) {
        return this.providers.get(name);
    };
    /**
     * List registered provider names in insertion order.
     * @returns the registered names.
     */
    SubagentRuntime.prototype.list = function () {
        return __spreadArray([], this.providers.keys(), true);
    };
    /**
     * Establish a published child on the named provider. Capability and semantic
     * checks run before delegation. Provider ownership lasts until its promise
     * fulfills; a rejection therefore has no run for the caller to dispose and
     * emits no run lifecycle events. Post-publication turn and infrastructure
     * failures settle through the returned run.
     * @param name - the provider to use.
     * @param request - child label, prompt, parent, signal, and optional capabilities.
     * @returns the published holder-owned run.
     */
    SubagentRuntime.prototype.start = function (name, request) {
        return __awaiter(this, void 0, void 0, function () {
            var provider, descriptor, resolved, _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        provider = this.expectProvider(name);
                        this.assertCapabilities(provider, request);
                        (0, depth_ts_1.assertSubagentMaxDepth)(request.maxDepth);
                        if (request.outputSchema !== undefined)
                            (0, dsh_tools_1.assertObjectJsonSchema)(request.outputSchema);
                        descriptor = (0, descriptor_ts_1.snapshotSubagentDescriptor)(__assign({ mode: 'one-shot', provider: name }, request.label !== undefined ? { label: request.label } : {}));
                        resolved = __assign(__assign({}, request), { descriptor: descriptor });
                        _a = lifecycle_ts_1.observeRun;
                        _b = [this.emitLifecycle, name, request.parent];
                        return [4 /*yield*/, provider.start(resolved)];
                    case 1: return [2 /*return*/, _a.apply(void 0, _b.concat([_c.sent()]))];
                }
            });
        });
    };
    /**
     * Resolve one provider's detached continuable-creation contribution. Method
     * presence on the provider IS the capability, so a provider without it is
     * rejected before the manager reserves any child resources.
     */
    SubagentRuntime.prototype.prepareContinuable = function (name, request) {
        return __awaiter(this, void 0, void 0, function () {
            var provider;
            return __generator(this, function (_a) {
                provider = this.expectProvider(name);
                if (provider.prepareContinuable === undefined) {
                    throw new error_ts_1.SubagentError("subagent provider \"".concat(provider.name, "\" does not support continuable children ")
                        + '(no prepareContinuable capability)', 'UNSUPPORTED_CAPABILITY');
                }
                return [2 /*return*/, provider.prepareContinuable(request)];
            });
        });
    };
    /** Look up a provider for dispatch or fail loud. */
    SubagentRuntime.prototype.expectProvider = function (name) {
        var provider = this.providers.get(name);
        if (provider === undefined) {
            throw new error_ts_1.SubagentError("no subagent provider registered for \"".concat(name, "\""), 'NO_PROVIDER');
        }
        return provider;
    };
    /** Resolve the optional continuable-subagent manager or fail loud. */
    SubagentRuntime.prototype.requireContinuations = function () {
        if (this.continuations === undefined) {
            throw new error_ts_1.SubagentError('continuable subagents require the agents service', 'CONTINUATION_UNAVAILABLE');
        }
        return this.continuations;
    };
    /**
     * Build the lifecycle observer for one continuable Activation's residency
     * epoch, so the manager publishes its edges without owning event dispatch.
     */
    SubagentRuntime.prototype.observeActivation = function (provider, childId, parent) {
        return (0, lifecycle_ts_1.createActivationObserver)(this.emitLifecycle, provider, childId, parent);
    };
    /** Reject the first requested capability that the provider lacks. */
    SubagentRuntime.prototype.assertCapabilities = function (provider, request) {
        var needs = [
            { when: request.outputSchema !== undefined, cap: 'outputSchema' },
            { when: request.maxDepth !== undefined, cap: 'depthLimit' },
            { when: request.toolFilter !== undefined, cap: 'toolFilter' },
            { when: request.persona !== undefined, cap: 'persona' },
        ];
        for (var _i = 0, needs_1 = needs; _i < needs_1.length; _i++) {
            var _a = needs_1[_i], when = _a.when, cap = _a.cap;
            if (when && !provider.capabilities[cap]) {
                throw new error_ts_1.SubagentError("subagent provider \"".concat(provider.name, "\" does not support the \"").concat(cap, "\" capability"), 'UNSUPPORTED_CAPABILITY');
            }
        }
    };
    return SubagentRuntime;
}(cordis_1.Service));
exports.SubagentRuntime = SubagentRuntime;
exports.default = SubagentRuntime;
