"use strict";
/**
 * The model-facing `web_search` tool: discover current information on the web.
 * Execution goes through `ctx.web` — this module owns only the model-facing
 * schema, argument validation, the result-count bound, and result formatting,
 * never provider selection or network access.
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
exports.WEB_SEARCH_MAX_QUERIES = exports.WEB_SEARCH_MAX_RESULTS = void 0;
exports.parseSearchArgs = parseSearchArgs;
exports.formatSearchOutput = formatSearchOutput;
exports.presentSearchCall = presentSearchCall;
exports.searchMetaFromValue = searchMetaFromValue;
exports.searchMetaFromResult = searchMetaFromResult;
exports.presentSearchResult = presentSearchResult;
exports.applyWebSearchTool = applyWebSearchTool;
var dsh_tools_1 = require("@z/dsh-tools");
/**
 * Default upper bound on returned sources (the `searchMaxResults` config).
 * Owned by the consumer (not the provider or model), mirroring `dsh-tool-fs`'s
 * `READ_LIMIT`. The model just asks a question; the product controls how much
 * context returns. The default `8` aligns with OpenCode's Exa default.
 */
exports.WEB_SEARCH_MAX_RESULTS = 8;
/** Default upper bound on concurrent searches in one tool call. */
exports.WEB_SEARCH_MAX_QUERIES = 4;
/**
 * Validate value constraints the schema DSL can't express: `queries` is
 * non-empty, contains only non-blank strings, and fits the deployment's
 * query-count bound. Exact duplicate strings are collapsed after the bound
 * check. Throws a plain `Error` otherwise.
 *
 * @param args - the schema-validated `web_search` arguments.
 * @param maxQueries - the deployment's upper bound on queries in one call.
 * @returns the accepted queries in their first-occurrence order.
 */
function parseSearchArgs(args, maxQueries) {
    var queries = args.queries;
    if (queries.length === 0)
        throw new Error('queries must contain at least one query');
    if (queries.length > maxQueries) {
        var noun = maxQueries === 1 ? 'query' : 'queries';
        throw new Error("queries must contain at most ".concat(maxQueries, " ").concat(noun));
    }
    if (queries.some(function (query) { return query.trim().length === 0; }))
        throw new Error('each query must be a non-empty string');
    return __spreadArray([], new Set(queries), true);
}
/** Display label for a source: its title, else its hostname. */
function sourceLabel(url, title) {
    if (title !== undefined && title.length > 0)
        return title;
    try {
        return new URL(url).hostname;
    }
    catch (_a) {
        // A provider should return a valid URL, but never let a malformed one throw
        // out of pure formatting — fall back to the raw string.
        return url;
    }
}
/**
 * Format a search result as one model-facing text block.
 *
 * @param result - the seam's search outcome.
 * @returns the provider answer (when any), a markdown source list with snippet
 *   and date metadata (or `No results found.`), a refine-the-query note when
 *   truncated, and a standing cite-your-sources instruction.
 */
function formatSearchOutput(result) {
    var parts = [];
    if (result.content !== undefined && result.content.length > 0)
        parts.push(result.content);
    if (result.sources.length > 0) {
        var lines = result.sources.map(function (source) {
            var label = sourceLabel(source.url, source.title);
            var meta = [];
            if (source.snippet !== undefined && source.snippet.length > 0)
                meta.push(source.snippet);
            if (source.publishedAt !== undefined && source.publishedAt.length > 0)
                meta.push("(".concat(source.publishedAt, ")"));
            var suffix = meta.length > 0 ? " \u2014 ".concat(meta.join(' ')) : '';
            return "- [".concat(label, "](").concat(source.url, ")").concat(suffix);
        });
        parts.push("Sources:\n".concat(lines.join('\n')));
    }
    else if (result.content === undefined || result.content.length === 0) {
        parts.push('No results found.');
    }
    if (result.truncated)
        parts.push("(Showing the first ".concat(result.sources.length, " sources. Refine the query for more.)"));
    parts.push('Cite the relevant URLs above as markdown links in your answer.');
    return parts.join('\n\n');
}
/**
 * Pending-call presentation: a search card titled by the query list.
 *
 * @param args - the raw tool arguments; only the query text feeds the view.
 * @returns the generic card view (`kind: 'search'`) shown while the call runs.
 */
function presentSearchCall(args) {
    var title = args.queries.join(', ');
    return { card: 'generic', title: title, kind: 'search', rawInput: title };
}
/**
 * Project one seam source into a plain object that omits every absent optional
 * field. Shared by the canonical `execute` result and its replayable
 * presentation meta so both carry byte-identical source shapes.
 *
 * @param source - one source from the `ctx.web` search outcome.
 * @returns `{ url }` plus each present optional field.
 */
function projectSource(source) {
    return __assign(__assign(__assign({ url: source.url }, source.title !== undefined ? { title: source.title } : {}), source.snippet !== undefined ? { snippet: source.snippet } : {}), source.publishedAt !== undefined ? { publishedAt: source.publishedAt } : {});
}
/**
 * Project a validated `web_search` output value into its replayable
 * presentation meta ({@link WebSearchMeta} as opaque JSON).
 *
 * @param value - the canonical `web_search` output value (the seam's result shape).
 * @returns the structured sources, the truncation flag, and the answer when present.
 */
function searchMetaFromValue(value) {
    return __assign({ sources: value.sources.map(projectSource), truncated: value.truncated }, value.content !== undefined ? { answer: value.content } : {});
}
/** Whether `value` is a valid {@link WebSource} (defensive narrowing from opaque `meta`). */
function isWebSource(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    var _a = value, url = _a.url, title = _a.title, snippet = _a.snippet, publishedAt = _a.publishedAt;
    return typeof url === 'string'
        && (title === undefined || typeof title === 'string')
        && (snippet === undefined || typeof snippet === 'string')
        && (publishedAt === undefined || typeof publishedAt === 'string');
}
/**
 * Narrow opaque live or replayed result metadata to a {@link WebSearchMeta}.
 * Malformed metadata returns `undefined` so presentation can fall back to the
 * generic card instead of throwing during replay.
 *
 * @param meta - result metadata.
 * @returns the validated search meta, or `undefined` for absent or malformed data.
 */
function searchMetaFromResult(meta) {
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta))
        return undefined;
    var _a = meta, sources = _a.sources, truncated = _a.truncated, answer = _a.answer;
    if (!Array.isArray(sources) || !sources.every(isWebSource))
        return undefined;
    if (typeof truncated !== 'boolean')
        return undefined;
    if (answer !== undefined && typeof answer !== 'string')
        return undefined;
    return __assign({ sources: sources, truncated: truncated }, answer !== undefined ? { answer: answer } : {});
}
/**
 * Completed-call presentation: a `web` search card carrying the faithful
 * structured sources from `meta`. It sets no `content` copy — a UI without the
 * `web` capability falls back to the raw `tool/result` content, which is the
 * same text (see the web-result-card Agent Note).
 *
 * @param args - the raw tool arguments; the queries become the result-state
 *   title so a window-truncated replay that dropped the call head still has one.
 * @param result - the final model-facing tool result; `meta` carries the sources.
 * @returns the search result view, or `undefined` (generic card) on failure or
 *   malformed meta.
 */
function presentSearchResult(args, result) {
    if (result.isError)
        return undefined;
    var meta = searchMetaFromResult(result.meta);
    if (meta === undefined)
        return undefined;
    return __assign({ card: 'web', kind: 'search', title: args.queries.join(', '), sources: meta.sources, truncated: meta.truncated }, meta.answer !== undefined ? { answer: meta.answer } : {});
}
/**
 * Run one or more searches through the web seam. A single query keeps the
 * provider's exact result; multiple queries run concurrently and are merged
 * into one normalized result capped at `maxResults`. A failed search aborts
 * its siblings, and this function waits for every search to settle before
 * rethrowing the first failure.
 *
 * @param ctx - context whose `web` service performs the searches.
 * @param queries - validated non-empty queries.
 * @param maxResults - the deployment's source cap for the combined result.
 * @param signal - cancellation signal forwarded to every search.
 * @returns the combined search result.
 */
function runSearchQueries(ctx, queries, maxResults, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var controller, batchSignal, firstFailure, results, searches;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (queries.length === 1) {
                        return [2 /*return*/, ctx.web.search({ query: queries[0], maxResults: maxResults }, signal)];
                    }
                    controller = new AbortController();
                    batchSignal = AbortSignal.any([signal, controller.signal]);
                    results = [];
                    searches = queries.map(function (query, index) { return __awaiter(_this, void 0, void 0, function () {
                        var _a, _b, error_1;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    _c.trys.push([0, 2, , 3]);
                                    _a = results;
                                    _b = index;
                                    return [4 /*yield*/, ctx.web.search({ query: query, maxResults: maxResults }, batchSignal)];
                                case 1:
                                    _a[_b] = _c.sent();
                                    return [3 /*break*/, 3];
                                case 2:
                                    error_1 = _c.sent();
                                    if (firstFailure === undefined)
                                        firstFailure = { error: error_1 };
                                    controller.abort(error_1);
                                    throw error_1;
                                case 3: return [2 /*return*/];
                            }
                        });
                    }); });
                    return [4 /*yield*/, Promise.allSettled(searches)];
                case 1:
                    _a.sent();
                    if (firstFailure !== undefined)
                        throw firstFailure.error;
                    return [2 /*return*/, mergeSearchResults(queries, results, maxResults)];
            }
        });
    });
}
/** Merge per-query results into one deduplicated, round-robin, capped result. */
function mergeSearchResults(queries, results, maxResults) {
    var seen = new Set();
    var sources = [];
    var sourceRanks = 0;
    for (var _i = 0, results_1 = results; _i < results_1.length; _i++) {
        var result = results_1[_i];
        sourceRanks = Math.max(sourceRanks, result.sources.length);
    }
    var droppedSource = false;
    merge: for (var rank = 0; rank < sourceRanks; rank++) {
        for (var _a = 0, results_2 = results; _a < results_2.length; _a++) {
            var result = results_2[_a];
            var source = result.sources[rank];
            if (source !== undefined && !seen.has(source.url)) {
                seen.add(source.url);
                if (sources.length === maxResults) {
                    droppedSource = true;
                    break merge;
                }
                sources.push(source);
            }
        }
    }
    var contents = results.flatMap(function (result, index) {
        if (result.content === undefined || result.content.length === 0)
            return [];
        return ["### ".concat(queries[index], "\n\n").concat(result.content)];
    });
    return __assign(__assign({}, contents.length > 0 ? { content: contents.join('\n\n') } : {}), { sources: sources, truncated: results.some(function (result) { return result.truncated; }) || droppedSource });
}
/**
 * Register the `web_search` tool and its system-prompt guidance.
 *
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the
 *   registrations; both are effect-scoped and unregister on plugin dispose.
 * @param maxResults - the deployment's source cap, sent as every seam
 *   request's `maxResults`.
 * @param maxQueries - the deployment's query cap enforced before provider calls.
 * @param timeoutMs - the cooperative tool-call budget (ms) attached as the tool's
 *   `ToolDefinition.timeoutMs` for `@z/dsh-tool-call-timeout-policy` to enforce.
 * @param fetchEnabled - whether the same composition exposes `web_fetch`, which
 *   controls whether search guidance may recommend that follow-up tool.
 */
function applyWebSearchTool(ctx, maxResults, maxQueries, timeoutMs, fetchEnabled) {
    ctx.systemPrompt.section({
        name: 'tool:web_search',
        order: 110,
        text: fetchEnabled
            ? "Use the web_search tool to discover current information on the web. The required queries array accepts 1\u2013".concat(maxQueries, " non-empty search queries; use a one-item array for a single search. It returns an optional answer plus a list of source URLs. Follow up with web_fetch when you need the full content of a specific result, and cite the relevant URLs as markdown links.")
            : "Use the web_search tool to discover current information on the web. The required queries array accepts 1\u2013".concat(maxQueries, " non-empty search queries; use a one-item array for a single search. It returns an optional answer plus a list of source URLs. Use the returned source snippets when available, and cite the relevant URLs as markdown links."),
    });
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'web_search',
        description: "Search the web for current information. Provide 1\u2013".concat(maxQueries, " queries in the required queries array. Returns an optional summary answer and a list of source URLs."),
        parameters: {
            queries: {
                type: 'array',
                required: true,
                items: { type: 'string' },
                description: "Required search queries; accepts 1\u2013".concat(maxQueries, " items and merges their results."),
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    content: { type: 'string' },
                    sources: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                url: { type: 'string', required: true },
                                title: { type: 'string' },
                                snippet: { type: 'string' },
                                publishedAt: { type: 'string' },
                            },
                        },
                    },
                    truncated: { type: 'boolean', required: true },
                },
            },
            render: function (_args, value) { return [{ type: 'text', text: formatSearchOutput(value) }]; },
            presentationMeta: function (_args, value) { return searchMetaFromValue(value); },
        },
        timeoutMs: timeoutMs,
        // Provider reads do not mutate parent-agent state.
        isConcurrencySafe: function () { return true; },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var queries, result;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            queries = parseSearchArgs(args, maxQueries);
                            return [4 /*yield*/, runSearchQueries(ctx, queries, maxResults, exec.signal)];
                        case 1:
                            result = _a.sent();
                            return [2 /*return*/, __assign(__assign({}, result.content !== undefined ? { content: result.content } : {}), { sources: result.sources.map(projectSource), truncated: result.truncated })];
                    }
                });
            });
        },
        presentCall: presentSearchCall,
        presentResult: function (args, result) { return presentSearchResult(args, result); },
    }));
}
