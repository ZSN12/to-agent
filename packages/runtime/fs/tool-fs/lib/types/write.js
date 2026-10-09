"use strict";
/**
 * Model-facing full-file write. It obtains an optional intent from the single policy slot, calls
 * `ctx.fs.writeText` without a stat, then records the resulting version; no policy means an
 * unconditional atomic create-or-overwrite.
 * @module @z/dsh-tool-fs/src/write
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
exports.parseWriteArgs = parseWriteArgs;
exports.formatWriteOutput = formatWriteOutput;
exports.applyWriteTool = applyWriteTool;
var dsh_tools_1 = require("@z/dsh-tools");
var diff_ts_1 = require("./diff.ts");
var error_ts_1 = require("./error.ts");
var session_cwd_ts_1 = require("./session-cwd.ts");
/**
 * Validate value constraints the schema DSL can't express: only a non-blank
 * `file_path` — an empty `content` is legitimate (it writes an empty file).
 * @param args - the schema-validated raw tool arguments.
 * @returns the camelCased input; `content` passes through untouched.
 */
function parseWriteArgs(args) {
    if (args.file_path.trim().length === 0)
        throw new Error('file_path must be a non-empty string');
    return { filePath: args.file_path, content: args.content };
}
/**
 * Format a write outcome as one model-facing text block body.
 * @param displayPath - the backend-resolved path rendered in the envelope's `<path>` element.
 * @param outcome - the write outcome; its `operation` selects the Created/Updated wording.
 * @returns the model-facing confirmation envelope (no file content is echoed back).
 */
function formatWriteOutput(displayPath, outcome) {
    var verb = outcome.operation === 'create' ? 'Created' : 'Updated';
    return "<path>".concat(displayPath, "</path>\n<type>file</type>\n<content>\n").concat(verb, " file\n</content>");
}
/**
 * Register the `write` tool and its system-prompt guidance.
 * @param ctx - the plugin context; registrations are effects scoped to it, and execution uses its `fs` service.
 * @param sandbox - the shared sandbox-escalation API (advertisement, mode stamping, denial mapping).
 */
function applyWriteTool(ctx, sandbox) {
    ctx.systemPrompt.section({
        name: 'tool:write',
        order: 101,
        text: 'Use the write tool to create files or completely replace file contents. Existing files are overwritten, so read an existing file first (the default fs-observation-policy requires it) and prefer edit for targeted changes.',
    });
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'write',
        description: 'Create or fully replace a UTF-8 text file.',
        parameters: __assign({ file_path: { type: 'string', required: true, description: 'Path to write, resolved by the filesystem backend.' }, content: { type: 'string', required: true, description: 'Full UTF-8 text content to write.' } }, sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {}),
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    path: { type: 'string', required: true },
                    operation: { type: 'string', required: true, enum: ['create', 'update'] },
                    before: {
                        required: true,
                        oneOf: [
                            { type: 'string' },
                            { type: 'null' },
                        ],
                    },
                    after: { type: 'string', required: true },
                },
            },
            render: function (_args, value) { return [{ type: 'text', text: formatWriteOutput(value.path, value) }]; },
            presentationMeta: function (args, value) { return ({
                diffs: value.before === null
                    ? []
                    : (0, diff_ts_1.computeHunkDiffs)(args.file_path, value.before, value.after)
                        .map(function (_a) {
                        var path = _a.path, oldText = _a.oldText, newText = _a.newText;
                        return ({ path: path, oldText: oldText, newText: newText });
                    }),
            }); },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var input, sandboxPolicy, target, intent, outcome, error_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            input = parseWriteArgs(args);
                            return [4 /*yield*/, sandbox.resolvePolicy('write', args, exec)];
                        case 1:
                            sandboxPolicy = _a.sent();
                            return [4 /*yield*/, ctx.fs.resolve(input.filePath, (0, session_cwd_ts_1.sessionResolveOptions)(exec, input.filePath, sandboxPolicy === null || sandboxPolicy === void 0 ? void 0 : sandboxPolicy.workspaceRoot))
                                // Single-slot decision: the policy plugin produces createIfAbsent/
                                // replaceIfVersion; the bare default is undefined (unconditional). No stat.
                            ];
                        case 2:
                            target = _a.sent();
                            return [4 /*yield*/, ctx.waterfall('fs/write-intent', target, exec, function () { return undefined; })];
                        case 3:
                            intent = _a.sent();
                            _a.label = 4;
                        case 4:
                            _a.trys.push([4, 6, , 7]);
                            return [4 /*yield*/, ctx.fs.writeText(target, input.content, intent, exec.signal, sandboxPolicy)];
                        case 5:
                            outcome = _a.sent();
                            return [3 /*break*/, 7];
                        case 6:
                            error_1 = _a.sent();
                            // A sandbox denial becomes the shared [sandbox: …] marker (the model
                            // recognizes it from bash); stale/not-observed failures gain their
                            // model-facing remedy; anything else passes through.
                            throw (0, error_ts_1.remediateFsError)(sandbox.mapError(error_1, sandboxPolicy));
                        case 7:
                            // Record the present observation (a no-op when no policy plugin listens).
                            ctx.emit('fs/observed', target, { kind: 'present', version: outcome.version }, exec);
                            return [2 /*return*/, {
                                    path: target.displayPath,
                                    operation: outcome.operation,
                                    before: outcome.before,
                                    after: outcome.after,
                                }];
                    }
                });
            });
        },
        // Pure display: a diff card. A call-time presenter has no access to prior
        // file content, so `oldText: null` also represents an overwrite here.
        presentCall: function (args) {
            return {
                card: 'diff',
                title: "Write ".concat(args.file_path),
                diffs: [{ path: args.file_path, oldText: null, newText: args.content }],
                locations: [{ path: args.file_path }],
            };
        },
        // Result-time display repeats the diff because completed views replace the
        // pending view. Overwrites use applied metadata; creates and identical
        // overwrites use the replay-safe args fallback.
        presentResult: function (args, result) {
            var _a;
            if (result.isError)
                return undefined;
            var diffs = (_a = (0, diff_ts_1.diffsFromMeta)(result.meta)) !== null && _a !== void 0 ? _a : [{ path: args.file_path, oldText: null, newText: args.content }];
            return { card: 'diff', title: "Write ".concat(args.file_path), diffs: diffs };
        },
    }));
}
