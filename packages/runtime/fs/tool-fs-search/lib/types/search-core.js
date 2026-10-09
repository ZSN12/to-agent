"use strict";
/**
 * Shared execution plumbing for the `glob` / `grep` search tools: the
 * package-owned `SEARCH_*` error vocabulary, one spawn helper that runs the
 * PACKAGED ripgrep binary (`@vscode/ripgrep`) with a plain argv vector and
 * returns complete raw stdout, the best-effort formatted-result spill handoff,
 * and workdir-relative path display.
 *
 * Both tools execute as ordinary foreground spawns through `ctx.subprocess` —
 * never `ctx.shell`, never `ctx.shell.start()`, never a model-visible background
 * task. The ripgrep binary ships inside the npm package, so no system `rg`
 * install is required, and no shell layer exists between the argv vector and
 * ripgrep, so no shell quoting is involved. Raw `rg` stdout is an internal
 * transport detail: the tools request a per-run stdout capture budget from the
 * subprocess seam, parse only complete in-memory stdout within
 * `rawOutputMaxBytes`, and never read spill files. The model-facing recovery
 * artifact is the formatted result saved through `ctx.spillStore.saveText()`
 * ({@link trySaveFormattedResult}).
 *
 * @module @z/dsh-tool-fs-search/search-core
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.SearchError = exports.SEARCH_META_MAX_BYTES = exports.SEARCH_GRACE_MS = exports.SEARCH_STDERR_MAX_BYTES = exports.SEARCH_TIMEOUT_MS = exports.RAW_OUTPUT_MAX_BYTES = void 0;
exports.resolveRgPath = resolveRgPath;
exports.runRipgrep = runRipgrep;
exports.toWorkdirRelative = toWorkdirRelative;
exports.previewLine = previewLine;
exports.retainGrepMatches = retainGrepMatches;
exports.retainGlobPaths = retainGlobPaths;
exports.trySaveFormattedResult = trySaveFormattedResult;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_output_retention_1 = require("@z/dsh-output-retention");
/**
 * Default cap on the complete raw `rg` stdout the tools will parse (the
 * `rawOutputMaxBytes` config), matching Claude Code's ripgrep raw buffer.
 */
exports.RAW_OUTPUT_MAX_BYTES = 20000000;
/**
 * Default cooperative tool-call timeout budget in milliseconds (the `timeoutMs`
 * config), attached to both tool definitions for
 * `@z/dsh-tool-call-timeout-policy` to enforce through `exec.signal`.
 */
exports.SEARCH_TIMEOUT_MS = 30000;
/**
 * Default cap in bytes on the retained stderr tail of one search run — a
 * diagnostic excerpt only (the tool never reads a stderr spill path, and the
 * collect disposition requests none).
 */
exports.SEARCH_STDERR_MAX_BYTES = 64 * 1024;
/** Default terminate grace period for a search process (ms). */
exports.SEARCH_GRACE_MS = 3000;
/**
 * Default cap in bytes on one search's serialized `presentationMeta` (the
 * `searchMetaMaxBytes` config). The inline match/path caps already bound the item
 * COUNT, but retained matches of a broad search (many long lines) can still
 * serialize to hundreds of kilobytes, and `meta` is persisted with the session
 * log and re-sent on every request. A deployment's final output budget
 * (`dsh-spill-policy`) only shrinks a result's `content`, never its `meta`, so the
 * projection owns this cap. 64 KiB holds the full default-capped result of a
 * typical search while bounding the pathological one.
 */
exports.SEARCH_META_MAX_BYTES = 65536;
/**
 * Typed search failure. Extends {@link HarnessError} so it carries a stable
 * {@link SearchErrorCode} and chains `cause`; the tool registry exposes
 * `{ name, code }` on `isError` results so retry/permission/UI layers can
 * branch without parsing messages.
 */
var SearchError = /** @class */ (function (_super) {
    __extends(SearchError, _super);
    function SearchError(message, code, options) {
        var _this = _super.call(this, message, code, options) || this;
        _this.code = code;
        return _this;
    }
    return SearchError;
}(dsh_llm_1.HarnessError));
exports.SearchError = SearchError;
/**
 * The retained stderr tail as a diagnostic excerpt, with a truncation note when
 * the subprocess seam dropped bytes.
 */
function stderrExcerpt(stderrText, truncated) {
    var text = stderrText.trim();
    if (text.length === 0)
        return '';
    return truncated ? "".concat(text, " [stderr truncated]") : text;
}
/**
 * Classify a nonzero-exit `rg` run into the search error vocabulary. There is
 * no shell layer, so an exit 127 or shell "command not found" text cannot
 * occur — a launch failure rejects at spawn (see {@link runRipgrep}).
 */
function classifyRunFailure(toolName, exitCode, stderrText, stderrTruncated) {
    var stderr = stderrExcerpt(stderrText, stderrTruncated);
    if (/regex parse error|error parsing glob/i.test(stderr)) {
        return new SearchError("".concat(toolName, " pattern rejected by ripgrep: ").concat(stderr), 'SEARCH_INVALID_PATTERN');
    }
    return new SearchError("".concat(toolName, " search failed (exit ").concat(exitCode, ")").concat(stderr.length > 0 ? ": ".concat(stderr) : ''), 'SEARCH_FAILED');
}
/**
 * Acquire the COMPLETE raw stdout of a finished run, enforcing
 * `rawOutputMaxBytes` on the in-memory transport. A truncated result means the
 * subprocess seam could not retain complete stdout within the requested
 * budget, so the tool fails clearly instead of parsing a silently-partial
 * stream.
 */
function completeStdout(toolName, stdout, rawOutputMaxBytes) {
    var narrow = 'narrow pattern, path, or include and retry';
    if (!stdout.lossy) {
        var inlineBytes = Buffer.byteLength(stdout.text, 'utf8');
        if (inlineBytes > rawOutputMaxBytes) {
            throw new SearchError("".concat(toolName, " produced ").concat(inlineBytes, " bytes of raw output, over the ").concat(rawOutputMaxBytes, "-byte cap; ").concat(narrow), 'SEARCH_RAW_OUTPUT_OVERFLOW');
        }
        return stdout.text;
    }
    throw new SearchError("".concat(toolName, " produced more raw output than the subprocess seam retained within the ").concat(rawOutputMaxBytes, "-byte cap; ").concat(narrow), 'SEARCH_RAW_OUTPUT_OVERFLOW');
}
var rgPathPromise;
/**
 * The packaged ripgrep binary path, resolved lazily once per process.
 *
 * A single-file runtime uses the executable's `-rg` sidecar because a native
 * helper cannot be spawned from pkg's virtual filesystem. Node-mode builds
 * fall back to the platform package selected by `@vscode/ripgrep`. Resolving
 * at the call boundary keeps a missing or corrupt binary at the first search
 * call as `SEARCH_FAILED`, rather than failing the Loader composition.
 *
 * @returns the packaged binary's absolute path; successful resolutions are
 *   memoized, while a rejected resolution is cleared so a later search can retry.
 */
function resolveRgPath() {
    var _this = this;
    if (rgPathPromise === undefined) {
        var pending_1 = Promise.resolve().then(function () { return __awaiter(_this, void 0, void 0, function () {
            var executableSidecar;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        executableSidecar = "".concat(process.execPath, "-rg");
                        if ('pkg' in process && (0, node_fs_1.existsSync)(executableSidecar))
                            return [2 /*return*/, executableSidecar];
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('@vscode/ripgrep'); })];
                    case 1: return [2 /*return*/, (_a.sent()).rgPath];
                }
            });
        }); });
        rgPathPromise = pending_1;
        // A rejected lazy import is not a usable cache entry. In particular, a
        // transient deploy/optional-package resolution race must not poison every
        // later grep/glob call for the lifetime of the Host process.
        void pending_1.catch(function () {
            if (rgPathPromise === pending_1)
                rgPathPromise = undefined;
        });
    }
    return rgPathPromise;
}
/** Add only stable, path-free OS diagnostics to a model-facing launch error. */
function launchFailureMessage(toolName, error) {
    var diagnostic = (function () {
        if (typeof error !== 'object' || error === null)
            return '';
        var value = error;
        var code = typeof value.code === 'string' && /^[A-Z][A-Z0-9_]{0,39}$/.test(value.code)
            ? value.code
            : '';
        var syscall = typeof value.syscall === 'string' && /^[a-z][a-z0-9_-]{0,39}$/i.test(value.syscall)
            ? value.syscall
            : '';
        return code ? "".concat(code).concat(syscall ? " (".concat(syscall, ")") : '') : '';
    })();
    return "".concat(toolName, " could not start its search command (ripgrep launch failed").concat(diagnostic ? ": ".concat(diagnostic) : '', ")");
}
/**
 * Run the packaged ripgrep binary with a plain argv vector and return its
 * complete raw stdout. The working directory is the calling agent's session
 * cwd (`exec.agent.session.header.cwd`) when available, else
 * `process.cwd()`. `exec.signal` is forwarded so the cooperative tool timeout
 * (`@z/dsh-tool-call-timeout-policy`) and caller cancellation terminate the
 * process tree.
 *
 * The spawn is unconfined (a plain `ctx.subprocess` call), so `--no-config`
 * is prepended: a host `RIPGREP_CONFIG_PATH` (or `rg.conf` next to the
 * binary) can otherwise inject `--pre` and make ripgrep execute an arbitrary
 * preprocessor for every matched file. The collect dispositions are the
 * seam's diagnostic-tail shape (no spill files): the tools never read a raw
 * spill path, and truncated stdout fails as `SEARCH_RAW_OUTPUT_OVERFLOW`.
 *
 * Exit semantics are tool-owned: exit 0 is success with results, exit 1 is
 * success with zero results (`noMatches`), anything else throws a
 * {@link SearchError} (abort/timeout → `SEARCH_ABORTED`, invalid pattern →
 * `SEARCH_INVALID_PATTERN`, the rest → `SEARCH_FAILED` /
 * `SEARCH_RAW_OUTPUT_OVERFLOW`). Both launch-time failure domains are
 * classified: a synchronous throw at spawn CREATION (a NUL in argv, an abort
 * racing the pre-check, a rejected `@vscode/ripgrep` resolution) and a
 * rejection of `handle.done` (the seam's infrastructure failures) both become
 * `SEARCH_FAILED` with the original as `cause` — an abort already observed by
 * creation time becomes `SEARCH_ABORTED` instead.
 *
 * @param ctx - the plugin context; execution uses its `subprocess` service.
 * @param exec - the tool-execution context; supplies the session cwd and the abort signal.
 * @param toolName - `glob` or `grep`, used in error messages.
 * @param argv - the ripgrep arguments (every model value an unquoted argv element; no shell layer exists).
 * @param rawOutputMaxBytes - cap on the complete raw stdout the tool will parse.
 * @param graceMs - the seam's terminate-escalation grace period.
 * @param stderrMaxBytes - cap on the retained stderr diagnostic tail.
 * @returns the complete stdout, the zero-result flag, and the resolved workdir.
 */
function runRipgrep(ctx, exec, toolName, argv, rawOutputMaxBytes, graceMs, stderrMaxBytes) {
    return __awaiter(this, void 0, void 0, function () {
        var cwd, workdir, handle, _a, _b, error_1, outcome, error_2, stdout, stderr, text;
        var _c;
        var _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    if (exec.signal.aborted) {
                        throw new SearchError("".concat(toolName, " was aborted before completion (tool timeout or caller cancellation)"), 'SEARCH_ABORTED');
                    }
                    cwd = (_d = exec.agent) === null || _d === void 0 ? void 0 : _d.session.header.cwd;
                    workdir = cwd !== null && cwd !== void 0 ? cwd : process.cwd();
                    _h.label = 1;
                case 1:
                    _h.trys.push([1, 3, , 4]);
                    _b = (_a = ctx.subprocess).spawn;
                    _c = {};
                    return [4 /*yield*/, resolveRgPath()];
                case 2:
                    handle = _b.apply(_a, [(_c.argv = __spreadArray.apply(void 0, [[_h.sent(), '--no-config'], argv, true]),
                            _c.cwd = workdir,
                            _c.stdio = {
                                stdin: 'ignore',
                                stdout: { maxBytes: rawOutputMaxBytes },
                                stderr: { maxBytes: stderrMaxBytes },
                            },
                            _c.graceMs = graceMs,
                            _c.signal = exec.signal,
                            _c)]);
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _h.sent();
                    // Node's spawn() throws synchronously for a NUL in argv, and the local
                    // impl can throw synchronously when the signal aborts between the check
                    // above and this call (or when the platform-package resolution rejects).
                    // The static narrowing that proves this re-check "always false" cannot
                    // see AbortSignal state changes.
                    // oxlint-disable-next-line typescript/no-unnecessary-condition
                    if (exec.signal.aborted) {
                        throw new SearchError("".concat(toolName, " was aborted before completion (tool timeout or caller cancellation)"), 'SEARCH_ABORTED');
                    }
                    throw new SearchError(launchFailureMessage(toolName, error_1), 'SEARCH_FAILED', { cause: error_1 });
                case 4:
                    _h.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, handle.done];
                case 5:
                    outcome = _h.sent();
                    return [3 /*break*/, 7];
                case 6:
                    error_2 = _h.sent();
                    throw new SearchError(launchFailureMessage(toolName, error_2), 'SEARCH_FAILED', { cause: error_2 });
                case 7:
                    stdout = (_e = handle.collected.stdout) === null || _e === void 0 ? void 0 : _e.readFrom(0);
                    stderr = (_f = handle.collected.stderr) === null || _f === void 0 ? void 0 : _f.readFrom(0);
                    if (stdout === undefined || stderr === undefined) {
                        throw new SearchError("".concat(toolName, " search command produced no collected output streams"), 'SEARCH_FAILED');
                    }
                    // The signal can abort while the spawn is awaited; the static narrowing that
                    // proves this re-check "always false" cannot see AbortSignal state changes.
                    // oxlint-disable-next-line typescript/no-unnecessary-condition
                    if (exec.signal.aborted) {
                        throw new SearchError("".concat(toolName, " was aborted before completion (tool timeout or caller cancellation)"), 'SEARCH_ABORTED');
                    }
                    if (outcome.signal !== null || outcome.exitCode === null) {
                        throw new SearchError("".concat(toolName, " search command was killed by signal ").concat((_g = outcome.signal) !== null && _g !== void 0 ? _g : '(unknown)'), 'SEARCH_FAILED');
                    }
                    if (outcome.exitCode !== 0 && outcome.exitCode !== 1) {
                        throw classifyRunFailure(toolName, outcome.exitCode, stderr.text, stderr.lossy);
                    }
                    text = completeStdout(toolName, stdout, rawOutputMaxBytes);
                    return [2 /*return*/, { stdout: text, noMatches: outcome.exitCode === 1, workdir: workdir }];
            }
        });
    });
}
/**
 * Map an `rg` output path to its display form: absolute paths inside the
 * resolved workdir become workdir-relative; everything else (relative output,
 * paths outside the workdir) passes through unchanged. Display-only —
 * returned paths are follow-up-readable in co-located workdir/filesystem
 * deployments where both resolve the same workspace (the documented v1
 * deployment requirement).
 *
 * @param path - one path as ripgrep printed it.
 * @param workdir - the resolved workdir the command ran in.
 * @returns the workdir-relative display path when possible, else `path` unchanged.
 */
function toWorkdirRelative(path, workdir) {
    if (!(0, node_path_1.isAbsolute)(path))
        return path;
    var rel = (0, node_path_1.relative)(workdir, path);
    if (rel.length === 0)
        return '.';
    if (rel === '..' || rel.startsWith("..".concat(node_path_1.sep)))
        return path;
    return rel;
}
/**
 * Bound one matched-line preview to `maxBytes` (UTF-8 boundary preserved) and
 * mark the cut. The cap is a per-line budget fact; the complete line stays in
 * the searched file for `read`.
 *
 * @param line - the matched line text (trailing newline already stripped).
 * @param maxBytes - the preview budget in bytes.
 * @returns the preview, suffixed with ` (line truncated)` when bytes were cut.
 */
function previewLine(line, maxBytes) {
    var retainer = new dsh_output_retention_1.TextRetainer({ kind: 'head', maxBytes: maxBytes });
    retainer.push(line);
    var kept = retainer.finish();
    return kept.truncated ? "".concat(kept.text, " (line truncated)") : kept.text;
}
/**
 * Apply the shared inline cap to a canonical `grep` match list: preview each
 * retained line to `maxLineBytes` and keep the first `maxMatches`. The single
 * retention pass both the model-facing render ({@link module:@z/dsh-tool-fs-search/grep}
 * `formatGrepOutput`) and the search-card projection
 * ({@link module:@z/dsh-tool-fs-search/presentation} `grepSearchMeta`)
 * consume, so text and card never disagree about which matches survived.
 *
 * @param matches - every match the search parsed (the canonical value's matches).
 * @param maxMatches - the inline match cap (the `grepMaxMatches` config).
 * @param maxLineBytes - the per-matched-line preview budget in bytes.
 * @returns the retention outcome over the previewed matches.
 */
function retainGrepMatches(matches, maxMatches, maxLineBytes) {
    var retainer = new dsh_output_retention_1.ItemRetainer({ kind: 'head', maxItems: maxMatches });
    for (var _i = 0, matches_1 = matches; _i < matches_1.length; _i++) {
        var match = matches_1[_i];
        retainer.push(__assign(__assign({}, match), { line: previewLine(match.line, maxLineBytes) }));
    }
    return retainer.finish();
}
/**
 * Apply the shared inline cap to a canonical `glob` path list: keep the first
 * `maxResults`. The single retention pass both the model-facing render and the
 * search-card projection consume.
 *
 * @param paths - every path the search discovered (the canonical value's paths).
 * @param maxResults - the inline path cap (the `globMaxResults` config).
 * @returns the retention outcome over the paths.
 */
function retainGlobPaths(paths, maxResults) {
    var retainer = new dsh_output_retention_1.ItemRetainer({ kind: 'head', maxItems: maxResults });
    for (var _i = 0, paths_1 = paths; _i < paths_1.length; _i++) {
        var path = paths_1[_i];
        retainer.push(path);
    }
    return retainer.finish();
}
/**
 * Best-effort save of one COMPLETE formatted search result through
 * `ctx.spillStore.saveText()` — the model-facing recovery path for a capped
 * result. `spillStore` is read with `ctx.get()` (not static inject) because
 * formatted-result spill is optional; the spill owner is the calling agent's
 * session header id and the source is the tool execution identity. A missing
 * backend, a call with no session owner, or a `saveText()` rejection logs a
 * warning and returns `undefined` — the caller keeps the inline result and
 * reports that the complete result could not be saved; search success never
 * turns into `isError` because spill storage is unavailable.
 *
 * @param ctx - the plugin context; `spillStore` is looked up opportunistically.
 * @param exec - the tool-execution context; supplies the owning session, tool name, and call id.
 * @param suggestedName - the backend-sanitized filename hint (e.g. `grep-results.txt`).
 * @param content - the complete formatted result to persist.
 * @returns the saved spill reference, or `undefined` when the result could not be saved.
 */
function trySaveFormattedResult(ctx, exec, suggestedName, content) {
    return __awaiter(this, void 0, void 0, function () {
        var sessionId, spillStore, save, error_3;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    sessionId = (_a = exec.agent) === null || _a === void 0 ? void 0 : _a.session.header.id;
                    if (sessionId === undefined) {
                        ctx.logger.warn("tool-fs-search: no session owner for ".concat(exec.name, " result; complete result not saved"));
                        return [2 /*return*/, undefined];
                    }
                    spillStore = ctx.get('spillStore');
                    if (!spillStore) {
                        ctx.logger.warn("tool-fs-search: no ctx.spillStore backend loaded; complete ".concat(exec.name, " result not saved"));
                        return [2 /*return*/, undefined];
                    }
                    save = {
                        owner: { sessionId: sessionId },
                        source: { toolName: exec.name, callId: exec.callId, label: 'result' },
                        suggestedName: suggestedName,
                        content: content,
                    };
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, spillStore.saveText(save)];
                case 2: return [2 /*return*/, _b.sent()];
                case 3:
                    error_3 = _b.sent();
                    // Best-effort: a storage failure must never fail the search or hide the
                    // inline result — the footer reports the unsaved remainder instead.
                    ctx.logger.warn("tool-fs-search: saveText failed for ".concat(exec.name, ": ").concat(String(error_3), "; complete result not saved"));
                    return [2 /*return*/, undefined];
                case 4: return [2 /*return*/];
            }
        });
    });
}
