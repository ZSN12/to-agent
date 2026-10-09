"use strict";
/**
 * The model-facing `workflow` tool: run a JavaScript orchestration script that fans out
 * subagents, and return the script's final value. It owns the model-facing schema and run lifecycle; script
 * parsing, execution, caps, and cancellation live behind `ctx.workflowEngine`
 * (`@z/dsh-workflow`), so a hardened engine swaps in without touching what the model
 * sees. Execution awaits `run.result` and always disposes the run; non-completed reasons become tool
 * errors, and background collection remains deferred. Presentation is an args-only generic card
 * titled from `meta.name`. Explicit-ask usage guidance is registered as the tool's own prompt
 * section rather than deployment persona prose.
 * @module @z/dsh-tool-workflow
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
exports.name = 'tool-workflow';
exports.inject = ['tools', 'workflowEngine', 'systemPrompt'];
exports.Config = schemastery_1.default.object({
    toolName: schemastery_1.default.string().default('workflow'),
    maxResultChars: schemastery_1.default.natural().min(1).default(50000),
});
/** Render a contained recording failure without trusting the thrown value. */
function renderRecordingError(error) {
    try {
        return String(error);
    }
    catch (_a) {
        return '[unrenderable thrown value]';
    }
}
/**
 * Project active top-level workflow runs into their parent Sessions without
 * letting recording failure affect tool execution.
 */
function createWorkflowRecorder(ctx) {
    var active = new Map();
    var append = function (session, type, data) {
        // These four package-owned events are all log-only. Narrowing the generic
        // append face here discharges Session.append's conditional options tuple.
        var appendRecord = session.append.bind(session);
        try {
            appendRecord(type, data);
            return true;
        }
        catch (error) {
            ctx.logger.warn("tool-workflow: disabled durable record after ".concat(type, " append failed: ").concat(renderRecordingError(error)));
            return false;
        }
    };
    ctx.on('workflow/agent-start', function (info, agent) {
        var session = active.get(info.id);
        if (session === undefined)
            return;
        var data = __assign(__assign({ runId: info.id, seq: agent.seq, label: agent.label }, agent.phase === undefined ? {} : { phase: agent.phase }), { childId: agent.childId });
        if (!append(session, 'tool-workflow/agent-start', data))
            active.delete(info.id);
    });
    ctx.on('workflow/agent-end', function (info, agent) {
        var session = active.get(info.id);
        if (session === undefined)
            return;
        var data = {
            runId: info.id,
            seq: agent.seq,
            outcome: agent.outcome,
        };
        if (!append(session, 'tool-workflow/agent-end', data))
            active.delete(info.id);
    });
    return {
        start: function (session, run) {
            if (append(session, 'tool-workflow/run-start', { runId: run.id, name: run.meta.name })) {
                active.set(run.id, session);
            }
        },
        finish: function (runId, stopReason) {
            var session = active.get(runId);
            if (session !== undefined)
                append(session, 'tool-workflow/run-end', { runId: runId, stopReason: stopReason });
            active.delete(runId);
        },
        abandon: function (runId) { active.delete(runId); },
    };
}
/**
 * The script-authoring contract, embedded in the tool description. This IS the
 * model-facing spec: the meta block, the hooks and their exact semantics, and
 * the supported schema subset.
 */
var DESCRIPTION = "Run a JavaScript workflow script that orchestrates subagents at scale. Use this for work that fans out across many independent pieces \u2014 an audit over many files, a migration, multi-angle research, adversarial verification of findings \u2014 where you write the orchestration as a script instead of delegating turn by turn.\n\nThe workflow's identity rides the `meta` parameter as JSON: required `name` (short kebab-case) and `description` strings, optional `whenToUse` string and `phases` array (`{title, detail?, provider?, model?}`). The `script` parameter is the plain JavaScript body ONLY (NOT TypeScript, and NO `export const meta` statement \u2014 meta is a parameter, not code), running with top-level await; end with `return <value>` \u2014 the value must be JSON-serializable and is this tool's result.\n\nScript-body hooks:\n- `agent(prompt, opts?): Promise<any>` \u2014 run one subagent to completion. Without `opts.schema` it resolves to the child's final text; with `opts.schema` (an object-rooted JSON Schema using ONLY type/properties/required/additionalProperties/items/enum/const/oneOf \u2014 no pattern/format/numeric bounds) it resolves to the validated object. Resolves `null` when the child fails (filter with `.filter(Boolean)`). Other opts: `label` (display), `phase` (progress group), and independent `provider`/`model` LLM target overrides (either may be provided alone). Anything else (`effort`/`isolation`/`agentType`) is rejected loudly.\n- `pipeline(items, ...stages): Promise<any[]>` \u2014 run each item through the stages independently with NO barrier between stages (prefer this for multi-stage work). Each stage receives `(prev, item, index)`. An ordinary stage throw drops that ITEM to `null` and skips its remaining stages.\n- `parallel(thunks): Promise<any[]>` \u2014 run zero-argument functions concurrently and await ALL of them (a barrier; use only when a stage genuinely needs every prior result together). A throwing thunk resolves to `null`.\n- `phase(title)` \u2014 start a progress phase; `log(message)` \u2014 narrate progress; `args` \u2014 the tool call's `args` input, verbatim.\n\nMisused hooks (bad arguments, unknown options, unsupported schemas, tripped caps) throw errors that ALWAYS kill the script \u2014 they never dissolve into a per-item `null`.\n\nConstraints: concurrency and total-agent caps apply; no filesystem, network, timers, or Node.js APIs are provided \u2014 the agents do the work, the script only coordinates them. The run executes in the foreground: this call returns when the whole script finishes.";
/** The pending-state card: a generic card titled by the workflow's meta name. */
function presentWorkflowCall(args) {
    return {
        card: 'generic',
        title: "workflow: ".concat(args.meta.name),
        rawInput: args.script,
    };
}
/** The completed-state card: keep the pending title; render the result content as-is. */
function presentWorkflowResult(args, result) {
    void args;
    void result;
    return { card: 'generic' };
}
/** A non-`completed` stop reason means the script did not finish cleanly. */
function stopReasonError(result) {
    var _a;
    switch (result.stopReason) {
        case 'completed':
            return undefined;
        case 'cancelled':
            return "workflow run was cancelled".concat(result.error !== undefined ? " (".concat(result.error, ")") : '');
        case 'error':
            return "workflow run failed: ".concat((_a = result.error) !== null && _a !== void 0 ? _a : 'unknown error');
        /* v8 ignore start -- defensive: WorkflowStopReason is a closed union, exhaustive by construction; a future variant fails here loudly */
        default:
            return "workflow run ended abnormally (".concat(String(result.stopReason), ")");
        /* v8 ignore stop */
    }
}
/** Render the run's outcome text: the meta name, agent count, and the JSON value (capped). */
function renderResult(name, agentsStarted, value, maxChars) {
    // The engine returns JSON data (null for a valueless script), so stringify never yields undefined.
    var rendered = JSON.stringify(value, null, 2);
    var clipped = rendered.length > maxChars
        ? "".concat(rendered.slice(0, maxChars), "\n\u2026 [truncated: ").concat(rendered.length - maxChars, " more characters]")
        : rendered;
    return "workflow \"".concat(name, "\" completed (").concat(agentsStarted, " agent").concat(agentsStarted === 1 ? '' : 's', ").\nReturn value:\n").concat(clipped);
}
function apply(ctx, config) {
    // schemastery (the exported Config schema) has already filled the defaulted
    // fields; the assertion records that resolution, not a hidden fallback.
    var _a = config, toolName = _a.toolName, maxResultChars = _a.maxResultChars;
    var recorder = createWorkflowRecorder(ctx);
    // Usage policy ships with the tool (the master convention: tool guidance
    // lives in tool plugins as prompt sections, not in the deployment persona).
    ctx.systemPrompt.section({
        name: "tool:".concat(toolName),
        order: 115,
        text: "Use the ".concat(toolName, " tool ONLY when the user explicitly asks for a workflow or for large multi-agent orchestration: you write a JavaScript script (the tool description documents the exact format) that fans work out across many subagents with phases and structured results. For one or two delegations, prefer plain subagent calls."),
    });
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: toolName,
        description: DESCRIPTION,
        parameters: {
            script: {
                type: 'string',
                required: true,
                description: 'The plain-JS workflow script body (top-level await allowed; NO `export const meta` statement; end with `return <json-value>`).',
            },
            meta: {
                type: 'object',
                additionalProperties: true,
                required: true,
                description: 'The workflow identity block (plain JSON — never code).',
                properties: {
                    name: { type: 'string', required: true, description: 'Short kebab-case workflow name.' },
                    description: { type: 'string', required: true, description: 'One-line description of what the workflow does.' },
                    whenToUse: { type: 'string', description: 'Optional guidance on when this workflow applies.' },
                    phases: {
                        type: 'array',
                        description: 'Optional phase declarations matched by phase() calls.',
                        items: {
                            type: 'object',
                            additionalProperties: true,
                            properties: {
                                title: { type: 'string', required: true, description: 'The phase title phase() calls match by exact string.' },
                                detail: { type: 'string', description: 'Optional one-line description of the phase.' },
                                provider: { type: 'string', description: 'Optional provider override this phase is expected to use.' },
                                model: { type: 'string', description: 'Optional model override this phase is expected to use.' },
                            },
                        },
                    },
                },
            },
            args: {
                type: 'object',
                additionalProperties: true,
                description: 'Optional JSON input exposed to the script as the `args` global (wrap a bare list as a field, e.g. {"files": [...]}).',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    runId: { type: 'string', required: true },
                    agentsStarted: { type: 'integer', required: true },
                    result: { type: 'json', required: true },
                },
            },
            render: function (args, value) { return [{
                    type: 'text',
                    text: renderResult(args.meta.name, value.agentsStarted, value.result, maxResultChars),
                }]; },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var parent, run, recordsRun, onAbort, result, error;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            parent = exec.agent;
                            if (!parent) {
                                // The loop sets `exec.agent` for every model-driven call; its absence
                                // means a non-agent caller invoked the tool directly, which has no
                                // parent to attribute the children to. Fail loud rather than guess.
                                throw new Error('workflow tool requires a calling agent (exec.agent was undefined)');
                            }
                            run = ctx.workflowEngine.start(__assign(__assign({ script: args.script, meta: args.meta }, args.args !== undefined ? { args: args.args } : {}), { parent: parent, signal: exec.signal }));
                            recordsRun = exec.parent === undefined;
                            // The shipped worker-thread engine publishes member events from later
                            // worker messages, after start() returns and this run record is active.
                            if (recordsRun)
                                recorder.start(parent.session, run);
                            onAbort = function () { run.cancel('parent step aborted'); };
                            exec.signal.addEventListener('abort', onAbort, { once: true });
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, , 3, 8]);
                            return [4 /*yield*/, run.result];
                        case 2:
                            result = _a.sent();
                            error = stopReasonError(result);
                            if (error !== undefined) {
                                // Map a non-clean finish to an isError result (the registry turns a
                                // throw into an isError). Report the reason, not partial output.
                                throw new Error(error);
                            }
                            return [2 /*return*/, {
                                    runId: run.id,
                                    agentsStarted: result.agentsStarted,
                                    result: result.value,
                                }];
                        case 3:
                            exec.signal.removeEventListener('abort', onAbort);
                            _a.label = 4;
                        case 4:
                            _a.trys.push([4, , 6, 7]);
                            // Keep member listeners alive through disposal: an engine may
                            // synthesize cancelled member endings while reaching quiescence.
                            return [4 /*yield*/, run.dispose()];
                        case 5:
                            // Keep member listeners alive through disposal: an engine may
                            // synthesize cancelled member endings while reaching quiescence.
                            _a.sent();
                            if (recordsRun) {
                                /* v8 ignore next -- WorkflowRun.result never rejects by contract, so result is assigned before finally. */
                                if (result === undefined)
                                    throw new Error('workflow run settled without a result');
                                recorder.finish(run.id, result.stopReason);
                            }
                            return [3 /*break*/, 7];
                        case 6:
                            if (recordsRun)
                                recorder.abandon(run.id);
                            return [7 /*endfinally*/];
                        case 7: return [7 /*endfinally*/];
                        case 8: return [2 /*return*/];
                    }
                });
            });
        },
        presentCall: function (args) { return presentWorkflowCall(args); },
        presentResult: function (args, result) { return presentWorkflowResult(args, result); },
    }));
}
