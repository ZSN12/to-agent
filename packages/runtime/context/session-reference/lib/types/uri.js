"use strict";
/** Canonical session URI and inline mention encoding. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_REFERENCE_SCHEME = void 0;
exports.encodeSessionReferenceUri = encodeSessionReferenceUri;
exports.decodeSessionReferenceUri = decodeSessionReferenceUri;
exports.formatSessionReferenceMention = formatSessionReferenceMention;
exports.parseSessionReferenceText = parseSessionReferenceText;
var dsh_session_1 = require("@z/dsh-session");
var config_ts_1 = require("./config.ts");
/** URI scheme reserved for DeepSeek Harness session snapshots. */
exports.SESSION_REFERENCE_SCHEME = 'dsh-session:';
/**
 * Encode any JavaScript session-id string as a canonical lossless URI.
 * @param sessionId - opaque session id to serialize.
 * @returns canonical `dsh-session:` URI.
 */
function encodeSessionReferenceUri(sessionId) {
    var payload = Buffer.from(JSON.stringify(sessionId), 'utf8').toString('base64url');
    return "".concat(exports.SESSION_REFERENCE_SCHEME).concat(payload);
}
/**
 * Decode and canonicalize one session-reference URI.
 * @param uri - complete canonical URI.
 * @returns decoded session id.
 */
function decodeSessionReferenceUri(uri) {
    if (!uri.startsWith(exports.SESSION_REFERENCE_SCHEME)) {
        throw invalidUri(uri);
    }
    var payload = uri.slice(exports.SESSION_REFERENCE_SCHEME.length);
    if (!/^[A-Za-z0-9_-]+$/.test(payload))
        throw invalidUri(uri);
    try {
        var parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (typeof parsed !== 'string')
            throw new TypeError('decoded session id is not a string');
        var sessionId = (0, dsh_session_1.SessionId)(parsed);
        if (encodeSessionReferenceUri(sessionId) !== uri)
            throw new TypeError('URI is not canonical');
        return sessionId;
    }
    catch (error) {
        throw invalidUri(uri, error);
    }
}
/**
 * Render a host-neutral Markdown mention carrying the canonical URI.
 * @param reference - structured id and optional display label.
 * @returns escaped `@[label](uri)` mention.
 */
function formatSessionReferenceMention(reference) {
    var _a;
    var label = escapeLabel((_a = reference.label) !== null && _a !== void 0 ? _a : reference.sessionId);
    return "@[".concat(label, "](").concat(encodeSessionReferenceUri(reference.sessionId), ")");
}
/**
 * Extract Markdown mentions and bare canonical URIs from one text value.
 * Explicit Markdown mentions fail on any malformed URI. Bare text is treated
 * as a reference only when it has a non-empty base64url-shaped payload, then
 * still fails if that candidate is not canonical.
 * @param text - host text to normalize.
 * @returns readable text and structured references in appearance order.
 */
function parseSessionReferenceText(text) {
    var references = [];
    var pattern = /@\[((?:\\.|[^\\\]])*)\]\((dsh-session:[^\s)]*)\)|(dsh-session:[A-Za-z0-9_-]+)/gu;
    var rendered = text.replace(pattern, function (_match, rawLabel, markdownUri, bareUri) {
        var uri = markdownUri !== null && markdownUri !== void 0 ? markdownUri : bareUri;
        /* v8 ignore next -- the two-alternative regex always captures exactly one URI group. */
        if (uri === undefined)
            throw new config_ts_1.SessionReferenceError('session reference URI is missing', 'SESSION_REFERENCE_INVALID_REFERENCE');
        var sessionId = decodeSessionReferenceUri(uri);
        var label = rawLabel === undefined ? sessionId : unescapeLabel(rawLabel);
        references.push({ sessionId: sessionId, label: label });
        return "@".concat(label);
    });
    return { text: rendered, references: references };
}
function escapeLabel(label) {
    return label.replace(/[\\\]]/gu, function (match) { return "\\".concat(match); });
}
function unescapeLabel(label) {
    return label.replace(/\\(.)/gu, '$1');
}
function invalidUri(uri, cause) {
    return new config_ts_1.SessionReferenceError("invalid session reference URI ".concat(JSON.stringify(uri)), 'SESSION_REFERENCE_INVALID_REFERENCE', cause === undefined ? undefined : { cause: cause });
}
