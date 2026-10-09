"use strict";
/**
 * The model-facing `glob` tool: discover files whose paths match a glob
 * pattern, sorted by modification time. Execution spawns the packaged
 * ripgrep binary (`@vscode/ripgrep`) directly through the subprocess seam
 * with a plain argv vector — this module owns the model-facing schema,
 * argument validation, argv construction, result parsing, inline sampling,
 * and formatting; process concerns (spawn execution, tree termination,
 * environment scrubbing, output capture) stay behind `ctx.subprocess`.
 * @module @z/dsh-tool-fs-search/glob
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
exports.GLOB_VCS_EXCLUDES = exports.GLOB_MAX_RESULTS = void 0;
exports.parseGlobArgs = parseGlobArgs;
exports.buildGlobCommand = buildGlobCommand;
exports.sampleAcrossTopLevel = sampleAcrossTopLevel;
exports.formatGlobOutput = formatGlobOutput;
exports.presentGlobCall = presentGlobCall;
exports.presentGlobResult = presentGlobResult;
exports.applyGlobTool = applyGlobTool;
var node_path_1 = require("node:path");
var dsh_tools_1 = require("@z/dsh-tools");
var search_core_ts_1 = require("./search-core.ts");
var presentation_ts_1 = require("./presentation.ts");
var direct_call_ts_1 = require("./direct-call.ts");
var search_scope_ts_1 = require("./search-scope.ts");
/**
 * Default cap on paths retained inline by one `glob` call (the `globMaxResults`
 * config), matching Claude Code's default `GlobTool` result limit.
 */
exports.GLOB_MAX_RESULTS = 100;
/**
 * Directory names ripgrep must never descend into for a discovery listing: VCS
 * metadata stores. `--no-ignore --hidden` would otherwise surface them in every
 * broad search. Each name is excluded with TWO negated `--glob`s (see
 * {@link buildGlobCommand}): an any-depth directory glob that matches — and
 * prunes — the directory during traversal, and a contents glob that still
 * excludes the internals when the search root itself is at or inside the
 * directory (an explicit `path` of `.git` or `sub/.git`), where the prune glob
 * alone never matches.
 */
exports.GLOB_VCS_EXCLUDES = search_scope_ts_1.VCS_DIRECTORIES;
/**
 * Validate value constraints the schema DSL can't express: a non-blank
 * canonical pattern (or its `glob_pattern` alias), and a non-blank path (or its
 * `target_directory` alias) when given. Throws a plain `Error` otherwise.
 *
 * @param args - the schema-validated `glob` arguments, including supported provider aliases.
 * @returns the accepted input with aliases normalized to canonical field names.
 */
function parseGlobArgs(args) {
    var _a, _b;
    if (args.pattern !== undefined && args.glob_pattern !== undefined && args.pattern !== args.glob_pattern) {
        throw new Error('pattern and glob_pattern must match when both are given');
    }
    if (args.path !== undefined && args.target_directory !== undefined && args.path !== args.target_directory) {
        throw new Error('path and target_directory must match when both are given');
    }
    var pattern = (_a = args.pattern) !== null && _a !== void 0 ? _a : args.glob_pattern;
    var path = (_b = args.path) !== null && _b !== void 0 ? _b : args.target_directory;
    if (typeof pattern !== 'string' || pattern.trim().length === 0) {
        throw new Error(args.pattern !== undefined
            ? 'pattern must be a non-empty string'
            : 'glob_pattern must be a non-empty string');
    }
    if (path !== undefined && path.trim().length === 0) {
        throw new Error(args.path !== undefined
            ? 'path must be a non-empty string when given'
            : 'target_directory must be a non-empty string when given');
    }
    return __assign(__assign({ pattern: pattern }, path !== undefined ? { path: path } : {}), args.includeExcluded !== undefined ? { includeExcluded: args.includeExcluded } : {});
}
/**
 * Build the fixed `rg --files` argv for one `glob` call. Every
 * model-controlled value ({@link GlobInput.pattern}, {@link GlobInput.path})
 * is a plain argv element — no shell layer exists, so no quoting applies; the
 * search root rides behind `--` so a leading-dash path can never be parsed as
 * a flag. `--sort=modified` orders by modification time, `--no-ignore
 * --hidden` searches ignored and hidden files, and
 * {@link GLOB_VCS_EXCLUDES} keeps VCS metadata out.
 *
 * @param input - the validated arguments.
 * @returns the complete ripgrep argument vector (excluding the binary itself).
 */
function buildGlobCommand(input, excludeDirectories) {
    if (excludeDirectories === void 0) { excludeDirectories = []; }
    var parts = __spreadArray(__spreadArray([
        '--files',
        "--glob=".concat(input.pattern),
        '--sort=modified',
        '--no-ignore',
        '--hidden'
    ], exports.GLOB_VCS_EXCLUDES.flatMap(function (name) { return [
        "--glob=!**/".concat(name),
        "--glob=!**/".concat(name, "/**"),
    ]; }), true), (0, search_scope_ts_1.searchExclusionArgs)(excludeDirectories, input.includeExcluded), true);
    if (input.path !== undefined)
        parts.push('--', input.path);
    return parts;
}
/** Remove the displayed search-root prefix before choosing a top-level group. */
function relativeToSearchRoot(path, root) {
    if (root === '.')
        return path.startsWith(".".concat(node_path_1.sep)) ? path.slice(2) : path;
    var rootEnd = root.length;
    while (rootEnd > 0 && root[rootEnd - 1] === node_path_1.sep)
        rootEnd -= 1;
    var trimmedRoot = root.slice(0, rootEnd);
    if (trimmedRoot.length === 0)
        return stripLeadingSeparators(path);
    if (path === trimmedRoot)
        return '';
    if (path.startsWith("".concat(trimmedRoot).concat(node_path_1.sep))) {
        return path.slice(trimmedRoot.length + 1);
    }
    return path;
}
/** Strip only separators recognized by the execution platform. */
function stripLeadingSeparators(path) {
    var start = 0;
    while (path[start] === node_path_1.sep)
        start += 1;
    return path.slice(start);
}
/**
 * The leading path segment of one display path — the top-level entry, relative
 * to the search root, that the path sits under. A path with no separator is its
 * own top-level entry. Leading separators are stripped first so an absolute path
 * (one outside the workdir, which {@link toWorkdirRelative} leaves untouched)
 * groups by its first real name instead of collapsing every such path into one
 * empty group.
 */
function topLevelSegment(path) {
    var trimmed = stripLeadingSeparators(path);
    var cut = trimmed.indexOf(node_path_1.sep);
    return cut === -1 ? trimmed : trimmed.slice(0, cut);
}
/**
 * Choose the inline page of an over-cap result by round-robin across the
 * complete result's top-level entries, instead of taking its head.
 *
 * Every top-level entry receives a slot before any receives a second; exhausted
 * groups drop out. Group order and order within each group follow `paths`, so a
 * flat result reproduces the modification-time head.
 *
 * @param paths - the complete result, in ripgrep's modification-time order.
 * @param maxItems - how many paths the page may hold; the caller has already established it is smaller than `paths`.
 * @param root - the search root in the same display-path space as `paths`.
 * @returns the page grouped by top-level entry, with the shown/total top-level spread.
 */
function sampleAcrossTopLevel(paths, maxItems, root) {
    if (root === void 0) { root = '.'; }
    var groups = new Map();
    var active = [];
    for (var _i = 0, paths_1 = paths; _i < paths_1.length; _i++) {
        var path = paths_1[_i];
        var key = topLevelSegment(relativeToSearchRoot(path, root));
        var group = groups.get(key);
        if (group === undefined) {
            var items = [path];
            groups.set(key, items);
            active.push({ key: key, items: items, index: 0, current: path });
        }
        else {
            group.push(path);
        }
    }
    var taken = new Map();
    var count = 0;
    while (active.length > 0 && count < maxItems) {
        var nextActive = [];
        for (var _a = 0, active_1 = active; _a < active_1.length; _a++) {
            var _b = active_1[_a], key = _b.key, items = _b.items, index = _b.index, current = _b.current;
            if (count >= maxItems)
                break;
            count += 1;
            var bucket = taken.get(key);
            if (bucket === undefined)
                taken.set(key, [current]);
            else
                bucket.push(current);
            var nextIndex = index + 1;
            var nextPath = items[nextIndex];
            if (nextPath !== undefined)
                nextActive.push({ key: key, items: items, index: nextIndex, current: nextPath });
        }
        active = nextActive;
    }
    return { items: __spreadArray([], taken.values(), true).flat(), shown: taken.size, total: groups.size };
}
/**
 * Format a capped sampled page and its complete-result recovery path. A flat
 * result keeps the plain footer because its sample is the modification-time head.
 *
 * @param sample - the inline page and its top-level spread.
 * @param seen - how many paths the complete result holds; always more than the page.
 * @param spillRef - the saved complete-result reference, or `undefined` when unsaved.
 * @returns the model-facing text.
 */
function formatGlobOutput(sample, seen, spillRef) {
    var basis = sample.total === seen
        ? '.'
        : ", sampled across ".concat(sample.shown, " of the ").concat(sample.total, " top-level entries this pattern matched instead of taken in modification-time order.")
            + (sample.shown < sample.total ? ' Narrow path to inspect a specific subtree.' : '');
    return formatGlobPage(sample.items, seen, spillRef, basis);
}
/** Format one bounded page and the recovery path for its complete sorted result. */
function formatGlobPage(items, seen, spillRef, basis) {
    var body = items.join('\n');
    var recovery = spillRef !== undefined
        ? "Full sorted result stored at: ".concat(spillRef.locator, ". ").concat(spillRef.retrievalHint)
        : 'The complete result could not be saved; narrow pattern or path to see more.';
    return "".concat(body, "\n\n(Showing ").concat(items.length, " of ").concat(seen, " paths").concat(basis, " ").concat(recovery, ")");
}
/** Bound and format one canonical path list for the Native surface relative to its search root. */
function renderGlobPaths(paths, caps, root, spillRef) {
    if (paths.length === 0)
        return 'No files found';
    // A result that fits is shown whole, untouched: modification-time order is the
    // tool's contract, and over a complete result it is what answers age questions.
    if (paths.length <= caps.maxResults)
        return paths.join('\n');
    if (!caps.sampleOverCapGlobResults) {
        return formatGlobPage(paths.slice(0, caps.maxResults), paths.length, spillRef, '.');
    }
    return formatGlobOutput(sampleAcrossTopLevel(paths, caps.maxResults, root), paths.length, spillRef);
}
/**
 * The inline page of paths a completed `glob` card shows, computed the SAME way
 * {@link renderGlobPaths} computes its model-facing page so the card and the text
 * agree on which paths survived the cap. A result within the cap is shown whole;
 * an over-cap result is either the modification-time head or the top-level sample,
 * matching the deployment's `sampleOverCapGlobResults`.
 *
 * @param paths - the complete discovered path list, in modification-time order.
 * @param caps - the resolved glob caps (the inline cap and the sampling switch).
 * @param root - the search root in the same display-path space as `paths`.
 * @returns the inline page and whether the complete result was capped.
 */
function globCardPage(paths, caps, root) {
    if (paths.length <= caps.maxResults)
        return { items: paths, truncated: false };
    if (!caps.sampleOverCapGlobResults)
        return { items: paths.slice(0, caps.maxResults), truncated: true };
    return { items: sampleAcrossTopLevel(paths, caps.maxResults, root).items, truncated: true };
}
/**
 * Pending-call presentation: a search card titled by the pattern (and root).
 *
 * @param args - the raw tool arguments; `pattern` and `path` feed the title.
 * @returns the generic card view (`kind: 'search'`) shown while the call runs.
 */
function presentGlobCall(args) {
    var where = args.path !== undefined ? " in ".concat(args.path) : '';
    return { card: 'generic', title: "Glob ".concat(args.pattern).concat(where), kind: 'search', rawInput: args.pattern };
}
/**
 * Completed-call presentation: the search card projected from the result's
 * `presentationMeta` (the discovered path list, with the truncation signal). A UI
 * without a search card falls back to the raw `tool/result` content, so the view
 * carries no result text of its own. Malformed or absent metadata (an obsolete or
 * hand-edited replayed log) falls back to the generic card.
 *
 * @param _args - the raw tool arguments; unused, the view derives from the result.
 * @param result - the final model-facing tool result carrying the projected metadata.
 * @returns the search card view, or `undefined` for the generic fallback.
 */
function presentGlobResult(_args, result) {
    if (result.isError)
        return undefined;
    var view = (0, presentation_ts_1.searchViewFromMeta)(result.meta);
    if (view === undefined || view.shape !== 'paths')
        return undefined;
    return view;
}
/**
 * Register the `glob` tool and its system-prompt guidance.
 *
 * @param ctx - the plugin context; registrations are effects scoped to it, and
 *   execution uses its `subprocess` service.
 * @param caps - the deployment's resolved glob caps (plugin config after defaulting).
 */
function applyGlobTool(ctx, caps) {
    var _this = this;
    var _a;
    var scopeGuidance = (0, search_scope_ts_1.searchScopeGuidance)((_a = caps.excludeDirectories) !== null && _a !== void 0 ? _a : []);
    var overCapGuidance = caps.sampleOverCapGlobResults
        ? 'while a larger one is sampled across top-level entries, so it spans the tree instead of one subtree.'
        : 'while a larger one keeps the modification-time-ordered head.';
    ctx.systemPrompt.section({
        name: 'tool:glob',
        order: 103,
        text: 'Use the glob tool — not shell find — to discover files by path pattern. A pattern with no "/" matches basenames at any depth, so "*" matches every file in the tree rather than its top level. '
            + "Results are files only, never directories, and include hidden and ignored files: a result that fits comes back in modification-time order, ".concat(overCapGuidance) + scopeGuidance,
    });
    var overCapDescription = caps.sampleOverCapGlobResults
        ? "a larger result instead returns ".concat(caps.maxResults, " paths sampled across top-level entries")
        : "a larger result returns the first ".concat(caps.maxResults, " paths in modification-time order");
    var tool = (0, dsh_tools_1.defineTool)({
        name: 'glob',
        description: 'Provide a non-empty pattern (or the glob_pattern alias). Optional search directory: path (or target_directory). '
            + 'If both names in a pair are supplied, their values must match. Find files whose paths match the pattern. Returns matching file paths — never directories — '
            + 'including hidden and ignored files (VCS metadata directories are excluded). '
            + "Up to ".concat(caps.maxResults, " paths come back in modification-time order; ").concat(overCapDescription, ", ")
            + 'says so, and reports where the complete sorted list was saved. This tool does not enumerate directory entries.' + scopeGuidance,
        parameters: {
            pattern: {
                type: 'string',
                description: 'Preferred glob pattern to match file paths against (e.g. "**/*.ts", "src/**/*.test.js"). '
                    + 'A pattern with no "/" matches the basename at any depth, so "*" and "*.ts" both search the whole tree; include a separator to anchor the depth.',
            },
            glob_pattern: {
                type: 'string',
                description: 'Compatibility alias for pattern. Prefer pattern.',
            },
            path: {
                type: 'string',
                description: 'Preferred directory to search in. Defaults to the session workspace; a relative path resolves against it.',
            },
            target_directory: {
                type: 'string',
                description: 'Compatibility alias for path. Prefer path.',
            },
            includeExcluded: { type: 'boolean', description: 'Include deployment-excluded dependency/build directories. Use only with a narrow path when inspecting those files intentionally.' },
        },
        timeoutMs: caps.timeoutMs,
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    root: { type: 'string', required: true },
                    paths: { type: 'array', required: true, items: { type: 'string' } },
                },
            },
            render: function (_args, value) { return [{ type: 'text', text: renderGlobPaths(value.paths, caps, value.root) }]; },
            presentationMeta: function (_args, value) {
                var page = globCardPage(value.paths, caps, value.root);
                return (0, presentation_ts_1.globSearchMeta)({ items: page.items, truncated: page.truncated, seen: value.paths.length }, caps.maxMetaBytes);
            },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var input, run, root, all, _i, _a, line, displayPath;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            input = parseGlobArgs(args);
                            return [4 /*yield*/, (0, search_core_ts_1.runRipgrep)(ctx, exec, 'glob', buildGlobCommand(input, caps.excludeDirectories), caps.rawOutputMaxBytes, caps.graceMs, caps.stderrMaxBytes)];
                        case 1:
                            run = _b.sent();
                            root = input.path === undefined ? '.' : (0, search_core_ts_1.toWorkdirRelative)(input.path, run.workdir);
                            if (run.noMatches)
                                return [2 /*return*/, { root: root, paths: [] }];
                            all = [];
                            for (_i = 0, _a = run.stdout.split('\n'); _i < _a.length; _i++) {
                                line = _a[_i];
                                if (line.length === 0)
                                    continue;
                                displayPath = (0, search_core_ts_1.toWorkdirRelative)(line, run.workdir);
                                all.push(displayPath);
                            }
                            return [2 /*return*/, { root: root, paths: all }];
                    }
                });
            });
        },
        presentCall: presentGlobCall,
        presentResult: presentGlobResult,
    });
    ctx.tools.register(tool);
    ctx.on('tools/post-execute', function (exec, result, next) { return __awaiter(_this, void 0, void 0, function () {
        var decision, value, paths, spillRef;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, next()];
                case 1:
                    decision = _a.sent();
                    value = (0, direct_call_ts_1.acceptedDirectCallValue)(ctx, tool, exec, result, decision);
                    if (value === undefined)
                        return [2 /*return*/, decision];
                    paths = value.paths;
                    if (paths.length <= caps.maxResults)
                        return [2 /*return*/, decision];
                    return [4 /*yield*/, (0, search_core_ts_1.trySaveFormattedResult)(ctx, exec, 'glob-results.txt', paths.join('\n'))];
                case 2:
                    spillRef = _a.sent();
                    return [2 /*return*/, __assign({ kind: 'accept', content: [{ type: 'text', text: renderGlobPaths(paths, caps, value.root, spillRef) }] }, decision.additionalContexts !== undefined ? { additionalContexts: decision.additionalContexts } : {})];
            }
        });
    }); });
}
