"use strict";
/**
 * Pure formatting and coordinate conversion for the `lsp` tool: one-based↔zero-based UTF-16 cursor
 * conversion, workspace-grouped location rendering with `file:`-URI resolution, complete-result
 * capping, and UI presentation. No I/O — a UI may call the presenter on live streaming and on
 * replay, so it depends only on the tool arguments.
 * @module @z/dsh-tool-lsp/render
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MAX_RESULT_CHARS = exports.DEFAULT_MAX_LOCATIONS = exports.LSP_OPERATIONS = void 0;
exports.parseLspArgs = parseLspArgs;
exports.formatLocations = formatLocations;
exports.formatHover = formatHover;
exports.renderUri = renderUri;
exports.presentLspCall = presentLspCall;
var node_path_1 = require("node:path");
var node_url_1 = require("node:url");
/** The four operations the tool exposes, as a runtime tuple for schema enum + validation. */
exports.LSP_OPERATIONS = ['goToDefinition', 'findReferences', 'goToImplementation', 'hover'];
/** Default cap on rendered locations before an omission marker is appended. */
exports.DEFAULT_MAX_LOCATIONS = 100;
/** Default cap on the complete rendered tool result, including truncation metadata. */
exports.DEFAULT_MAX_RESULT_CHARS = 16000;
/**
 * Validate and convert model arguments: `operation` must be one of the four; `line`/`character` are
 * positive one-based integers converted to the seam's zero-based position.
 * @param args - the schema-validated raw arguments.
 * @returns the validated input with a zero-based position.
 * @throws Error when the operation is unknown or a coordinate is not a positive integer.
 */
function parseLspArgs(args) {
    if (!isOperation(args.operation)) {
        throw new Error("operation must be one of ".concat(exports.LSP_OPERATIONS.join(', ')));
    }
    if (args.file_path.trim().length === 0)
        throw new Error('file_path must be a non-empty string');
    var line = oneBased(args.line, 'line');
    var character = oneBased(args.character, 'character');
    return {
        operation: args.operation,
        filePath: args.file_path,
        // The model counts from 1; the seam (and protocol) count from 0.
        position: { line: line - 1, character: character - 1 },
    };
}
/** Whether a string is one of the four operations. */
function isOperation(value) {
    return exports.LSP_OPERATIONS.includes(value);
}
/** Validate a one-based coordinate is a positive integer. */
function oneBased(value, name) {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error("".concat(name, " must be a positive integer (one-based)"));
    }
    return value;
}
/**
 * Render a locations result grouped by file, converting each zero-based location back to a one-based
 * `path:line:character` entry. A `file:` URI inside the workspace becomes a workspace-relative path;
 * outside it, a URI-derived absolute path; a non-`file:` URI is kept verbatim. Applies `maxLocations` and
 * appends an omission marker when it truncates by count, then applies the complete result cap.
 * @param locations - the seam's locations (possibly empty).
 * @param workspaceUri - the provider's canonical workspace `file:` URI.
 * @param maxLocations - the cap before truncation.
 * @param maxResultChars - the complete rendered-text cap, including truncation metadata.
 * @returns the rendered text; a distinct no-result line when there are none.
 */
function formatLocations(locations, workspaceUri, maxLocations, maxResultChars) {
    var _a;
    if (locations.length === 0)
        return boundResult('No results.', maxResultChars, 'locations');
    var shown = locations.slice(0, maxLocations);
    var omitted = locations.length - shown.length;
    var grouped = new Map();
    for (var _i = 0, shown_1 = shown; _i < shown_1.length; _i++) {
        var location_1 = shown_1[_i];
        var path = renderUri(location_1.uri, workspaceUri);
        var line = location_1.range.start.line + 1;
        var character = location_1.range.start.character + 1;
        var entries = (_a = grouped.get(path)) !== null && _a !== void 0 ? _a : [];
        entries.push("".concat(path, ":").concat(line, ":").concat(character));
        grouped.set(path, entries);
    }
    var lines = [];
    for (var _b = 0, _c = grouped.values(); _b < _c.length; _b++) {
        var entries = _c[_b];
        lines.push.apply(lines, entries);
    }
    if (omitted > 0) {
        lines.push("\u2026 ".concat(omitted, " more location").concat(omitted === 1 ? '' : 's', " omitted (limit ").concat(maxLocations, ")."));
    }
    return boundResult(lines.join('\n'), maxResultChars, 'locations');
}
/**
 * Render a hover result, applying `maxResultChars` last and keeping its marker within the cap.
 * @param hover - the normalized hover, or `null` for no hover.
 * @param maxResultChars - the complete rendered-text cap, including truncation metadata.
 * @returns the rendered hover text; a distinct no-result line for `null`.
 */
function formatHover(hover, maxResultChars) {
    var text = hover === null ? 'No hover information.' : hover.contents;
    return boundResult(text, maxResultChars, 'hover');
}
/** Bound a complete rendered result, including the truncation notice itself. */
function boundResult(text, maxChars, label) {
    if (text.length <= maxChars)
        return text;
    var notice = "\n\u2026 ".concat(label, " truncated (limit ").concat(maxChars, " characters).");
    if (notice.length >= maxChars)
        return notice.slice(0, maxChars);
    return "".concat(text.slice(0, maxChars - notice.length)).concat(notice);
}
/**
 * Resolve a location URI without applying the harness host's path rules. A valid `file:` URI becomes
 * workspace-relative when it is under the provider's canonical workspace URI, or a URI-derived
 * absolute path otherwise; malformed and non-`file:` URIs remain verbatim.
 * @param uri - the target URI from the seam.
 * @param workspaceUri - the provider's canonical workspace `file:` URI.
 * @returns the display path or the verbatim URI.
 */
function renderUri(uri, workspaceUri) {
    if (!uri.startsWith('file:'))
        return uri;
    var target;
    var workspace;
    try {
        target = new URL(uri);
        workspace = new URL(workspaceUri);
    }
    catch (_a) {
        return uri;
    }
    if (workspace.protocol !== 'file:')
        return uri;
    // A `file:` URI does not carry its world's OS, so a leading `/X:` segment is
    // read as a Windows drive. A POSIX workspace literally rooted at `/c:/...`
    // would mis-render (display only; edits and reads use the exact URI).
    var drivePath = /^\/[a-z](?::|%3A)/iu;
    var windowsWorld = workspace.hostname.length > 0 || drivePath.test(workspace.pathname);
    var targetWindowsWorld = windowsWorld && (target.hostname.length > 0 || drivePath.test(target.pathname));
    var workspacePath = filePath(workspace, windowsWorld);
    var targetPath = filePath(target, targetWindowsWorld);
    if (workspacePath === undefined || targetPath === undefined)
        return uri;
    if (windowsWorld !== targetWindowsWorld)
        return targetPath;
    var path = windowsWorld ? node_path_1.win32 : node_path_1.posix;
    var relative = path.relative(workspacePath, targetPath);
    var outside = relative === '..' || relative.startsWith("..".concat(path.sep)) || path.isAbsolute(relative);
    var rendered = relative === '' ? '.' : outside ? targetPath : relative;
    return windowsWorld ? rendered.replaceAll('\\', '/') : rendered;
}
/** Decode a file URL for its execution world while containing malformed URL failures. */
function filePath(url, windows) {
    try {
        var path = (0, node_url_1.fileURLToPath)(url, { windows: windows });
        return path.includes('\0') ? undefined : path;
    }
    catch (_a) {
        // `fileURLToPath` rejects malformed escapes, authorities, and encoded path separators.
        return undefined;
    }
}
/**
 * UI presentation for a pending `lsp` call. Uses a generic search card; the title carries the
 * operation and one-based cursor, and `locations` focuses the queried line. The shared location
 * shape has no character, so the title preserves the column.
 * @param args - the raw tool arguments.
 * @returns the generic call view.
 */
function presentLspCall(args) {
    return {
        card: 'generic',
        kind: 'search',
        title: "LSP ".concat(args.operation, " ").concat(args.file_path, ":").concat(args.line, ":").concat(args.character),
        locations: [{ path: args.file_path, line: args.line }],
    };
}
