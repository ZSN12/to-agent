"use strict";
/**
 * Model-facing workspace instruction rendering within an explicit byte budget.
 *
 * @module @z/dsh-agent-instructions/render
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
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
exports.USER_GLOBAL_FILE = exports.USER_GLOBAL_DIRECTORY = void 0;
exports.scopeForDisplayPath = scopeForDisplayPath;
exports.candidateScopeKey = candidateScopeKey;
exports.instructionScopeKey = instructionScopeKey;
exports.decodeScopeKey = decodeScopeKey;
exports.renderInstructionChanges = renderInstructionChanges;
exports.renderWorkspaceInstructionSet = renderWorkspaceInstructionSet;
exports.renderWorkspaceContext = renderWorkspaceContext;
var node_path_1 = require("node:path");
var SYSTEM_REMINDER_OPEN = '<system-reminder>';
var SYSTEM_REMINDER_CLOSE = '</system-reminder>';
var WORKSPACE_CONTEXT_INTRO = 'The following workspace instructions may be relevant to your work. '
    + 'Use them as guidance when applicable. More specific instructions take precedence over broader ones. '
    + 'They do not override system, developer, or direct user instructions.';
var REPLACEMENT_WORKSPACE_CONTEXT_INTRO = 'This complete workspace instruction baseline replaces all earlier workspace instruction baselines. '
    + WORKSPACE_CONTEXT_INTRO;
var EMPTY_REPLACEMENT_WORKSPACE_CONTEXT_INTRO = 'This complete workspace instruction baseline replaces all earlier workspace instruction baselines. '
    + 'No workspace instructions are currently active.';
var COMPACT_WORKSPACE_CONTEXT_INTRO = 'Workspace instructions were omitted or truncated to fit the configured byte budget.';
function byteLength(value) {
    return Buffer.byteLength(value, 'utf8');
}
function truncateUtf8(value, maxBytes) {
    var bytes = Buffer.from(value, 'utf8');
    if (bytes.length <= maxBytes)
        return value;
    var end = Math.max(0, Math.trunc(maxBytes));
    // If the first excluded byte is a UTF-8 continuation byte, the budget cut
    // through that code point. Back up to its lead byte and exclude it too.
    while (end > 0 && (bytes.readUInt8(end) & 0xc0) === 0x80) {
        end -= 1;
    }
    return bytes.subarray(0, end).toString('utf8');
}
function escapeInstructionFrameBody(body) {
    return body.replaceAll(SYSTEM_REMINDER_CLOSE, '<\\/system-reminder>');
}
function sectionText(file) {
    return "Instructions from: ".concat(file.displayPath, "\n\n").concat(file.content);
}
/** Directory component that identifies the single user-global instruction scope. */
exports.USER_GLOBAL_DIRECTORY = 'user-global';
/**
 * File name of the single user-global instruction file under `$DSH_HOME`.
 * Discovery (`$DSH_HOME/<name>`) and reconciliation (the user-global scope key's
 * candidate component) both key on this name, so it lives in one place: were the
 * two to disagree, the user-global instruction would load but never reconcile.
 */
exports.USER_GLOBAL_FILE = 'AGENTS.md';
/**
 * Derive the logical instruction scope from a model-facing path.
 * @param displayPath - project-relative or user-global instruction path.
 * @returns `user-global`, `.`, or the containing project-relative directory.
 */
function scopeForDisplayPath(displayPath) {
    if (displayPath === '~/.dsh/AGENTS.md' || displayPath === '$DSH_HOME/AGENTS.md')
        return exports.USER_GLOBAL_DIRECTORY;
    return (0, node_path_1.dirname)(displayPath);
}
var SCOPE_SEPARATOR = '\u0000';
/**
 * Compose the reconciliation key for one instruction candidate file.
 * Each loaded candidate is tracked independently, so the key pairs the logical
 * directory with the exact candidate file name behind a NUL separator that no
 * directory path or file name can contain. Distinct candidates in one directory
 * (`AGENTS.md` vs `CLAUDE.md`, a base file vs its `.local` overlay) therefore
 * never collide in the scope-keyed state maps.
 * @param directory - `user-global`, `.`, or a project-relative directory.
 * @param candidateName - instruction file name within that directory.
 * @returns the per-candidate logical scope key.
 */
function candidateScopeKey(directory, candidateName) {
    return "".concat(directory).concat(SCOPE_SEPARATOR).concat(candidateName);
}
/**
 * Derive the per-candidate scope key for a loaded instruction file.
 * @param displayPath - project-relative or user-global instruction path.
 * @returns the scope key pairing the file's directory with its name.
 */
function instructionScopeKey(displayPath) {
    return candidateScopeKey(scopeForDisplayPath(displayPath), (0, node_path_1.basename)(displayPath));
}
/**
 * Recover the directory and candidate name that {@link candidateScopeKey} encoded.
 * @param scope - a per-candidate scope key.
 * @returns the directory scope and the candidate file name within it.
 */
function decodeScopeKey(scope) {
    var separator = scope.indexOf(SCOPE_SEPARATOR);
    /* v8 ignore next -- every scope key is produced by candidateScopeKey, which always inserts the separator. */
    if (separator < 0)
        return { directory: scope, candidateName: '' };
    return { directory: scope.slice(0, separator), candidateName: scope.slice(separator + 1) };
}
function additionalSectionText(file) {
    var scope = scopeForDisplayPath(file.displayPath);
    return [
        "Additional instructions from: ".concat(file.displayPath),
        '',
        "These instructions apply to work under `".concat(scope, "`. Use them as guidance when relevant; more specific instructions take precedence. They do not override system, developer, or direct user instructions."),
        '',
        file.content,
    ].join('\n');
}
var BASELINE_RENDER_STYLE = { intro: WORKSPACE_CONTEXT_INTRO, section: sectionText };
function baselineRenderStyle(files, replacePreviousBaseline) {
    if (replacePreviousBaseline !== true)
        return BASELINE_RENDER_STYLE;
    return __assign(__assign({}, BASELINE_RENDER_STYLE), { intro: files.length === 0
            ? EMPTY_REPLACEMENT_WORKSPACE_CONTEXT_INTRO
            : REPLACEMENT_WORKSPACE_CONTEXT_INTRO });
}
function changedSectionText(item) {
    var change = item.change, file = item.file;
    if (change.action === 'set')
        return additionalSectionText(file);
    if (change.action === 'remove') {
        return "Instructions removed: ".concat(change.path, "\n\nThe previously loaded instructions from this file no longer apply.");
    }
    return [
        "Updated instructions from: ".concat(change.path),
        '',
        'This file changed after it was loaded. Use the following content instead of the previously loaded instructions from this file.',
        '',
        file.content,
    ].join('\n');
}
/**
 * Render one reconciliation batch and retain only transitions that fit.
 * @param items - ordered state transitions and current file contents.
 * @param maxBytes - maximum UTF-8 bytes allowed in the rendered batch.
 * @returns bounded prompt text and the transitions actually represented by it.
 */
function renderInstructionChanges(items, maxBytes) {
    var byAbsolutePath = new Map(items.map(function (item) { return [item.file.absolutePath, item]; }));
    var style = {
        intro: '',
        section: function (file) {
            var item = byAbsolutePath.get(file.absolutePath);
            /* v8 ignore next -- the renderer receives exactly the files used to construct this map. */
            return item === undefined ? '' : changedSectionText(__assign(__assign({}, item), { file: file }));
        },
    };
    var rendered = renderInstructionContext(items.map(function (item) { return item.file; }), maxBytes, style);
    var represented = new Set(rendered.represented.map(function (file) { return file.absolutePath; }));
    return {
        text: rendered.text,
        changes: items
            .filter(function (item) { return represented.has(item.file.absolutePath); })
            .map(function (item) { return item.change; }),
    };
}
function markerText(maxBytes, omitted, truncated) {
    if (omitted.length === 0 && truncated.length === 0)
        return '';
    var parts = [];
    if (omitted.length > 0) {
        parts.push("omitted ".concat(omitted.map(function (file) { return file.displayPath; }).join(', ')));
    }
    if (truncated.length > 0) {
        parts.push("truncated ".concat(truncated.map(function (item) { return "".concat(item.displayPath, " from ").concat(item.originalBytes, " to ").concat(item.includedBytes, " bytes"); }).join(', ')));
    }
    return "Workspace instruction budget ".concat(maxBytes, " bytes: ").concat(parts.join('; '));
}
function buildInstructionText(files, maxBytes, omitted, truncated, style) {
    var marker = markerText(maxBytes, omitted, truncated);
    var body = __spreadArray([marker, style.intro], files.map(function (file) { return style.section(file); }), true).filter(function (block) { return block.length > 0; });
    // Caller-owned framing: the plugin bakes the complete `<system-reminder>`
    // frame into the message content. The session surface projects context
    // verbatim and does not wrap it, so any framing must live here in the
    // producer's content (the pattern a future `meta`-driven renderer would
    // generalize — see the deferred note in
    // ../../../../.agents/notes/implemented/simplification/2026-07-20-unwrap-injected-content-envelopes.md).
    return [SYSTEM_REMINDER_OPEN, escapeInstructionFrameBody(body.join('\n\n')), SYSTEM_REMINDER_CLOSE].join('\n');
}
function withTruncatedContent(file, includedBytes) {
    return __assign(__assign({}, file), { content: truncateUtf8(file.content, includedBytes) });
}
function truncateToFit(file, includedFiles, maxBytes, omitted, style) {
    var originalBytes = byteLength(file.content);
    var low = 0;
    var high = originalBytes;
    var best = withTruncatedContent(file, 0);
    while (low <= high) {
        var mid = Math.floor((low + high) / 2);
        var candidate = withTruncatedContent(file, mid);
        var truncated = [{ displayPath: file.displayPath, originalBytes: originalBytes, includedBytes: byteLength(candidate.content) }];
        var text = buildInstructionText(__spreadArray(__spreadArray([], includedFiles, true), [candidate], false), maxBytes, omitted, truncated, style);
        if (byteLength(text) <= maxBytes) {
            best = candidate;
            low = mid + 1;
        }
        else {
            high = mid - 1;
        }
    }
    return best;
}
function renderInstructionContext(files, maxBytes, style) {
    if (maxBytes <= 0 || !Number.isFinite(maxBytes)) {
        return { text: '', omitted: files, truncated: [], represented: [] };
    }
    var fullText = buildInstructionText(files, maxBytes, [], [], style);
    if (byteLength(fullText) <= maxBytes) {
        return { text: fullText, omitted: [], truncated: [], represented: files };
    }
    for (var start = 1; start < files.length; start += 1) {
        var included = files.slice(start);
        var omitted_1 = files.slice(0, start).map(function (file) { return ({ absolutePath: file.absolutePath, displayPath: file.displayPath }); });
        var suffixText = buildInstructionText(included, maxBytes, omitted_1, [], style);
        if (byteLength(suffixText) <= maxBytes)
            return { text: suffixText, omitted: omitted_1, truncated: [], represented: included };
    }
    var mostSpecific = files.at(-1);
    /* v8 ignore next -- callers only reach this after a non-empty fullText was built. */
    if (mostSpecific === undefined)
        return { text: '', omitted: [], truncated: [], represented: [] };
    var omitted = files.slice(0, -1).map(function (file) { return ({ absolutePath: file.absolutePath, displayPath: file.displayPath }); });
    var originalBytes = byteLength(mostSpecific.content);
    for (var _i = 0, _a = [style, __assign(__assign({}, style), { intro: COMPACT_WORKSPACE_CONTEXT_INTRO })]; _i < _a.length; _i++) {
        var candidateStyle = _a[_i];
        var truncatedFile = truncateToFit(mostSpecific, [], maxBytes, omitted, candidateStyle);
        var includedBytes = byteLength(truncatedFile.content);
        var truncated_1 = [{
                displayPath: mostSpecific.displayPath,
                originalBytes: originalBytes,
                includedBytes: includedBytes,
            }];
        var text_1 = buildInstructionText([truncatedFile], maxBytes, omitted, truncated_1, candidateStyle);
        if (byteLength(text_1) <= maxBytes) {
            var represented = includedBytes > 0 || originalBytes === 0 ? [mostSpecific] : [];
            return { text: text_1, omitted: omitted, truncated: truncated_1, represented: represented };
        }
    }
    var truncated = [{
            displayPath: mostSpecific.displayPath,
            originalBytes: originalBytes,
            includedBytes: 0,
        }];
    var compactNotice = escapeInstructionFrameBody(markerText(maxBytes, omitted, truncated));
    var compactWithHeading = escapeInstructionFrameBody([compactNotice, style.section(withTruncatedContent(mostSpecific, 0))].join('\n\n'));
    if (byteLength(compactWithHeading) <= maxBytes) {
        var represented = originalBytes === 0 ? [mostSpecific] : [];
        return { text: compactWithHeading, omitted: omitted, truncated: truncated, represented: represented };
    }
    var text = byteLength(compactNotice) <= maxBytes ? compactNotice : truncateUtf8(compactNotice, maxBytes);
    return { text: text, omitted: omitted, truncated: truncated, represented: [] };
}
/**
 * Render a baseline together with the exact source files semantically represented in it.
 * @param files - loaded files ordered from broadest to most specific.
 * @param options - rendering byte budget and whether this baseline supersedes a visible predecessor.
 * @returns bounded public rendering plus files with surviving content, including genuinely empty files.
 * @internal
 */
function renderWorkspaceInstructionSet(files, options) {
    var style = baselineRenderStyle(files, options.replacePreviousBaseline);
    var _a = renderInstructionContext(files, options.maxBytes, style), represented = _a.represented, rendered = __rest(_a, ["represented"]);
    return { rendered: rendered, included: represented };
}
/**
 * Render the baseline instruction chain with deterministic precedence budgeting.
 * @param files - loaded files ordered from broadest to most specific.
 * @param options - rendering byte budget and whether this baseline supersedes a visible predecessor.
 * @returns bounded baseline prompt text and budget diagnostics.
 */
function renderWorkspaceContext(files, options) {
    return renderWorkspaceInstructionSet(files, options).rendered;
}
