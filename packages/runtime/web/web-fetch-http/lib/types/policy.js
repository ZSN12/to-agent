"use strict";
/**
 * URL validation and content-type classification for the local HTTP(S) fetch
 * provider — the pure, network-free half. The provider's `fetch()` composes
 * these with transport (redirect following, byte caps, decoding).
 *
 * @module @z/dsh-web-fetch-http/policy
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateFetchUrl = validateFetchUrl;
exports.isSameOrigin = isSameOrigin;
exports.classifyContentType = classifyContentType;
exports.parseCharset = parseCharset;
exports.decoderForCharset = decoderForCharset;
var dsh_web_1 = require("@z/dsh-web");
/**
 * Validate a request URL against the basic transport hygiene the provider
 * enforces before any network access: http(s) only, no embedded credentials,
 * bounded length. Returns the parsed `URL`. Throws {@link WebError} otherwise.
 * (SSRF / private-network blocking is deferred — see the package Agent Note.)
 *
 * @param input - the raw URL string from the fetch request.
 * @param maxUrlLength - inclusive upper bound on `input`'s length.
 * @returns the parsed `URL`.
 */
function validateFetchUrl(input, maxUrlLength) {
    if (input.length > maxUrlLength) {
        throw new dsh_web_1.WebError("URL exceeds the maximum length of ".concat(maxUrlLength), 'WEB_INVALID_URL');
    }
    var url;
    try {
        url = new URL(input);
    }
    catch (error) {
        throw new dsh_web_1.WebError("invalid URL: ".concat(input), 'WEB_INVALID_URL', { cause: error });
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new dsh_web_1.WebError("unsupported URL scheme \"".concat(url.protocol, "\" (only http and https are allowed)"), 'WEB_INVALID_URL');
    }
    if (url.username.length > 0 || url.password.length > 0) {
        throw new dsh_web_1.WebError('credentials in URLs are not allowed', 'WEB_BLOCKED_URL');
    }
    return url;
}
/**
 * Two URLs are same-origin when scheme, hostname, and port match. A redirect
 * that crosses origins is refused so each new origin requires a fresh tool call
 * (and thus a fresh provider/permission decision).
 *
 * @param a - one of the two URLs to compare.
 * @param b - the other URL to compare.
 * @returns true when `a` and `b` share scheme, hostname, and port.
 */
function isSameOrigin(a, b) {
    return a.protocol === b.protocol && a.hostname === b.hostname && a.port === b.port;
}
/**
 * Classify a response `Content-Type` into a decodable body kind, or `undefined`
 * for an unsupported (e.g. binary) type. `text/html` and `application/xhtml+xml`
 * are `html`; other `text/*` plus a few structured text types are `text`.
 *
 * @param contentType - the raw `Content-Type` header, or `null` when the
 *   response carries none (unsupported).
 * @returns the decodable kind, or `undefined` for an unsupported type.
 */
function classifyContentType(contentType) {
    var mime = (contentType !== null && contentType !== void 0 ? contentType : '').replace(/;.*$/s, '').trim().toLowerCase();
    if (mime === 'text/html' || mime === 'application/xhtml+xml')
        return 'html';
    if (mime.startsWith('text/'))
        return 'text';
    if (mime === 'application/json' || mime === 'application/xml' || mime.endsWith('+json') || mime.endsWith('+xml'))
        return 'text';
    return undefined;
}
/**
 * Extract the `charset` parameter from a response `Content-Type`, lower-cased,
 * or `undefined` when absent. The provider feeds this label to `TextDecoder`
 * so a non-UTF-8 response is decoded with its declared encoding rather than
 * silently mangled into replacement characters.
 *
 * @param contentType - the raw `Content-Type` header, or `null` when the
 *   response carries none.
 * @returns the lower-cased charset label, or `undefined` when none is declared.
 */
function parseCharset(contentType) {
    var _a;
    var match = /;\s*charset\s*=\s*"?([^";]+)"?/i.exec(contentType !== null && contentType !== void 0 ? contentType : '');
    return (_a = match === null || match === void 0 ? void 0 : match[1]) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase();
}
/**
 * Build a `TextDecoder` for the declared charset, falling back to UTF-8 when
 * none is declared. Throws {@link WebError} `WEB_UNSUPPORTED_CONTENT_TYPE` when
 * the label is present but not a charset `TextDecoder` recognizes — better to
 * fail loudly than return mojibake.
 *
 * @param charset - the declared charset label (from {@link parseCharset}), or
 *   `undefined` to default to UTF-8.
 * @returns a decoder for the declared (or defaulted) encoding.
 */
function decoderForCharset(charset) {
    if (charset === undefined)
        return new TextDecoder('utf-8');
    try {
        return new TextDecoder(charset);
    }
    catch (error) {
        throw new dsh_web_1.WebError("unsupported charset \"".concat(charset, "\""), 'WEB_UNSUPPORTED_CONTENT_TYPE', { cause: error });
    }
}
