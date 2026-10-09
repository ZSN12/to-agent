"use strict";
/**
 * Model-facing foreground Ralph loop over the workflow and subagent seams. A
 * fixed script starts one fresh structured-output child per round, carrying
 * only the immutable objective and the previous bounded handoff between them.
 * @module @z/dsh-tool-ralph
 */
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
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
exports.name = 'tool-ralph';
exports.inject = ['tools', 'workflowEngine', 'subagents', 'systemPrompt'];
/** Schemastery configuration for the Ralph tool. */
exports.Config = schemastery_1.default.object({
    subagentProvider: schemastery_1.default.string().default('spawn'),
    maxRounds: schemastery_1.default.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(256),
    maxHandoffChars: schemastery_1.default.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(16384),
    maxResultChars: schemastery_1.default.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(16384),
});
var RALPH_META = {
    name: 'ralph-loop',
    description: 'Iterate toward one objective with a fresh child and bounded structured handoff per round.',
    phases: [{ title: 'Fresh-agent rounds', detail: 'One clean child context per Ralph round.' }],
};
/**
 * Fixed, deployment-owned orchestration. The model supplies data only; it
 * cannot alter the loop, provider route, schema, or handoff validation.
 */
var RALPH_SCRIPT = String.raw(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\nconst reportSchema = {\n  type: 'object',\n  properties: {\n    status: { type: 'string', enum: ['continue', 'complete', 'blocked'] },\n    summary: { type: 'string' },\n    evidence: { type: 'array', items: { type: 'string' } },\n    nextSteps: { type: 'array', items: { type: 'string' } },\n    blocker: { type: 'string' },\n  },\n  required: ['status', 'summary', 'evidence', 'nextSteps', 'blocker'],\n  additionalProperties: false,\n}\n\nfunction normalizedText(value) {\n  return typeof value === 'string' && value.length > 0 && value === value.trim()\n}\n\nfunction normalizedList(value) {\n  return Array.isArray(value) && value.every(normalizedText)\n}\n\nfunction validateReport(report) {\n  if (report === null || typeof report !== 'object' || Array.isArray(report)) {\n    throw new Error('Ralph child returned no structured round report')\n  }\n  if (!normalizedText(report.summary)) {\n    throw new Error('Ralph round report summary must be non-empty and normalized')\n  }\n  if (!normalizedList(report.evidence) || !normalizedList(report.nextSteps)) {\n    throw new Error('Ralph round report evidence and nextSteps must contain only non-empty normalized strings')\n  }\n  if (typeof report.blocker !== 'string' || report.blocker !== report.blocker.trim()) {\n    throw new Error('Ralph round report blocker must be a normalized string')\n  }\n  switch (report.status) {\n    case 'continue':\n      if (report.nextSteps.length === 0 || report.blocker !== '') {\n        throw new Error('a continuing Ralph report needs nextSteps and an empty blocker')\n      }\n      break\n    case 'complete':\n      if (report.evidence.length === 0 || report.nextSteps.length !== 0 || report.blocker !== '') {\n        throw new Error('a complete Ralph report needs evidence, no nextSteps, and an empty blocker')\n      }\n      break\n    case 'blocked':\n      if (!normalizedText(report.blocker)) {\n        throw new Error('a blocked Ralph report needs a concrete blocker')\n      }\n      break\n    default:\n      throw new Error('Ralph round report status is invalid')\n  }\n  const serialized = JSON.stringify(report)\n  if (serialized.length > args.maxHandoffChars) {\n    throw new Error('Ralph round report exceeds maxHandoffChars (' + serialized.length + ' > ' + args.maxHandoffChars + ')')\n  }\n  return report\n}\n\nlet previous\nphase('Fresh-agent rounds')\nfor (let round = 1; round <= args.maxRounds; round += 1) {\n  const prior = previous === undefined ? '(none \u2014 this is the first round)' : JSON.stringify(previous)\n  const prompt = [\n    'You are one fresh worker in a foreground Ralph loop. You receive no parent conversation and no prior child session. Do not call the ralph tool: this round already is its worker.',\n    'Immutable objective:\n' + args.objective,\n    'Ralph round: ' + round + ' of ' + args.maxRounds + '.',\n    'The shared workspace and its current working tree are the long-term memory and source of truth. Inspect them before acting, preserve existing work, perform concrete in-scope work, and verify what you change. Treat the previous report only as a bounded handoff; confirm it against the workspace.',\n    'Previous structured handoff:\n' + prior,\n    'Return one report with exact normalized strings. Use status continue with at least one nextSteps entry while useful work remains; complete only with concrete evidence and no nextSteps; blocked only when no meaningful progress is possible without human input or an external-state change. blocker must be empty unless blocked.',\n  ].join('\n\n')\n  const rawReport = await agent(prompt, {\n    label: 'Ralph round ' + round,\n    phase: 'Fresh-agent rounds',\n    schema: reportSchema,\n  })\n  if (rawReport === null) {\n    return { status: 'round-failed', roundsStarted: round, lastReport: previous ?? null }\n  }\n  const report = validateReport(rawReport)\n  if (report.status === 'complete') return { status: 'complete', roundsStarted: round, report }\n  if (report.status === 'blocked') return { status: 'blocked', roundsStarted: round, report }\n  previous = report\n}\nreturn { status: 'budget-limited', roundsStarted: args.maxRounds, report: previous }\n"], ["\nconst reportSchema = {\n  type: 'object',\n  properties: {\n    status: { type: 'string', enum: ['continue', 'complete', 'blocked'] },\n    summary: { type: 'string' },\n    evidence: { type: 'array', items: { type: 'string' } },\n    nextSteps: { type: 'array', items: { type: 'string' } },\n    blocker: { type: 'string' },\n  },\n  required: ['status', 'summary', 'evidence', 'nextSteps', 'blocker'],\n  additionalProperties: false,\n}\n\nfunction normalizedText(value) {\n  return typeof value === 'string' && value.length > 0 && value === value.trim()\n}\n\nfunction normalizedList(value) {\n  return Array.isArray(value) && value.every(normalizedText)\n}\n\nfunction validateReport(report) {\n  if (report === null || typeof report !== 'object' || Array.isArray(report)) {\n    throw new Error('Ralph child returned no structured round report')\n  }\n  if (!normalizedText(report.summary)) {\n    throw new Error('Ralph round report summary must be non-empty and normalized')\n  }\n  if (!normalizedList(report.evidence) || !normalizedList(report.nextSteps)) {\n    throw new Error('Ralph round report evidence and nextSteps must contain only non-empty normalized strings')\n  }\n  if (typeof report.blocker !== 'string' || report.blocker !== report.blocker.trim()) {\n    throw new Error('Ralph round report blocker must be a normalized string')\n  }\n  switch (report.status) {\n    case 'continue':\n      if (report.nextSteps.length === 0 || report.blocker !== '') {\n        throw new Error('a continuing Ralph report needs nextSteps and an empty blocker')\n      }\n      break\n    case 'complete':\n      if (report.evidence.length === 0 || report.nextSteps.length !== 0 || report.blocker !== '') {\n        throw new Error('a complete Ralph report needs evidence, no nextSteps, and an empty blocker')\n      }\n      break\n    case 'blocked':\n      if (!normalizedText(report.blocker)) {\n        throw new Error('a blocked Ralph report needs a concrete blocker')\n      }\n      break\n    default:\n      throw new Error('Ralph round report status is invalid')\n  }\n  const serialized = JSON.stringify(report)\n  if (serialized.length > args.maxHandoffChars) {\n    throw new Error('Ralph round report exceeds maxHandoffChars (' + serialized.length + ' > ' + args.maxHandoffChars + ')')\n  }\n  return report\n}\n\nlet previous\nphase('Fresh-agent rounds')\nfor (let round = 1; round <= args.maxRounds; round += 1) {\n  const prior = previous === undefined ? '(none \u2014 this is the first round)' : JSON.stringify(previous)\n  const prompt = [\n    'You are one fresh worker in a foreground Ralph loop. You receive no parent conversation and no prior child session. Do not call the ralph tool: this round already is its worker.',\n    'Immutable objective:\\n' + args.objective,\n    'Ralph round: ' + round + ' of ' + args.maxRounds + '.',\n    'The shared workspace and its current working tree are the long-term memory and source of truth. Inspect them before acting, preserve existing work, perform concrete in-scope work, and verify what you change. Treat the previous report only as a bounded handoff; confirm it against the workspace.',\n    'Previous structured handoff:\\n' + prior,\n    'Return one report with exact normalized strings. Use status continue with at least one nextSteps entry while useful work remains; complete only with concrete evidence and no nextSteps; blocked only when no meaningful progress is possible without human input or an external-state change. blocker must be empty unless blocked.',\n  ].join('\\n\\n')\n  const rawReport = await agent(prompt, {\n    label: 'Ralph round ' + round,\n    phase: 'Fresh-agent rounds',\n    schema: reportSchema,\n  })\n  if (rawReport === null) {\n    return { status: 'round-failed', roundsStarted: round, lastReport: previous ?? null }\n  }\n  const report = validateReport(rawReport)\n  if (report.status === 'complete') return { status: 'complete', roundsStarted: round, report }\n  if (report.status === 'blocked') return { status: 'blocked', roundsStarted: round, report }\n  previous = report\n}\nreturn { status: 'budget-limited', roundsStarted: args.maxRounds, report: previous }\n"])));
var DESCRIPTION = 'Run a foreground fresh-agent Ralph loop toward one immutable objective. '
    + 'Use only when the direct human explicitly asks for Ralph or fresh-agent iteration. Each round '
    + 'opens a new child with no parent conversation or prior child session; the shared workspace is '
    + 'long-term memory, and only a bounded structured report crosses rounds. The call returns when '
    + 'a worker reports completion or a concrete blocker, or at the round limit. Ordinary long-running same-session work '
    + 'belongs to goal tools.';
/** Validate defaults even when a caller invokes apply() without Loader normalization. */
function resolveConfig(config) {
    var _a, _b, _c, _d;
    var subagentProvider = (_a = config.subagentProvider) !== null && _a !== void 0 ? _a : 'spawn';
    var maxRounds = (_b = config.maxRounds) !== null && _b !== void 0 ? _b : 256;
    var maxHandoffChars = (_c = config.maxHandoffChars) !== null && _c !== void 0 ? _c : 16384;
    var maxResultChars = (_d = config.maxResultChars) !== null && _d !== void 0 ? _d : 16384;
    if (subagentProvider.length === 0 || subagentProvider !== subagentProvider.trim()) {
        throw new TypeError('subagentProvider must be a non-empty normalized string');
    }
    if (!Number.isSafeInteger(maxRounds) || maxRounds < 1) {
        throw new TypeError('maxRounds must be a positive safe integer');
    }
    if (!Number.isSafeInteger(maxHandoffChars) || maxHandoffChars < 1) {
        throw new TypeError('maxHandoffChars must be a positive safe integer');
    }
    if (!Number.isSafeInteger(maxResultChars) || maxResultChars < 1) {
        throw new TypeError('maxResultChars must be a positive safe integer');
    }
    return { subagentProvider: subagentProvider, maxRounds: maxRounds, maxHandoffChars: maxHandoffChars, maxResultChars: maxResultChars };
}
/** Resolve one model-selected cap against the deployment ceiling. */
function resolveMaxRounds(requested, ceiling) {
    var value = requested !== null && requested !== void 0 ? requested : ceiling;
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError('Ralph maxRounds must be a positive safe integer');
    }
    if (value > ceiling) {
        throw new TypeError("Ralph maxRounds ".concat(value, " exceeds the deployment ceiling ").concat(ceiling));
    }
    return value;
}
/** Require the configured route to mean a genuinely fresh structured child. */
function requireFreshProvider(ctx, name) {
    var provider = ctx.subagents.getProvider(name);
    if (provider === undefined) {
        throw new Error("Ralph subagent provider \"".concat(name, "\" is not registered"));
    }
    if (!provider.capabilities.outputSchema) {
        throw new Error("Ralph subagent provider \"".concat(name, "\" does not support structured output"));
    }
    if (provider.inheritsParentContext) {
        throw new Error("Ralph subagent provider \"".concat(name, "\" inherits parent context; Ralph requires a fresh provider"));
    }
    return provider;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function normalizedText(value) {
    return typeof value === 'string' && value.length > 0 && value === value.trim();
}
function normalizedList(value) {
    return Array.isArray(value) && value.every(normalizedText);
}
/** Defensively decode the fixed script's report across a provider boundary. */
function readReport(value, expectedStatus, maxChars) {
    if (!isRecord(value)
        || Object.keys(value).sort().join(',') !== 'blocker,evidence,nextSteps,status,summary'
        || value['status'] !== expectedStatus
        || !normalizedText(value['summary'])
        || !normalizedList(value['evidence'])
        || !normalizedList(value['nextSteps'])
        || typeof value['blocker'] !== 'string'
        || value['blocker'] !== value['blocker'].trim()) {
        throw new Error('Ralph workflow returned a malformed round report');
    }
    var report = {
        status: expectedStatus,
        summary: value['summary'],
        evidence: value['evidence'],
        nextSteps: value['nextSteps'],
        blocker: value['blocker'],
    };
    if (expectedStatus === 'continue' && (report.nextSteps.length === 0 || report.blocker !== '')) {
        throw new Error('Ralph workflow returned an invalid continuing report');
    }
    if (expectedStatus === 'complete'
        && (report.evidence.length === 0 || report.nextSteps.length !== 0 || report.blocker !== '')) {
        throw new Error('Ralph workflow returned an invalid completion report');
    }
    if (expectedStatus === 'blocked' && !normalizedText(report.blocker)) {
        throw new Error('Ralph workflow returned an invalid blocked report');
    }
    var chars = JSON.stringify(report).length;
    if (chars > maxChars) {
        throw new Error("Ralph workflow returned an oversized handoff (".concat(chars, " > ").concat(maxChars, ")"));
    }
    return report;
}
/** Defensively decode the fixed script's terminal value. */
function readRunResult(value, maxRounds, maxHandoffChars) {
    if (!isRecord(value)
        || typeof value['roundsStarted'] !== 'number'
        || !Number.isSafeInteger(value['roundsStarted'])
        || value['roundsStarted'] < 1
        || value['roundsStarted'] > maxRounds) {
        throw new Error('Ralph workflow returned a malformed terminal result');
    }
    var roundsStarted = value['roundsStarted'];
    switch (value['status']) {
        case 'complete':
            if (Object.keys(value).sort().join(',') !== 'report,roundsStarted,status') {
                throw new Error('Ralph workflow returned a malformed terminal result');
            }
            return { status: 'complete', roundsStarted: roundsStarted, report: readReport(value['report'], 'complete', maxHandoffChars) };
        case 'blocked':
            if (Object.keys(value).sort().join(',') !== 'report,roundsStarted,status') {
                throw new Error('Ralph workflow returned a malformed terminal result');
            }
            return { status: 'blocked', roundsStarted: roundsStarted, report: readReport(value['report'], 'blocked', maxHandoffChars) };
        case 'budget-limited':
            if (Object.keys(value).sort().join(',') !== 'report,roundsStarted,status') {
                throw new Error('Ralph workflow returned a malformed terminal result');
            }
            if (roundsStarted !== maxRounds) {
                throw new Error('Ralph workflow returned budget-limited before the round limit');
            }
            return { status: 'budget-limited', roundsStarted: roundsStarted, report: readReport(value['report'], 'continue', maxHandoffChars) };
        case 'round-failed': {
            if (Object.keys(value).sort().join(',') !== 'lastReport,roundsStarted,status') {
                throw new Error('Ralph workflow returned a malformed terminal result');
            }
            if (roundsStarted === 1) {
                if (value['lastReport'] !== null) {
                    throw new Error('Ralph workflow returned an invalid first-round failure');
                }
                return { status: 'round-failed', roundsStarted: roundsStarted };
            }
            if (value['lastReport'] === null) {
                throw new Error('Ralph workflow returned a round failure without its last handoff');
            }
            return {
                status: 'round-failed',
                roundsStarted: roundsStarted,
                lastReport: readReport(value['lastReport'], 'continue', maxHandoffChars),
            };
        }
        default:
            throw new Error('Ralph workflow returned an unknown terminal status');
    }
}
/** A non-clean workflow finish is an error, never a partial Ralph success. */
function stopReasonError(result) {
    var _a;
    switch (result.stopReason) {
        case 'completed':
            return undefined;
        case 'cancelled':
            return "Ralph workflow was cancelled".concat(result.error === undefined ? '' : " (".concat(result.error, ")"));
        case 'error':
            return "Ralph workflow failed: ".concat((_a = result.error) !== null && _a !== void 0 ? _a : 'unknown error');
        /* v8 ignore start -- WorkflowStopReason is closed; a future variant must fail loud here. */
        default:
            return "Ralph workflow ended abnormally (".concat(String(result.stopReason), ")");
        /* v8 ignore stop */
    }
}
var TRUNCATION_NOTICE = '\n… [truncated]';
/** Bound complete parent-facing text, including its envelope and truncation marker. */
function boundResult(text, maxChars) {
    if (text.length <= maxChars)
        return text;
    if (maxChars <= TRUNCATION_NOTICE.length)
        return TRUNCATION_NOTICE.slice(0, maxChars);
    return "".concat(text.slice(0, maxChars - TRUNCATION_NOTICE.length)).concat(TRUNCATION_NOTICE);
}
/** Render the fixed terminal envelope without presenting self-report as certification. */
function renderResult(result, maxChars) {
    var rounds = "".concat(result.roundsStarted, " round").concat(result.roundsStarted === 1 ? '' : 's');
    var text;
    switch (result.status) {
        case 'complete':
            text = "Ralph worker reported completion after ".concat(rounds, ".\nFinal report:\n").concat(JSON.stringify(result.report, null, 2));
            break;
        case 'blocked':
            text = "Ralph worker reported a blocker after ".concat(rounds, ".\nFinal report:\n").concat(JSON.stringify(result.report, null, 2));
            break;
        case 'budget-limited':
            text = "Ralph reached its ".concat(rounds, " limit; the worker reported work remaining.\nFinal report:\n").concat(JSON.stringify(result.report, null, 2));
            break;
    }
    return boundResult(text, maxChars);
}
/** Canonical Ralph result fields shared by schema inference and rendering. */
var RALPH_OUTPUT_PROPERTIES = {
    runId: { type: 'string', required: true },
    agentsStarted: { type: 'integer', required: true },
    result: { type: 'json', required: true },
};
/** Render an ordinary child failure with the most recent durable handoff. */
function renderRoundFailure(result, maxChars) {
    var header = "Ralph round ".concat(result.roundsStarted, " child failed before producing a structured report.");
    var text = result.lastReport === undefined
        ? "".concat(header, "\nNo previous handoff was available.")
        : "".concat(header, "\nLast successful handoff:\n").concat(JSON.stringify(result.lastReport, null, 2));
    return boundResult(text, maxChars);
}
function presentCall(args) {
    return { card: 'generic', title: 'ralph', rawInput: args.objective };
}
function presentResult(args, result) {
    void args;
    void result;
    return { card: 'generic' };
}
/** Register the fixed Ralph tool and its explicit-ask usage policy. */
function apply(ctx, config) {
    var resolved = resolveConfig(config);
    ctx.systemPrompt.section({
        name: 'tool:ralph',
        order: 116,
        text: 'Use the ralph tool ONLY when the direct human explicitly asks for a Ralph loop or fresh-agent iterative execution. Each Ralph round starts a fresh child with no conversation seed and uses the shared workspace as durable memory. Completion and blockers are worker reports, not independent evaluation. Use same-session goal tools for ordinary long-running objectives, and plain subagents or workflows for bounded delegation and fan-out.',
    });
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'ralph',
        description: DESCRIPTION,
        parameters: {
            objective: {
                type: 'string',
                required: true,
                description: 'The immutable completion objective for every fresh Ralph round.',
            },
            maxRounds: {
                type: 'number',
                description: 'Optional positive safe-integer round cap, bounded by the deployment ceiling.',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: RALPH_OUTPUT_PROPERTIES,
            },
            render: function (_args, value) { return [{
                    type: 'text',
                    text: renderResult(value.result, resolved.maxResultChars),
                }]; },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var parent, objective, maxRounds, run, onAbort, settled, error, value;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            parent = exec.agent;
                            if (parent === undefined) {
                                throw new Error('Ralph tool requires a calling agent (exec.agent was undefined)');
                            }
                            objective = args.objective.trim();
                            if (objective.length === 0)
                                throw new Error('Ralph objective must be a non-empty string');
                            maxRounds = resolveMaxRounds(args.maxRounds, resolved.maxRounds);
                            void requireFreshProvider(ctx, resolved.subagentProvider);
                            run = ctx.workflowEngine.start({
                                script: RALPH_SCRIPT,
                                meta: RALPH_META,
                                args: { objective: objective, maxRounds: maxRounds, maxHandoffChars: resolved.maxHandoffChars },
                                subagentProvider: resolved.subagentProvider,
                                maxTotalAgents: maxRounds,
                                parent: parent,
                                signal: exec.signal,
                            });
                            onAbort = function () { run.cancel('parent step aborted'); };
                            exec.signal.addEventListener('abort', onAbort, { once: true });
                            if (exec.signal.aborted)
                                run.cancel('parent step aborted');
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, , 3, 5]);
                            return [4 /*yield*/, run.result];
                        case 2:
                            settled = _a.sent();
                            error = stopReasonError(settled);
                            if (error !== undefined)
                                throw new Error(error);
                            value = readRunResult(settled.value, maxRounds, resolved.maxHandoffChars);
                            if (value.status === 'round-failed')
                                throw new Error(renderRoundFailure(value, resolved.maxResultChars));
                            return [2 /*return*/, {
                                    runId: run.id,
                                    agentsStarted: settled.agentsStarted,
                                    result: value,
                                }];
                        case 3:
                            exec.signal.removeEventListener('abort', onAbort);
                            return [4 /*yield*/, run.dispose()];
                        case 4:
                            _a.sent();
                            return [7 /*endfinally*/];
                        case 5: return [2 /*return*/];
                    }
                });
            });
        },
        presentCall: presentCall,
        presentResult: presentResult,
    }));
}
var templateObject_1;
