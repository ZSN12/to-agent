"use strict";
/**
 * DeepSeek search through an Anthropic-compatible Messages model call with the native
 * `web_search_20250305` server tool. Each search costs a model turn, but returns structured
 * result blocks; absence of those blocks is an error rather than a prose-scraping fallback.
 * The wire format and native `fetch` client are provider-private and do not use `ctx.llm`.
 * @module @z/dsh-web-search-deepseek/provider
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
exports.DeepSeekSearchProvider = exports.DEEPSEEK_DEFAULT_MAX_USES = exports.DEEPSEEK_DEFAULT_MAX_TOKENS = exports.DEEPSEEK_DEFAULT_API_VERSION = exports.DEEPSEEK_DEFAULT_MODEL = exports.DEEPSEEK_DEFAULT_BASE_URL = exports.DEEPSEEK_PROVIDER_ID = void 0;
exports.citationSnippets = citationSnippets;
exports.mapAnthropicResponse = mapAnthropicResponse;
var dsh_web_1 = require("@z/dsh-web");
/** Stable id this provider registers under. */
exports.DEEPSEEK_PROVIDER_ID = 'deepseek-official';
/**
 * Default endpoint: DeepSeek's Anthropic-compatible API, `/v1` included
 * (`/messages` is appended). This is NOT the chat-completions base
 * (`https://api.deepseek.com`) `@z/dsh-llm-deepseek` uses, so this
 * provider does NOT reuse `$DEEPSEEK_BASE_URL` — only the API key is shared.
 */
exports.DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com/anthropic/v1';
/** Default Anthropic-format model name (aligned with the repo's DeepSeek model vocabulary). */
exports.DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash';
/** Default `anthropic-version` header value. */
exports.DEEPSEEK_DEFAULT_API_VERSION = '2023-06-01';
/** Default upper bound on generated tokens for the Messages request. */
exports.DEEPSEEK_DEFAULT_MAX_TOKENS = 4096;
/** Default maximum `web_search` server-tool uses per request. */
exports.DEEPSEEK_DEFAULT_MAX_USES = 5;
/** Attribution header sent on every request. Bump with the package version. */
var USER_AGENT = 'deepseek-harness/0.0.1';
/**
 * Build a `url → cited_text` map from every `text` block's `citations[]`. This
 * is the snippet source: Anthropic `web_search_result` items carry
 * `url`/`title`/`page_age` but typically NO inline snippet — the excerpt lives
 * in a separate `text` block's citation, keyed by `url` (first occurrence wins).
 *
 * @param blocks - the response's content blocks; non-`text` blocks are skipped.
 * @returns the `url → cited_text` map (empty when no citations are present).
 */
function citationSnippets(blocks) {
    var _a;
    var map = new Map();
    for (var _i = 0, blocks_1 = blocks; _i < blocks_1.length; _i++) {
        var block = blocks_1[_i];
        if (block.type !== 'text')
            continue;
        for (var _b = 0, _c = (_a = block.citations) !== null && _a !== void 0 ? _a : []; _b < _c.length; _b++) {
            var cite = _c[_b];
            if (cite.url != null && cite.url.length > 0 && cite.cited_text != null && cite.cited_text.length > 0 && !map.has(cite.url)) {
                map.set(cite.url, cite.cited_text);
            }
        }
    }
    return map;
}
/**
 * Map a DeepSeek Anthropic Messages response to a normalized search result. Walks
 * `web_search_tool_result` blocks for citeable `web_search_result` items, joins each to its
 * citation excerpt as `snippet`, and dedupes by `url` (a `max_uses > 1` request can surface
 * the same URL across searches). The web service owns the final `maxResults` truncation, so
 * `truncated` is always `false` here.
 *
 * @param response - the parsed Messages response body.
 * @returns the normalized result with deduped, snippet-joined sources.
 * @throws {@link WebError} when native search produced no result block.
 */
function mapAnthropicResponse(response) {
    var _a, _b;
    var blocks = (_a = response.content) !== null && _a !== void 0 ? _a : [];
    var resultBlocks = blocks.filter(function (block) { return block.type === 'web_search_tool_result'; });
    if (resultBlocks.length === 0) {
        throw new dsh_web_1.WebError('DeepSeek returned no web_search_tool_result blocks; the request may not have triggered native web search', 'WEB_PROVIDER_ERROR');
    }
    var snippets = citationSnippets(blocks);
    var seen = new Set();
    var sources = [];
    for (var _i = 0, resultBlocks_1 = resultBlocks; _i < resultBlocks_1.length; _i++) {
        var block = resultBlocks_1[_i];
        for (var _c = 0, _d = (_b = block.content) !== null && _b !== void 0 ? _b : []; _c < _d.length; _c++) {
            var item = _d[_c];
            if (item.type !== 'web_search_result' || item.url.length === 0 || seen.has(item.url))
                continue;
            seen.add(item.url);
            var snippet = snippets.get(item.url);
            sources.push(__assign(__assign(__assign({ url: item.url }, item.title != null && item.title.length > 0 ? { title: item.title } : {}), snippet != null && snippet.length > 0 ? { snippet: snippet } : {}), item.page_age != null && item.page_age.length > 0 ? { publishedAt: item.page_age } : {}));
        }
    }
    return { sources: sources, truncated: false };
}
/** The DeepSeek-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
var DeepSeekSearchProvider = /** @class */ (function () {
    /**
     * @param resolveOptions - the options for the NEXT operation, snapshotted
     * once at each operation's entry so one search never mixes two sections. A
     * thunk rather than a value because the plugin's settings section can change
     * between searches, and re-registering the provider to carry a new endpoint
     * would make the seam's selection observable to the user as a flicker.
     */
    function DeepSeekSearchProvider(resolveOptions) {
        this.resolveOptions = resolveOptions;
        this.id = exports.DEEPSEEK_PROVIDER_ID;
    }
    DeepSeekSearchProvider.prototype.available = function () {
        var _a, _b;
        var options = this.resolveOptions();
        return (((_b = (_a = options.apiKey) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) > 0 || options.resolveApiKey !== undefined)
            && URL.canParse(options.baseURL)
            && isPositiveInteger(options.maxTokens)
            && isPositiveInteger(options.maxUses);
    };
    DeepSeekSearchProvider.prototype.search = function (request, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var options, apiKey, endpoint, body, response, error_1, status_1, message, parsed, detail, error_2, payload, error_3;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        options = this.resolveOptions();
                        return [4 /*yield*/, this.apiKey(options, signal)];
                    case 1:
                        apiKey = _d.sent();
                        throwIfSearchAborted(signal);
                        endpoint = "".concat(options.baseURL, "/messages");
                        body = {
                            model: options.model,
                            max_tokens: options.maxTokens,
                            messages: [{
                                    role: 'user',
                                    content: [{ type: 'text', text: "Perform a web search for the query: ".concat(request.query) }],
                                }],
                            tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: options.maxUses }],
                        };
                        (_a = options.recordRequest) === null || _a === void 0 ? void 0 : _a.call(options, {
                            endpoint: endpoint,
                            apiVersion: options.apiVersion,
                            body: body,
                        });
                        throwIfSearchAborted(signal);
                        _d.label = 2;
                    case 2:
                        _d.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, fetch(endpoint, __assign({ method: 'POST', redirect: 'error', headers: {
                                    // Official DeepSeek expects `x-api-key`; an Anthropic-compatible proxy
                                    // may expect `Authorization: Bearer` — send both so either resolves.
                                    'x-api-key': apiKey,
                                    'authorization': "Bearer ".concat(apiKey),
                                    'anthropic-version': options.apiVersion,
                                    'content-type': 'application/json',
                                    'accept': 'application/json',
                                    'user-agent': USER_AGENT,
                                }, body: JSON.stringify(body) }, signal !== undefined ? { signal: signal } : {}))];
                    case 3:
                        response = _d.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _d.sent();
                        if ((signal === null || signal === void 0 ? void 0 : signal.aborted) === true || isAbortError(error_1))
                            throw searchAborted(signal, error_1);
                        throw new dsh_web_1.WebError("DeepSeek search request failed: ".concat(String(error_1)), 'WEB_PROVIDER_ERROR', { cause: error_1 });
                    case 5:
                        if (!!response.ok) return [3 /*break*/, 10];
                        status_1 = response.status;
                        message = "DeepSeek API error (HTTP ".concat(status_1, ")");
                        _d.label = 6;
                    case 6:
                        _d.trys.push([6, 8, , 9]);
                        return [4 /*yield*/, response.json()];
                    case 7:
                        parsed = _d.sent();
                        detail = typeof parsed.error === 'string' ? parsed.error : (_c = (_b = parsed.error) === null || _b === void 0 ? void 0 : _b.message) !== null && _c !== void 0 ? _c : parsed.message;
                        if (detail !== undefined && detail.length > 0)
                            message = detail;
                        return [3 /*break*/, 9];
                    case 8:
                        error_2 = _d.sent();
                        // An abort fired mid-body must surface as WEB_ABORTED, not be swallowed
                        // into a generic HTTP-error message — cancellation is not a provider
                        // error (the seam's cancellation contract).
                        if ((signal === null || signal === void 0 ? void 0 : signal.aborted) === true || isAbortError(error_2))
                            throw searchAborted(signal, error_2);
                        return [3 /*break*/, 9];
                    case 9: throw new dsh_web_1.WebError(message, 'WEB_PROVIDER_ERROR');
                    case 10:
                        _d.trys.push([10, 12, , 13]);
                        return [4 /*yield*/, response.json()];
                    case 11:
                        payload = _d.sent();
                        return [2 /*return*/, mapAnthropicResponse(payload)];
                    case 12:
                        error_3 = _d.sent();
                        if ((signal === null || signal === void 0 ? void 0 : signal.aborted) === true || isAbortError(error_3))
                            throw searchAborted(signal, error_3);
                        if (error_3 instanceof dsh_web_1.WebError)
                            throw error_3;
                        throw new dsh_web_1.WebError("DeepSeek returned an unprocessable response body: ".concat(String(error_3)), 'WEB_PROVIDER_ERROR', { cause: error_3 });
                    case 13: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Resolve one operation's credential without retaining it on the provider.
     * @param options - the caller's snapshot, so the key and the endpoint it is sent to come from one section.
     * @param signal - abort signal for the surrounding search.
     * @returns the resolved key.
     */
    DeepSeekSearchProvider.prototype.apiKey = function (options, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var resolved, error_4, ref;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        throwIfSearchAborted(signal);
                        if (options.apiKey !== undefined && options.apiKey.length > 0)
                            return [2 /*return*/, options.apiKey];
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, abortable((_b = (_a = options.resolveApiKey) === null || _a === void 0 ? void 0 : _a.call(options)) !== null && _b !== void 0 ? _b : Promise.resolve(undefined), signal)];
                    case 2:
                        resolved = _d.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_4 = _d.sent();
                        if ((signal === null || signal === void 0 ? void 0 : signal.aborted) === true || isAbortError(error_4))
                            throw searchAborted(signal, error_4);
                        throw new dsh_web_1.WebError("DeepSeek search credential resolution failed: ".concat(String(error_4)), 'WEB_PROVIDER_ERROR', { cause: error_4 });
                    case 4:
                        if (resolved !== undefined && resolved.length > 0)
                            return [2 /*return*/, resolved];
                        ref = (_c = options.apiKeyEnv) !== null && _c !== void 0 ? _c : 'DEEPSEEK_API_KEY';
                        throw new dsh_web_1.WebError("DeepSeek search has no API key for \"".concat(ref, "\"; store it through the credentials service")
                            + ' (the web Models page writes it), export it in the launching environment, or set a literal'
                            + ' "apiKey" in the web-search-deepseek config', 'WEB_PROVIDER_CREDENTIAL_MISSING');
                }
            });
        });
    };
    return DeepSeekSearchProvider;
}());
exports.DeepSeekSearchProvider = DeepSeekSearchProvider;
/**
 * Race a same-process asynchronous preflight against caller cancellation. The
 * attached settlement handlers keep observing an uncooperative operation after
 * abort so a later rejection cannot become unhandled.
 */
function abortable(operation, signal) {
    if (signal === undefined)
        return operation;
    if (signal.aborted)
        return Promise.reject(searchAborted(signal));
    return new Promise(function (resolve, reject) {
        var onAbort = function () { reject(searchAborted(signal)); };
        signal.addEventListener('abort', onAbort, { once: true });
        void operation.then(function (value) {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
        }, function (error) {
            signal.removeEventListener('abort', onAbort);
            reject(new Error(String(error).replace(/^Error: /u, ''), { cause: error }));
        });
    });
}
/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal) {
    if ((signal === null || signal === void 0 ? void 0 : signal.aborted) === true)
        throw searchAborted(signal);
}
/** Build the provider's stable cancellation error while retaining the caller's reason. */
function searchAborted(signal, fallback) {
    return new dsh_web_1.WebError('DeepSeek search aborted', 'WEB_ABORTED', {
        cause: (signal === null || signal === void 0 ? void 0 : signal.aborted) === true ? signal.reason : fallback,
    });
}
/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error) {
    return error instanceof DOMException && error.name === 'AbortError';
}
/** True for DeepSeek request limits that can be sent to the Messages API. */
function isPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
}
