"use strict";
/**
 * The model-facing filesystem discovery tool suite (`glob`, `grep`) over the
 * packaged ripgrep binary (`@vscode/ripgrep`). This single plugin registers
 * both tools; the binary ships inside the npm dependency, so no system `rg`
 * install and no shell layer is involved.
 *
 * ## Spawn-backed, not a `ctx.fs` provider method
 *
 * Local workspace discovery is a process-backed `rg` workflow, so these tools
 * execute through `ctx.subprocess.spawn()` with fixed ripgrep argv templates —
 * never `ctx.shell`, never `ctx.shell.start()`, never a model-visible background
 * task. The tool layer owns schemas, argument validation, argv construction
 * ({@link module:@z/dsh-tool-fs-search/glob} /
 * {@link module:@z/dsh-tool-fs-search/grep}), result parsing,
 * retention, formatted-result spill, and timeout declaration; the subprocess
 * seam owns spawn execution, process-tree termination, environment scrubbing,
 * and raw output capture. The package injects `tools`, `systemPrompt`, and
 * `subprocess` — deliberately NOT `fs`, and `ctx.spillStore` is read
 * opportunistically with `ctx.get()` because formatted-result spill is optional.
 *
 * Returned paths are displayed relative to the resolved workdir and are
 * follow-up-readable only in co-located deployments where the workdir and the
 * filesystem `read` root are the same workspace — a documented v1 deployment
 * requirement, not runtime-validated.
 *
 * @module @z/dsh-tool-fs-search
 */
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
exports.Config = exports.inject = exports.name = exports.trySaveFormattedResult = exports.toWorkdirRelative = exports.runRipgrep = exports.resolveRgPath = exports.previewLine = exports.SearchError = exports.SEARCH_TIMEOUT_MS = exports.SEARCH_STDERR_MAX_BYTES = exports.SEARCH_META_MAX_BYTES = exports.SEARCH_GRACE_MS = exports.RAW_OUTPUT_MAX_BYTES = exports.presentGrepResult = exports.presentGrepCall = exports.parseGrepMatches = exports.parseGrepArgs = exports.formatGrepOutput = exports.formatGrepMatches = exports.buildGrepCommand = exports.applyGrepTool = exports.GREP_MAX_MATCHES = exports.GREP_MAX_LINE_BYTES = exports.sampleAcrossTopLevel = exports.presentGlobResult = exports.presentGlobCall = exports.parseGlobArgs = exports.formatGlobOutput = exports.buildGlobCommand = exports.applyGlobTool = exports.GLOB_VCS_EXCLUDES = exports.GLOB_MAX_RESULTS = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_timeout_1 = require("@z/dsh-timeout");
var glob_ts_1 = require("./glob.ts");
var grep_ts_1 = require("./grep.ts");
var search_core_ts_1 = require("./search-core.ts");
var search_scope_ts_1 = require("./search-scope.ts");
var glob_ts_2 = require("./glob.ts");
Object.defineProperty(exports, "GLOB_MAX_RESULTS", { enumerable: true, get: function () { return glob_ts_2.GLOB_MAX_RESULTS; } });
Object.defineProperty(exports, "GLOB_VCS_EXCLUDES", { enumerable: true, get: function () { return glob_ts_2.GLOB_VCS_EXCLUDES; } });
Object.defineProperty(exports, "applyGlobTool", { enumerable: true, get: function () { return glob_ts_2.applyGlobTool; } });
Object.defineProperty(exports, "buildGlobCommand", { enumerable: true, get: function () { return glob_ts_2.buildGlobCommand; } });
Object.defineProperty(exports, "formatGlobOutput", { enumerable: true, get: function () { return glob_ts_2.formatGlobOutput; } });
Object.defineProperty(exports, "parseGlobArgs", { enumerable: true, get: function () { return glob_ts_2.parseGlobArgs; } });
Object.defineProperty(exports, "presentGlobCall", { enumerable: true, get: function () { return glob_ts_2.presentGlobCall; } });
Object.defineProperty(exports, "presentGlobResult", { enumerable: true, get: function () { return glob_ts_2.presentGlobResult; } });
Object.defineProperty(exports, "sampleAcrossTopLevel", { enumerable: true, get: function () { return glob_ts_2.sampleAcrossTopLevel; } });
var grep_ts_2 = require("./grep.ts");
Object.defineProperty(exports, "GREP_MAX_LINE_BYTES", { enumerable: true, get: function () { return grep_ts_2.GREP_MAX_LINE_BYTES; } });
Object.defineProperty(exports, "GREP_MAX_MATCHES", { enumerable: true, get: function () { return grep_ts_2.GREP_MAX_MATCHES; } });
Object.defineProperty(exports, "applyGrepTool", { enumerable: true, get: function () { return grep_ts_2.applyGrepTool; } });
Object.defineProperty(exports, "buildGrepCommand", { enumerable: true, get: function () { return grep_ts_2.buildGrepCommand; } });
Object.defineProperty(exports, "formatGrepMatches", { enumerable: true, get: function () { return grep_ts_2.formatGrepMatches; } });
Object.defineProperty(exports, "formatGrepOutput", { enumerable: true, get: function () { return grep_ts_2.formatGrepOutput; } });
Object.defineProperty(exports, "parseGrepArgs", { enumerable: true, get: function () { return grep_ts_2.parseGrepArgs; } });
Object.defineProperty(exports, "parseGrepMatches", { enumerable: true, get: function () { return grep_ts_2.parseGrepMatches; } });
Object.defineProperty(exports, "presentGrepCall", { enumerable: true, get: function () { return grep_ts_2.presentGrepCall; } });
Object.defineProperty(exports, "presentGrepResult", { enumerable: true, get: function () { return grep_ts_2.presentGrepResult; } });
var search_core_ts_2 = require("./search-core.ts");
Object.defineProperty(exports, "RAW_OUTPUT_MAX_BYTES", { enumerable: true, get: function () { return search_core_ts_2.RAW_OUTPUT_MAX_BYTES; } });
Object.defineProperty(exports, "SEARCH_GRACE_MS", { enumerable: true, get: function () { return search_core_ts_2.SEARCH_GRACE_MS; } });
Object.defineProperty(exports, "SEARCH_META_MAX_BYTES", { enumerable: true, get: function () { return search_core_ts_2.SEARCH_META_MAX_BYTES; } });
Object.defineProperty(exports, "SEARCH_STDERR_MAX_BYTES", { enumerable: true, get: function () { return search_core_ts_2.SEARCH_STDERR_MAX_BYTES; } });
Object.defineProperty(exports, "SEARCH_TIMEOUT_MS", { enumerable: true, get: function () { return search_core_ts_2.SEARCH_TIMEOUT_MS; } });
Object.defineProperty(exports, "SearchError", { enumerable: true, get: function () { return search_core_ts_2.SearchError; } });
Object.defineProperty(exports, "previewLine", { enumerable: true, get: function () { return search_core_ts_2.previewLine; } });
Object.defineProperty(exports, "resolveRgPath", { enumerable: true, get: function () { return search_core_ts_2.resolveRgPath; } });
Object.defineProperty(exports, "runRipgrep", { enumerable: true, get: function () { return search_core_ts_2.runRipgrep; } });
Object.defineProperty(exports, "toWorkdirRelative", { enumerable: true, get: function () { return search_core_ts_2.toWorkdirRelative; } });
Object.defineProperty(exports, "trySaveFormattedResult", { enumerable: true, get: function () { return search_core_ts_2.trySaveFormattedResult; } });
/** Cordis plugin name used by loader diagnostics. */
exports.name = 'tool-fs-search';
/** Services required by the search tool suite (`spillStore` is optional, read via `ctx.get()`). */
exports.inject = ['tools', 'systemPrompt', 'subprocess'];
exports.Config = schemastery_1.default.object({
    sampleOverCapGlobResults: schemastery_1.default.boolean().required(),
    excludeDirectories: schemastery_1.default.array(schemastery_1.default.string()).default([]),
    globMaxResults: schemastery_1.default.number().default(glob_ts_1.GLOB_MAX_RESULTS),
    grepMaxMatches: schemastery_1.default.number().default(grep_ts_1.GREP_MAX_MATCHES),
    grepMaxLineBytes: schemastery_1.default.number().default(grep_ts_1.GREP_MAX_LINE_BYTES),
    searchMetaMaxBytes: schemastery_1.default.number().default(search_core_ts_1.SEARCH_META_MAX_BYTES),
    rawOutputMaxBytes: schemastery_1.default.number().default(search_core_ts_1.RAW_OUTPUT_MAX_BYTES),
    graceMs: schemastery_1.default.number().default(search_core_ts_1.SEARCH_GRACE_MS),
    stderrMaxBytes: schemastery_1.default.number().default(search_core_ts_1.SEARCH_STDERR_MAX_BYTES),
    timeoutMs: schemastery_1.default.number().default(search_core_ts_1.SEARCH_TIMEOUT_MS),
});
/** Every search cap counts items/bytes/milliseconds — a positive integer, or retention and timeout arithmetic misbehaves silently. */
function assertPositiveInteger(name, value) {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error("tool-fs-search: ".concat(name, " must be a positive integer"));
    }
}
/**
 * Register the `glob`/`grep` filesystem discovery tool suite. The packaged
 * ripgrep binary is always available (an npm dependency), so registration is
 * unconditional.
 *
 * @param ctx - plugin context; registrations are effects scoped to this plugin.
 * @param config - resolved plugin configuration from schemastery.
 */
// oxlint-disable-next-line typescript/require-await -- async keeps a load-time config rejection a rejection, not a synchronous throw
function apply(ctx, config) {
    return __awaiter(this, void 0, void 0, function () {
        var resolved;
        return __generator(this, function (_a) {
            resolved = config;
            (0, search_scope_ts_1.validateExcludedDirectories)(resolved.excludeDirectories);
            assertPositiveInteger('globMaxResults', resolved.globMaxResults);
            assertPositiveInteger('grepMaxMatches', resolved.grepMaxMatches);
            assertPositiveInteger('grepMaxLineBytes', resolved.grepMaxLineBytes);
            assertPositiveInteger('searchMetaMaxBytes', resolved.searchMetaMaxBytes);
            assertPositiveInteger('rawOutputMaxBytes', resolved.rawOutputMaxBytes);
            assertPositiveInteger('graceMs', resolved.graceMs);
            if (resolved.graceMs > dsh_timeout_1.MAX_TIMER_DELAY_MS) {
                throw new Error("tool-fs-search: graceMs must be no greater than ".concat(dsh_timeout_1.MAX_TIMER_DELAY_MS));
            }
            assertPositiveInteger('stderrMaxBytes', resolved.stderrMaxBytes);
            assertPositiveInteger('timeoutMs', resolved.timeoutMs);
            (0, glob_ts_1.applyGlobTool)(ctx, {
                sampleOverCapGlobResults: resolved.sampleOverCapGlobResults,
                excludeDirectories: resolved.excludeDirectories,
                maxResults: resolved.globMaxResults,
                maxMetaBytes: resolved.searchMetaMaxBytes,
                rawOutputMaxBytes: resolved.rawOutputMaxBytes,
                graceMs: resolved.graceMs,
                stderrMaxBytes: resolved.stderrMaxBytes,
                timeoutMs: resolved.timeoutMs,
            });
            (0, grep_ts_1.applyGrepTool)(ctx, {
                excludeDirectories: resolved.excludeDirectories,
                maxMatches: resolved.grepMaxMatches,
                maxLineBytes: resolved.grepMaxLineBytes,
                maxMetaBytes: resolved.searchMetaMaxBytes,
                rawOutputMaxBytes: resolved.rawOutputMaxBytes,
                graceMs: resolved.graceMs,
                stderrMaxBytes: resolved.stderrMaxBytes,
                timeoutMs: resolved.timeoutMs,
            });
            return [2 /*return*/];
        });
    });
}
