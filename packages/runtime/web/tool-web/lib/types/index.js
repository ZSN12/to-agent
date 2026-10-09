"use strict";
/**
 * Model-facing `web_search` and `web_fetch` tools over `ctx.web`. This package owns schemas,
 * validation, prompt guidance, limits, and presentation, never concrete providers. Enablement
 * controls tool registration; an enabled tool remains visible when its provider is unavailable
 * and fails with a structured error at execution time.
 * @module @z/dsh-tool-web
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.DEFAULT_FETCH_MAX_OUTPUT_CHARS = exports.DEFAULT_WEB_TOOL_TIMEOUT_MS = exports.inject = exports.name = exports.fetchMetaFromResult = exports.fetchMetaFromValue = exports.presentFetchResult = exports.presentFetchCall = exports.parseFetchArgs = exports.formatFetchOutput = exports.applyWebFetchTool = exports.searchMetaFromResult = exports.searchMetaFromValue = exports.presentSearchResult = exports.presentSearchCall = exports.formatSearchOutput = exports.applyWebSearchTool = exports.WEB_SEARCH_MAX_RESULTS = exports.WEB_SEARCH_MAX_QUERIES = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var search_ts_1 = require("./search.ts");
var fetch_ts_1 = require("./fetch.ts");
var search_ts_2 = require("./search.ts");
Object.defineProperty(exports, "WEB_SEARCH_MAX_QUERIES", { enumerable: true, get: function () { return search_ts_2.WEB_SEARCH_MAX_QUERIES; } });
Object.defineProperty(exports, "WEB_SEARCH_MAX_RESULTS", { enumerable: true, get: function () { return search_ts_2.WEB_SEARCH_MAX_RESULTS; } });
Object.defineProperty(exports, "applyWebSearchTool", { enumerable: true, get: function () { return search_ts_2.applyWebSearchTool; } });
Object.defineProperty(exports, "formatSearchOutput", { enumerable: true, get: function () { return search_ts_2.formatSearchOutput; } });
Object.defineProperty(exports, "presentSearchCall", { enumerable: true, get: function () { return search_ts_2.presentSearchCall; } });
Object.defineProperty(exports, "presentSearchResult", { enumerable: true, get: function () { return search_ts_2.presentSearchResult; } });
Object.defineProperty(exports, "searchMetaFromValue", { enumerable: true, get: function () { return search_ts_2.searchMetaFromValue; } });
Object.defineProperty(exports, "searchMetaFromResult", { enumerable: true, get: function () { return search_ts_2.searchMetaFromResult; } });
var fetch_ts_2 = require("./fetch.ts");
Object.defineProperty(exports, "applyWebFetchTool", { enumerable: true, get: function () { return fetch_ts_2.applyWebFetchTool; } });
Object.defineProperty(exports, "formatFetchOutput", { enumerable: true, get: function () { return fetch_ts_2.formatFetchOutput; } });
Object.defineProperty(exports, "parseFetchArgs", { enumerable: true, get: function () { return fetch_ts_2.parseFetchArgs; } });
Object.defineProperty(exports, "presentFetchCall", { enumerable: true, get: function () { return fetch_ts_2.presentFetchCall; } });
Object.defineProperty(exports, "presentFetchResult", { enumerable: true, get: function () { return fetch_ts_2.presentFetchResult; } });
Object.defineProperty(exports, "fetchMetaFromValue", { enumerable: true, get: function () { return fetch_ts_2.fetchMetaFromValue; } });
Object.defineProperty(exports, "fetchMetaFromResult", { enumerable: true, get: function () { return fetch_ts_2.fetchMetaFromResult; } });
/** Cordis plugin name used by loader diagnostics. */
exports.name = 'tool-web';
/** Services required by the web tool suite. */
exports.inject = ['tools', 'web', 'systemPrompt'];
/** Default cooperative tool-call timeout budget (ms) for the web tools. */
exports.DEFAULT_WEB_TOOL_TIMEOUT_MS = 30000;
/**
 * Default cap on one `web_fetch` output and on source characters converted
 * synchronously. This leaves headroom above the local provider's default
 * 100,000-character body cap while bounding custom providers and rendered output.
 */
exports.DEFAULT_FETCH_MAX_OUTPUT_CHARS = 200000;
exports.Config = schemastery_1.default.object({
    search: schemastery_1.default.boolean().default(true),
    fetch: schemastery_1.default.boolean().default(true),
    searchMaxResults: schemastery_1.default.number().default(search_ts_1.WEB_SEARCH_MAX_RESULTS),
    searchMaxQueries: schemastery_1.default.number().default(search_ts_1.WEB_SEARCH_MAX_QUERIES),
    fetchTimeoutMs: schemastery_1.default.number().default(exports.DEFAULT_WEB_TOOL_TIMEOUT_MS),
    searchTimeoutMs: schemastery_1.default.number().default(exports.DEFAULT_WEB_TOOL_TIMEOUT_MS),
    fetchMaxOutputChars: schemastery_1.default.number().default(exports.DEFAULT_FETCH_MAX_OUTPUT_CHARS),
});
/** Configured count, timeout, and character caps must be positive integers. */
function assertPositiveInteger(name, value) {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error("tool-web: ".concat(name, " must be a positive integer"));
    }
}
/**
 * Register the enabled web tools. `search`/`fetch` default to true; a product
 * that wants only one disables the other in config. Each tool's cooperative
 * timeout budget (`fetchTimeoutMs`/`searchTimeoutMs`, default 30000) is resolved
 * here and attached to the tool as `ToolDefinition.timeoutMs` for
 * `@z/dsh-tool-call-timeout-policy` to enforce. The tools' disposers are
 * fiber-scoped (the effect-based registries clean up on dispose), so no manual
 * teardown is needed.
 */
function apply(ctx, config) {
    // schemastery (Config) has already filled every defaulted field.
    var resolved = config;
    assertPositiveInteger('searchMaxResults', resolved.searchMaxResults);
    assertPositiveInteger('searchMaxQueries', resolved.searchMaxQueries);
    assertPositiveInteger('fetchTimeoutMs', resolved.fetchTimeoutMs);
    assertPositiveInteger('searchTimeoutMs', resolved.searchTimeoutMs);
    assertPositiveInteger('fetchMaxOutputChars', resolved.fetchMaxOutputChars);
    if (resolved.search) {
        (0, search_ts_1.applyWebSearchTool)(ctx, resolved.searchMaxResults, resolved.searchMaxQueries, resolved.searchTimeoutMs, resolved.fetch);
    }
    if (resolved.fetch)
        (0, fetch_ts_1.applyWebFetchTool)(ctx, resolved.fetchTimeoutMs, resolved.fetchMaxOutputChars);
}
