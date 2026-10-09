"use strict";
/**
 * `@z/dsh-web-fetch-http`: registers an anonymous public HTTP(S)
 * `WebFetchProvider` with `ctx.web`. A function/namespace plugin (NOT a
 * default-export service): it registers INTO the seam's fetch registry, like the
 * search providers register into the search registry.
 *
 * @module @z/dsh-web-fetch-http
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.inject = exports.name = exports.DEFAULT_USER_AGENT = exports.HttpFetchProvider = exports.LOCAL_FETCH_PROVIDER_ID = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var provider_ts_1 = require("./provider.ts");
var MAX_NODE_TIMER_DELAY_MS = 2147483647;
var provider_ts_2 = require("./provider.ts");
Object.defineProperty(exports, "LOCAL_FETCH_PROVIDER_ID", { enumerable: true, get: function () { return provider_ts_2.LOCAL_FETCH_PROVIDER_ID; } });
Object.defineProperty(exports, "HttpFetchProvider", { enumerable: true, get: function () { return provider_ts_2.HttpFetchProvider; } });
/** Default `User-Agent`: an explicit product agent, never a browser disguise. */
exports.DEFAULT_USER_AGENT = 'deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)';
/** Cordis plugin name used by loader diagnostics. */
exports.name = 'web-fetch-http';
/** The web seam this provider registers into. */
exports.inject = ['web'];
exports.Config = schemastery_1.default.object({
    maxUrlLength: schemastery_1.default.number().default(2048),
    maxResponseBytes: schemastery_1.default.number().default(5000000),
    maxBodyChars: schemastery_1.default.number().default(100000),
    timeoutMs: schemastery_1.default.number().default(30000),
    maxRedirects: schemastery_1.default.number().default(5),
    userAgent: schemastery_1.default.string().default(exports.DEFAULT_USER_AGENT),
});
/** A resource limit (byte/char/length/timeout cap) must be a positive finite number. */
function assertPositiveFinite(name, value) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error("web-fetch-http: ".concat(name, " must be a positive finite number"));
    }
}
/** Node coerces larger timer delays to 1 ms, so reject them at configuration time. */
function assertTimeoutMs(value) {
    assertPositiveFinite('timeoutMs', value);
    if (value > MAX_NODE_TIMER_DELAY_MS) {
        throw new Error("web-fetch-http: timeoutMs must be no greater than ".concat(MAX_NODE_TIMER_DELAY_MS));
    }
}
/** The redirect hop cap must be a non-negative integer (0 follows no redirects). */
function assertNonNegativeInteger(name, value) {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error("web-fetch-http: ".concat(name, " must be a non-negative integer"));
    }
}
/** Register the local HTTP(S) fetch provider with `ctx.web`. */
function apply(ctx, config) {
    // schemastery (Config) has already filled every defaulted field.
    var resolved = config;
    assertPositiveFinite('maxUrlLength', resolved.maxUrlLength);
    assertPositiveFinite('maxResponseBytes', resolved.maxResponseBytes);
    assertPositiveFinite('maxBodyChars', resolved.maxBodyChars);
    assertTimeoutMs(resolved.timeoutMs);
    assertNonNegativeInteger('maxRedirects', resolved.maxRedirects);
    var limits = {
        maxUrlLength: resolved.maxUrlLength,
        maxResponseBytes: resolved.maxResponseBytes,
        maxBodyChars: resolved.maxBodyChars,
        timeoutMs: resolved.timeoutMs,
        maxRedirects: resolved.maxRedirects,
        userAgent: resolved.userAgent,
    };
    ctx.web.registerFetchProvider(new provider_ts_1.HttpFetchProvider(limits));
}
