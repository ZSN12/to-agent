"use strict";
/**
 * Model-facing delegation through one configured `ctx.subagents` provider.
 * Provider lifecycle controls tool registration and context-sensitive schema
 * wording. Foreground calls always dispose the run after collection.
 * Background policy is selected by this plugin's configuration: one-shot
 * calls own a plain Task, while continuable calls use
 * `ctx.subagents.startContinuable()`.
 * @module @z/dsh-tool-subagent
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
exports.Config = exports.inject = exports.name = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_tools_1 = require("@z/dsh-tools");
var dsh_subagent_1 = require("@z/dsh-subagent");
exports.name = 'tool-subagent';
exports.inject = ['tools', 'subagents', 'systemPrompt'];
/** Prompt order after bounded delegation policy and before child reporting. */
var SUBAGENT_SECTION_ORDER = 116.5;
exports.Config = schemastery_1.default.object({
    provider: schemastery_1.default.string().required(),
    toolName: schemastery_1.default.string().default('subagent'),
    enableRunInBackground: schemastery_1.default.boolean().default(true),
    backgroundMode: schemastery_1.default.union(['one-shot', 'continuable']).default('one-shot'),
    // Prevent Schemastery from materializing omitted agentOptions as `{}`.
    agentOptions: schemastery_1.default.object({
        provider: schemastery_1.default.string(),
        model: schemastery_1.default.string(),
        maxTokens: schemastery_1.default.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
    }).default(undefined),
    persona: schemastery_1.default.string(),
    // Preserve omission; Schemastery's `{ allow: [] }` default would deny every tool.
    toolFilter: schemastery_1.default.object({
        allow: schemastery_1.default.array(schemastery_1.default.string()).default(undefined),
        deny: schemastery_1.default.array(schemastery_1.default.string()).default(undefined),
    }).default(undefined),
    maxDepth: schemastery_1.default.union([schemastery_1.default.natural().max(Number.MAX_SAFE_INTEGER), schemastery_1.default.const('provider-managed')]).default(3),
});
/** Render text blocks from the canonical JSON block array without trusting arbitrary values. */
function outputValueText(values) {
    return values
        .filter(function (value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value)
            && value.type === 'text' && typeof value.text === 'string';
    })
        .map(function (value) { return value.text; })
        .join('');
}
/** Settle pending startup without rejecting the task producer contract. */
function settleStart(start, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    _a = dsh_subagent_1.settleRun;
                    return [4 /*yield*/, start];
                case 1: return [4 /*yield*/, _a.apply(void 0, [_b.sent()])];
                case 2: return [2 /*return*/, _b.sent()];
                case 3:
                    error_1 = _b.sent();
                    // Product providers aggregate startup and rollback failures. Cancellation
                    // must not turn a failed cleanup into a cleanly killed Job.
                    return [2 /*return*/, signal.aborted && !(error_1 instanceof AggregateError)
                            ? { status: 'killed' }
                            : { status: 'failed', detail: String(error_1) }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/** A non-`completed` stop reason means the child did not finish cleanly. */
function stopReasonError(result) {
    switch (result.stopReason) {
        case 'completed':
            return undefined;
        case 'aborted':
            return 'subagent run was cancelled';
        case 'error':
            return 'subagent run failed';
        case 'max-tokens':
            return 'subagent run hit its token limit before finishing';
        case 'refusal':
            return 'subagent declined the task';
        // Merge-extensible union: a backend may add stop reasons. Treat an unknown
        // terminal reason as a failure rather than reporting partial output as success.
        default:
            return "subagent run ended abnormally (".concat(String(result.stopReason), ")");
    }
}
/**
 * Append provider-authored failure detail and the child's preserved partial
 * answer to a stop-reason error, keeping diagnostic text separate from the
 * child's assistant output.
 * @param error - the stop-reason headline.
 * @param result - the child's terminal result.
 * @returns the headline, diagnostic, and partial text that are present.
 */
function withDiagnosticAndPartialText(error, result) {
    var diagnostic = result.diagnostic === undefined
        ? ''
        : "\nDiagnostic: ".concat(result.diagnostic);
    var text = result.output
        .filter(function (block) { return block.type === 'text'; })
        .map(function (block) { return block.text; })
        .join('');
    var partial = text.length === 0
        ? ''
        : "\nPartial output before the run ended:\n".concat(text);
    return "".concat(error).concat(diagnostic).concat(partial);
}
/**
 * Collect and release one foreground run without letting disposal replace an
 * independent result failure.
 */
function settleForegroundRun(run) {
    return __awaiter(this, void 0, void 0, function () {
        var execution, disposal;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.allSettled([
                        run.result.then(function (result) {
                            var error = stopReasonError(result);
                            if (error !== undefined) {
                                // The registry converts this throw to isError; partial output is not
                                // success, but the preserved partial answer still reaches the parent.
                                throw new Error(withDiagnosticAndPartialText(error, result));
                            }
                            return {
                                kind: 'foreground',
                                runId: run.id,
                                // Content blocks already cross durable JSON boundaries elsewhere;
                                // the registry performs the authoritative lossless snapshot here.
                                output: result.output,
                            };
                        }),
                    ])];
                case 1:
                    execution = (_a.sent())[0];
                    return [4 /*yield*/, Promise.allSettled([Promise.resolve().then(function () { return run.dispose(); })])];
                case 2:
                    disposal = (_a.sent())[0];
                    if (execution.status === 'rejected') {
                        if (disposal.status === 'rejected') {
                            throw new AggregateError([execution.reason, disposal.reason], "subagent run failed: ".concat(String(execution.reason), "; dispose failed: ").concat(String(disposal.reason)));
                        }
                        throw execution.reason;
                    }
                    if (disposal.status === 'rejected')
                        throw disposal.reason;
                    return [2 /*return*/, execution.value];
            }
        });
    });
}
/**
 * Model-facing wording from the provider's conversation-history descriptor
 * ({@link SubagentProvider.inheritsParentContext}).
 * A fresh child needs a standalone prompt; a forked child already sees the
 * conversation's completed turns — telling the model to restate everything
 * (or, worse, that the child "does not see this conversation") would be false
 * for a fork.
 * @param inheritsConversation - whether the child's conversation is seeded
 *   with the parent's completed turns; this says nothing about tool, service,
 *   scope, or authority inheritance.
 * @returns the tool `description` and the `prompt` parameter description.
 */
function providerWording(inheritsConversation) {
    if (inheritsConversation) {
        return {
            description: 'Delegate a task to a subagent that inherits this conversation: a child agent seeded with all '
                + 'completed turns so far (it does not see the current in-flight turn). Use this when the subtask '
                + 'builds on this conversation\'s context — a follow-up analysis, '
                + 'a review, a continuation — without consuming this conversation\'s context for the work itself. '
                + 'You receive its result, not its intermediate steps.',
            promptDescription: 'The task for the subagent. It already sees this conversation\'s completed turns, so build on them '
                + 'freely and state only what is new.',
        };
    }
    return {
        description: 'Delegate a self-contained task to a subagent (a separate agent that works in its own context) '
            + 'to offload focused, independent work — research, a scoped '
            + 'implementation, an analysis — so it does not consume this conversation\'s context. The subagent '
            + 'returns its result, not its intermediate steps. Give it a '
            + 'complete, standalone prompt: it does not see this conversation.',
        promptDescription: 'The complete, self-contained task for the subagent. It does not share this '
            + 'conversation\'s context, so include everything it needs.',
    };
}
/** Resolve the model's optional scheduling request into one execution route. */
function resolveDelegationRun(request, options) {
    var _a;
    if (!options.backgroundEnabled) {
        // The validator permits undeclared keys, so schema omission also needs
        // execution-time enforcement.
        if (request.run_in_background === true) {
            throw new Error('run_in_background is disabled for this tool instance (enableRunInBackground: false)');
        }
        return { runInBackground: false };
    }
    return {
        // Continuable work is independently scheduled unless the caller explicitly
        // needs the result before its next action. One-shot policy keeps its existing
        // foreground default because its background result requires Task collection.
        runInBackground: (_a = request.run_in_background) !== null && _a !== void 0 ? _a : options.continuable,
    };
}
function apply(ctx, config) {
    var _a, _b, _c;
    // Direct apply() bypasses Schemastery's numeric constraints. A direct-apply
    // omission stays capless (the schema default only runs through the loader).
    if (config.maxDepth !== 'provider-managed')
        (0, dsh_subagent_1.assertSubagentMaxDepth)(config.maxDepth);
    // Reject an empty explicit filter at load instead of failing every delegation.
    if (config.toolFilter !== undefined && config.toolFilter.allow === undefined && config.toolFilter.deny === undefined) {
        throw new Error('tool-subagent: `toolFilter` is configured but names neither `allow` nor `deny` — remove the key or fill the filter');
    }
    var backgroundEnabled = config.enableRunInBackground !== false;
    var continuable = ((_a = config.backgroundMode) !== null && _a !== void 0 ? _a : 'one-shot') === 'continuable';
    var toolName = (_b = config.toolName) !== null && _b !== void 0 ? _b : 'subagent';
    // Mirror provider lifecycle because sibling load order and HMR replacement
    // can change provider availability while this fiber remains active.
    var disposeTool;
    var mount = function (provider) {
        // A numeric cap the provider cannot enforce is a misconfiguration — fail at
        // mount (the earliest point the provider's capabilities are known), not on
        // the first delegation.
        if (typeof config.maxDepth === 'number' && !provider.capabilities.depthLimit) {
            throw new Error("tool-subagent: provider \"".concat(provider.name, "\" cannot enforce maxDepth (no depthLimit capability) \u2014 ")
                + 'set maxDepth: \'provider-managed\' to leave the recursion budget to the provider');
        }
        var wording = providerWording(provider.inheritsParentContext);
        if (continuable && provider.prepareContinuable === undefined) {
            throw new Error("tool-subagent: provider \"".concat(provider.name, "\" does not support `backgroundMode: continuable`"));
        }
        disposeTool = ctx.tools.register((0, dsh_tools_1.defineTool)({
            name: toolName,
            description: wording.description + (backgroundEnabled
                // The completion notice is the continuation service's own behavior, not
                // a separately installed capability, so this promise holds whenever the
                // continuable background path is reachable at all.
                ? continuable
                    ? ' This tool runs in the background by default, immediately returns a durable subagent id, and keeps the child conversation available for later turns. When that run settles, the runtime sends the parent a notice containing its outcome and any final assistant message; `send_message` starts a later turn in the same child conversation. Set `run_in_background: false` only when your next action depends on receiving the result.'
                    : ' This call waits for the result by default. Set `run_in_background: true` to return a job id; collect with `job_output` and stop with `job_kill`.'
                : ' This call waits for the subagent and returns its result.'),
            parameters: __assign({ description: {
                    type: 'string',
                    required: true,
                    description: 'A short (3-5 word) description of the delegated task, for display.',
                }, prompt: {
                    type: 'string',
                    required: true,
                    description: wording.promptDescription,
                } }, backgroundEnabled ? {
                run_in_background: {
                    type: 'boolean',
                    description: continuable
                        ? 'Whether to run in the background and return a durable subagent id immediately. Defaults to true. Set false to wait for the result when your next action depends on it.'
                        : 'Whether to run as a background job and return its id. Defaults to false; collect with job_output or stop with job_kill.',
                },
            } : {}),
            output: {
                schema: {
                    oneOf: [
                        {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                kind: { type: 'string', required: true, const: 'background' },
                                jobId: { type: 'string', required: true },
                            },
                        },
                        {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                kind: { type: 'string', required: true, const: 'continuable' },
                                subagentId: { type: 'string', required: true },
                            },
                        },
                        {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                kind: { type: 'string', required: true, const: 'foreground' },
                                runId: { type: 'string', required: true },
                                output: { type: 'array', required: true, items: { type: 'json' } },
                            },
                        },
                    ],
                },
                render: function (_args, value) { return [{
                        type: 'text',
                        text: value.kind === 'background'
                            ? "started background subagent job ".concat(value.jobId)
                            : value.kind === 'continuable'
                                ? "started subagent ".concat(value.subagentId)
                                : outputValueText(value.output),
                    }]; },
            },
            // Children never mutate the parent session; the one parent-owned write
            // (tasks.start) is a synchronous commutative insertion.
            isConcurrencySafe: function () { return true; },
            execute: function (args, exec) {
                return __awaiter(this, void 0, void 0, function () {
                    var parent, maxDepth, request, runSpec, started, jobs, id, run;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                parent = exec.agent;
                                if (!parent) {
                                    // Non-agent callers provide no parent for delegation ownership.
                                    throw new Error('subagent tool requires a calling agent (exec.agent was undefined)');
                                }
                                maxDepth = typeof config.maxDepth === 'number' ? config.maxDepth : undefined;
                                request = __assign(__assign(__assign(__assign({ label: args.description, prompt: [{ type: 'text', text: args.prompt }], parent: parent }, config.agentOptions !== undefined ? { agentOptions: config.agentOptions } : {}), config.persona !== undefined ? { persona: config.persona } : {}), config.toolFilter !== undefined ? { toolFilter: config.toolFilter } : {}), maxDepth !== undefined ? { maxDepth: maxDepth } : {});
                                runSpec = resolveDelegationRun(args, { backgroundEnabled: backgroundEnabled, continuable: continuable });
                                if (!runSpec.runInBackground) return [3 /*break*/, 3];
                                if (!continuable) return [3 /*break*/, 2];
                                return [4 /*yield*/, ctx.subagents.startContinuable({
                                        provider: config.provider,
                                        label: args.description,
                                        request: request,
                                        signal: exec.signal,
                                    })];
                            case 1:
                                started = _a.sent();
                                return [2 /*return*/, { kind: 'continuable', subagentId: started.childId }];
                            case 2:
                                jobs = ctx.get('jobs');
                                if (jobs === undefined) {
                                    throw new Error('background jobs unavailable: load @z/dsh-jobs and @z/dsh-tool-jobs');
                                }
                                id = jobs.start({
                                    kind: 'subagent',
                                    label: args.description,
                                    owner: parent,
                                    run: function () {
                                        var controller = new AbortController();
                                        var start = ctx.subagents.start(config.provider, __assign(__assign({}, request), { signal: controller.signal }));
                                        return {
                                            cancel: function (reason) {
                                                controller.abort(reason !== null && reason !== void 0 ? reason : 'background subagent task killed');
                                            },
                                            done: settleStart(start, controller.signal),
                                            // No readOutput: the child session owns intermediate detail.
                                        };
                                    },
                                });
                                return [2 /*return*/, { kind: 'background', jobId: id }];
                            case 3: return [4 /*yield*/, ctx.subagents.start(config.provider, __assign(__assign({}, request), { signal: exec.signal }))];
                            case 4:
                                run = _a.sent();
                                return [2 /*return*/, settleForegroundRun(run)];
                        }
                    });
                });
            },
        }));
    };
    // Register listeners before checking presence so no synchronous change is missed.
    // TODO(subagent-dup-toolname): two waiting one-shot fibers configured with the
    // same toolName collide when their provider appears, and the duplicate-name
    // throw rolls back the provider registration. Continuable instances reserve
    // their prompt-section name during apply() and fail earlier. Add an intent
    // registry if the late one-shot collision occurs in a shipped composition.
    ctx.on('subagent/provider-added', function (provider) {
        if (provider.name === config.provider && disposeTool === undefined)
            mount(provider);
    });
    ctx.on('subagent/provider-removed', function (name) {
        if (name !== config.provider || disposeTool === undefined)
            return;
        disposeTool();
        disposeTool = undefined;
    });
    var present = ctx.subagents.getProvider(config.provider);
    if (present !== undefined) {
        mount(present);
    }
    else {
        // A backend fiber may activate later; a misspelled provider remains visible in this log.
        ctx.logger.info("subagent provider \"".concat(config.provider, "\" not registered yet; the \"").concat((_c = config.toolName) !== null && _c !== void 0 ? _c : 'subagent', "\" tool will register when it appears"));
    }
    if (backgroundEnabled && continuable) {
        // The section follows provider availability without its own manual
        // lifecycle: empty text is omitted from rendered prompts while the tool is
        // absent, and the registration itself stays owned by this plugin fiber.
        ctx.systemPrompt.section({
            name: "tool:".concat(toolName),
            order: SUBAGENT_SECTION_ORDER,
            text: function (context) { return disposeTool === undefined || ctx.tools.get(toolName, context.scope) === undefined
                ? ''
                : "Use ".concat(toolName, " in the background by default. Start independent delegations together in one assistant message and continue useful work while they run. Set `run_in_background: false` only when your next action depends on that subagent's result. When a background run settles, the runtime sends you a notice containing its outcome and any final assistant message."); },
        });
    }
}
