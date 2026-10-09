"use strict";
/**
 * Pure protocol translation for the local host: what the server's capabilities allow, and how its
 * `Location`/`LocationLink`/`Hover` payloads normalize into the seam's closed result unions. No I/O
 * or process state — every function here is a pure transform, which the fake-stdio tests pin exactly.
 * @module @z/dsh-lsp-stdio/translate
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestMethod = requestMethod;
exports.supportsOperation = supportsOperation;
exports.supportsTransientOpen = supportsTransientOpen;
exports.negotiatePositionEncoding = negotiatePositionEncoding;
exports.normalizeLocations = normalizeLocations;
exports.normalizeHover = normalizeHover;
var dsh_lsp_1 = require("@z/dsh-lsp");
var dsh_llm_1 = require("@z/dsh-llm");
/**
 * The `textDocument/*` request method for each LSP operation.
 * @param operation - the LSP operation to map.
 * @returns the LSP request method name.
 */
function requestMethod(operation) {
    switch (operation) {
        case 'goToDefinition': return 'textDocument/definition';
        case 'findReferences': return 'textDocument/references';
        case 'goToImplementation': return 'textDocument/implementation';
        case 'hover': return 'textDocument/hover';
        /* v8 ignore next -- exhaustive over the closed LspOperation union; unreachable. */
        default: return (0, dsh_llm_1.assertNever)(operation, 'requestMethod');
    }
}
/** The `ServerCapabilities` provider field backing each operation. */
function capabilityValue(capabilities, operation) {
    switch (operation) {
        case 'goToDefinition': return capabilities.definitionProvider;
        case 'findReferences': return capabilities.referencesProvider;
        case 'goToImplementation': return capabilities.implementationProvider;
        case 'hover': return capabilities.hoverProvider;
        /* v8 ignore next -- exhaustive over the closed LspOperation union; unreachable. */
        default: return (0, dsh_llm_1.assertNever)(operation, 'capabilityValue');
    }
}
/** A provider capability is present when the server sent `true` or an options object (not `false`/absent). */
function supportsCapability(value) {
    if (value === undefined)
        return false;
    if (typeof value === 'boolean')
        return value;
    return true;
}
/**
 * Whether the server advertises the requested operation.
 * @param capabilities - the server's `initialize` capabilities.
 * @param operation - the LSP operation to check.
 * @returns true when the corresponding provider capability is present.
 */
function supportsOperation(capabilities, operation) {
    return supportsCapability(capabilityValue(capabilities, operation));
}
/**
 * Whether a `textDocumentSync` value permits the transient `didOpen`/`didClose` this host relies on.
 * The legacy enum form implies open/close for `Full`/`Incremental`; the options form requires an
 * explicit `openClose: true`, because the protocol defaults an omitted `openClose` to false.
 * @param sync - the server's advertised `textDocumentSync` capability.
 * @returns true when transient open/close is supported.
 */
function supportsTransientOpen(sync) {
    if (sync === undefined)
        return false;
    if (typeof sync === 'number')
        return isOpenCloseKind(sync);
    return sync.openClose === true;
}
/** Legacy enum: `Full` (1) or `Incremental` (2) imply open/close support; `None` (0) does not. */
function isOpenCloseKind(kind) {
    return kind === 1 || kind === 2;
}
/**
 * Normalize the negotiated position encoding. An omitted encoding defaults to `utf-16`; any value
 * other than `utf-16` is a protocol error this host does not support.
 * @param encoding - the server's advertised `positionEncoding`, if any.
 * @returns the string `'utf-16'`.
 * @throws Error for any non-`utf-16` encoding.
 */
function negotiatePositionEncoding(encoding) {
    if (encoding === undefined || encoding === 'utf-16')
        return 'utf-16';
    throw new Error("server negotiated unsupported position encoding \"".concat(encoding, "\"; this host requires utf-16"));
}
/** Convert a wire range to the seam's range (structurally identical, but re-shaped as `readonly`). */
function toRange(range) {
    return {
        start: { line: range.start.line, character: range.start.character },
        end: { line: range.end.line, character: range.end.character },
    };
}
/** Whether a record is a `LocationLink` (has `targetUri` + `targetSelectionRange`). */
function isLocationLink(value) {
    return typeof value.targetUri === 'string' && isRange(value.targetSelectionRange);
}
/** Whether a record is a `Location` (has string `uri` + a range). */
function isLocation(value) {
    return typeof value.uri === 'string' && isRange(value.range);
}
/** Structural range guard used by both location shapes. */
function isRange(value) {
    if (value === null || typeof value !== 'object')
        return false;
    var range = value;
    return isPosition(range.start) && isPosition(range.end);
}
/** Structural position guard. */
function isPosition(value) {
    if (value === null || typeof value !== 'object')
        return false;
    var position = value;
    return isProtocolCoordinate(position.line) && isProtocolCoordinate(position.character);
}
/** Whether a wire coordinate is a valid nonnegative integer. */
function isProtocolCoordinate(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
/**
 * Normalize a navigation result (`Location`, `Location[]`, `LocationLink[]`, or `null`) to the seam's
 * locations. `Location` maps directly; `LocationLink` maps `targetUri` + `targetSelectionRange`.
 * @param payload - the raw `textDocument/definition|references|implementation` result.
 * @returns the normalized locations (empty for `null`/`[]`).
 * @throws Error when an element is neither a `Location` nor a `LocationLink`.
 */
function normalizeLocations(payload) {
    if (payload === null)
        return [];
    if (payload === undefined)
        throw malformedResponse('LSP navigation result was missing');
    var elements = Array.isArray(payload) ? payload : [payload];
    var locations = [];
    for (var _i = 0, elements_1 = elements; _i < elements_1.length; _i++) {
        var element = elements_1[_i];
        if (element === null || typeof element !== 'object') {
            throw malformedResponse('LSP navigation result contained a non-object entry');
        }
        var record = element;
        if (isLocationLink(record)) {
            var link = record;
            locations.push({ uri: link.targetUri, range: toRange(link.targetSelectionRange) });
        }
        else if (isLocation(record)) {
            var location_1 = record;
            locations.push({ uri: location_1.uri, range: toRange(location_1.range) });
        }
        else {
            throw malformedResponse('LSP navigation result contained neither a Location nor a LocationLink');
        }
    }
    return locations;
}
/** Render one `MarkedString` (string form verbatim; object form as a language-tagged fenced block). */
function renderMarkedString(value) {
    if (typeof value === 'string')
        return value;
    return "```".concat(value.language, "\n").concat(value.value, "\n```");
}
/**
 * Normalize a `Hover` (or `null`) to the seam's hover. `MarkupContent` uses its `value`; a string
 * `MarkedString` is verbatim; a language-tagged `MarkedString` becomes a fenced code block; an array
 * joins its rendered parts with one blank line. The model-facing tool owns the complete result cap.
 * @param payload - the raw `textDocument/hover` result.
 * @returns the normalized hover, or `null` when there is no content.
 * @throws Error when the payload is a non-null, non-object, or structurally invalid hover.
 */
function normalizeHover(payload) {
    if (payload === null)
        return null;
    if (payload === undefined)
        throw malformedResponse('LSP hover result was missing');
    if (typeof payload !== 'object')
        throw malformedResponse('LSP hover result was not an object');
    var hover = payload;
    var contents = renderHoverContents(hover.contents);
    if (contents === '')
        return null;
    var range = hover.range;
    if (range === undefined)
        return { contents: contents };
    if (!isRange(range))
        throw malformedResponse('LSP hover result contained a malformed range');
    return { contents: contents, range: toRange(range) };
}
/** Render the three `Hover.contents` encodings into one string (input is untrusted wire data). */
function renderHoverContents(contents) {
    if (contents === null || contents === undefined) {
        throw malformedResponse('LSP hover result had no contents');
    }
    if (typeof contents === 'string')
        return contents;
    if (Array.isArray(contents)) {
        return contents.map(function (value) {
            if (isMarkedString(value))
                return renderMarkedString(value);
            throw malformedResponse('LSP hover contents contained a malformed MarkedString');
        }).join('\n\n');
    }
    if (typeof contents !== 'object') {
        throw malformedResponse('LSP hover contents were not MarkupContent, MarkedString, or an array');
    }
    var record = contents;
    if (record.kind === 'markdown' || record.kind === 'plaintext') {
        if (typeof record.value !== 'string') {
            throw malformedResponse('LSP hover MarkupContent value was not a string');
        }
        return record.value;
    }
    if (typeof record.language === 'string' && typeof record.value === 'string') {
        return renderMarkedString({ language: record.language, value: record.value });
    }
    throw malformedResponse('LSP hover contents were not MarkupContent, MarkedString, or an array');
}
/** Whether an untrusted value is either form of `MarkedString`. */
function isMarkedString(value) {
    if (typeof value === 'string')
        return true;
    if (value === null || typeof value !== 'object')
        return false;
    var record = value;
    return typeof record.language === 'string' && typeof record.value === 'string';
}
/** Create the stable structured error used for malformed server result payloads. */
function malformedResponse(message) {
    return new dsh_lsp_1.LspError(message, 'LSP_MALFORMED_RESPONSE');
}
