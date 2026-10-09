"use strict";
/**
 * The spill-policy PLUGIN: a `tools/post-execute` result transformer that keeps
 * oversized plain-text tool results out of the model's context. When a final
 * result's UTF-8 size exceeds `maxInlineBytes`, it saves the FULL text to a
 * session-scoped spill artifact (`ctx.spillStore`) and replaces the
 * model-facing result with a bounded head/tail preview plus the backend's
 * locator and retrieval guidance.
 *
 * It registers NO service and owns NO storage or preview mechanics: preview is
 * `@z/dsh-output-retention` (`TextRetainer`), storage is `ctx.spillStore`.
 * The policy only decides WHEN to spill and composes the notice.
 *
 * A second arm applies the SAME cap to the durable log: the
 * `tools/code-dispatch-log` waterfall bounds the `tool/code-dispatch` event's
 * copy of an oversized `run_code` sub-call result (the program's value is
 * untouched; UIs and replay read the full text through the spill artifact).
 *
 * ## Deliberately narrow
 *
 * - Omitted `maxInlineBytes` ⇒ the plugin registers nothing (a true no-op).
 * - Plain-text results only: a result carrying any non-text block is left
 *   untouched (the policy knows only the final formatted text, not tool
 *   internals).
 * - Nested composite calls skip the MODEL-facing arm; their durable log copy
 *   is bounded by the dispatch-log arm instead.
 * - Accepted value replacements pass through for registry revalidation and
 *   rendering; this presentation policy cannot also replace content in the
 *   same mutually exclusive decision.
 * - `read` is skipped by the model-facing arm to avoid a
 *   `read → spill → read again` loop; the dispatch-log arm bounds `read`
 *   sub-calls too (a log copy is not model context, and `read` is precisely
 *   the tool that produces huge logs).
 * - Best-effort: no session owner, no `ctx.spillStore` backend, or a save
 *   failure ⇒ log and return the original result. A spill failure must NEVER
 *   turn a successful tool call into an `isError` or hide the inline result.
 *
 * It COMPOSES with other post-execute listeners: its prepended listener
 * delegates via `next()` and bounds the resulting content projection, so
 * tool-owned asynchronous projection runs before generic bounding, a hook that
 * replaced content still has its replacement bounded, and value replacements
 * and `block` decisions pass through unchanged.
 *
 * @module @z/dsh-spill-policy
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
var dsh_output_retention_1 = require("@z/dsh-output-retention");
/** Cordis plugin name used by loader diagnostics. */
exports.name = 'spill-policy';
/** Require the tool registry (its `tools/post-execute` waterfall is the extension point we transform). */
exports.inject = ['tools'];
exports.Config = schemastery_1.default.object({
    maxInlineBytes: schemastery_1.default.number(),
});
/** All-text content flattened to one UTF-8 string, or `undefined` if any block is non-text. */
function flattenPlainText(content) {
    var text = '';
    for (var _i = 0, content_1 = content; _i < content_1.length; _i++) {
        var block = content_1[_i];
        if (block.type !== 'text')
            return undefined;
        text += block.text;
    }
    return text;
}
/** The owning session id, or `undefined` for a call with no agent (a direct/test call). */
function ownerSessionId(exec) {
    var _a;
    return (_a = exec.agent) === null || _a === void 0 ? void 0 : _a.session.header.id;
}
/** Build the bounded head/tail preview for `text`, splitting `budget` bytes across the two ends. */
function preview(text, budget) {
    var headBytes = Math.ceil(budget / 2);
    var tailBytes = Math.floor(budget / 2);
    var retainer = new dsh_output_retention_1.TextRetainer({ kind: 'headTail', headBytes: headBytes, tailBytes: tailBytes });
    retainer.push(text);
    var kept = retainer.finish();
    return { text: kept.text, omitted: kept.omittedBytes };
}
/** The spill-notice line for a given omission + saved reference (no preview, no leading blank line). */
function spillNotice(omitted, ref) {
    var omission = (0, dsh_output_retention_1.describeOmitted)(omitted, 'bytes');
    return "(".concat(omission, " Full formatted result stored at: ").concat(ref.locator, ". ").concat(ref.retrievalHint, ")");
}
function apply(ctx, config) {
    var _this = this;
    var maxInlineBytes = config.maxInlineBytes;
    // Omitted ⇒ no automatic spill policy: register nothing at all.
    if (maxInlineBytes === undefined)
        return;
    // Validate at LOAD, not per call: a negative/fractional cap would reach
    // TextRetainer's assertBudget and throw, turning every oversized-result call
    // into an isError. A bad config must fail the deployment, not the tool.
    if (!Number.isInteger(maxInlineBytes) || maxInlineBytes < 0) {
        throw new Error("spill-policy: maxInlineBytes must be a non-negative integer (got ".concat(maxInlineBytes, ")"));
    }
    // Narrowed once for the nested arms (closure narrowing does not survive awaits).
    var cap = maxInlineBytes;
    /**
     * Spill `text` and build the bounded replacement (preview + notice), or
     * return `undefined` when the policy must keep the original (no session
     * owner, no backend, storage failure, or no within-cap replacement).
     * Shared verbatim by the model-facing post-execute arm and the durable
     * dispatch-log arm so both produce byte-identical projections.
     */
    function spillReplacement(text, totalBytes, sessionId, toolName, callId, label) {
        return __awaiter(this, void 0, void 0, function () {
            var spillStore, save, ref, error_1, reserve, previewBudget, _a, previewText, omitted, notice, replacedText;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (sessionId === undefined) {
                            ctx.logger.warn("spill-policy: no session owner for ".concat(toolName, " ").concat(label, "; keeping the inline content"));
                            return [2 /*return*/, undefined];
                        }
                        spillStore = ctx.get('spillStore');
                        if (!spillStore) {
                            ctx.logger.warn('spill-policy: no ctx.spillStore backend loaded; keeping the inline content');
                            return [2 /*return*/, undefined];
                        }
                        save = {
                            owner: { sessionId: sessionId },
                            source: { toolName: toolName, callId: callId, label: label },
                            suggestedName: "".concat(toolName, ".txt"),
                            content: text,
                        };
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, spillStore.saveText(save)];
                    case 2:
                        ref = _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _b.sent();
                        // Best-effort: a storage failure (permissions, ENOSPC, backend down) must
                        // never fail the call or hide the content — keep the original inline.
                        ctx.logger.warn("spill-policy: saveText failed for ".concat(toolName, ": ").concat(String(error_1), "; keeping the inline content"));
                        return [2 /*return*/, undefined];
                    case 4:
                        reserve = Buffer.byteLength(spillNotice({ kind: 'exact', count: totalBytes }, ref), 'utf8') + 2;
                        previewBudget = Math.max(0, cap - reserve);
                        _a = preview(text, previewBudget), previewText = _a.text, omitted = _a.omitted;
                        notice = spillNotice(omitted, ref);
                        replacedText = previewText.length > 0 ? "".concat(previewText, "\n\n").concat(notice) : notice;
                        // Invariant: the policy NEVER emits a replacement larger than the cap. When
                        // the notice alone exceeds maxInlineBytes (a tiny cap or a long spill root),
                        // there is no within-cap replacement, so keep the inline content — spilling
                        // would break the advertised cap. (A within-cap replacement is always
                        // smaller than the original, which is > cap by the entry condition, so this
                        // one check subsumes "not smaller than the original" too. The spill file
                        // already written is a harmless orphan; cleanup is deferred.)
                        if (Buffer.byteLength(replacedText, 'utf8') > cap) {
                            ctx.logger.warn("spill-policy: spill notice for ".concat(toolName, " exceeds maxInlineBytes; keeping the inline content"));
                            return [2 /*return*/, undefined];
                        }
                        return [2 /*return*/, replacedText];
                }
            });
        });
    }
    ctx.on('tools/post-execute', function (exec, result, next) { return __awaiter(_this, void 0, void 0, function () {
        var decision, content, text, totalBytes, replacedText, replaced;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, next()
                    // Skip `read` to avoid a read → spill → read again loop.
                ];
                case 1:
                    decision = _b.sent();
                    // Skip `read` to avoid a read → spill → read again loop.
                    if (decision.kind !== 'accept' || Object.hasOwn(decision, 'value')
                        || exec.parent !== undefined || exec.name === 'read')
                        return [2 /*return*/, decision];
                    content = (_a = decision.content) !== null && _a !== void 0 ? _a : result.content;
                    text = flattenPlainText(content);
                    if (text === undefined)
                        return [2 /*return*/, decision];
                    totalBytes = Buffer.byteLength(text, 'utf8');
                    if (totalBytes <= maxInlineBytes)
                        return [2 /*return*/, decision];
                    return [4 /*yield*/, spillReplacement(text, totalBytes, ownerSessionId(exec), exec.name, exec.callId, 'result')];
                case 2:
                    replacedText = _b.sent();
                    if (replacedText === undefined)
                        return [2 /*return*/, decision];
                    replaced = [{ type: 'text', text: replacedText }];
                    return [2 /*return*/, __assign({ kind: 'accept', content: replaced }, decision.additionalContexts ? { additionalContexts: decision.additionalContexts } : {})];
            }
        });
    }); }, { prepend: true });
    // The durable-log arm: bound the `tool/code-dispatch` event's copy of an
    // oversized sub-call result the same way the model-facing arm bounds an
    // outer result. The program's returned value is untouched (it already
    // crossed the worker boundary whole); only the session log's copy shrinks
    // to preview + locator, so replay and UIs read the full text through the
    // spill artifact exactly as they do for spilled native results.
    ctx.on('tools/code-dispatch-log', function (dispatch, next) { return __awaiter(_this, void 0, void 0, function () {
        var content, text, totalBytes, replacedText;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, next()
                    // `read` sub-calls spill too: the log copy is not model context, so the
                    // read → spill → read-again loop the post-execute arm avoids cannot
                    // happen here, and read is precisely the tool that produces huge logs.
                ];
                case 1:
                    content = _a.sent();
                    text = flattenPlainText(content);
                    if (text === undefined)
                        return [2 /*return*/, content];
                    totalBytes = Buffer.byteLength(text, 'utf8');
                    if (totalBytes <= maxInlineBytes)
                        return [2 /*return*/, content];
                    return [4 /*yield*/, spillReplacement(text, totalBytes, ownerSessionId(dispatch.exec), dispatch.name, dispatch.subCallId, 'dispatch')];
                case 2:
                    replacedText = _a.sent();
                    if (replacedText === undefined)
                        return [2 /*return*/, content];
                    return [2 /*return*/, [{ type: 'text', text: replacedText }]];
            }
        });
    }); }, { prepend: true });
}
