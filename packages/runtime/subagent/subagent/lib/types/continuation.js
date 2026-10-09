"use strict";
/**
 * Internal continuable-subagent manager: stable child ids, descriptor
 * persistence, activation admission, the live ownership graph, cold resume,
 * child-first disposal, and settlement delivery to the parent, behind
 * `ctx.subagents`.
 *
 * A continuable child has one durable Session and at most one process-local
 * {@link Activation} — one residency epoch for a reconstructed child Agent. An
 * Activation is not a request, result, cancellation, or Task boundary: it may
 * execute many FIFO turns and stays resident while descendants it created are
 * still running. The Agent inbox is the only turn queue, so this manager owns
 * residency while the Agent loop owns all turn ordering and execution. No
 * continuable path creates a Task or an intermediate result-bearing wrapper.
 *
 * Because residency is this manager's alone to end, telling the parent that a
 * child settled is its job too. An external `subagent/end` listener cannot do
 * it correctly: that payload names no parent, the child handle is already
 * disposed by then, and the release that wakes the parent's own settlement
 * watcher has already run. See {@link SubagentContinuationManager.notifySettlement}.
 *
 * @module @z/dsh-subagent
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
exports.SubagentContinuationManager = void 0;
var node_crypto_1 = require("node:crypto");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_session_1 = require("@z/dsh-session");
var descriptor_ts_1 = require("./descriptor.ts");
var child_agent_ts_1 = require("./child-agent.ts");
var depth_ts_1 = require("./depth.ts");
var descriptor_seed_ts_1 = require("./descriptor-seed.ts");
var error_ts_1 = require("./error.ts");
/**
 * Read one Activation's current disposal transaction. This indirection exists
 * because TypeScript would otherwise narrow repeated reads of the mutable field
 * inside a long-lived closure to constants instead of re-reading runtime state.
 * @param activation - the Activation to inspect.
 * @returns the in-flight or settled disposal, or `undefined` while resident.
 */
function disposalOf(activation) {
    return activation.disposal;
}
/**
 * One line telling a parent that a background child is finished and why, in
 * the parent's own task vocabulary.
 * @param childId - the durable child the parent knows by id.
 * @param stopReason - how the child's last ordinary turn ended.
 * @returns the model-facing opening line of the settlement notice.
 */
function settlementSummary(childId, stopReason) {
    var subject = "Background subagent ".concat(childId);
    switch (stopReason) {
        case 'completed':
            return "".concat(subject, " finished and will do no further work unless you send it more.");
        case 'aborted':
            return "".concat(subject, " was stopped before it finished.");
        case 'max-tokens':
            return "".concat(subject, " ran out of room before it finished.");
        // A pre-step rejection — a hook deny, a policy plugin — discarded input
        // the child had claimed, so the parent must not treat the task as done.
        case 'refusal':
            return "".concat(subject, " declined the task.");
        case 'error':
            return "".concat(subject, " failed before it finished.");
        /* v8 ignore next 4 -- `SubagentResult['stopReason']` is merge-extensible, so this arm
         * needs a backend that adds a variant; an unnameable ending is reported as unfinished
         * rather than silently as success. */
        default:
            return "".concat(subject, " ended abnormally (").concat(String(stopReason), ") before it finished.");
    }
}
/** Serialize each durable child's delivery, release, and disposal. */
var ChildLock = /** @class */ (function () {
    function ChildLock() {
        this.tails = new Map();
    }
    /**
     * Run `operation` after every previously queued operation for `childId`.
     * @param childId - the durable child whose operations are linearized.
     * @param operation - the critical section to run in order.
     * @returns the operation's own settlement.
     */
    ChildLock.prototype.run = function (childId, operation) {
        var _this = this;
        var _a;
        var previous = (_a = this.tails.get(childId)) !== null && _a !== void 0 ? _a : Promise.resolve();
        var result = previous.then(operation, operation);
        // Absorb rejections in the chaining tail so one failed critical section
        // cannot reject an unrelated later caller.
        var tail = result.then(function () { return undefined; }, function () { return undefined; });
        this.tails.set(childId, tail);
        void tail.then(function () {
            if (_this.tails.get(childId) === tail)
                _this.tails.delete(childId);
        });
        return result;
    };
    return ChildLock;
}());
/**
 * The continuable-subagent orchestration service behind `ctx.subagents`. Tool
 * schema and host adapters are consumers of this one contract; foreground
 * one-shot delegation keeps calling `ctx.subagents.start()` and never enters
 * this lifecycle.
 */
var SubagentContinuationManager = /** @class */ (function () {
    function SubagentContinuationManager(ctx, host, setupRegistry) {
        var _this = this;
        this.ctx = ctx;
        this.host = host;
        this.setupRegistry = setupRegistry;
        /** Child session id → its live Activation. Process-local, never durable. */
        this.activations = new Map();
        /** Materializations admitted before drain, tracked through publication or rollback. */
        this.materializations = new Set();
        this.locks = new ChildLock();
        /**
         * Exact roots whose host teardown has begun, with the live lineage members
         * observed under each root. Entries remain until that exact root leaves the
         * Agent registry, closing admission throughout its host's teardown without
         * poisoning a later same-id replacement.
         */
        this.closingScopes = new Map();
        this.draining = false;
        // Ordinary Cordis owner effects unwind in reverse registration order, which
        // cannot express the dynamic child graph. Register the private scope's
        // structural disposer FIRST and the drain SECOND, so reverse unwind invokes
        // the drain before releasing the scope; a cleanup effect on the same scope
        // as the Agent handles would let structural handle disposal bypass
        // child-first ordering.
        var scope = ctx.plugin(function activationOwner() { });
        this.ownerCtx = scope.ctx;
        ctx.on('agent/disposed', function (_a) {
            var agent = _a.agent;
            _this.closingScopes.delete(agent);
        });
        ctx.effect(function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, scope.dispose];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, function () { return _this.drain(); }];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }.bind(this), 'subagents.continuations()');
    }
    /**
     * Start one continuable background child: reserve its durable identity,
     * resolve the provider's detached creation spec, create the child Agent
     * through the private activation-owner scope, establish any continuable-parent
     * ownership, and submit the initial prompt. Resolves when inbox acceptance
     * yields the message id — without waiting for the turn to start or for the
     * message to reach the Session log.
     *
     * Every failure before that acceptance rejects without either id, disposing
     * any created handle and rolling back the Activation and parent ownership.
     * The caller signal owns lookup, materialization, and admission only until
     * acceptance; afterwards the manager owns the Activation independently.
     * @param spec - provider, delegation request, and caller cancellation.
     * @returns the durable child id and the accepted initial prompt's message id.
     */
    SubagentContinuationManager.prototype.startContinuable = function (spec) {
        return __awaiter(this, void 0, void 0, function () {
            var request, parent, persistence, childId, childDepth, agentProvider, agentModel, descriptor, delegatedPolicies, prepared, lineageSeedLength, seed, messageId;
            var _this = this;
            var _a, _b, _c, _d, _e, _f, _g;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        request = spec.request;
                        parent = request.parent;
                        this.assertAdmitting(parent);
                        persistence = this.requirePersistence();
                        (0, depth_ts_1.assertSubagentMaxDepth)(request.maxDepth);
                        childId = (_a = spec.childId) !== null && _a !== void 0 ? _a : (0, dsh_session_1.SessionId)((0, node_crypto_1.randomUUID)());
                        this.assertChildIdAvailable(childId);
                        childDepth = (0, child_agent_ts_1.resolveChildDepth)(parent, request.maxDepth);
                        agentProvider = (_c = (_b = request.agentOptions) === null || _b === void 0 ? void 0 : _b.provider) !== null && _c !== void 0 ? _c : parent.options.provider;
                        agentModel = (_e = (_d = request.agentOptions) === null || _d === void 0 ? void 0 : _d.model) !== null && _e !== void 0 ? _e : parent.options.model;
                        descriptor = (0, descriptor_ts_1.snapshotSubagentDescriptor)(__assign(__assign(__assign(__assign({ mode: 'continuable', provider: spec.provider, label: spec.label }, agentProvider !== undefined ? { agentProvider: agentProvider } : {}), agentModel !== undefined ? { agentModel: agentModel } : {}), request.persona !== undefined ? { persona: request.persona } : {}), request.toolFilter !== undefined ? { toolFilter: request.toolFilter } : {}));
                        delegatedPolicies = (0, child_agent_ts_1.captureDelegatedPolicyOverrides)(parent);
                        return [4 /*yield*/, this.host.prepareContinuable(spec.provider, {
                                sessionId: childId,
                                parent: parent,
                                signal: spec.signal,
                            })];
                    case 1:
                        prepared = _h.sent();
                        spec.signal.throwIfAborted();
                        this.assertAdmitting(parent);
                        lineageSeedLength = (_g = (_f = prepared.seed) === null || _f === void 0 ? void 0 : _f.length) !== null && _g !== void 0 ? _g : 0;
                        seed = (0, descriptor_seed_ts_1.seedDescriptorTurn)(childId, prepared.seed, descriptor);
                        return [4 /*yield*/, this.locks.run(childId, function () { return __awaiter(_this, void 0, void 0, function () {
                                var persisted, activation;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            spec.signal.throwIfAborted();
                                            this.assertAdmitting(parent);
                                            this.assertChildIdAvailable(childId);
                                            if (!(spec.childId !== undefined)) return [3 /*break*/, 2];
                                            return [4 /*yield*/, persistence.listSnapshots(spec.signal)];
                                        case 1:
                                            persisted = _a.sent();
                                            spec.signal.throwIfAborted();
                                            this.assertAdmitting(parent);
                                            this.assertChildIdAvailable(childId);
                                            if (persisted.some(function (snapshot) { return snapshot.header.id === childId; })) {
                                                throw new error_ts_1.SubagentError("subagent \"".concat(childId, "\" already exists"), 'DUPLICATE_CHILD');
                                            }
                                            _a.label = 2;
                                        case 2: return [4 /*yield*/, this.materialize({
                                                childId: childId,
                                                provider: spec.provider,
                                                parent: parent,
                                                create: { seed: seed, meta: (0, child_agent_ts_1.childSessionMeta)(parent, childDepth, lineageSeedLength), delegatedPolicies: delegatedPolicies },
                                                agentOptions: (0, child_agent_ts_1.resolveChildAgentOptions)(parent, request.agentOptions, childDepth),
                                                composition: { persona: request.persona, toolFilter: request.toolFilter },
                                                signal: spec.signal,
                                            })];
                                        case 3:
                                            activation = _a.sent();
                                            return [2 /*return*/, this.submitMaterialized(activation, request.prompt, { kind: 'user' }, parent, spec.signal)];
                                    }
                                });
                            }); })];
                    case 2:
                        messageId = _h.sent();
                        return [2 /*return*/, { childId: childId, messageId: messageId }];
                }
            });
        });
    };
    /** Reject one child identity already owned by a live Agent or Session. */
    SubagentContinuationManager.prototype.assertChildIdAvailable = function (childId) {
        var _a;
        if (this.ctx.agents.get(childId) !== undefined || ((_a = this.ctx.get('sessions')) === null || _a === void 0 ? void 0 : _a.get(childId)) !== undefined) {
            throw new error_ts_1.SubagentError("subagent \"".concat(childId, "\" already exists"), 'DUPLICATE_CHILD');
        }
    };
    /**
     * Deliver one later message to a known continuable child as its next FIFO
     * turn. Routing depends only on Activation residency: a `running` Activation
     * enqueues, a `waiting` one wakes the same Agent, and an absent one
     * cold-resumes a new Activation from the persisted Session. The Agent inbox
     * is the only queue, so every accepted message has one observable order.
     *
     * The caller signal owns lookup, materialization, and admission only until
     * inbox acceptance; afterwards the accepted turn cannot be cancelled through
     * this service.
     * @param parent - the exact live direct parent authorizing this delivery.
     * @param childId - the durable child session id.
     * @param content - the user-role content to deliver.
     * @param options - the message source fields and caller cancellation.
     * @returns the accepted message's inbox id.
     * @throws when parent authority, availability, or admission rejects the delivery.
     */
    SubagentContinuationManager.prototype.followup = function (parent, childId, content, options) {
        return __awaiter(this, void 0, void 0, function () {
            var live;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.assertAdmitting(parent);
                        _a.label = 1;
                    case 1:
                        if (!true) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.locks.run(childId, function () { return __awaiter(_this, void 0, void 0, function () {
                                var activation;
                                return __generator(this, function (_a) {
                                    activation = this.activations.get(childId);
                                    if (activation === undefined)
                                        return [2 /*return*/, this.coldResume(parent, childId, content, options)
                                            // A delivery that arrives after the disposal transaction began must not
                                            // reach a handle being torn down; wait for release, then cold-resume.
                                            /* v8 ignore next 3 -- the send-versus-dispose cutoff: reaching this arm needs a
                                             * delivery to observe the transaction inside the same critical section that opened it,
                                             * which no test can schedule deterministically. The behavior is covered end-to-end by
                                             * "cold-resumes a delivery that lost the race with final disposal". */
                                        ];
                                    // A delivery that arrives after the disposal transaction began must not
                                    // reach a handle being torn down; wait for release, then cold-resume.
                                    /* v8 ignore next 3 -- the send-versus-dispose cutoff: reaching this arm needs a
                                     * delivery to observe the transaction inside the same critical section that opened it,
                                     * which no test can schedule deterministically. The behavior is covered end-to-end by
                                     * "cold-resumes a delivery that lost the race with final disposal". */
                                    if (activation.disposal !== undefined) {
                                        return [2 /*return*/, activation.disposal.then(function () { return undefined; }, function () { return undefined; })];
                                    }
                                    return [2 /*return*/, this.submitAdmitted(activation, content, options.source, parent, options.signal)];
                                });
                            }); })
                            /* v8 ignore start -- only the lost-cutoff arm above returns undefined, so only that
                             * race reaches the retry below, which then cold-resumes a new Activation. */
                        ];
                    case 2:
                        live = _a.sent();
                        /* v8 ignore start -- only the lost-cutoff arm above returns undefined, so only that
                         * race reaches the retry below, which then cold-resumes a new Activation. */
                        if (live !== undefined)
                            return [2 /*return*/, live];
                        this.assertAdmitting(parent);
                        options.signal.throwIfAborted();
                        return [3 /*break*/, 1];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Interrupt one live continuable child's current turn. Admission is
     * synchronous and the effect is asynchronous: this authorizes the caller,
     * requests `Agent.cancel(cause, { keepInbox: true })` on the target, and
     * returns without waiting for the target to observe the signal or reach
     * quiescence. The Activation, its handle, accepted unclaimed inbox work, and
     * already-published descendants are untouched; work already claimed into the
     * interrupted turn is not requeued. Once the interrupted driver is idle, a
     * waking send resumes the parked queue.
     *
     * An absent target is an accepted no-op, which uniformly covers natural
     * completion races, repeated requests, one-shot ids, and unknown ids without
     * consulting the durable catalog. A target whose disposal transaction is
     * already open is likewise an accepted no-op after authorization.
     * @param targetSessionId - the durable child session id to interrupt.
     * @param authority - the human parent address or exact live ancestor Agent.
     * @throws {SubagentError} `UNAUTHORIZED` when the presented authority does
     *   not own the live target: a stale or self-targeting ancestor caller, a
     *   parent address that is not the live target's durable direct parent, or
     *   an ancestor outside the target's recorded live lineage.
     */
    SubagentContinuationManager.prototype.interrupt = function (targetSessionId, authority) {
        if (authority.kind === 'ancestor') {
            var caller = authority.agent;
            // A stale caller is rejected even when the target is absent, so a
            // replaced same-id Agent can never probe this manager's state.
            if (this.ctx.agents.get(caller.id) !== caller) {
                throw new error_ts_1.SubagentError("interrupting \"".concat(targetSessionId, "\" requires the exact live ancestor agent"), 'UNAUTHORIZED');
            }
            if (caller.id === targetSessionId) {
                throw new error_ts_1.SubagentError("agent \"".concat(caller.id, "\" cannot interrupt itself"), 'UNAUTHORIZED');
            }
        }
        var activation = this.activations.get(targetSessionId);
        if (activation === undefined)
            return;
        if (authority.kind === 'user') {
            if (activation.handle.agent.session.header.parentSession !== authority.parentSessionId) {
                throw new error_ts_1.SubagentError("subagent \"".concat(targetSessionId, "\" belongs to another parent session"), 'UNAUTHORIZED');
            }
        }
        else if (!activation.ancestry.has(authority.agent)) {
            throw new error_ts_1.SubagentError("subagent \"".concat(targetSessionId, "\" is not a live descendant of agent \"").concat(authority.agent.id, "\""), 'UNAUTHORIZED');
        }
        // Disposal already stopped the target with a whole-Activation teardown;
        // a second cancel would be a redundant signal on a closing handle.
        if (activation.disposal !== undefined)
            return;
        activation.handle.agent.cancel(authority.kind === 'user' ? { kind: 'user' } : { kind: 'parent' }, { keepInbox: true });
    };
    /**
     * Deliver explicitly selected content from one resident continuable child to
     * its durable direct parent. Sender authorization, parent resolution, and
     * send acceptance share one no-await span. Reporting neither concludes the
     * child's turn nor changes its Activation lifetime.
     * @param child - exact live reporting child; this is the authority credential.
     * @param content - selected model-facing content.
     * @param options - scheduling policy and pre-acceptance cancellation.
     * @returns the stable identity of the message accepted by the parent.
     * @throws {SubagentError} when the sender is unauthorized, the parent is not
     *   live, or continuation admission is closing.
     */
    // oxlint-disable-next-line typescript/require-await -- keep rejection semantics without yielding during admission
    SubagentContinuationManager.prototype.reportFrom = function (child, content, options) {
        return __awaiter(this, void 0, void 0, function () {
            var activation, parent;
            return __generator(this, function (_a) {
                options.signal.throwIfAborted();
                this.assertAdmitting(child);
                activation = this.authorizeReporter(child);
                parent = this.resolveReportParent(child);
                return [2 /*return*/, this.deliverReport(activation, parent, content, options.delivery)];
            });
        });
    };
    /** Authorize only the exact Agent of one resident Activation. */
    SubagentContinuationManager.prototype.authorizeReporter = function (child) {
        var activation = this.activations.get(child.id);
        if (activation === undefined || activation.handle.agent !== child) {
            throw new error_ts_1.SubagentError("agent \"".concat(child.id, "\" is not a live continuable subagent and cannot report"), 'UNAUTHORIZED');
        }
        /* v8 ignore next 6 -- only a synchronous re-entrant disposer can open this
         * transaction between exact-agent authorization and this no-await cutoff. */
        if (activation.disposal !== undefined) {
            throw new error_ts_1.SubagentError("subagent \"".concat(child.id, "\" activation is being disposed; the report was not delivered"), 'ACTIVATION_CLOSING');
        }
        return activation;
    };
    /** Resolve the reporting child's live direct parent from durable lineage. */
    SubagentContinuationManager.prototype.resolveReportParent = function (child) {
        var parentId = child.session.header.parentSession;
        /* v8 ignore next -- every continuation-managed child has direct-parent metadata. */
        var parent = parentId === undefined ? undefined : this.ctx.agents.get(parentId);
        if (parent === undefined) {
            throw new error_ts_1.SubagentError('direct parent is not live; report was not delivered', 'PARENT_UNAVAILABLE');
        }
        return parent;
    };
    /** Deliver one framed report through the selected parent scheduling preset. */
    SubagentContinuationManager.prototype.deliverReport = function (activation, parent, content, delivery) {
        var _this = this;
        var message = (0, dsh_llm_1.createUserMessage)({
            content: __spreadArray([
                { type: 'text', text: "Background subagent ".concat(activation.childId, " reported:") }
            ], content, true),
            source: {
                kind: 'subagent-report',
                form: 'relay',
                senderSessionId: activation.childId,
            },
        });
        if (delivery === 'next-step') {
            this.sendWaking(parent, message, function () { _this.sendReport(parent, message, delivery); });
        }
        else {
            this.sendReport(parent, message, delivery);
        }
        return message.id;
    };
    /**
     * Perform one waking send to a parent, accounted against that parent's own
     * Activation when it has one. Registering the id before the send is what
     * keeps a continuation-managed parent from being judged quiescent in the
     * window between a waking send and the microtask that admits it.
     * @param parent - the exact live parent receiving the waking message.
     * @param message - the message whose id is accounted.
     * @param send - the synchronous waking send to perform.
     */
    SubagentContinuationManager.prototype.sendWaking = function (parent, message, send) {
        var parentActivation = this.activations.get(parent.id);
        if (parentActivation !== undefined && parentActivation.handle.agent === parent) {
            this.admitWaking(parentActivation, message.id, send);
        }
        else {
            send();
        }
    };
    /** Send one report while translating only the parent's own rejection. */
    SubagentContinuationManager.prototype.sendReport = function (parent, message, delivery) {
        try {
            if (delivery === 'next-step')
                parent.steer(message);
            else
                parent.inject(message);
        }
        catch (error) {
            throw new error_ts_1.SubagentError('direct parent is not live; report was not delivered', 'PARENT_UNAVAILABLE', { cause: error });
        }
    };
    /**
     * Close admission, await every already-admitted materialization through
     * publication or rollback, then dispose the stable live Activation forest
     * child-first. Sibling branches drain independently: one failure is recorded
     * but never prevents the remaining handles from being attempted, and the
     * aggregate rejects only after every branch settles.
     * @returns once materialization is quiescent and every live Activation released its handle.
     * @throws an aggregate error when any branch failed to release.
     */
    SubagentContinuationManager.prototype.drain = function () {
        return __awaiter(this, void 0, void 0, function () {
            var owned, _i, _a, activation, _b, _c, child, roots;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        // Close admission synchronously before the first await. Materializations
                        // already past that cutoff remain tracked until their handle is installed
                        // or rollback completes, producing a stable forest for the later snapshot.
                        this.draining = true;
                        return [4 /*yield*/, Promise.all(__spreadArray([], this.materializations, true).map(function (materialization) { return materialization.settled; }))
                            // Snapshot roots after closing admission: a root is an Activation no live
                            // Activation owns, so disposing roots recurses child-first into the forest.
                        ];
                    case 1:
                        _d.sent();
                        owned = new Set();
                        for (_i = 0, _a = this.activations.values(); _i < _a.length; _i++) {
                            activation = _a[_i];
                            for (_b = 0, _c = activation.ownedChildren; _b < _c.length; _b++) {
                                child = _c[_b];
                                owned.add(child);
                            }
                        }
                        roots = __spreadArray([], this.activations.values(), true).filter(function (activation) { return !owned.has(activation.childId); });
                        return [4 /*yield*/, this.disposeRoots(roots, 'activation(s)')];
                    case 2:
                        _d.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Stop only the continuable descendants of exact live host-owned parents.
     * Admission stays closed for those parent trees until each exact parent
     * leaves the Agent registry; unrelated trees and manager-wide admission stay
     * live.
     * @param parents - exact live roots whose continuable descendants must stop.
     * @returns once every retained descendant Activation released its handle.
     * @throws an aggregate error after all scoped branches settle when any failed.
     */
    SubagentContinuationManager.prototype.drainDescendants = function (parents) {
        return __awaiter(this, void 0, void 0, function () {
            var roots, _i, roots_1, root, targets, _loop_1, this_1, _a, _b, activation, materializations, ownedTargets, _c, targets_1, activation, _d, _e, child, targetRoots, _f, targets_2, activation, disposal;
            var _this = this;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        roots = new Set(parents.filter(function (parent) { return _this.ctx.agents.get(parent.id) === parent; }));
                        if (roots.size === 0)
                            return [2 /*return*/];
                        // Publish the scoped admission cutoff before the first await. Merge with an
                        // earlier call for the same exact root so a converging drain cannot forget
                        // descendants whose release is already in flight.
                        for (_i = 0, roots_1 = roots; _i < roots_1.length; _i++) {
                            root = roots_1[_i];
                            this.closingMembers(root).add(root);
                        }
                        targets = [];
                        _loop_1 = function (activation) {
                            var lineage = this_1.liveLineage(activation.handle.agent);
                            // Strict descendants only: a continuable Agent may itself be a
                            // host-owned root, and its host remains responsible for that root handle.
                            var owners = __spreadArray([], roots, true).filter(function (root) { return activation.handle.agent !== root
                                && activation.ancestry.has(root); });
                            if (owners.length === 0)
                                return "continue";
                            targets.push(activation);
                            for (var _h = 0, owners_1 = owners; _h < owners_1.length; _h++) {
                                var owner = owners_1[_h];
                                var members = this_1.closingMembers(owner);
                                members.add(activation.handle.agent);
                                for (var _j = 0, lineage_1 = lineage; _j < lineage_1.length; _j++) {
                                    var agent = lineage_1[_j];
                                    members.add(agent);
                                }
                            }
                        };
                        this_1 = this;
                        for (_a = 0, _b = this.activations.values(); _a < _b.length; _a++) {
                            activation = _b[_a];
                            _loop_1(activation);
                        }
                        materializations = __spreadArray([], this.materializations, true).filter(function (materialization) {
                            var owners = __spreadArray([], roots, true).filter(function (root) { return materialization.lineage.includes(root); });
                            for (var _i = 0, owners_2 = owners; _i < owners_2.length; _i++) {
                                var owner = owners_2[_i];
                                var members = _this.closingMembers(owner);
                                for (var _a = 0, _b = materialization.lineage; _a < _b.length; _a++) {
                                    var agent = _b[_a];
                                    members.add(agent);
                                }
                            }
                            return owners.length > 0;
                        });
                        ownedTargets = new Set();
                        for (_c = 0, targets_1 = targets; _c < targets_1.length; _c++) {
                            activation = targets_1[_c];
                            for (_d = 0, _e = activation.ownedChildren; _d < _e.length; _d++) {
                                child = _e[_d];
                                ownedTargets.add(child);
                            }
                        }
                        targetRoots = targets.filter(function (activation) { return !ownedTargets.has(activation.childId); });
                        // Open every selected transaction before the materialization barrier.
                        // Disposal propagates cancellation top-down in the same synchronous span;
                        // handle release remains child-first.
                        for (_f = 0, targets_2 = targets; _f < targets_2.length; _f++) {
                            activation = targets_2[_f];
                            disposal = this.dispose(activation);
                            void disposal.catch(function () { return undefined; });
                        }
                        return [4 /*yield*/, Promise.all(materializations.map(function (materialization) { return materialization.settled; }))];
                    case 1:
                        _g.sent();
                        return [4 /*yield*/, this.disposeRoots(targetRoots, 'scoped activation(s)')];
                    case 2:
                        _g.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Release selected resident direct children of one exact live parent without
     * closing admission for the parent's other continuable children. Owned
     * descendants are released recursively through the same lifecycle.
     * @param parent - exact live direct parent authorizing the selected release.
     * @param childIds - durable direct-child ids to release when resident.
     * @returns once every selected Activation released its handle.
     * @throws {SubagentError} `UNAUTHORIZED` when a resident target is not the
     *   parent's direct continuable child or the parent identity is stale.
     */
    SubagentContinuationManager.prototype.drainChildren = function (parent, childIds) {
        return __awaiter(this, void 0, void 0, function () {
            var targets, _i, _a, childId, activation, _b, targets_3, activation, disposal;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (this.ctx.agents.get(parent.id) !== parent) {
                            throw new error_ts_1.SubagentError('selected child teardown requires the exact live parent agent', 'UNAUTHORIZED');
                        }
                        targets = [];
                        for (_i = 0, _a = new Set(childIds); _i < _a.length; _i++) {
                            childId = _a[_i];
                            activation = this.activations.get(childId);
                            if (activation === undefined)
                                continue;
                            if (activation.parentSession !== parent.id || !activation.ancestry.has(parent)) {
                                throw new error_ts_1.SubagentError("subagent \"".concat(childId, "\" is not a direct child of agent \"").concat(parent.id, "\""), 'UNAUTHORIZED');
                            }
                            targets.push(activation);
                        }
                        // Open every transaction before the first await so cancellation propagates
                        // across the selected roots in one synchronous span.
                        for (_b = 0, targets_3 = targets; _b < targets_3.length; _b++) {
                            activation = targets_3[_b];
                            disposal = this.dispose(activation);
                            void disposal.catch(function () { return undefined; });
                        }
                        return [4 /*yield*/, this.disposeRoots(targets, 'selected activation(s)')];
                    case 1:
                        _c.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Dispose independent roots and report every branch failure after all settle. */
    SubagentContinuationManager.prototype.disposeRoots = function (roots, failureSubject) {
        return __awaiter(this, void 0, void 0, function () {
            var failures, reasons;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.all(roots.map(function (activation) { return __awaiter(_this, void 0, void 0, function () {
                            var error_1;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _a.trys.push([0, 2, , 3]);
                                        return [4 /*yield*/, this.dispose(activation)];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/, undefined];
                                    case 2:
                                        error_1 = _a.sent();
                                        return [2 /*return*/, error_1];
                                    case 3: return [2 /*return*/];
                                }
                            });
                        }); }))];
                    case 1:
                        failures = _a.sent();
                        reasons = failures.filter(function (failure) { return failure !== undefined; });
                        if (reasons.length > 0) {
                            throw new error_ts_1.SubagentError("continuable subagent teardown failed for ".concat(reasons.length, " ").concat(failureSubject, ": ")
                                + reasons.map(function (reason) { return (0, dsh_llm_1.errorChain)(reason); }).join('; '), 'ACTIVATION_TEARDOWN_FAILED');
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Return the retained member set for one exact scoped-teardown root. */
    SubagentContinuationManager.prototype.closingMembers = function (root) {
        var existing = this.closingScopes.get(root);
        if (existing !== undefined)
            return existing;
        var members = new Set();
        this.closingScopes.set(root, members);
        return members;
    };
    /**
     * Return the exact currently resolvable ancestry from `agent` upward. The
     * first element is always the supplied identity, even when it is already
     * stale; each ancestor after it must be the registry's current exact entry.
     */
    SubagentContinuationManager.prototype.liveLineage = function (agent) {
        var lineage = [agent];
        var seen = new Set([agent.id]);
        var parentSession = agent.session.header.parentSession;
        while (parentSession !== undefined) {
            var parent_1 = this.ctx.agents.get(parentSession);
            if (parent_1 === undefined || seen.has(parent_1.id))
                break;
            lineage.push(parent_1);
            seen.add(parent_1.id);
            parentSession = parent_1.session.header.parentSession;
        }
        return lineage;
    };
    /**
     * The teardown that closed continuable admission for this agent's lineage.
     * `'manager'` is the whole manager draining; an Agent is the exact scoped root
     * whose forest is closing.
     * @param agent - the agent whose lineage is tested.
     * @returns the closing teardown, or `undefined` while admission is open.
     */
    SubagentContinuationManager.prototype.closingTeardownFor = function (agent) {
        if (this.draining)
            return 'manager';
        var lineage = this.liveLineage(agent);
        for (var _i = 0, _a = this.closingScopes; _i < _a.length; _i++) {
            var _b = _a[_i], root = _b[0], members = _b[1];
            if (members.has(agent) || lineage.includes(root))
                return root;
        }
        return undefined;
    };
    /** Reject new admission once the manager or this exact parent tree began draining. */
    SubagentContinuationManager.prototype.assertAdmitting = function (agent) {
        var closing = this.closingTeardownFor(agent);
        if (closing === undefined)
            return;
        throw new error_ts_1.SubagentError(closing === 'manager'
            ? 'continuable subagents are draining; the operation was not admitted'
            : "continuable subagents below parent \"".concat(closing.id, "\" are draining; the operation was not admitted"), 'DRAINING');
    };
    /**
     * Derive residency from Agent quiescence and the owned-child set. `running`
     * covers an active admission, an open turn, or accepted waking inbox work.
     *
     * `Agent.status` alone is insufficient: it stays `idle` between an accepted
     * waking send and the microtask that admits it, so a synchronous inbox
     * observer would see `settled` while a turn is already queued. `accepted`
     * holds the ids this manager admitted but has not yet seen drained.
     */
    SubagentContinuationManager.prototype.stateOf = function (activation) {
        if (activation.handle.agent.status === 'running' || activation.accepted.size > 0)
            return 'running';
        if (activation.ownedChildren.size > 0)
            return 'waiting';
        return 'settled';
    };
    /**
     * Cold-resume a persisted child: inspect and authorize its Session, fold the
     * generic descriptor, create the Activation through `ctx.agents.resume()`,
     * and submit the waiting turn. This never dispatches through a subagent
     * provider — the persisted Session already holds the initial prefix and the
     * descriptor is the whole reconstruction input.
     */
    SubagentContinuationManager.prototype.coldResume = function (parent, childId, content, options) {
        return __awaiter(this, void 0, void 0, function () {
            var persistence, loaded, error_2, descriptor, activation, error_3;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        persistence = this.requirePersistence();
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, persistence.inspect(childId, options.signal)];
                    case 2:
                        loaded = _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _b.sent();
                        options.signal.throwIfAborted();
                        throw new error_ts_1.SubagentError("subagent \"".concat(childId, "\" is unavailable"), 'NOT_RESUMABLE', { cause: error_2 });
                    case 4:
                        options.signal.throwIfAborted();
                        this.assertAdmitting(parent);
                        // Authorize the persisted header before folding: only the durable child's
                        // exact live direct parent may continue it.
                        this.authorizeLineage(parent, childId, loaded.meta.parentSession);
                        descriptor = (0, descriptor_ts_1.foldSubagentDescriptor)(loaded.events.slice((_a = loaded.meta.seedLength) !== null && _a !== void 0 ? _a : 0));
                        if (descriptor === undefined || descriptor.mode !== 'continuable') {
                            throw new error_ts_1.SubagentError("subagent \"".concat(childId, "\" has no supported continuation state and cannot be resumed; ")
                                + 'do not retry send_message with this id', 'NOT_RESUMABLE');
                        }
                        _b.label = 5;
                    case 5:
                        _b.trys.push([5, 7, , 8]);
                        return [4 /*yield*/, this.materialize({
                                childId: childId,
                                provider: descriptor.provider,
                                parent: parent,
                                agentOptions: __assign(__assign({}, descriptor.agentProvider !== undefined ? { provider: descriptor.agentProvider } : {}), descriptor.agentModel !== undefined ? { model: descriptor.agentModel } : {}),
                                composition: { persona: descriptor.persona, toolFilter: descriptor.toolFilter },
                                signal: options.signal,
                            })];
                    case 6:
                        activation = _b.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        error_3 = _b.sent();
                        options.signal.throwIfAborted();
                        if (error_3 instanceof error_ts_1.SubagentError)
                            throw error_3;
                        throw new error_ts_1.SubagentError("subagent \"".concat(childId, "\" is unavailable"), 'NOT_RESUMABLE', { cause: error_3 });
                    case 8: return [2 /*return*/, this.submitMaterialized(activation, content, options.source, parent, options.signal)];
                }
            });
        });
    };
    /**
     * Submit to a freshly materialized Activation or roll it back completely.
     * @param activation - the just-published Activation to admit or release.
     * @param content - the initial or resumed message content.
     * @param source - durable fields naming who supplied the accepted message.
     * @param parent - the live direct parent authorizing admission.
     * @param signal - caller cancellation owning admission until acceptance.
     * @returns the accepted inbox message id.
     */
    SubagentContinuationManager.prototype.submitMaterialized = function (activation, content, source, parent, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 1, , 3]);
                        return [2 /*return*/, this.submitAdmitted(activation, content, source, parent, signal)];
                    case 1:
                        error_4 = _a.sent();
                        /* v8 ignore next -- rollback disposal failures must not mask the
                         * pre-acceptance signal, drain, or lifecycle failure. */
                        return [4 /*yield*/, this.dispose(activation).catch(function () { return undefined; })];
                    case 2:
                        /* v8 ignore next -- rollback disposal failures must not mask the
                         * pre-acceptance signal, drain, or lifecycle failure. */
                        _a.sent();
                        throw error_4;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Create or resume the child Agent through the private activation-owner
     * scope, install the handle in a fresh Activation, and register ownership on
     * a continuation-managed parent. Rejection leaves no Activation, no handle,
     * and no ownership membership.
     */
    SubagentContinuationManager.prototype.materialize = function (inputs) {
        var _this = this;
        this.assertAdmitting(inputs.parent);
        var settled = Promise.withResolvers();
        var lineage = this.liveLineage(inputs.parent);
        var materialization = {
            lineage: lineage,
            settled: settled.promise,
        };
        this.materializations.add(materialization);
        return this.materializeTracked(inputs, lineage).finally(function () {
            _this.materializations.delete(materialization);
            settled.resolve();
        });
    };
    /**
     * Perform one tracked materialization. The caller keeps the drain barrier
     * registered until this either returns a resident Activation or finishes
     * rollback.
     */
    SubagentContinuationManager.prototype.materializeTracked = function (inputs, parentLineage) {
        return __awaiter(this, void 0, void 0, function () {
            var childId, provider, parent, create, setup, observer, handle, _a, activation, error_5;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        childId = inputs.childId, provider = inputs.provider, parent = inputs.parent, create = inputs.create;
                        // No id pre-check here: the child lock serializes each durable child, both
                        // callers reach this only after confirming no Activation exists, and
                        // `AgentRegistry.enter()` is the authoritative collision boundary for an id
                        // some other owner holds — a duplicate would reject there with rollback.
                        inputs.signal.throwIfAborted();
                        setup = function (childCtx) {
                            // Only fresh creation seeds the delegation policy onto the child's own
                            // log (after any fork seed, so fresh policy wins stale seed state); a
                            // cold resume replays those persisted events instead.
                            if (create !== undefined) {
                                (0, child_agent_ts_1.appendDelegatedPolicyOverrides)(childCtx.agent.session, create.delegatedPolicies);
                            }
                            (0, child_agent_ts_1.applyChildComposition)(childCtx, parent, inputs.composition);
                            return _this.setupRegistry.apply(childCtx);
                        };
                        observer = this.host.observeActivation(provider, childId, parent);
                        if (!(create === undefined)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.ownerCtx.agents.resume({
                                resumeSessionId: childId,
                                agentOptions: inputs.agentOptions,
                                signal: inputs.signal,
                                setup: setup,
                            })];
                    case 1:
                        _a = _b.sent();
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, this.ownerCtx.agents.create({
                            sessionId: childId,
                            meta: create.meta,
                            seed: create.seed,
                            agentOptions: inputs.agentOptions,
                            signal: inputs.signal,
                            setup: setup,
                        })];
                    case 3:
                        _a = _b.sent();
                        _b.label = 4;
                    case 4:
                        handle = _a;
                        activation = {
                            childId: childId,
                            // The durable lineage, not merely the caller: creation stamps this same
                            // agent into the child's header, and cold resume authorized it against
                            // the persisted header before materializing.
                            parentSession: parent.id,
                            provider: provider,
                            handle: handle,
                            ancestry: new WeakSet(__spreadArray([handle.agent], parentLineage, true)),
                            ownedChildren: new Set(),
                            observer: observer,
                            disposal: undefined,
                            accepted: new Set(),
                            announced: false,
                            poke: Promise.withResolvers(),
                        };
                        // After transfer, any failure must dispose the created handle, remove the
                        // Activation, and roll back parent ownership before rejecting.
                        this.activations.set(childId, activation);
                        _b.label = 5;
                    case 5:
                        _b.trys.push([5, 6, , 8]);
                        inputs.signal.throwIfAborted();
                        this.assertAdmitting(parent);
                        this.acquireOwnership(parent, childId);
                        // Every accepted id leaves the inbox exactly once, through dequeue or
                        // discard. Clearing it there is what lets `stateOf()` distinguish a truly
                        // quiet Agent from one whose accepted turn has not been admitted yet.
                        // Registered through the child's own scoped context, so scope filtering
                        // already restricts both listeners to this exact agent.
                        handle.agent.ctx.on('agent/inbox/claimed', function (_a) {
                            var message = _a.message;
                            /* v8 ignore next -- a claim of an id this manager never admitted needs
                             * another sender on the same child, which no current path allows. */
                            if (activation.accepted.delete(message.id))
                                _this.wake(activation);
                        });
                        handle.agent.ctx.on('agent/inbox/discarded', function (_a) {
                            var message = _a.message;
                            if (activation.accepted.delete(message.id))
                                _this.wake(activation);
                        });
                        // Agent creation committed setup at its publication boundary;
                        // revocations from here on are immediate live revocation.
                        // Publish the start edge before any turn can run, so observers see this
                        // epoch before its first request.
                        observer.start(handle.agent);
                        return [3 /*break*/, 8];
                    case 6:
                        error_5 = _b.sent();
                        // Listener exceptions are contained by the lifecycle emitter; a start
                        // publication throw therefore leaves no residency edge to pair.
                        /* v8 ignore next -- rollback failure must not mask the admission failure
                         * that prevented this operation from returning an accepted message id. */
                        return [4 /*yield*/, this.rollbackUnpublished(activation).catch(function () { return undefined; })];
                    case 7:
                        // Listener exceptions are contained by the lifecycle emitter; a start
                        // publication throw therefore leaves no residency edge to pair.
                        /* v8 ignore next -- rollback failure must not mask the admission failure
                         * that prevented this operation from returning an accepted message id. */
                        _b.sent();
                        throw error_5;
                    case 8:
                        this.watchSettlement(activation);
                        return [2 /*return*/, activation];
                }
            });
        });
    };
    /**
     * Release an Activation whose start edge was not published. The memoized
     * transaction remains in the live map until handle disposal settles, so a
     * concurrent drain or delivery observes the same closing boundary.
     */
    SubagentContinuationManager.prototype.rollbackUnpublished = function (activation) {
        var _this = this;
        var _a;
        return ((_a = activation.disposal) !== null && _a !== void 0 ? _a : (activation.disposal = (function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, , 2, 3]);
                        return [4 /*yield*/, activation.handle.dispose()];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        this.activations.delete(activation.childId);
                        this.releaseOwnership(activation.childId);
                        return [7 /*endfinally*/];
                    case 3: return [2 /*return*/];
                }
            });
        }); })()));
    };
    /**
     * Register the child in a continuation-managed parent's owned set before the
     * child can run, so that parent cannot settle while the child is live. A
     * top-level or other non-continuation Agent has no Activation and stays
     * outside the waiting graph.
     */
    SubagentContinuationManager.prototype.acquireOwnership = function (parent, childId) {
        var parentActivation = this.activations.get(parent.id);
        if (parentActivation === undefined)
            return;
        if (parentActivation.disposal !== undefined) {
            throw new error_ts_1.SubagentError("subagent parent \"".concat(parent.id, "\" is being disposed; the child was not established"), 'ACTIVATION_CLOSING');
        }
        parentActivation.ownedChildren.add(childId);
    };
    /** Remove one child from its live owner's set and let that owner re-check settlement. */
    SubagentContinuationManager.prototype.releaseOwnership = function (childId) {
        for (var _i = 0, _a = this.activations.values(); _i < _a.length; _i++) {
            var candidate = _a[_i];
            if (candidate.ownedChildren.delete(childId))
                this.wake(candidate);
        }
    };
    /** Let a settlement watcher re-observe quiescence after ownership or inbox changes. */
    SubagentContinuationManager.prototype.wake = function (activation) {
        activation.poke.resolve();
        activation.poke = Promise.withResolvers();
    };
    /**
     * Submit one message as the child's next FIFO turn and return its accepted
     * inbox id. Acceptance is the operation's success boundary; the manager owns
     * the Activation independently afterwards.
     */
    SubagentContinuationManager.prototype.submit = function (activation, content, source, parent) {
        // Parent-originated delivery keeps the parent live through ownership, so
        // establish it before the message can enter the child's inbox.
        this.acquireOwnership(parent, activation.childId);
        var message = (0, dsh_llm_1.createUserMessage)({ content: content, source: source });
        var accepted = this.admitWaking(activation, message.id, function () {
            activation.handle.agent.followup(message);
        });
        // Past this point the caller has an id for this child, so its eventual
        // settlement is something the parent is owed an account of.
        activation.announced = true;
        return accepted;
    };
    /**
     * Account one waking send across a resident Activation's settlement window.
     * @param activation - Activation receiving waking inbox work.
     * @param messageId - stable identity of the message about to be sent.
     * @param send - synchronous send that publishes one enqueue occurrence.
     * @returns the accepted message id.
     */
    SubagentContinuationManager.prototype.admitWaking = function (activation, messageId, send) {
        // Waking Agent sends publish inbox events synchronously, so observers must
        // see this Activation as busy before the call begins.
        activation.accepted.add(messageId);
        try {
            send();
        }
        catch (error) {
            activation.accepted.delete(messageId);
            throw error;
        }
        // Accepted waking work keeps this Activation live until whenIdle() observes
        // the complete waking suffix.
        this.wake(activation);
        return messageId;
    };
    /**
     * Cross the final admission cutoff and submit without yielding. Signal abort,
     * manager drain, or Activation disposal that wins before this synchronous
     * span rejects without inbox acceptance.
     */
    SubagentContinuationManager.prototype.submitAdmitted = function (activation, content, source, parent, signal) {
        signal.throwIfAborted();
        this.assertAdmitting(parent);
        /* v8 ignore next 6 -- only a synchronous re-entrant disposer can change
         * this field between the caller's live check and this no-await boundary. */
        if (disposalOf(activation) !== undefined) {
            throw new error_ts_1.SubagentError("subagent \"".concat(activation.childId, "\" activation is being disposed; the message was not accepted"), 'ACTIVATION_CLOSING');
        }
        this.authorizeLineage(parent, activation.childId, activation.handle.agent.session.header.parentSession);
        return this.submit(activation, content, source, parent);
    };
    /**
     * Authorize one operation against the durable direct-parent lineage. Other
     * agents, ancestors, teams, workflows, and hosts remain rejected until an
     * explicit authority protocol has a production consumer.
     */
    SubagentContinuationManager.prototype.authorizeLineage = function (parent, childId, parentSession) {
        if (this.ctx.agents.get(parent.id) !== parent) {
            throw new error_ts_1.SubagentError("subagent \"".concat(childId, "\" delivery requires the exact live parent agent"), 'UNAUTHORIZED');
        }
        if (parentSession !== parent.id) {
            throw new error_ts_1.SubagentError("subagent \"".concat(childId, "\" belongs to another parent session"), 'UNAUTHORIZED');
        }
    };
    /**
     * Follow one Activation to settlement: wait for Agent quiescence, then for
     * every owned child to complete disposal, and dispose the handle once both
     * hold. A `next-turn` delivered while `waiting` wakes the same Agent and
     * returns it to `running`, so this re-observes rather than settling early.
     */
    SubagentContinuationManager.prototype.watchSettlement = function (activation) {
        var _this = this;
        void (function () { return __awaiter(_this, void 0, void 0, function () {
            var poked, settling, error_6;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(disposalOf(activation) === undefined)) return [3 /*break*/, 9];
                        poked = activation.poke.promise;
                        return [4 /*yield*/, Promise.race([activation.handle.agent.whenIdle(), poked])];
                    case 1:
                        _a.sent();
                        if (disposalOf(activation) !== undefined)
                            return [2 /*return*/];
                        return [4 /*yield*/, this.locks.run(activation.childId, function () {
                                if (disposalOf(activation) !== undefined || _this.stateOf(activation) !== 'settled') {
                                    return Promise.resolve({ settling: false });
                                }
                                // `dispose()` assigns its memoized transaction synchronously, so
                                // admission is closed before this critical section releases.
                                return Promise.resolve({ settling: true, done: _this.dispose(activation) });
                            })];
                    case 2:
                        settling = _a.sent();
                        if (!!settling.settling) return [3 /*break*/, 5];
                        if (!(activation.handle.agent.status !== 'running')) return [3 /*break*/, 4];
                        return [4 /*yield*/, poked];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4: return [3 /*break*/, 0];
                    case 5:
                        _a.trys.push([5, 7, , 8]);
                        return [4 /*yield*/, settling.done];
                    case 6:
                        _a.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        error_6 = _a.sent();
                        this.ctx.logger.warn("subagent \"".concat(activation.childId, "\" activation teardown failed: ").concat((0, dsh_llm_1.errorChain)(error_6)));
                        return [3 /*break*/, 8];
                    case 8: return [2 /*return*/];
                    case 9: return [2 /*return*/];
                }
            });
        }); })();
    };
    /**
     * Stop one Activation immediately, then release it child-first. The memoized
     * transaction is installed before cancellation or recursive callbacks, so
     * admission and reentrant teardown converge on the same owner.
     *
     * The final session flush is best effort and never prevents handle disposal
     * or ownership release, because retaining a child would permanently pin its
     * ancestors in `waiting`.
     * @param activation - the residency epoch to stop and release.
     * @returns the one disposal transaction owned by this Activation.
     */
    SubagentContinuationManager.prototype.dispose = function (activation) {
        var existing = activation.disposal;
        if (existing !== undefined)
            return existing;
        var completion = Promise.withResolvers();
        // Presence is the admission cutoff. Assign it before the async helper starts
        // because that helper cancels Agents and may synchronously re-enter callers.
        activation.disposal = completion.promise;
        void this.finishDisposal(activation).then(completion.resolve, completion.reject);
        return completion.promise;
    };
    /**
     * Propagate stop synchronously, then finish the child-first release.
     * @param activation - the Activation whose disposal transaction is installed.
     * @returns once the handle and ownership edge are released.
     */
    SubagentContinuationManager.prototype.finishDisposal = function (activation) {
        return __awaiter(this, void 0, void 0, function () {
            var childId, idle, children, childDisposals, failures, childFailures, reasons, error_7, error_8, failure;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.wake(activation);
                        childId = activation.childId;
                        // Stop top-down before the first await. Slow descendant cleanup may delay
                        // release, but it cannot let this ancestor continue model or tool work.
                        activation.handle.agent.cancel({ kind: 'parent' });
                        idle = activation.handle.agent.whenIdle();
                        children = __spreadArray([], activation.ownedChildren, true).map(function (child) { return _this.activations.get(child); })
                            .filter(function (child) { return child !== undefined; });
                        childDisposals = children.map(function (child) { return _this.dispose(child); });
                        failures = [];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, Promise.all(childDisposals.map(function (disposal) { return __awaiter(_this, void 0, void 0, function () {
                                var error_9;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            _a.trys.push([0, 2, , 3]);
                                            return [4 /*yield*/, disposal];
                                        case 1:
                                            _a.sent();
                                            return [2 /*return*/, undefined];
                                        case 2:
                                            error_9 = _a.sent();
                                            return [2 /*return*/, error_9];
                                        case 3: return [2 /*return*/];
                                    }
                                });
                            }); }))];
                    case 2:
                        childFailures = _a.sent();
                        reasons = childFailures.filter(function (reason) { return reason !== undefined; });
                        if (reasons.length > 0) {
                            failures.push(new error_ts_1.SubagentError("subagent \"".concat(childId, "\" child teardown failed: ").concat(reasons.map(function (reason) { return (0, dsh_llm_1.errorChain)(reason); }).join('; ')), 'ACTIVATION_TEARDOWN_FAILED'));
                        }
                        // Quiesce before the flush: a turn still running would keep
                        // appending events the flush cannot cover.
                        return [4 /*yield*/, idle];
                    case 3:
                        // Quiesce before the flush: a turn still running would keep
                        // appending events the flush cannot cover.
                        _a.sent();
                        return [4 /*yield*/, this.flushFinalState(activation)
                            // Capture the child-dependent edge data while the child is still live:
                            // handle disposal unregisters it, and consumers read its log and scope.
                        ];
                    case 4:
                        _a.sent();
                        // Capture the child-dependent edge data while the child is still live:
                        // handle disposal unregisters it, and consumers read its log and scope.
                        activation.observer.capture(activation.handle.agent);
                        return [3 /*break*/, 6];
                    case 5:
                        error_7 = _a.sent();
                        failures.push(new error_ts_1.SubagentError("subagent \"".concat(childId, "\" activation teardown failed: ").concat((0, dsh_llm_1.errorChain)(error_7)), 'ACTIVATION_TEARDOWN_FAILED', { cause: error_7 }));
                        return [3 /*break*/, 6];
                    case 6:
                        _a.trys.push([6, 8, , 9]);
                        return [4 /*yield*/, activation.handle.dispose()];
                    case 7:
                        _a.sent();
                        return [3 /*break*/, 9];
                    case 8:
                        error_8 = _a.sent();
                        failures.push(new error_ts_1.SubagentError("subagent \"".concat(childId, "\" activation handle disposal failed: ").concat((0, dsh_llm_1.errorChain)(error_8)), 'ACTIVATION_TEARDOWN_FAILED', { cause: error_8 }));
                        return [3 /*break*/, 9];
                    case 9:
                        if (failures.length === 1) {
                            failure = failures[0];
                        }
                        else if (failures.length > 1) {
                            failure = new error_ts_1.SubagentError("subagent \"".concat(childId, "\" activation teardown failed at ").concat(failures.length, " boundaries: ")
                                + failures.map(function (item) { return (0, dsh_llm_1.errorChain)(item); }).join('; '), 'ACTIVATION_TEARDOWN_FAILED', { cause: new AggregateError(failures) });
                        }
                        // Only now is the Activation gone: keeping the entry until disposal settles
                        // makes a racing delivery wait for release rather than cold-resume into the
                        // still-registered agent.
                        this.activations.delete(childId);
                        // BEFORE releasing ownership, while the parent still counts this child and
                        // therefore cannot be judged settled. Delivering after the release would
                        // race a parent watcher that resumes one microtask later, finds itself
                        // childless and quiet, and disposes an Agent whose `cancel()` clears the
                        // inbox this notice is sitting in.
                        this.notifySettlement(activation, activation.observer.terminal(failure));
                        // Release ownership even on failure: a retained failed child would pin its
                        // ancestors in `waiting` forever.
                        this.releaseOwnership(childId);
                        // Emit once the disposal outcome is known, so a rejecting scoped cleanup
                        // cannot be reported as a successful epoch.
                        activation.observer.settle(failure);
                        if (failure !== undefined)
                            throw failure;
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Tell the durable direct parent that this child produced everything it is
     * going to. Unconditional for every child the caller received an id for: it
     * does not consider whether the child reported, because the cases that most
     * need it — a token ceiling, a model failure, cancellation, teardown — are
     * exactly the ones where the child never got to choose. A materialization
     * rolled back before its first acceptance stays silent, since the caller was
     * told that child was not established. A parent that is no longer live is not
     * an error; the child's own Session remains the durable record either way.
     * A parent whose own lineage is already closing receives the notice without a
     * wake, because teardown is not a reason to start a turn.
     *
     * Never blocks disposal. A delivery failure is logged and dropped, because
     * retaining a child to retry a notice would pin its whole ancestry in
     * `waiting` forever.
     * @param activation - the settling Activation, still owned by its parent.
     * @param terminal - how this epoch ended, as the terminal edge will report it.
     */
    SubagentContinuationManager.prototype.notifySettlement = function (activation, terminal) {
        if (!activation.announced)
            return;
        try {
            var parent_2 = this.ctx.agents.get(activation.parentSession);
            if (parent_2 === undefined)
                return;
            var summary = settlementSummary(activation.childId, terminal.stopReason);
            var message_1 = (0, dsh_llm_1.createUserMessage)({
                content: __spreadArray([
                    { type: 'text', text: summary }
                ], terminal.output === undefined
                    ? [{ type: 'text', text: 'It left no closing message.' }]
                    : __spreadArray([{ type: 'text', text: 'Its closing message:' }], terminal.output, true), true),
                source: {
                    kind: 'subagent-settled',
                    form: 'notice',
                    summary: (0, dsh_llm_1.boundContextSummary)(summary),
                    senderSessionId: activation.childId,
                },
            });
            // A parent whose own teardown already began must not be woken. Waking is
            // not a queue operation: `followup()` on a quiescent Agent starts a turn,
            // and `cancel()` does not arm against a later one, so a notice arriving
            // during teardown would spend a model request on an Agent its host is
            // about to dispose — once per tree layer, since each layer's own notice
            // then wakes the layer above it. Injecting delivers to a parent still
            // reading its inbox and records the account in the log either way; it
            // does NOT survive that parent's own disposal, whose `keepInbox: false`
            // cancel durably clears whatever it never claimed.
            if (this.closingTeardownFor(parent_2) !== undefined) {
                parent_2.inject(message_1);
                return;
            }
            // An idle parent has nothing else to look at, so it gets one ordinary
            // turn. A busy parent is steered instead of woken: `Inbox.claim()` takes
            // the whole next-step batch at one boundary, so several children settling
            // together cost one step rather than one turn each. Steering rather than
            // injecting closes the window where a driver retires between this status
            // read and the send, which would strand the notice unclaimed.
            this.sendWaking(parent_2, message_1, function () {
                if (parent_2.status === 'idle')
                    parent_2.followup(message_1);
                else
                    parent_2.steer(message_1);
            });
        }
        catch (error) {
            this.ctx.logger.warn("subagent \"".concat(activation.childId, "\" settlement notice was not delivered to its parent: ")
                + (0, dsh_llm_1.errorChain)(error));
        }
    };
    /**
     * Request a best-effort final session flush after the child is quiescent.
     * Listener failure is logged because flush participation cannot identify a
     * particular persistence backend, and teardown must still release ownership.
     * @param activation - the Activation whose final events should be flushed.
     */
    SubagentContinuationManager.prototype.flushFinalState = function (activation) {
        return __awaiter(this, void 0, void 0, function () {
            var child, error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        child = activation.handle.agent;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, child.ctx.sessions.flush(child.session)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_10 = _a.sent();
                        this.ctx.logger.warn("subagent \"".concat(activation.childId, "\" best-effort final session flush failed; ")
                            + "the persisted state may be unavailable or stale on resume: ".concat((0, dsh_llm_1.errorChain)(error_10)));
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /** Resolve the persistence service continuable children require, or fail loud. */
    SubagentContinuationManager.prototype.requirePersistence = function () {
        var persistence = this.ctx.get('sessionPersistence');
        if (persistence === undefined) {
            throw new error_ts_1.SubagentError('continuable subagents require session persistence (load a dsh-session-persistence backend)', 'PERSISTENCE_UNAVAILABLE');
        }
        return persistence;
    };
    return SubagentContinuationManager;
}());
exports.SubagentContinuationManager = SubagentContinuationManager;
exports.default = SubagentContinuationManager;
