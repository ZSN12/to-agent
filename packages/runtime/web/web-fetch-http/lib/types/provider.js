"use strict";
/**
 * Safe HTTP(S) retrieval for `ctx.web`: validates URLs, follows only same-origin redirects,
 * enforces time and size limits, classifies and decodes text, and leaves presentation to
 * `@z/dsh-tool-web`. Requests carry no browser cookies or ambient credentials.
 *
 * Private-network and SSRF protection is not implemented; do not enable this provider where
 * it can reach sensitive internal targets.
 * @module @z/dsh-web-fetch-http/provider
 */
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
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpFetchProvider = exports.LOCAL_FETCH_PROVIDER_ID = void 0;
var dsh_web_1 = require("@z/dsh-web");
var dsh_timeout_1 = require("@z/dsh-timeout");
var policy_ts_1 = require("./policy.ts");
/** Stable id this provider registers under. */
exports.LOCAL_FETCH_PROVIDER_ID = 'http';
/** The anonymous public HTTP(S) fetch provider. */
var HttpFetchProvider = /** @class */ (function () {
    function HttpFetchProvider(limits) {
        this.limits = limits;
        this.id = exports.LOCAL_FETCH_PROVIDER_ID;
    }
    /** No credentials to check — an anonymous public fetcher is always usable. */
    HttpFetchProvider.prototype.available = function () {
        return true;
    };
    HttpFetchProvider.prototype.fetch = function (request, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var env_1, d, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        env_1 = { stack: [], error: void 0, hasError: false };
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, 4, 5]);
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            throw new dsh_web_1.WebError('web fetch aborted', 'WEB_ABORTED');
                        d = __addDisposableResource(env_1, (0, dsh_timeout_1.deadline)(signal, this.limits.timeoutMs, 'WEB_FETCH_TIMEOUT'), false);
                        return [4 /*yield*/, this.followAndRead(request.url, d.signal)];
                    case 2: return [2 /*return*/, _a.sent()];
                    case 3:
                        e_1 = _a.sent();
                        env_1.error = e_1;
                        env_1.hasError = true;
                        return [3 /*break*/, 5];
                    case 4:
                        __disposeResources(env_1);
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /** Follow same-origin redirects up to the hop cap, then read the final response. */
    HttpFetchProvider.prototype.followAndRead = function (initialUrl, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var currentUrl, redirectsFollowed, response, location_1, target, validatedTarget, error_1;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        currentUrl = (0, policy_ts_1.validateFetchUrl)(initialUrl, this.limits.maxUrlLength);
                        redirectsFollowed = 0;
                        _e.label = 1;
                    case 1: return [4 /*yield*/, this.requestOnce(currentUrl, signal)];
                    case 2:
                        response = _e.sent();
                        if (!isRedirectStatus(response.status)) return [3 /*break*/, 12];
                        if (!(redirectsFollowed >= this.limits.maxRedirects)) return [3 /*break*/, 4];
                        return [4 /*yield*/, ((_a = response.body) === null || _a === void 0 ? void 0 : _a.cancel())];
                    case 3:
                        _e.sent();
                        throw new dsh_web_1.WebError("exceeded the maximum of ".concat(this.limits.maxRedirects, " redirects"), 'WEB_REDIRECT_BLOCKED');
                    case 4:
                        location_1 = response.headers.get('location');
                        if (!(location_1 === null)) return [3 /*break*/, 6];
                        // A redirect status with no Location is not a usable resource. Cancel
                        // the (possibly streaming) body before throwing so no socket leaks.
                        return [4 /*yield*/, ((_b = response.body) === null || _b === void 0 ? void 0 : _b.cancel())];
                    case 5:
                        // A redirect status with no Location is not a usable resource. Cancel
                        // the (possibly streaming) body before throwing so no socket leaks.
                        _e.sent();
                        throw new dsh_web_1.WebError("redirect response (HTTP ".concat(response.status, ") without a Location header"), 'WEB_PROVIDER_ERROR');
                    case 6:
                        target = resolveRedirect(location_1, currentUrl);
                        validatedTarget = void 0;
                        _e.label = 7;
                    case 7:
                        _e.trys.push([7, 8, , 10]);
                        validatedTarget = (0, policy_ts_1.validateFetchUrl)(target.toString(), this.limits.maxUrlLength);
                        if (!(0, policy_ts_1.isSameOrigin)(validatedTarget, currentUrl)) {
                            throw new dsh_web_1.WebError("cross-origin redirect to ".concat(validatedTarget.origin, " is not followed automatically; retry against that URL directly"), 'WEB_REDIRECT_BLOCKED');
                        }
                        return [3 /*break*/, 10];
                    case 8:
                        error_1 = _e.sent();
                        return [4 /*yield*/, ((_c = response.body) === null || _c === void 0 ? void 0 : _c.cancel())];
                    case 9:
                        _e.sent();
                        throw error_1;
                    case 10: return [4 /*yield*/, ((_d = response.body) === null || _d === void 0 ? void 0 : _d.cancel())];
                    case 11:
                        _e.sent();
                        currentUrl = validatedTarget;
                        redirectsFollowed++;
                        return [3 /*break*/, 14];
                    case 12: return [4 /*yield*/, this.readBody(response, currentUrl, signal)];
                    case 13: return [2 /*return*/, _e.sent()];
                    case 14: return [3 /*break*/, 1];
                    case 15: return [2 /*return*/];
                }
            });
        });
    };
    HttpFetchProvider.prototype.requestOnce = function (url, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, fetch(url, {
                                method: 'GET',
                                redirect: 'manual',
                                headers: { 'user-agent': this.limits.userAgent, 'accept': 'text/html,application/xhtml+xml,text/*;q=0.9,application/json;q=0.8' },
                                signal: signal,
                            })];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2:
                        error_2 = _a.sent();
                        throw translateAbortOrNetwork(error_2, signal);
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /** Read, byte-cap, classify, and decode the final response body. */
    HttpFetchProvider.prototype.readBody = function (response, finalUrl, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var contentType, kind, decoder, error_3, _a, bytes, truncatedByBytes, decoded, truncatedByChars, content, body;
            var _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        contentType = response.headers.get('content-type');
                        kind = (0, policy_ts_1.classifyContentType)(contentType);
                        if (!(kind === undefined)) return [3 /*break*/, 2];
                        return [4 /*yield*/, ((_b = response.body) === null || _b === void 0 ? void 0 : _b.cancel())];
                    case 1:
                        _d.sent();
                        throw new dsh_web_1.WebError("unsupported content type \"".concat(contentType !== null && contentType !== void 0 ? contentType : 'unknown', "\""), 'WEB_UNSUPPORTED_CONTENT_TYPE');
                    case 2:
                        _d.trys.push([2, 3, , 5]);
                        decoder = (0, policy_ts_1.decoderForCharset)((0, policy_ts_1.parseCharset)(contentType));
                        return [3 /*break*/, 5];
                    case 3:
                        error_3 = _d.sent();
                        return [4 /*yield*/, ((_c = response.body) === null || _c === void 0 ? void 0 : _c.cancel())];
                    case 4:
                        _d.sent();
                        throw error_3;
                    case 5: return [4 /*yield*/, this.readCapped(response, signal)];
                    case 6:
                        _a = _d.sent(), bytes = _a.bytes, truncatedByBytes = _a.truncatedByBytes;
                        decoded = decoder.decode(bytes);
                        truncatedByChars = decoded.length > this.limits.maxBodyChars;
                        content = truncatedByChars ? decoded.slice(0, this.limits.maxBodyChars) : decoded;
                        body = kind === 'html' ? { kind: 'html', content: content } : { kind: 'text', content: content };
                        return [2 /*return*/, {
                                url: finalUrl.toString(),
                                statusCode: response.status,
                                body: body,
                                truncated: truncatedByBytes || truncatedByChars,
                            }];
                }
            });
        });
    };
    /**
     * Read the response stream up to `maxResponseBytes`. A `Content-Length` over
     * the cap rejects immediately with `WEB_FETCH_TOO_LARGE`; a stream that grows
     * past the cap is cut short (`truncatedByBytes`) rather than rejected, so a
     * server that under-reports still yields a bounded usable body.
     */
    HttpFetchProvider.prototype.readCapped = function (response, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var declared, length_1, chunks, total, truncatedByBytes, reader, _a, done, value, remaining, error_4, bytes, offset, _i, chunks_1, chunk;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        declared = response.headers.get('content-length');
                        if (!(declared !== null)) return [3 /*break*/, 2];
                        length_1 = Number(declared);
                        if (!(Number.isFinite(length_1) && length_1 > this.limits.maxResponseBytes)) return [3 /*break*/, 2];
                        return [4 /*yield*/, ((_b = response.body) === null || _b === void 0 ? void 0 : _b.cancel())];
                    case 1:
                        _c.sent();
                        throw new dsh_web_1.WebError("response exceeds the maximum of ".concat(this.limits.maxResponseBytes, " bytes"), 'WEB_FETCH_TOO_LARGE');
                    case 2:
                        /* v8 ignore next -- a 2xx Response from fetch always exposes a body stream; the null guard is defensive. */
                        if (response.body === null)
                            return [2 /*return*/, { bytes: new Uint8Array(0), truncatedByBytes: false }];
                        chunks = [];
                        total = 0;
                        truncatedByBytes = false;
                        reader = response.body.getReader();
                        _c.label = 3;
                    case 3:
                        _c.trys.push([3, 8, 9, 11]);
                        _c.label = 4;
                    case 4: return [4 /*yield*/, reader.read()];
                    case 5:
                        _a = _c.sent(), done = _a.done, value = _a.value;
                        if (done)
                            return [3 /*break*/, 7];
                        remaining = this.limits.maxResponseBytes - total;
                        // Only DROPPED bytes count as truncation: a chunk that exactly fills the
                        // remaining capacity keeps all its bytes and we read on to observe EOF,
                        // so an exactly-at-cap body is not falsely flagged truncated.
                        if (value.byteLength > remaining) {
                            chunks.push(value.subarray(0, remaining));
                            total += remaining;
                            truncatedByBytes = true;
                            return [3 /*break*/, 7];
                        }
                        chunks.push(value);
                        total += value.byteLength;
                        _c.label = 6;
                    case 6: return [3 /*break*/, 4];
                    case 7: return [3 /*break*/, 11];
                    case 8:
                        error_4 = _c.sent();
                        /* v8 ignore next -- mid-stream read fault needs a network drop after headers; translate path covered by request-phase tests. */
                        throw translateAbortOrNetwork(error_4, signal);
                    case 9: 
                    /* v8 ignore next 4 -- cancel() after a completed/broken read settles without rejecting; unobserved best-effort cleanup. */
                    return [4 /*yield*/, reader.cancel().catch(function () {
                            // Cancel after a successful read (or after we broke past the cap) is
                            // best-effort cleanup; the bytes we need are already collected.
                        })];
                    case 10:
                        /* v8 ignore next 4 -- cancel() after a completed/broken read settles without rejecting; unobserved best-effort cleanup. */
                        _c.sent();
                        return [7 /*endfinally*/];
                    case 11:
                        bytes = new Uint8Array(total);
                        offset = 0;
                        for (_i = 0, chunks_1 = chunks; _i < chunks_1.length; _i++) {
                            chunk = chunks_1[_i];
                            bytes.set(chunk, offset);
                            offset += chunk.byteLength;
                        }
                        return [2 /*return*/, { bytes: bytes, truncatedByBytes: truncatedByBytes }];
                }
            });
        });
    };
    return HttpFetchProvider;
}());
exports.HttpFetchProvider = HttpFetchProvider;
/** HTTP redirect status codes that carry a `Location`. */
function isRedirectStatus(status) {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
/** Resolve a (possibly relative) `Location` against the current URL. */
function resolveRedirect(location, base) {
    try {
        return new URL(location, base);
    }
    catch (error) {
        /* v8 ignore next 2 -- URL resolution against a valid absolute base effectively never throws; defensive guard. */
        throw new dsh_web_1.WebError("invalid redirect Location \"".concat(location, "\""), 'WEB_PROVIDER_ERROR', { cause: error });
    }
}
/**
 * Translate a thrown fetch/stream error into a `WebError`, classified by the
 * deadline signal rather than the thrown value (which differs by phase: the
 * request-phase `fetch` rejects with the abort reason, while the read-phase
 * reader surfaces a bare `AbortError`). `timeoutOf(signal, 'WEB_FETCH_TIMEOUT')`
 * recovering OUR reason means our timeout fired (`WEB_FETCH_TIMEOUT`); any other
 * abort — an upstream cancel, or a foreign/outer deadline's timeout under
 * nesting — is `WEB_ABORTED`; a throw with the signal NOT aborted is a
 * transport/network failure (`WEB_PROVIDER_ERROR`).
 */
function translateAbortOrNetwork(error, signal) {
    var timeout = (0, dsh_timeout_1.timeoutOf)(signal, 'WEB_FETCH_TIMEOUT');
    if (timeout !== undefined)
        return new dsh_web_1.WebError('web fetch timed out', 'WEB_FETCH_TIMEOUT', { cause: timeout });
    if (signal.aborted)
        return new dsh_web_1.WebError('web fetch aborted', 'WEB_ABORTED', { cause: error });
    return new dsh_web_1.WebError("web fetch failed: ".concat(String(error)), 'WEB_PROVIDER_ERROR', { cause: error });
}
