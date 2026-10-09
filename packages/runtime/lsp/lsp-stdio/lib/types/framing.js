"use strict";
/**
 * LSP base-protocol framing: `Content-Length`-delimited JSON-RPC over a byte stream. The encoder
 * produces one framed buffer; the decoder buffers incoming bytes and yields complete message bodies,
 * bounding the header and total message size so a hostile or broken server cannot exhaust memory.
 * @module @z/dsh-lsp-stdio/framing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageDecoder = void 0;
exports.encodeMessage = encodeMessage;
/** The header/body separator in the LSP base protocol. */
var HEADER_SEPARATOR = '\r\n\r\n';
/** Cap on the header section so a server that never sends the separator cannot grow the buffer forever. */
var MAX_HEADER_BYTES = 1 << 16;
/**
 * Encode one JSON-RPC message as a framed LSP buffer (`Content-Length: N\r\n\r\n<utf-8 json>`).
 * @param message - the JSON-RPC message object to serialize.
 * @returns the framed bytes ready to write to the server's stdin.
 */
function encodeMessage(message) {
    var body = Buffer.from(JSON.stringify(message), 'utf8');
    var header = Buffer.from("Content-Length: ".concat(body.length, "\r\n\r\n"), 'ascii');
    return Buffer.concat([header, body]);
}
/**
 * A streaming decoder for `Content-Length`-framed JSON-RPC. Feed it stdout chunks; it returns any
 * whole message bodies that completed. It parses only the `Content-Length` header and ignores other
 * headers (e.g. `Content-Type`), matching the base protocol.
 */
var MessageDecoder = /** @class */ (function () {
    /**
     * @param maxMessageBytes - reject any single framed body larger than this (guards memory).
     */
    function MessageDecoder(maxMessageBytes) {
        this.buffer = Buffer.alloc(0);
        this.maxMessageBytes = maxMessageBytes;
    }
    /**
     * Append a chunk and return every message body that is now complete.
     * @param chunk - raw bytes from the server's stdout.
     * @returns the parsed JSON bodies, in arrival order (possibly empty).
     * @throws Error when a header is malformed or a body exceeds `maxMessageBytes`.
     */
    MessageDecoder.prototype.push = function (chunk) {
        this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
        var messages = [];
        for (;;) {
            var step = this.next();
            if (!step.ready)
                break;
            messages.push(step.message);
        }
        return messages;
    };
    /** Parse and consume the next complete message, or report that more bytes are needed. */
    MessageDecoder.prototype.next = function () {
        var separator = this.buffer.indexOf(HEADER_SEPARATOR);
        if (separator < 0) {
            if (this.buffer.length > MAX_HEADER_BYTES) {
                throw new Error("LSP header exceeded ".concat(MAX_HEADER_BYTES, " bytes without a terminator"));
            }
            return { ready: false };
        }
        if (separator > MAX_HEADER_BYTES) {
            throw new Error("LSP header exceeded ".concat(MAX_HEADER_BYTES, " bytes"));
        }
        var headerText = this.buffer.toString('ascii', 0, separator);
        var contentLength = parseContentLength(headerText);
        if (contentLength > this.maxMessageBytes) {
            throw new Error("LSP message length ".concat(contentLength, " exceeds the ").concat(this.maxMessageBytes, "-byte limit"));
        }
        var bodyStart = separator + HEADER_SEPARATOR.length;
        var bodyEnd = bodyStart + contentLength;
        if (this.buffer.length < bodyEnd)
            return { ready: false };
        var body = this.buffer.toString('utf8', bodyStart, bodyEnd);
        this.buffer = this.buffer.subarray(bodyEnd);
        try {
            return { ready: true, message: JSON.parse(body) };
        }
        catch (error) {
            /* v8 ignore next -- JSON.parse throws a SyntaxError (an Error); the String() fallback is defensive. */
            throw new Error("LSP message body was not valid JSON: ".concat(error instanceof Error ? error.message : String(error)));
        }
    };
    return MessageDecoder;
}());
exports.MessageDecoder = MessageDecoder;
/** Read the `Content-Length` header value (case-insensitive), rejecting a missing or non-numeric one. */
function parseContentLength(headerText) {
    for (var _i = 0, _a = headerText.split('\r\n'); _i < _a.length; _i++) {
        var line = _a[_i];
        var colon = line.indexOf(':');
        if (colon < 0)
            continue;
        if (line.slice(0, colon).trim().toLowerCase() !== 'content-length')
            continue;
        var value = Number(line.slice(colon + 1).trim());
        if (!Number.isInteger(value) || value < 0) {
            throw new Error("invalid Content-Length header: ".concat(JSON.stringify(line)));
        }
        return value;
    }
    throw new Error("LSP header block missing Content-Length: ".concat(JSON.stringify(headerText)));
}
