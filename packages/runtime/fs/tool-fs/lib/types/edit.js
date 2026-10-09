"use strict";
/**
 * Model-facing literal edit, unique-match by default. It obtains an optional guard from the
 * single intent slot, calls `ctx.fs.editText` without a separate stat, then records the observed
 * version; no policy means an unconditional atomic edit.
 * @module @z/dsh-tool-fs/src/edit
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
exports.parseEditArgs = parseEditArgs;
exports.formatEditOutput = formatEditOutput;
exports.applyEditTool = applyEditTool;
var dsh_tools_1 = require("@z/dsh-tools");
var diff_ts_1 = require("./diff.ts");
var error_ts_1 = require("./error.ts");
var session_cwd_ts_1 = require("./session-cwd.ts");
/**
 * Validate value constraints the schema DSL can't express: a non-blank
 * `file_path`, a non-empty `old_string`, and `old_string !== new_string`
 * (an equal pair would be a guaranteed no-op edit).
 * @param args - the schema-validated raw tool arguments.
 * @returns the camelCased input with `replace_all` defaulted to false.
 */
function parseEditArgs(args) {
    var _a;
    if (args.file_path.trim().length === 0)
        throw new Error('file_path must be a non-empty string');
    if (args.old_string.length === 0)
        throw new Error('old_string must be a non-empty string');
    if (args.old_string === args.new_string)
        throw new Error('old_string and new_string must differ');
    return {
        filePath: args.file_path,
        oldString: args.old_string,
        newString: args.new_string,
        replaceAll: (_a = args.replace_all) !== null && _a !== void 0 ? _a : false,
    };
}
/**
 * Format an edit success (single-match or replace-all) as a Claude-style model-facing message.
 * @param displayPath - the backend-resolved path shown to the model.
 * @param replaceAll - selects the all-occurrences wording over the single-replacement one.
 * @returns the confirmation sentence the model sees as the tool result.
 */
function formatEditOutput(displayPath, replaceAll) {
    return replaceAll
        ? "The file ".concat(displayPath, " has been updated. All occurrences were successfully replaced.")
        : "The file ".concat(displayPath, " has been updated successfully.");
}
/**
 * Register the `edit` tool and its system-prompt guidance.
 * @param ctx - the plugin context; registrations are effects scoped to it, and execution uses its `fs` service.
 * @param sandbox - the shared sandbox-escalation API (advertisement, mode stamping, denial mapping).
 */
function applyEditTool(ctx, sandbox) {
    ctx.systemPrompt.section({
        name: 'tool:edit',
        order: 102,
        text: 'Use the edit tool for targeted changes to existing UTF-8 text files. It replaces literal old_string with new_string; by default old_string must appear exactly once. If old_string appears multiple times, provide a more specific old_string or set replace_all to true. Read the file first (the default fs-observation-policy requires it), unless you just created or edited it in this session.',
    });
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'edit',
        description: 'Edit an existing UTF-8 text file by replacing literal text.',
        parameters: __assign({ file_path: { type: 'string', required: true, description: 'Path to edit, resolved by the filesystem backend.' }, old_string: { type: 'string', required: true, description: 'Literal text to replace. Must match exactly.' }, new_string: { type: 'string', required: true, description: 'Literal replacement text. Use an empty string to delete the match.' }, replace_all: { type: 'boolean', description: 'Replace all matches. Defaults to false; when false, old_string must appear exactly once.' } }, sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {}),
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    path: { type: 'string', required: true },
                    before: { type: 'string', required: true },
                    after: { type: 'string', required: true },
                },
            },
            render: function (args, value) {
                var _a;
                return [{
                        type: 'text',
                        text: formatEditOutput(value.path, (_a = args.replace_all) !== null && _a !== void 0 ? _a : false),
                    }];
            },
            presentationMeta: function (args, value) { return ({
                diffs: (0, diff_ts_1.computeHunkDiffs)(args.file_path, value.before, value.after)
                    .map(function (_a) {
                    var path = _a.path, oldText = _a.oldText, newText = _a.newText;
                    return ({ path: path, oldText: oldText, newText: newText });
                }),
            }); },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var input, sandboxPolicy, target, outcome, intent, error_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            input = parseEditArgs(args);
                            return [4 /*yield*/, sandbox.resolvePolicy('edit', args, exec)];
                        case 1:
                            sandboxPolicy = _a.sent();
                            return [4 /*yield*/, ctx.fs.resolve(input.filePath, (0, session_cwd_ts_1.sessionResolveOptions)(exec, input.filePath, sandboxPolicy === null || sandboxPolicy === void 0 ? void 0 : sandboxPolicy.workspaceRoot))
                                // Single-slot decision: the policy plugin returns { version: vObserved } or
                                // throws FS_NOT_OBSERVED; the bare default is undefined (unconditional edit).
                                // No stat — the bare default never manufactures a version basis. The intent
                                // slot itself can throw FS_NOT_OBSERVED for an unread target, so it sits
                                // inside the try: both that refusal and the provider's guarded-mutation
                                // failure get the model-facing remedy below.
                            ];
                        case 2:
                            target = _a.sent();
                            _a.label = 3;
                        case 3:
                            _a.trys.push([3, 6, , 7]);
                            return [4 /*yield*/, ctx.waterfall('fs/edit-intent', target, exec, function () { return undefined; })];
                        case 4:
                            intent = _a.sent();
                            return [4 /*yield*/, ctx.fs.editText(target, { oldString: input.oldString, newString: input.newString, replaceAll: input.replaceAll }, intent, exec.signal, sandboxPolicy)];
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
                                    before: outcome.before,
                                    after: outcome.after,
                                }];
                    }
                });
            });
        },
        // Pure display: a diff card of the literal replacement (old_string → new_string), derived
        // from the call args. `oldText: old_string || null` matches claude-agent-acp's Edit arm;
        // new_string is a required arg here, so it maps straight to newText.
        presentCall: function (args) {
            return {
                card: 'diff',
                title: "Edit ".concat(args.file_path),
                diffs: [{ path: args.file_path, oldText: args.old_string || null, newText: args.new_string }],
                locations: [{ path: args.file_path }],
            };
        },
        // Applied metadata replaces the call-time snippet; errors or malformed replay metadata use
        // the generic result rendering.
        presentResult: function (args, result) {
            if (result.isError)
                return undefined;
            var diffs = (0, diff_ts_1.diffsFromMeta)(result.meta);
            if (diffs === undefined)
                return undefined;
            return { card: 'diff', title: "Edit ".concat(args.file_path), diffs: diffs };
        },
    }));
}
