"use strict";
/**
 * Model-facing UTF-8 read. It performs one provider stat for type, routing, and observed version,
 * streams large or size-unknown files, renders a bounded window, then emits the observation.
 * @module @z/dsh-tool-fs/src/read
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.STREAM_MIN_SIZE = exports.READ_LIMIT = void 0;
exports.parseReadArgs = parseReadArgs;
exports.applyReadTool = applyReadTool;
var dsh_tools_1 = require("@z/dsh-tools");
var read_render_ts_1 = require("./read-render.ts");
var read_target_ts_1 = require("./read-target.ts");
/** Default and maximum number of lines returned by one `read` call (the `readLimit` config). */
exports.READ_LIMIT = 2000;
/**
 * Default streaming threshold (the `readStreamMinSize` config): files at or
 * above this size stream; smaller files read whole into memory.
 */
exports.STREAM_MIN_SIZE = 10 * 1024 * 1024;
function parsePositiveInteger(value, name) {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
        throw new Error("".concat(name, " must be a positive integer"));
    }
    return value;
}
/**
 * Validate value constraints the schema DSL can't express. `maxLimit` is the deployment's line cap.
 * @param args - the schema-validated raw tool arguments; `offset`/`limit` must be positive integers when given.
 * @param maxLimit - the configured line cap: both the default `limit` and the largest one accepted.
 * @returns the validated input with `offset` defaulted to 1 and `limit` to `maxLimit`.
 */
function parseReadArgs(args, maxLimit) {
    var _a;
    if (args.file_path !== undefined && args.path !== undefined && args.file_path !== args.path) {
        throw new Error('file_path and path must match when both are provided');
    }
    var filePath = (_a = args.file_path) !== null && _a !== void 0 ? _a : args.path;
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
        throw new Error('file_path must be a non-empty string');
    }
    var offset = args.offset === undefined ? 1 : parsePositiveInteger(args.offset, 'offset');
    var limit = args.limit === undefined ? maxLimit : parsePositiveInteger(args.limit, 'limit');
    if (limit > maxLimit)
        throw new Error("limit must be less than or equal to ".concat(maxLimit));
    return { filePath: filePath, offset: offset, limit: limit };
}
/**
 * Register the `read` tool and its system-prompt guidance.
 * @param ctx - the plugin context; registrations are effects scoped to it, and execution uses its `fs` service.
 * @param caps - the deployment's resolved read caps (plugin config after defaulting).
 */
function applyReadTool(ctx, caps) {
    ctx.systemPrompt.section({
        name: 'tool:read',
        order: 100,
        text: 'Use the read tool — not shell commands like cat — to inspect text files. Prefer file_path; path is accepted as a compatibility alias. Results include line numbers. Use offset and limit to continue reading large files.',
    });
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'read',
        description: 'Read a UTF-8 text file and return line-numbered content. Use file_path; path is accepted as a compatibility alias.',
        parameters: {
            file_path: { type: 'string', description: 'Canonical path to read, resolved by the filesystem backend.' },
            path: { type: 'string', description: 'Compatibility alias for file_path; use only when file_path is omitted.' },
            offset: { type: 'number', description: '1-based first line to return. Defaults to 1.' },
            limit: { type: 'number', description: "Maximum number of lines to return. Defaults to ".concat(caps.limit, ".") },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    path: { type: 'string', required: true },
                    offset: { type: 'integer', required: true },
                    lines: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                number: { type: 'integer', required: true },
                                text: { type: 'string', required: true },
                            },
                        },
                    },
                    totalLines: { type: 'integer', required: true },
                },
            },
            render: function (args, value) {
                var _a, _b;
                var input = parseReadArgs(args, caps.limit);
                var endLine = (_b = (_a = value.lines.at(-1)) === null || _a === void 0 ? void 0 : _a.number) !== null && _b !== void 0 ? _b : Math.max(0, value.offset - 1);
                var truncatedByBytes = value.lines.length < input.limit && endLine < value.totalLines;
                return [{
                        type: 'text',
                        text: (0, read_render_ts_1.formatReadOutput)(value.path, __assign({ offset: value.offset, lines: value.lines, totalLines: value.totalLines }, truncatedByBytes ? { truncatedByBytes: true } : {})),
                    }];
            },
            // Project the structured window into persisted `meta` so a UI's read card
            // survives replay: the raw canonical output object is not on the wire, only
            // the model-facing text, from which the line/lang data cannot be recovered.
            presentationMeta: function (_args, value) {
                var lang = (0, read_render_ts_1.langFromPath)(value.path);
                return __assign({ path: value.path, offset: value.offset, lines: value.lines.map(function (_a) {
                        var number = _a.number, text = _a.text;
                        return ({ number: number, text: text });
                    }), totalLines: value.totalLines }, lang === undefined ? {} : { lang: lang });
            },
        },
        // Observation races fail closed because guarded mutations re-check the version in-lock.
        isConcurrencySafe: function () { return true; },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var input, _a, target, info, chunks, _b, window, outcome;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            input = parseReadArgs(args, caps.limit);
                            return [4 /*yield*/, (0, read_target_ts_1.resolveRegularReadTarget)(ctx, exec, input.filePath)
                                // Stream when the file is large OR size is unknown, so a size-less backend
                                // never buffers an arbitrarily large file.
                            ];
                        case 1:
                            _a = _c.sent(), target = _a.target, info = _a.info;
                            if (!(info.size === undefined || info.size >= caps.streamMinSize)) return [3 /*break*/, 3];
                            return [4 /*yield*/, ctx.fs.streamText(target, exec.signal)];
                        case 2:
                            _b = _c.sent();
                            return [3 /*break*/, 5];
                        case 3: return [4 /*yield*/, ctx.fs.readText(target, exec.signal)];
                        case 4:
                            _b = [_c.sent()];
                            _c.label = 5;
                        case 5:
                            chunks = _b;
                            return [4 /*yield*/, (0, read_render_ts_1.buildWindow)(chunks, { offset: input.offset, limit: input.limit, maxLineLength: caps.maxLineLength, maxBytes: caps.maxBytes }, target.displayPath)];
                        case 6:
                            window = _c.sent();
                            outcome = {
                                path: target.displayPath,
                                offset: input.offset,
                                lines: window.lines,
                                totalLines: window.totalLines,
                            };
                            // Record the present observation (a no-op when no policy plugin listens). The
                            // read already succeeded; an fs/observed listener is contractually a
                            // synchronous, side-effect-only recorder.
                            ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec);
                            return [2 /*return*/, outcome];
                    }
                });
            });
        },
        // Result-time display: a `read` card carrying the structured line window a
        // capable UI renders as a line-numbered, syntax-highlighted view. The
        // structured data is narrowed from the persisted `meta` (replay-safe); the
        // envelope-stripped model-facing text rides along as `content` so a UI without
        // the read capability still shows the file text. A malformed or absent meta,
        // or a result whose text is not the read envelope, declines to `undefined`
        // (the generic fallback), never throwing on replay of obsolete logged output.
        presentResult: function (_args, result) {
            var _a;
            if (result.isError)
                return undefined;
            var meta = (0, read_render_ts_1.readMetaFromMeta)(result.meta);
            if (meta === undefined)
                return undefined;
            var only = result.content.length === 1 ? result.content[0] : undefined;
            var text = (only === null || only === void 0 ? void 0 : only.type) === 'text' ? only.text : undefined;
            if (text === undefined)
                return undefined;
            // Group 1 always captures (possibly empty) when the envelope matches.
            var body = (_a = /^<path>[^\n]*<\/path>\n<type>file<\/type>\n<content>\n([\s\S]*)\n<\/content>$/u.exec(text)) === null || _a === void 0 ? void 0 : _a[1];
            if (body === undefined)
                return undefined;
            return __assign(__assign({ card: 'read', path: meta.path, offset: meta.offset, lines: meta.lines, totalLines: meta.totalLines }, meta.lang === undefined ? {} : { lang: meta.lang }), { content: [{ type: 'text', text: body }] });
        },
        // Pure display: a generic card titled by the file with the read window appended (`Read
        // foo.txt (5 - 8)`), `read` kind (icon), and a follow-along location whose line is the
        // read's offset (defaulting to 1). The window reflects raw args, so an omitted limit keeps
        // the title bare instead of smuggling config into this pure presenter.
        presentCall: function (args) {
            var _a, _b;
            var filePath = (_b = (_a = args.file_path) !== null && _a !== void 0 ? _a : args.path) !== null && _b !== void 0 ? _b : '';
            var offset = args.offset, limit = args.limit;
            var window = limit !== undefined && limit > 0
                ? " (".concat(offset !== null && offset !== void 0 ? offset : 1, " - ").concat((offset !== null && offset !== void 0 ? offset : 1) + limit - 1, ")")
                : offset !== undefined ? " (from line ".concat(offset, ")") : '';
            return {
                card: 'generic',
                title: "Read ".concat(filePath).concat(window),
                kind: 'read',
                locations: [{ path: filePath, line: offset !== null && offset !== void 0 ? offset : 1 }],
            };
        },
    }));
}
