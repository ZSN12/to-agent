"use strict";
/**
 * Model-facing `job_output`, `job_list`, and `job_kill` tools over
 * `ctx.jobs`. Loading the plugin attaches the controller required by
 * producers. It also delivers unreported completions to the owning agent:
 * injected into a busy owner's next step, or opening a turn on an idle one
 * under the default `wakeup` delivery, bounded per owner.
 * @module @z/dsh-tool-jobs
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
exports.statusLine = statusLine;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_output_retention_1 = require("@z/dsh-output-retention");
var dsh_tools_1 = require("@z/dsh-tools");
var dsh_jobs_1 = require("@z/dsh-jobs");
exports.name = 'tool-jobs';
exports.inject = ['tools', 'jobs', 'systemPrompt'];
exports.Config = schemastery_1.default.object({
    waitTimeoutMs: schemastery_1.default.number().min(1).default(30000),
    maxWaitTimeoutMs: schemastery_1.default.number().min(1).default(600000),
    completionDelivery: schemastery_1.default.union(['quiet', 'wakeup']).default('wakeup'),
    maxConsecutiveWakes: schemastery_1.default.number().min(1).default(3),
});
/** Shared schema for job-control outputs. */
var PUBLIC_TASK_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        id: { type: 'string', required: true },
        kind: { type: 'string', required: true },
        label: { type: 'string', required: true },
        status: {
            type: 'string',
            required: true,
            enum: ['running', 'stopping', 'completed', 'killed', 'failed'],
        },
        detail: { type: 'string' },
        startedAt: { type: 'integer', required: true },
        finishedAt: { type: 'integer' },
    },
};
/** Remove job ownership and notification bookkeeping from a registry snapshot. */
function publicJob(snapshot) {
    return __assign(__assign(__assign({ id: snapshot.id, kind: snapshot.kind, label: snapshot.label, status: snapshot.status }, snapshot.detail !== undefined ? { detail: snapshot.detail } : {}), { startedAt: snapshot.startedAt }), snapshot.finishedAt !== undefined ? { finishedAt: snapshot.finishedAt } : {});
}
/**
 * Render generic status with optional producer detail.
 * @param snapshot - job state to render.
 * @returns a bracketed status line.
 */
function statusLine(snapshot) {
    return snapshot.detail !== undefined
        ? "[status: ".concat(snapshot.status, ", ").concat(snapshot.detail, "]")
        : "[status: ".concat(snapshot.status, "]");
}
var encoder = new TextEncoder();
function retainTail(text, maxBytes) {
    var retainer = new dsh_output_retention_1.TextRetainer({ kind: 'tail', maxBytes: maxBytes });
    retainer.push(text);
    return retainer.finish().text;
}
function retainHead(text, maxBytes) {
    var retainer = new dsh_output_retention_1.TextRetainer({ kind: 'head', maxBytes: maxBytes });
    retainer.push(text);
    return retainer.finish().text;
}
function fitWithSuffix(content, suffix, maxBytes, omitted) {
    var complete = "".concat(content).concat(suffix);
    if (maxBytes === undefined || encoder.encode(complete).byteLength <= maxBytes)
        return complete;
    var fixed = "".concat(content.endsWith(omitted.trimStart()) ? '' : omitted).concat(suffix);
    var fixedBytes = encoder.encode(fixed).byteLength;
    if (fixedBytes >= maxBytes)
        return retainTail(fixed, maxBytes);
    return "".concat(retainTail(content, maxBytes - fixedBytes)).concat(fixed);
}
/**
 * One-line account of a settled job for the `notice` form's collapsed row.
 * @param snapshot - the settled job.
 * @returns its kind, label, and status, bounded like every notice summary.
 */
function completionSummary(snapshot) {
    return (0, dsh_llm_1.boundContextSummary)("".concat(snapshot.kind, " ").concat(snapshot.label, " ").concat(statusLine(snapshot)));
}
function fitCompletionNotice(snapshot) {
    var prefix = "background job ".concat(snapshot.id);
    var detail = " (".concat(snapshot.kind, ": ").concat(snapshot.label, ") finished ").concat(statusLine(snapshot));
    var action = '\nDone; job_output.';
    var complete = "".concat(prefix).concat(detail, ". Read its output with job_output.");
    var maxBytes = snapshot.outputLimitBytes;
    if (maxBytes === undefined || encoder.encode(complete).byteLength <= maxBytes)
        return complete;
    var omitted = '\n[notice truncated]';
    var fixed = "".concat(prefix).concat(omitted).concat(action);
    var fixedBytes = encoder.encode(fixed).byteLength;
    if (fixedBytes <= maxBytes) {
        return fixedBytes === maxBytes
            ? fixed
            : "".concat(prefix).concat(retainHead(detail, maxBytes - fixedBytes)).concat(omitted).concat(action);
    }
    var compact = "".concat(prefix).concat(action);
    var compactBytes = encoder.encode(compact).byteLength;
    if (compactBytes <= maxBytes)
        return compact;
    var actionBytes = encoder.encode(action).byteLength;
    if (actionBytes >= maxBytes)
        return retainTail(action, maxBytes);
    return "".concat(retainHead(prefix, maxBytes - actionBytes)).concat(action);
}
function rawSingleText(content) {
    if (content.length !== 1)
        return undefined;
    var block = content[0];
    if ((block === null || block === void 0 ? void 0 : block.type) !== 'text')
        return undefined;
    return block.text;
}
function boundSingleText(content, maxBytes) {
    var text = rawSingleText(content);
    if (text === undefined)
        return undefined;
    return [{
            type: 'text',
            text: fitWithSuffix(text, '', maxBytes, '\n[result truncated]'),
        }];
}
function visibleOutputLimit(ctx, exec) {
    var _a, _b;
    if (exec.name !== 'job_output' && exec.name !== 'job_kill')
        return undefined;
    var jobId = (_a = exec.arguments) === null || _a === void 0 ? void 0 : _a.job_id;
    if (typeof jobId !== 'string' || jobId.length === 0)
        return undefined;
    return (_b = ctx.jobs.list(exec.agent).find(function (snapshot) { return snapshot.id === jobId; })) === null || _b === void 0 ? void 0 : _b.outputLimitBytes;
}
/** Validate the non-empty constraint that ParameterSchemaSpec cannot express. */
function validateJobId(value) {
    if (value.length === 0) {
        throw new Error("invalid job_id: expected a non-empty string, got ".concat(JSON.stringify(value)));
    }
    return (0, dsh_jobs_1.JobId)(value);
}
/** Pending presentation shared by the three generic job controls. */
function presentTaskCall(title, kind, rawInput) {
    return __assign({ card: 'generic', title: title, kind: kind }, rawInput !== undefined ? { rawInput: rawInput } : {});
}
function apply(ctx, config) {
    var _a, _b, _c, _d;
    var waitDefault = (_a = config.waitTimeoutMs) !== null && _a !== void 0 ? _a : 30000;
    var waitCap = (_b = config.maxWaitTimeoutMs) !== null && _b !== void 0 ? _b : 600000;
    var delivery = (_c = config.completionDelivery) !== null && _c !== void 0 ? _c : 'wakeup';
    var wakeBudget = (_d = config.maxConsecutiveWakes) !== null && _d !== void 0 ? _d : 3;
    // Turns this plugin opened on each owner since that owner last consumed
    // human input. Keyed by the exact Agent, so a same-session replacement
    // starts with a full budget.
    var spentWakes = new WeakMap();
    if (waitDefault > waitCap) {
        throw new Error("tool-jobs: waitTimeoutMs (".concat(waitDefault, ") exceeds maxWaitTimeoutMs (").concat(waitCap, ")"));
    }
    // A budget is a count of turns. `Infinity` would leave the runaway chain this
    // field exists to bound unbounded, and a fraction never names a turn at all.
    if (!Number.isSafeInteger(wakeBudget)) {
        throw new Error("tool-jobs: maxConsecutiveWakes (".concat(wakeBudget, ") must be a whole number of turns"));
    }
    // Nothing spends the budget under quiet delivery, so nothing needs to refill it.
    if (delivery === 'wakeup') {
        ctx.on('agent/inbox/claimed', function (_a) {
            var agent = _a.agent, message = _a.message;
            // Claiming is the point the human's input actually enters a step; a notice
            // this plugin itself queued must not refill the budget it just spent.
            if (message.source.kind === 'user')
                spentWakes.delete(agent);
        });
    }
    var outputLimits = new WeakMap();
    ctx.on('tools/pre-execute', function (exec, next) {
        var maxBytes = visibleOutputLimit(ctx, exec);
        if (maxBytes !== undefined)
            outputLimits.set(exec, maxBytes);
        return next();
    }, { prepend: true });
    var finalizeTaskContent = function (exec, result) {
        var _a;
        var maxBytes = (_a = outputLimits.get(exec)) !== null && _a !== void 0 ? _a : visibleOutputLimit(ctx, exec);
        outputLimits.delete(exec);
        if (maxBytes === undefined)
            return undefined;
        if (exec.name === 'job_output' && !result.isError) {
            // This definition owns and schema-validates the canonical value. Preserve
            // its output/status split only while policy left the default rendering intact.
            var value = result.value;
            var body = value.text.length > 0 ? value.text : '(no new output)';
            var content = body.endsWith('\n') ? body.slice(0, -1) : body;
            var suffix = "\n".concat(statusLine(value.job));
            if (rawSingleText(result.content) === "".concat(content).concat(suffix)) {
                return [{
                        type: 'text',
                        text: fitWithSuffix(content, suffix, maxBytes, '\n[output truncated]'),
                    }];
            }
        }
        return boundSingleText(result.content, maxBytes);
    };
    // Producers may start work only while a controller is attached.
    ctx.jobs.attachController('tool-jobs');
    // Cross-call guidance follows the bash section and precedes product sections.
    ctx.systemPrompt.section({
        name: 'tool:jobs',
        order: 106,
        text: 'Track every background job id you start. You are notified in-session when a job finishes — do not busy-poll or sleep on one; keep working on independent steps and do not duplicate a running job\'s work. Before giving a final answer, collect every still-relevant job with job_output (set wait: true only when you are genuinely blocked on it), and job_kill jobs that stopped mattering.',
    });
    // Use the exact lifecycle owner; reusable ids could resolve to a replacement.
    // A busy owner is injected: the notice waits in its next-step inbox, which
    // the turn cannot close over, so jobs settling together cost one step. An
    // idle owner is woken instead, because an unclaimed notice is a completion
    // the model never learns about. Either way, disposal before the claim
    // discards it with the owner, and teardown settlements arrive `reported`.
    //
    // The registry routes each settlement to the listeners its owner's scope
    // chain reaches, so a mount under one preset never sees another preset's
    // agents; this listener owns delivery, not the choice of whom to deliver to.
    ctx.jobs.onJobDone(function (snapshot, owner) {
        var _a;
        if (snapshot.reported || owner === undefined)
            return;
        var message = (0, dsh_llm_1.createUserMessage)({
            content: [{
                    type: 'text',
                    text: fitCompletionNotice(snapshot),
                }],
            source: {
                kind: 'plugin',
                plugin: 'tool-jobs',
                form: 'notice',
                summary: completionSummary(snapshot),
            },
        });
        var spent = (_a = spentWakes.get(owner)) !== null && _a !== void 0 ? _a : 0;
        if (delivery === 'wakeup' && owner.status === 'idle' && spent < wakeBudget) {
            spentWakes.set(owner, spent + 1);
            owner.followup(message);
            return;
        }
        owner.inject(message);
    });
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'job_output',
        description: 'Read a background job. Stream jobs return only output since the previous read; '
            + 'final-output jobs return their result after settlement. Every response ends with '
            + '`[status: ...]`. Reads are non-blocking unless `wait: true`, which waits up to the configured cap.',
        // A timed-out wait returns job state rather than a TOOL_TIMEOUT error, so
        // this tool owns its deadline instead of using ToolDefinition.timeoutMs.
        parameters: {
            job_id: { type: 'string', required: true, description: 'Job id returned by the tool that started the background work.' },
            wait: { type: 'boolean', description: 'Block until the job reaches a terminal status or the timeout expires. A timed-out wait returns [status: running] and leaves the job alive.' },
            timeout_ms: { type: 'number', description: 'Max wait in milliseconds (only meaningful with wait: true). Defaults to the configured wait timeout; capped by the configured maximum.' },
        },
        finalizeContent: finalizeTaskContent,
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    text: { type: 'string', required: true },
                    job: __assign(__assign({}, PUBLIC_TASK_SCHEMA), { required: true }),
                },
            },
            render: function (_args, value) {
                var body = value.text.length > 0 ? value.text : '(no new output)';
                var separator = body.endsWith('\n') ? '' : '\n';
                return [{ type: 'text', text: "".concat(body).concat(separator).concat(statusLine(value.job)) }];
            },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var id, timeout, read;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            id = validateJobId(args.job_id);
                            if (!(args.wait === true)) return [3 /*break*/, 2];
                            timeout = Math.min((_a = args.timeout_ms) !== null && _a !== void 0 ? _a : waitDefault, waitCap);
                            return [4 /*yield*/, ctx.jobs.wait(id, timeout, exec.agent, exec.signal)];
                        case 1:
                            _b.sent();
                            _b.label = 2;
                        case 2:
                            read = ctx.jobs.read(id, exec.agent);
                            return [2 /*return*/, { text: read.text, job: publicJob(read.snapshot) }];
                    }
                });
            });
        },
        presentCall: function (args) { return presentTaskCall("Read output from background job ".concat(args.job_id), 'read', args.job_id); },
    }));
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'job_list',
        description: 'List your background jobs (running and finished) with their ids, kinds, and statuses.',
        parameters: {},
        output: {
            schema: { type: 'array', items: PUBLIC_TASK_SCHEMA },
            render: function (_args, jobs) { return [{
                    type: 'text',
                    text: jobs.length === 0
                        ? '(no background jobs)'
                        : jobs.map(function (t) { return "".concat(t.id, " [").concat(t.kind, "] ").concat(t.status, " \u2014 ").concat(t.label); }).join('\n'),
                }]; },
        },
        execute: function (_args, exec) {
            var jobs = ctx.jobs.list(exec.agent);
            return Promise.resolve(jobs.map(publicJob));
        },
        presentCall: function () { return presentTaskCall('List background jobs', 'read'); },
    }));
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'job_kill',
        description: 'Request cancellation of a running background job by job id. Returns immediately; the job settles as killed once its work actually stops.',
        parameters: {
            job_id: { type: 'string', required: true, description: 'Job id returned by the tool that started the background work.' },
            reason: { type: 'string', description: 'Optional short reason, recorded in the log and forwarded to the job.' },
        },
        finalizeContent: finalizeTaskContent,
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    outcome: {
                        type: 'string',
                        required: true,
                        enum: ['cancellation-requested', 'already-finished'],
                    },
                    job: __assign(__assign({}, PUBLIC_TASK_SCHEMA), { required: true }),
                },
            },
            render: function (_args, value) { return [{
                    type: 'text',
                    text: value.outcome === 'already-finished'
                        ? "job ".concat(value.job.id, " had already finished ").concat(statusLine(value.job))
                        : "requested cancellation of job ".concat(value.job.id),
                }]; },
        },
        execute: function (args, exec) {
            var id = validateJobId(args.job_id);
            var result = ctx.jobs.kill(id, exec.agent, args.reason);
            // A snapshot describes current state without consuming pending output.
            var snapshot = publicJob(ctx.jobs.get(id, exec.agent));
            return Promise.resolve({
                outcome: result === 'already-finished' ? 'already-finished' : 'cancellation-requested',
                job: snapshot,
            });
        },
        presentCall: function (args) { return presentTaskCall("Kill background job ".concat(args.job_id), 'execute', args.job_id); },
    }));
}
