"use strict";
/**
 * The model-facing `grep` tool: search file contents with a ripgrep regular
 * expression. Execution spawns the packaged ripgrep binary
 * (`@vscode/ripgrep`) directly through the subprocess seam with a plain argv
 * vector using a fixed line-oriented `rg --json` command so file path, line
 * number, and line text parse without colon-splitting ambiguity — this module
 * owns the model-facing schema, argument validation, argv construction,
 * `--json` record parsing, per-line preview retention, match retention,
 * grouping, and formatting; process concerns stay behind `ctx.subprocess`.
 *
 * @module @z/dsh-tool-fs-search/grep
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
exports.GREP_MAX_LINE_BYTES = exports.GREP_MAX_MATCHES = void 0;
exports.parseGrepArgs = parseGrepArgs;
exports.buildGrepCommand = buildGrepCommand;
exports.parseGrepMatches = parseGrepMatches;
exports.formatGrepMatches = formatGrepMatches;
exports.formatGrepOutput = formatGrepOutput;
exports.presentGrepCall = presentGrepCall;
exports.presentGrepResult = presentGrepResult;
exports.applyGrepTool = applyGrepTool;
var dsh_tools_1 = require("@z/dsh-tools");
var search_core_ts_1 = require("./search-core.ts");
var presentation_ts_1 = require("./presentation.ts");
var direct_call_ts_1 = require("./direct-call.ts");
var search_scope_ts_1 = require("./search-scope.ts");
/**
 * Default cap on flat matches retained inline by one `grep` call (the
 * `grepMaxMatches` config), matching Claude Code's default `GrepTool`
 * `head_limit`.
 */
exports.GREP_MAX_MATCHES = 250;
/**
 * Default cap in bytes on one matched-line preview (the `grepMaxLineBytes`
 * config); the cut preserves UTF-8 boundaries.
 */
exports.GREP_MAX_LINE_BYTES = 2000;
/**
 * Reject an `include` that is not ONE positive glob filter: blank strings,
 * negated patterns (`!…`), and comma-separated lists. A comma inside a brace
 * group is fine — `*.{ts,tsx}` is one glob with alternation, not a list.
 */
function validateInclude(include) {
    if (include.trim().length === 0)
        throw new Error('include must be a non-empty glob when given');
    if (include.startsWith('!'))
        throw new Error('include must be a positive glob filter; negated patterns ("!…") are not supported');
    var braceDepth = 0;
    for (var _i = 0, include_1 = include; _i < include_1.length; _i++) {
        var char = include_1[_i];
        if (char === '{')
            braceDepth++;
        else if (char === '}')
            braceDepth = Math.max(0, braceDepth - 1);
        else if (char === ',' && braceDepth === 0) {
            throw new Error('include must be one glob, not a comma-separated list (use {a,b} alternation instead)');
        }
    }
}
/**
 * Validate value constraints the schema DSL can't express: a non-EMPTY
 * `pattern` (whitespace is a legitimate regex), a non-blank `path` when given,
 * and a single positive `include` glob ({@link GrepInput}). Throws a plain
 * `Error` (an ordinary tool argument error) otherwise.
 *
 * @param args - the schema-validated `grep` arguments.
 * @returns the accepted input, unchanged.
 */
function parseGrepArgs(args) {
    if (args.pattern.length === 0)
        throw new Error('pattern must be a non-empty string');
    if (args.path !== undefined && args.path.trim().length === 0)
        throw new Error('path must be a non-empty string when given');
    if (args.include !== undefined)
        validateInclude(args.include);
    return __assign(__assign(__assign({ pattern: args.pattern }, args.path !== undefined ? { path: args.path } : {}), args.include !== undefined ? { include: args.include } : {}), args.includeExcluded !== undefined ? { includeExcluded: args.includeExcluded } : {});
}
/**
 * Build the fixed line-oriented `rg --json` argv for one `grep` call. Every
 * model-controlled value ({@link GrepInput.pattern}, {@link GrepInput.path},
 * {@link GrepInput.include}) is a plain argv element — no shell layer exists,
 * so no quoting applies; the pattern and include ride in `--flag=value` form
 * and the target behind `--`, so a leading-dash value can never be parsed as
 * a flag.
 *
 * @param input - the validated arguments.
 * @returns the complete ripgrep argument vector (excluding the binary itself).
 */
function buildGrepCommand(input, excludeDirectories) {
    if (excludeDirectories === void 0) { excludeDirectories = []; }
    var parts = ['--json', "--regexp=".concat(input.pattern)];
    if (input.include !== undefined)
        parts.push("--glob=".concat(input.include));
    if (input.includeExcluded && excludeDirectories.length) {
        parts.push.apply(parts, __spreadArray(['--no-ignore', '--hidden'], (0, search_scope_ts_1.searchExclusionArgs)(search_scope_ts_1.VCS_DIRECTORIES), false));
    }
    parts.push.apply(parts, (0, search_scope_ts_1.searchExclusionArgs)(excludeDirectories, input.includeExcluded));
    if (input.path !== undefined)
        parts.push('--', input.path);
    return parts;
}
/**
 * The uniform malformed-output failure: raw `rg --json` is an internal
 * transport, so missing or invalid response fields cause a search failure, not a partial result.
 */
function malformedRecord(detail, cause) {
    return new search_core_ts_1.SearchError("grep received malformed ripgrep --json output (".concat(detail, ")"), 'SEARCH_FAILED', cause !== undefined ? { cause: cause } : undefined);
}
/**
 * Parse one `rg --json` NDJSON line into a match, `undefined` for the
 * non-match record types (`begin`/`end`/`context`/`summary`). A line that is
 * not JSON, or a `match` record missing its path / line number / line content,
 * throws {@link SearchError} `SEARCH_FAILED`. A match whose line is not valid
 * UTF-8 (ripgrep sends base64 `bytes` instead of `text`) yields a placeholder
 * preview rather than failing the whole search.
 */
function parseRecord(line) {
    var parsed;
    try {
        parsed = JSON.parse(line);
    }
    catch (error) {
        throw malformedRecord('a line is not JSON', error);
    }
    if (typeof parsed !== 'object' || parsed === null)
        throw malformedRecord('a record is not an object');
    var record = parsed;
    // Non-match record types (begin/end/context/summary — and any future type)
    // are transport framing, not results: skipped, not malformed.
    if (record.type !== 'match')
        return undefined;
    if (typeof record.data !== 'object' || record.data === null)
        throw malformedRecord('a match record has no data');
    var data = record.data;
    var pathText = typeof data.path === 'object' && data.path !== null ? data.path.text : undefined;
    if (typeof pathText !== 'string')
        throw malformedRecord('a match record has no path text');
    if (typeof data.line_number !== 'number')
        throw malformedRecord('a match record has no line number');
    if (typeof data.lines !== 'object' || data.lines === null)
        throw malformedRecord('a match record has no line content');
    var lines = data.lines;
    if (typeof lines.text === 'string') {
        return { path: pathText, lineNumber: data.line_number, line: lines.text.replace(/\r?\n$/, '') };
    }
    if (typeof lines.bytes === 'string') {
        return { path: pathText, lineNumber: data.line_number, line: '(line is not valid UTF-8)' };
    }
    throw malformedRecord('a match record has neither line text nor bytes');
}
/**
 * Parse complete `rg --json` stdout into flat matches, in output order (ripgrep
 * emits one file's matches contiguously). Only `match` records are consumed.
 *
 * @param stdout - the complete raw `rg --json` stdout.
 * @returns the flat matches; empty for output with no match records.
 */
function parseGrepMatches(stdout) {
    var matches = [];
    for (var _i = 0, _a = stdout.split('\n'); _i < _a.length; _i++) {
        var line = _a[_i];
        if (line.length === 0)
            continue;
        var match = parseRecord(line);
        if (match !== undefined)
            matches.push(match);
    }
    return matches;
}
/** `match` / `matches` for a count. */
function matchNoun(count) {
    return count === 1 ? 'match' : 'matches';
}
/**
 * Group flat matches by file (first-seen order) into the model-facing body:
 * each file's display path, then one `Line N: <text>` row per match.
 *
 * @param matches - the flat matches to render.
 * @returns the grouped body text.
 */
function formatGrepMatches(matches) {
    var byFile = new Map();
    for (var _i = 0, matches_1 = matches; _i < matches_1.length; _i++) {
        var match = matches_1[_i];
        var group = byFile.get(match.path);
        if (group !== undefined)
            group.push(match);
        else
            byFile.set(match.path, [match]);
    }
    var sections = [];
    for (var _a = 0, byFile_1 = byFile; _a < byFile_1.length; _a++) {
        var _b = byFile_1[_a], path = _b[0], group = _b[1];
        sections.push("".concat(path, "\n").concat(group.map(function (m) { return "Line ".concat(m.lineNumber, ": ").concat(m.line); }).join('\n')));
    }
    return sections.join('\n\n');
}
/**
 * Format the model-facing `grep` result: a found-count header, the retained
 * matches grouped by file, then — when the result was capped — a footer
 * carrying either the formatted-spill recovery locator or the could-not-save
 * explanation. The omitted count is a budget fact: the search itself completed.
 *
 * @param retained - the retention outcome over every parsed match.
 * @param spillRef - the saved complete-result reference, or `undefined` when unsaved.
 * @returns the model-facing text.
 */
function formatGrepOutput(retained, spillRef) {
    var header = retained.truncated
        ? "Found ".concat(retained.kept, " of ").concat(retained.seen, " matches")
        : "Found ".concat(retained.seen, " ").concat(matchNoun(retained.seen));
    var body = formatGrepMatches(retained.items);
    if (!retained.truncated)
        return "".concat(header, "\n\n").concat(body);
    var recovery = spillRef !== undefined
        ? "Full grep result stored at: ".concat(spillRef.locator, ". ").concat(spillRef.retrievalHint)
        : 'The complete result could not be saved; narrow pattern, path, or include to see more.';
    return "".concat(header, "\n\n").concat(body, "\n\n(").concat(recovery, ")");
}
/** Format one already-retained match list for the Native surface. */
function formatRetainedGrep(retained, spillRef) {
    if (retained.seen === 0)
        return 'No matches found';
    return formatGrepOutput(retained, spillRef);
}
/**
 * Pending-call presentation: a search card titled by the pattern (and target /
 * include filter).
 *
 * @param args - the raw tool arguments; `pattern`, `path`, and `include` feed the title.
 * @returns the generic card view (`kind: 'search'`) shown while the call runs.
 */
function presentGrepCall(args) {
    var where = args.path !== undefined ? " in ".concat(args.path) : '';
    var filter = args.include !== undefined ? " (".concat(args.include, ")") : '';
    return { card: 'generic', title: "Grep ".concat(args.pattern).concat(where).concat(filter), kind: 'search', rawInput: args.pattern };
}
/**
 * Completed-call presentation: the search card projected from the result's
 * `presentationMeta` (matches grouped by file, with the truncation signal). A UI
 * without a search card falls back to the raw `tool/result` content, so the view
 * carries no result text of its own. Malformed or absent metadata (an obsolete or
 * hand-edited replayed log) falls back to the generic card.
 *
 * @param _args - the raw tool arguments; unused, the view derives from the result.
 * @param result - the final model-facing tool result carrying the projected metadata.
 * @returns the search card view, or `undefined` for the generic fallback.
 */
function presentGrepResult(_args, result) {
    if (result.isError)
        return undefined;
    var view = (0, presentation_ts_1.searchViewFromMeta)(result.meta);
    if (view === undefined || view.shape !== 'matches')
        return undefined;
    return view;
}
/**
 * Register the `grep` tool and its system-prompt guidance.
 *
 * @param ctx - the plugin context; registrations are effects scoped to it, and
 *   execution uses its `subprocess` service.
 * @param caps - the deployment's resolved grep caps (plugin config after defaulting).
 */
function applyGrepTool(ctx, caps) {
    var _this = this;
    var _a;
    var scopeGuidance = (0, search_scope_ts_1.searchScopeGuidance)((_a = caps.excludeDirectories) !== null && _a !== void 0 ? _a : []);
    ctx.systemPrompt.section({
        name: 'tool:grep',
        order: 104,
        text: 'Use the grep tool — not shell grep or rg — to search file contents. Use read on a matched file when you need surrounding context.' + scopeGuidance,
    });
    var tool = (0, dsh_tools_1.defineTool)({
        name: 'grep',
        description: 'Search file contents with a ripgrep regular expression. Returns matching lines with line numbers, grouped by file. '
            + "Returns the first ".concat(caps.maxMatches, " matches inline; a capped result reports where the complete match list was saved. ")
            + 'Use read on a matched file for surrounding context.' + scopeGuidance,
        parameters: {
            pattern: { type: 'string', required: true, description: 'Regular expression to search for (ripgrep syntax).' },
            path: { type: 'string', description: 'File or directory to search. Defaults to the session workspace; a relative path resolves against it.' },
            include: { type: 'string', description: 'One glob filter for which files to search (e.g. "*.ts", "*.{js,jsx}"). Not a list; negation is not supported.' },
            includeExcluded: { type: 'boolean', description: 'Include deployment-excluded dependency/build directories. Use only with a narrow path when inspecting those files intentionally.' },
        },
        timeoutMs: caps.timeoutMs,
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    matches: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                path: { type: 'string', required: true },
                                lineNumber: { type: 'integer', required: true },
                                line: { type: 'string', required: true },
                            },
                        },
                    },
                },
            },
            render: function (_args, value) { return [{
                    type: 'text',
                    text: formatRetainedGrep((0, search_core_ts_1.retainGrepMatches)(value.matches, caps.maxMatches, caps.maxLineBytes)),
                }]; },
            presentationMeta: function (_args, value) {
                return (0, presentation_ts_1.grepSearchMeta)((0, search_core_ts_1.retainGrepMatches)(value.matches, caps.maxMatches, caps.maxLineBytes), caps.maxMetaBytes);
            },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var input, run, all, _i, _a, raw, match;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            input = parseGrepArgs(args);
                            return [4 /*yield*/, (0, search_core_ts_1.runRipgrep)(ctx, exec, 'grep', buildGrepCommand(input, caps.excludeDirectories), caps.rawOutputMaxBytes, caps.graceMs, caps.stderrMaxBytes)];
                        case 1:
                            run = _b.sent();
                            if (run.noMatches)
                                return [2 /*return*/, { matches: [] }];
                            all = [];
                            for (_i = 0, _a = parseGrepMatches(run.stdout); _i < _a.length; _i++) {
                                raw = _a[_i];
                                match = {
                                    path: (0, search_core_ts_1.toWorkdirRelative)(raw.path, run.workdir),
                                    lineNumber: raw.lineNumber,
                                    line: raw.line,
                                };
                                all.push(match);
                            }
                            return [2 /*return*/, { matches: all }];
                    }
                });
            });
        },
        presentCall: presentGrepCall,
        presentResult: presentGrepResult,
    });
    ctx.tools.register(tool);
    ctx.on('tools/post-execute', function (exec, result, next) { return __awaiter(_this, void 0, void 0, function () {
        var decision, value, matches, previewedAll, spillRef;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, next()];
                case 1:
                    decision = _a.sent();
                    value = (0, direct_call_ts_1.acceptedDirectCallValue)(ctx, tool, exec, result, decision);
                    if (value === undefined)
                        return [2 /*return*/, decision];
                    matches = value.matches;
                    if (matches.length <= caps.maxMatches)
                        return [2 /*return*/, decision
                            // The spill artifact holds the COMPLETE result: preview each line, but keep
                            // every match (no inline cap), so the recovery file is the full search.
                        ];
                    previewedAll = matches.map(function (match) { return (__assign(__assign({}, match), { line: (0, search_core_ts_1.previewLine)(match.line, caps.maxLineBytes) })); });
                    return [4 /*yield*/, (0, search_core_ts_1.trySaveFormattedResult)(ctx, exec, 'grep-results.txt', "Found ".concat(matches.length, " ").concat(matchNoun(matches.length), "\n\n").concat(formatGrepMatches(previewedAll)))];
                case 2:
                    spillRef = _a.sent();
                    return [2 /*return*/, __assign({ kind: 'accept', content: [{
                                    type: 'text',
                                    text: formatRetainedGrep((0, search_core_ts_1.retainGrepMatches)(matches, caps.maxMatches, caps.maxLineBytes), spillRef),
                                }] }, decision.additionalContexts !== undefined ? { additionalContexts: decision.additionalContexts } : {})];
            }
        });
    }); });
}
