"use strict";
/**
 * Model-facing `lsp` tool over `ctx.lsp`. One read-only tool with four operations
 * (`goToDefinition`/`findReferences`/`goToImplementation`/`hover`); it converts one-based UTF-16
 * cursor coordinates to the seam's zero-based positions, requires the session workspace with no
 * fallback, caps and renders results, and attaches a configurable timeout budget for
 * `dsh-tool-call-timeout-policy` to enforce. It runtime-injects only `tools`, `lsp`, and `systemPrompt` and
 * imports no provider.
 *
 * Namespace plugin (named exports, no default export).
 * @module @z/dsh-tool-lsp
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
exports.Config = exports.LSP_PROMPT_TEXT = exports.DEFAULT_LSP_TOOL_TIMEOUT_MS = exports.inject = exports.name = exports.sessionCwd = exports.renderUri = exports.presentLspCall = exports.parseLspArgs = exports.LSP_OPERATIONS = exports.formatLocations = exports.formatHover = exports.DEFAULT_MAX_RESULT_CHARS = exports.DEFAULT_MAX_LOCATIONS = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_tools_1 = require("@z/dsh-tools");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_lsp_1 = require("@z/dsh-lsp");
var dsh_timeout_1 = require("@z/dsh-timeout");
var render_ts_1 = require("./render.ts");
var session_cwd_ts_1 = require("./session-cwd.ts");
var render_ts_2 = require("./render.ts");
Object.defineProperty(exports, "DEFAULT_MAX_LOCATIONS", { enumerable: true, get: function () { return render_ts_2.DEFAULT_MAX_LOCATIONS; } });
Object.defineProperty(exports, "DEFAULT_MAX_RESULT_CHARS", { enumerable: true, get: function () { return render_ts_2.DEFAULT_MAX_RESULT_CHARS; } });
Object.defineProperty(exports, "formatHover", { enumerable: true, get: function () { return render_ts_2.formatHover; } });
Object.defineProperty(exports, "formatLocations", { enumerable: true, get: function () { return render_ts_2.formatLocations; } });
Object.defineProperty(exports, "LSP_OPERATIONS", { enumerable: true, get: function () { return render_ts_2.LSP_OPERATIONS; } });
Object.defineProperty(exports, "parseLspArgs", { enumerable: true, get: function () { return render_ts_2.parseLspArgs; } });
Object.defineProperty(exports, "presentLspCall", { enumerable: true, get: function () { return render_ts_2.presentLspCall; } });
Object.defineProperty(exports, "renderUri", { enumerable: true, get: function () { return render_ts_2.renderUri; } });
var session_cwd_ts_2 = require("./session-cwd.ts");
Object.defineProperty(exports, "sessionCwd", { enumerable: true, get: function () { return session_cwd_ts_2.sessionCwd; } });
/** Cordis plugin name for loader diagnostics. */
exports.name = 'tool-lsp';
/** Services required by this plugin. */
exports.inject = ['tools', 'lsp', 'systemPrompt'];
/** Default tool-call timeout budget (ms), covering the queued open/query/close lifecycle. */
exports.DEFAULT_LSP_TOOL_TIMEOUT_MS = 60000;
/** The stable system-prompt guidance positioning LSP as a precision aid. */
exports.LSP_PROMPT_TEXT = 'Use search/read for ordinary navigation. Use lsp when textual matches are ambiguous or before a change requires precise definitions, implementations, or references. Positions are one-based line and character (UTF-16) at the cursor; an off-symbol position may return no results. findReferences always includes the declaration.';
exports.Config = schemastery_1.default.object({
    maxLocations: schemastery_1.default.number().default(render_ts_1.DEFAULT_MAX_LOCATIONS),
    maxResultChars: schemastery_1.default.number().default(render_ts_1.DEFAULT_MAX_RESULT_CHARS),
    timeoutMs: schemastery_1.default.number().max(dsh_timeout_1.MAX_TIMER_DELAY_MS).default(exports.DEFAULT_LSP_TOOL_TIMEOUT_MS),
});
var LSP_POSITION_OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        line: { type: 'integer', required: true },
        character: { type: 'integer', required: true },
    },
};
var LSP_RANGE_OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        start: __assign(__assign({}, LSP_POSITION_OUTPUT_SCHEMA), { required: true }),
        end: __assign(__assign({}, LSP_POSITION_OUTPUT_SCHEMA), { required: true }),
    },
};
/**
 * Register the `lsp` tool and its system-prompt guidance.
 * @param ctx - the plugin context (must inject `tools`, `lsp`, `systemPrompt`).
 * @param config - the resolved plugin configuration.
 */
function apply(ctx, config) {
    var resolved = config;
    assertPositiveInteger('maxLocations', resolved.maxLocations);
    assertPositiveInteger('maxResultChars', resolved.maxResultChars);
    assertTimer('timeoutMs', resolved.timeoutMs);
    ctx.systemPrompt.section({ name: 'tool:lsp', order: 112, text: exports.LSP_PROMPT_TEXT });
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'lsp',
        description: 'Query a language server for precise code navigation. operation is one of goToDefinition, findReferences, goToImplementation, hover. line and character are one-based UTF-16 cursor coordinates. findReferences includes the declaration.',
        parameters: {
            operation: {
                type: 'string',
                required: true,
                enum: __spreadArray([], render_ts_1.LSP_OPERATIONS, true),
                description: 'goToDefinition, findReferences, goToImplementation, or hover.',
            },
            file_path: { type: 'string', required: true, description: 'The source file to query, relative to the workspace or absolute.' },
            line: { type: 'number', required: true, description: 'One-based line of the cursor.' },
            character: { type: 'number', required: true, description: 'One-based UTF-16 column of the cursor.' },
        },
        output: {
            schema: {
                oneOf: [
                    {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            kind: { type: 'string', required: true, const: 'locations' },
                            locations: {
                                type: 'array',
                                required: true,
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        uri: { type: 'string', required: true },
                                        range: __assign(__assign({}, LSP_RANGE_OUTPUT_SCHEMA), { required: true }),
                                    },
                                },
                            },
                            resolvedWorkspaceUri: { type: 'string', required: true },
                        },
                    },
                    {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            kind: { type: 'string', required: true, const: 'hover' },
                            hover: {
                                required: true,
                                oneOf: [
                                    { type: 'null' },
                                    {
                                        type: 'object',
                                        additionalProperties: false,
                                        properties: {
                                            contents: { type: 'string', required: true },
                                            range: LSP_RANGE_OUTPUT_SCHEMA,
                                        },
                                    },
                                ],
                            },
                        },
                    },
                ],
            },
            render: function (_args, value) {
                switch (value.kind) {
                    case 'locations':
                        return [{ type: 'text', text: (0, render_ts_1.formatLocations)(value.locations, value.resolvedWorkspaceUri, resolved.maxLocations, resolved.maxResultChars) }];
                    case 'hover':
                        return [{ type: 'text', text: (0, render_ts_1.formatHover)(value.hover, resolved.maxResultChars) }];
                    /* v8 ignore next -- exhaustive over the output schema's closed union; unreachable. */
                    default:
                        return (0, dsh_llm_1.assertNever)(value, 'tool-lsp output');
                }
            },
        },
        timeoutMs: resolved.timeoutMs,
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var input, workspaceRoot, result;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            input = (0, render_ts_1.parseLspArgs)(args);
                            workspaceRoot = (0, session_cwd_ts_1.sessionCwd)(exec);
                            if (workspaceRoot === undefined) {
                                throw new dsh_lsp_1.LspError('the lsp tool requires a session workspace cwd', 'LSP_WORKSPACE_REQUIRED');
                            }
                            return [4 /*yield*/, ctx.lsp.query({
                                    operation: input.operation,
                                    filePath: input.filePath,
                                    position: input.position,
                                    workspaceRoot: workspaceRoot,
                                }, exec.signal)];
                        case 1:
                            result = _a.sent();
                            switch (result.kind) {
                                case 'locations':
                                    return [2 /*return*/, {
                                            kind: 'locations',
                                            locations: result.locations.map(function (location) { return ({
                                                uri: location.uri,
                                                range: {
                                                    start: { line: location.range.start.line, character: location.range.start.character },
                                                    end: { line: location.range.end.line, character: location.range.end.character },
                                                },
                                            }); }),
                                            resolvedWorkspaceUri: result.resolvedWorkspaceUri,
                                        }];
                                case 'hover':
                                    return [2 /*return*/, {
                                            kind: 'hover',
                                            hover: result.hover === null
                                                ? null
                                                : __assign({ contents: result.hover.contents }, result.hover.range === undefined
                                                    ? {}
                                                    : {
                                                        range: {
                                                            start: { line: result.hover.range.start.line, character: result.hover.range.start.character },
                                                            end: { line: result.hover.range.end.line, character: result.hover.range.end.character },
                                                        },
                                                    }),
                                        }
                                        /* v8 ignore next -- exhaustive over the closed LspQueryResult union; unreachable. */
                                    ];
                                /* v8 ignore next -- exhaustive over the closed LspQueryResult union; unreachable. */
                                default:
                                    return [2 /*return*/, (0, dsh_llm_1.assertNever)(result, 'tool-lsp result')];
                            }
                            return [2 /*return*/];
                    }
                });
            });
        },
        presentCall: render_ts_1.presentLspCall,
    }));
}
/** Reject a non-positive-integer config value at load, so misconfiguration fails loud. */
function assertPositiveInteger(name, value) {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error("tool-lsp: ".concat(name, " must be a positive integer"));
    }
}
/** Reject a timer value Node would clamp instead of scheduling as configured. */
function assertTimer(name, value) {
    if (!Number.isInteger(value) || value < 1 || value > dsh_timeout_1.MAX_TIMER_DELAY_MS) {
        throw new Error("tool-lsp: ".concat(name, " must be a positive integer no greater than ").concat(dsh_timeout_1.MAX_TIMER_DELAY_MS));
    }
}
