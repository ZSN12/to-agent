"use strict";
/**
 * Default one-shot summarization and durable checkpoint framing.
 *
 * @module @z/dsh-compaction-basic/summarizer
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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
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
exports.summarizeWithLlm = summarizeWithLlm;
exports.frameSummary = frameSummary;
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
/** Tags wrapping the structured summary inside the landed checkpoint node. */
var SUMMARY_OPEN_TAG = '<compacted-summary>';
var SUMMARY_CLOSE_TAG = '</compacted-summary>';
/**
 * The summarization directive, delivered as the FINAL user message after the
 * replayed conversation rather than as a distinct summarizer system prompt.
 * Keeping the conversation's own system prompt, tools, and message prefix in
 * front of it makes the auxiliary call a genuine prefix of the last routed
 * request, so the provider's KV cache is reused instead of invalidated.
 */
var COMPACTION_INSTRUCTION = [
    'You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.',
    '',
    'Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not prose paragraphs. Write "(none)" for an empty section — never drop a section.',
    '',
    '## Primary Request and Intent',
    "- [the user's original and evolving goals; quote verbatim where the exact wording matters]",
    '',
    '## Key Technical Concepts',
    '- [technologies, frameworks, patterns, and conventions in play]',
    '',
    '## Files and Code',
    '- [exact path: why it matters, key changes or snippets]',
    '',
    '## Errors and Fixes',
    '- [error: how it was resolved, plus any related user feedback]',
    '',
    '## Pending Jobs',
    '- [explicitly requested work not yet completed]',
    '',
    '## Current Work',
    '- [precisely what was in progress at this checkpoint]',
    '',
    '## Next Step',
    '- [the single next action, directly in line with the most recent request, or "(none)"]',
    '',
    '## Critical Context',
    '- [decisions and their rationale, constraints, user preferences, open questions, data needed to continue]',
    '',
    'Rules:',
    '- Write concise English engineering prose. Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.',
    '- Capture user feedback and explicit instructions faithfully, especially corrections.',
    '- Do NOT mention this summarization request or that the context was compacted.',
    '- Output only the checkpoint text: do not call any tool or take any other action.',
    "- If the conversation already contains a ".concat(SUMMARY_OPEN_TAG, " block, it is a PRIOR checkpoint. Do not copy it forward verbatim: preserve still-true facts, drop stale ones, and merge newer information into a single consolidated summary under the same structure."),
].join('\n');
/** Framing that makes the replacement user message established context. */
var CHECKPOINT_PREAMBLE = 'This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.';
/** TaskWeaver desktop may inject a summarization route from models.json (overrides preset/chat). */
function readTaskWeaverCompactionTarget() {
    var _a, _b;
    if (!(0, dsh_home_paths_1.taskweaverEmbeddedFromEnv)())
        return undefined;
    var provider = (_a = process.env.TASKWEAVER_COMPACTION_SUMMARIZATION_PROVIDER) === null || _a === void 0 ? void 0 : _a.trim();
    var model = (_b = process.env.TASKWEAVER_COMPACTION_SUMMARIZATION_MODEL) === null || _b === void 0 ? void 0 : _b.trim();
    if (provider === undefined || provider.length === 0 || model === undefined || model.length === 0) {
        return undefined;
    }
    return { provider: provider, model: model };
}
/**
 * Run the default cache-reusing `ctx.llm.stream()` summarization call: replay
 * the conversation prefix, then append the compaction instruction as the final
 * user message so the provider's warm prefix cache is reused.
 * @param ctx - context providing the LLM service.
 * @param config - resolved backend configuration.
 * @param input - replayed conversation prefix (system, tools, and leading messages) to condense.
 * @param agent - supplies routed-model history, fallback model, and session id.
 * @param signal - optional cancellation forwarded to the adapter.
 * @returns safe text-only summary blocks and the exact call envelope and output.
 */
function summarizeWithLlm(ctx, config, input, agent, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var latest, configured, agentTarget, target, assembler, messages, options, _a, _b, _c, chunk, e_1_1, error, rawOutput, summary;
        var _d, e_1, _e, _f;
        var _g, _h, _j, _k;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    latest = (_g = agent.session.requestHeader()) === null || _g === void 0 ? void 0 : _g.config;
                    configured = config.summarizationProvider.length === 0
                        ? undefined
                        : { provider: config.summarizationProvider, model: config.summarizationModel };
                    agentTarget = agent.options.provider !== undefined
                        && agent.options.provider.length > 0
                        && agent.options.model !== undefined
                        && agent.options.model.length > 0
                        ? { provider: agent.options.provider, model: agent.options.model }
                        : undefined;
                    target = (_k = (_j = (_h = readTaskWeaverCompactionTarget()) !== null && _h !== void 0 ? _h : configured) !== null && _j !== void 0 ? _j : latest) !== null && _k !== void 0 ? _k : agentTarget;
                    if (target === undefined) {
                        throw new Error('no provider/model available for summarization: set both BasicCompactionConfig summarization fields, route one request, or set both AgentOptions fields');
                    }
                    assembler = new dsh_llm_1.BlockAssembler();
                    messages = __spreadArray(__spreadArray([], input.messages, true), [
                        (0, dsh_llm_1.createUserMessage)({
                            content: [{ type: 'text', text: COMPACTION_INSTRUCTION }],
                            source: { kind: 'plugin', plugin: 'dsh-compaction-basic' },
                        }),
                    ], false);
                    options = __assign(__assign(__assign(__assign({ provider: target.provider, model: target.model, messages: messages }, input.system === undefined ? {} : { system: input.system }), input.tools === undefined ? {} : { tools: __spreadArray([], input.tools, true) }), { maxTokens: config.maxTokens, sessionId: agent.session.id, purpose: 'compaction' }), signal === undefined ? {} : { signal: signal });
                    _l.label = 1;
                case 1:
                    _l.trys.push([1, 6, 7, 12]);
                    _a = true, _b = __asyncValues(ctx.llm.stream(options));
                    _l.label = 2;
                case 2: return [4 /*yield*/, _b.next()];
                case 3:
                    if (!(_c = _l.sent(), _d = _c.done, !_d)) return [3 /*break*/, 5];
                    _f = _c.value;
                    _a = false;
                    chunk = _f;
                    assembler.push(chunk);
                    _l.label = 4;
                case 4:
                    _a = true;
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 12];
                case 6:
                    e_1_1 = _l.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 12];
                case 7:
                    _l.trys.push([7, , 10, 11]);
                    if (!(!_a && !_d && (_e = _b.return))) return [3 /*break*/, 9];
                    return [4 /*yield*/, _e.call(_b)];
                case 8:
                    _l.sent();
                    _l.label = 9;
                case 9: return [3 /*break*/, 11];
                case 10:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 11: return [7 /*endfinally*/];
                case 12:
                    error = finishError(assembler.finish);
                    if (error !== undefined)
                        throw error;
                    rawOutput = assembler.blocks();
                    summary = summaryText(rawOutput);
                    if (!summary.some(function (block) { return block.text.trim().length > 0; })) {
                        throw new Error('summarization produced no text summary content');
                    }
                    return [2 /*return*/, __assign({ summary: summary, rawOutput: rawOutput, llmStreamCall: true, provider: options.provider, model: options.model, maxTokens: config.maxTokens }, (assembler.usage === undefined ? {} : { usage: assembler.usage }))];
            }
        });
    });
}
/**
 * Wrap raw summary blocks in the durable checkpoint framing.
 * @param summary - safe text-only model output.
 * @returns content for the synthesized replacement user message.
 */
function frameSummary(summary) {
    return __spreadArray(__spreadArray([
        { type: 'text', text: "".concat(CHECKPOINT_PREAMBLE, "\n\n").concat(SUMMARY_OPEN_TAG) }
    ], summary, true), [
        { type: 'text', text: SUMMARY_CLOSE_TAG },
    ], false);
}
/** Map a terminal summarization finish to its fail-closed error. */
function finishError(finish) {
    switch (finish.kind) {
        case 'error':
        case 'aborted': {
            var error = new Error(finish.failure.message);
            error.code = finish.failure.code;
            return error;
        }
        case 'max-tokens': {
            var error = new Error('summarization truncated at the token cap (incomplete checkpoint)');
            error.code = 'MAX_TOKENS';
            return error;
        }
        default:
            return undefined;
    }
}
/** Reject visual output and keep only text before synthesizing a user message. */
function summaryText(blocks) {
    if ((0, dsh_llm_1.contentHasImage)(blocks)) {
        throw new dsh_llm_1.LlmError('compaction summary cannot contain image output', 'UNSUPPORTED_CONTENT');
    }
    return blocks.filter(function (block) { return block.type === 'text'; });
}
