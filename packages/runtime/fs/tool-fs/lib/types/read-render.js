"use strict";
/**
 * Pure read presentation: turn provider-decoded text into a bounded, line-numbered window and
 * model-facing envelope. Chunk scanning caps the current line, so even one newline-free giant
 * line cannot grow memory without bound.
 * @module @z/dsh-tool-fs/read-render
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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.READ_MAX_BYTES = exports.READ_MAX_LINE_LENGTH = void 0;
exports.buildWindow = buildWindow;
exports.formatReadOutput = formatReadOutput;
exports.langFromPath = langFromPath;
exports.readMetaFromMeta = readMetaFromMeta;
var dsh_fs_1 = require("@z/dsh-fs");
/** Default maximum characters returned for a single line (the `readMaxLineLength` config). */
exports.READ_MAX_LINE_LENGTH = 2000;
/** Default maximum bytes returned for selected file lines (the `readMaxBytes` config). */
exports.READ_MAX_BYTES = 50 * 1024;
function newAccumulator() {
    return { lines: [], totalLines: 0, outputBytes: 0, truncatedByBytes: false };
}
function truncateLine(line, maxLineLength) {
    return line.length > maxLineLength ? "".concat(line.substring(0, maxLineLength), "... (line truncated to ").concat(maxLineLength, " chars)") : line;
}
function lineByteSize(line, currentLineCount) {
    return Buffer.byteLength(line, 'utf8') + (currentLineCount > 0 ? 1 : 0);
}
function consumeLine(acc, rawLine, request) {
    acc.totalLines += 1;
    if (acc.truncatedByBytes || acc.totalLines < request.offset || acc.lines.length >= request.limit)
        return;
    var text = truncateLine(rawLine, request.maxLineLength);
    var bytes = lineByteSize(text, acc.lines.length);
    if (acc.outputBytes + bytes > request.maxBytes) {
        acc.truncatedByBytes = true;
        return;
    }
    acc.outputBytes += bytes;
    acc.lines.push({ number: acc.totalLines, text: text });
}
function stripCarriageReturn(line) {
    return line.endsWith('\r') ? line.slice(0, -1) : line;
}
function finish(acc, request, displayPath) {
    if (!acc.truncatedByBytes && request.offset > acc.totalLines && !(acc.totalLines === 0 && request.offset === 1)) {
        throw new dsh_fs_1.FsError("offset ".concat(request.offset, " is out of range for \"").concat(displayPath, "\" (").concat(acc.totalLines, " lines)"), 'FS_NOT_FOUND');
    }
    return { lines: acc.lines, totalLines: acc.totalLines, truncatedByBytes: acc.truncatedByBytes };
}
/**
 * Build one window from streamed or whole-file chunks, enforcing line and byte caps while still
 * scanning to an exact total line count, and throwing `FS_NOT_FOUND` when the requested offset is
 * past EOF.
 * @param chunks - decoded text chunks in file order; chunk boundaries carry no meaning.
 * @param request - the resolved window; the caller has already applied its defaults and caps.
 * @param displayPath - the caller-facing path used in the offset-out-of-range error.
 * @returns the numbered window lines, the total line count seen, and the byte-cap truncation flag.
 */
function buildWindow(chunks, request, displayPath) {
    return __awaiter(this, void 0, void 0, function () {
        function appendToLineBuffer(segment) {
            if (lineBuffer.length >= lineBufferCap)
                return;
            lineBuffer += segment;
            if (lineBuffer.length > lineBufferCap)
                lineBuffer = lineBuffer.slice(0, lineBufferCap);
        }
        function flushLine() {
            consumeLine(acc, stripCarriageReturn(lineBuffer), request);
            lineBuffer = '';
        }
        var acc, lineBufferCap, lineBuffer, chunk, startPos, newlinePos, e_1_1;
        var _a, chunks_1, chunks_1_1;
        var _b, e_1, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    acc = newAccumulator();
                    lineBufferCap = request.maxLineLength + 1;
                    lineBuffer = '';
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 6, 7, 12]);
                    _a = true, chunks_1 = __asyncValues(chunks);
                    _e.label = 2;
                case 2: return [4 /*yield*/, chunks_1.next()];
                case 3:
                    if (!(chunks_1_1 = _e.sent(), _b = chunks_1_1.done, !_b)) return [3 /*break*/, 5];
                    _d = chunks_1_1.value;
                    _a = false;
                    chunk = _d;
                    startPos = 0;
                    newlinePos = void 0;
                    while ((newlinePos = chunk.indexOf('\n', startPos)) !== -1) {
                        appendToLineBuffer(chunk.slice(startPos, newlinePos));
                        flushLine();
                        startPos = newlinePos + 1;
                    }
                    appendToLineBuffer(chunk.slice(startPos));
                    _e.label = 4;
                case 4:
                    _a = true;
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 12];
                case 6:
                    e_1_1 = _e.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 12];
                case 7:
                    _e.trys.push([7, , 10, 11]);
                    if (!(!_a && !_b && (_c = chunks_1.return))) return [3 /*break*/, 9];
                    return [4 /*yield*/, _c.call(chunks_1)];
                case 8:
                    _e.sent();
                    _e.label = 9;
                case 9: return [3 /*break*/, 11];
                case 10:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 11: return [7 /*endfinally*/];
                case 12:
                    if (lineBuffer.length > 0)
                        flushLine();
                    return [2 /*return*/, finish(acc, request, displayPath)];
            }
        });
    });
}
/**
 * Format a read outcome as one OpenCode-style line-numbered text block body.
 * @param displayPath - the backend-resolved path rendered in the envelope's `<path>` element.
 * @param outcome - the windowed read to render.
 * @returns the model-facing envelope: numbered lines plus a continuation or end-of-file footer.
 */
function formatReadOutput(displayPath, outcome) {
    var _a, _b;
    var endLine = (_b = (_a = outcome.lines.at(-1)) === null || _a === void 0 ? void 0 : _a.number) !== null && _b !== void 0 ? _b : Math.max(0, outcome.offset - 1);
    var footer;
    if (outcome.truncatedByBytes) {
        footer = "(Output capped. Showing lines ".concat(outcome.offset, "-").concat(endLine, ". Use offset=").concat(endLine + 1, " to continue.)");
    }
    else if (endLine < outcome.totalLines) {
        footer = "(Showing lines ".concat(outcome.offset, "-").concat(endLine, " of ").concat(outcome.totalLines, ". Use offset=").concat(endLine + 1, " to continue.)");
    }
    else {
        footer = "(End of file - total ".concat(outcome.totalLines, " lines)");
    }
    var body = outcome.lines.length > 0
        ? "".concat(outcome.lines.map(function (line) { return "".concat(line.number, ": ").concat(line.text); }).join('\n'), "\n\n").concat(footer)
        : footer;
    return "<path>".concat(displayPath, "</path>\n<type>file</type>\n<content>\n").concat(body, "\n</content>");
}
/**
 * Lowercased file-extension to syntax-highlighting language hint. Keys are the
 * extension without its dot; a UI treats an absent key as plain text. The map is
 * intentionally small — common source, config, and markup extensions a
 * line-numbered code view benefits from highlighting — not an exhaustive registry.
 */
var LANG_BY_EXTENSION = {
    ts: 'ts', tsx: 'tsx', mts: 'ts', cts: 'ts',
    js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js',
    json: 'json', jsonc: 'json',
    py: 'py', rb: 'rb', go: 'go', rs: 'rs', java: 'java',
    c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cxx: 'cpp',
    cs: 'cs', kt: 'kotlin', swift: 'swift', php: 'php',
    sh: 'sh', bash: 'sh', zsh: 'sh',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini',
    md: 'md', markdown: 'md', mdx: 'mdx',
    html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
    sql: 'sql', xml: 'xml', lua: 'lua',
};
/**
 * Derive a syntax-highlighting language hint from a read path's file extension.
 * Pure and case-insensitive on the extension; a dotfile with no extension
 * (`.gitignore`) and an unknown extension both yield `undefined`.
 * @param path - the model-facing path the read reported.
 * @returns the language hint for {@link LANG_BY_EXTENSION}, or `undefined` when the extension maps to none.
 */
function langFromPath(path) {
    var base = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
    var dot = base.lastIndexOf('.');
    // A leading dot is a dotfile (no extension), not an empty extension.
    if (dot <= 0)
        return undefined;
    var ext = base.slice(dot + 1).toLowerCase();
    // Own-property check only: a filename whose extension is an Object.prototype
    // key (`foo.constructor`, `foo.__proto__`) must map to no language, not to the
    // inherited member — otherwise a function would reach `lang` and fail the
    // tool-output JSON validation.
    return Object.hasOwn(LANG_BY_EXTENSION, ext) ? LANG_BY_EXTENSION[ext] : undefined;
}
/**
 * Whether `value` is a valid {@link FileTextLine} (defensive narrowing from
 * opaque `meta`). `number` must be a 1-based integer line number, since a card
 * rendered from a zero, fractional, or non-finite line number would violate the
 * 1-based numbering contract the read window promises.
 */
function isFileTextLine(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    var _a = value, number = _a.number, text = _a.text;
    return typeof number === 'number' && Number.isInteger(number) && number >= 1 && typeof text === 'string';
}
/**
 * Narrow opaque live or replayed result metadata to a structured read window.
 * Malformed metadata returns `undefined` so presentation can fall back to the
 * generic text card instead of throwing during replay. Beyond shape, the
 * semantic contract of a read window is enforced against replayed JSON that is
 * well-typed but out of range: `offset` must be a 1-based integer, `totalLines`
 * must be a non-negative integer, each line number must be a 1-based integer no
 * less than `offset`, the line numbers must strictly increase, and no line number
 * may exceed `totalLines`. Any violation declines to the generic fallback rather
 * than emitting a card that misnumbers or overcounts.
 * @param meta - result metadata.
 * @returns the validated read window, or `undefined` for absent, malformed, or semantically invalid data.
 */
function readMetaFromMeta(meta) {
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta))
        return undefined;
    var _a = meta, path = _a.path, offset = _a.offset, lines = _a.lines, totalLines = _a.totalLines, lang = _a.lang;
    if (typeof path !== 'string' || typeof totalLines !== 'number' || typeof offset !== 'number')
        return undefined;
    if (!Number.isInteger(offset) || offset < 1)
        return undefined;
    if (!Number.isInteger(totalLines) || totalLines < 0)
        return undefined;
    if (!Array.isArray(lines) || !lines.every(isFileTextLine))
        return undefined;
    if (lang !== undefined && typeof lang !== 'string')
        return undefined;
    var previous = offset - 1;
    for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
        var number = lines_1[_i].number;
        if (number <= previous || number > totalLines)
            return undefined;
        previous = number;
    }
    return __assign({ path: path, offset: offset, lines: lines, totalLines: totalLines }, lang === undefined ? {} : { lang: lang });
}
