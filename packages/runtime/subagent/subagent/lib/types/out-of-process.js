"use strict";
/**
 * Provider-side vocabulary for OUT-OF-PROCESS subagent backends — the pieces
 * that enforce this seam's own contracts around a child in another process:
 * the no-capabilities advertisement, timing-bound validation, child
 * working-directory resolution (config override, else the delegating parent
 * session's workspace), the never-reject result settlement, and the standard
 * run-handle publication. Backends compose these with their own wire drivers;
 * the process machinery itself (spawn, env scrub, tree-scoped teardown)
 * belongs to the `dsh-subprocess` seam.
 *
 * @module @z/dsh-subagent/out-of-process
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
exports.NO_START_CAPABILITIES = void 0;
exports.assertPositiveFinite = assertPositiveFinite;
exports.assertUsableCwd = assertUsableCwd;
exports.validateConfiguredCwd = validateConfiguredCwd;
exports.resolveChildCwd = resolveChildCwd;
exports.settleRunResult = settleRunResult;
exports.subprocessRunHandle = subprocessRunHandle;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
/** Maximum UTF-8 size of {@link SubagentResult.diagnostic}. */
var MAX_SUBAGENT_DIAGNOSTIC_BYTES = 4096;
var DIAGNOSTIC_TRUNCATION_SUFFIX = '\n[diagnostic truncated]';
var utf8Encoder = new TextEncoder();
var utf8Decoder = new TextDecoder();
/**
 * Limit provider-authored failure detail without splitting a UTF-8 sequence.
 * @param diagnostic - safe diagnostic text produced by the provider.
 * @returns the original text, or a visibly truncated value within the limit.
 */
function limitSubagentDiagnostic(diagnostic) {
    var bytes = utf8Encoder.encode(diagnostic);
    if (bytes.byteLength <= MAX_SUBAGENT_DIAGNOSTIC_BYTES)
        return diagnostic;
    var suffixBytes = utf8Encoder.encode(DIAGNOSTIC_TRUNCATION_SUFFIX).byteLength;
    var prefixBytes = MAX_SUBAGENT_DIAGNOSTIC_BYTES - suffixBytes;
    while ((bytes[prefixBytes] & 192) === 128) {
        prefixBytes -= 1;
    }
    return utf8Decoder.decode(bytes.subarray(0, prefixBytes))
        + DIAGNOSTIC_TRUNCATION_SUFFIX;
}
/**
 * The capability advertisement of an out-of-process backend: NONE. A child in
 * another process cannot honor parent-enforced start features
 * (`outputSchema`/`maxDepth`/`toolFilter`/`persona`), so the service rejects a
 * request needing any of them before `start` runs — never accepted-then-ignored.
 */
exports.NO_START_CAPABILITIES = Object.freeze({
    outputSchema: false,
    depthLimit: false,
    toolFilter: false,
    persona: false,
});
/**
 * Assert a configured timing bound is a positive finite number (it bounds a
 * teardown or shutdown wait; zero, negative, or NaN would skip or wedge it).
 * @param prefix - the consuming plugin's diagnostic prefix (e.g. `subagent-acp`).
 * @param name - the config field name, for the diagnostic.
 * @param value - the configured value.
 */
function assertPositiveFinite(prefix, name, value) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error("".concat(prefix, ": ").concat(name, " must be a positive finite number"));
    }
}
/**
 * Whether `path` names an existing directory the harness can ENTER. The
 * search-permission probe matters: `statSync().isDirectory()` is true for a
 * mode-600 directory, but a subprocess cwd needs `X_OK` or spawn fails EACCES.
 */
function isEnterableDirectory(path) {
    try {
        if (!(0, node_fs_1.statSync)(path).isDirectory())
            return false;
        (0, node_fs_1.accessSync)(path, node_fs_1.constants.X_OK);
        return true;
    }
    catch (_a) {
        // statSync/accessSync throw only filesystem access errors here
        // (ENOENT/EACCES/ENOTDIR/…), and every one of them means the path cannot
        // serve as the child's cwd.
        return false;
    }
}
/**
 * Assert `cwd` can actually host the child: absolute (it doubles as the
 * child's workspace identity, and a relative path would be re-anchored to the
 * server process's launch directory) and an existing directory (fail here,
 * before the process boundary, instead of as an ambiguous spawn ENOENT).
 * @param prefix - the consuming plugin's diagnostic prefix.
 * @param label - which source supplied the value, for the diagnostic.
 * @param cwd - the candidate working directory.
 * @returns `cwd`, validated.
 */
function assertUsableCwd(prefix, label, cwd) {
    if (!(0, node_path_1.isAbsolute)(cwd)) {
        throw new Error("".concat(prefix, ": ").concat(label, " must be an absolute path: ").concat(cwd));
    }
    if (!isEnterableDirectory(cwd)) {
        throw new Error("".concat(prefix, ": ").concat(label, " is not an accessible directory: ").concat(cwd));
    }
    return cwd;
}
/**
 * Validate a configured `cwd` override ONCE, at plugin load: reject the empty
 * string (`path.resolve('')` is the process cwd — it would silently
 * reintroduce the launch-directory fallback this resolution removes),
 * interpret a relative path against the harness launch directory, and require
 * an enterable directory.
 * @param prefix - the consuming plugin's diagnostic prefix.
 * @param cwd - the configured override, or `undefined` when the config omits it.
 * @returns the validated absolute override, or `undefined` when omitted.
 */
function validateConfiguredCwd(prefix, cwd) {
    if (cwd === undefined)
        return undefined;
    if (cwd === '') {
        throw new Error("".concat(prefix, ": config cwd must not be empty \u2014 omit the key to inherit the parent session cwd"));
    }
    return assertUsableCwd(prefix, 'config cwd', (0, node_path_1.resolve)(cwd));
}
/**
 * Resolve the child's working directory at start: the deployment override
 * when configured (already validated at load), else the parent session's
 * workspace cwd (validated here, its earliest resolvable point). Fails loud
 * when neither exists — falling back to the harness process cwd would
 * silently bind the child to the server's launch directory instead of the
 * delegating session's workspace (one server process serves many sessions,
 * each with its own cwd).
 * @param prefix - the consuming plugin's diagnostic prefix.
 * @param configured - the load-validated override, or `undefined`.
 * @param parentCwd - the delegating parent session's workspace cwd, if any.
 * @returns the absolute child working directory.
 */
function resolveChildCwd(prefix, configured, parentCwd) {
    if (configured !== undefined)
        return configured;
    if (parentCwd === undefined) {
        throw new Error("".concat(prefix, ": no working directory for the child \u2014 configure `cwd` or delegate from a parent session that has one"));
    }
    return assertUsableCwd(prefix, 'parent session cwd', parentCwd);
}
/** Normalize an unknown thrown value to an Error (the catch binding is `unknown`). */
function toError(value) {
    // The rejecting surfaces (wire clients, spawn failures) only throw
    // `Error`s; the `String(value)` arm is a defensive fallback for a non-Error
    // throw the typed surfaces cannot produce.
    /* v8 ignore next */
    return value instanceof Error ? value : new Error(String(value));
}
/**
 * Settle an out-of-process run result under the seam contract: `result` never
 * rejects after publication. A normally completed or rejected attempt resolves
 * as `aborted` when cancellation already settled locally; another rejection is
 * flattened to `stopReason: 'error'` through the contained diagnostic sink.
 * The abort listener is removed on every path.
 * @param parts - the attempt, output snapshot, cancellation state, sink, and signal wiring.
 * @returns the terminal result (never a rejection).
 */
function settleRunResult(parts) {
    return __awaiter(this, void 0, void 0, function () {
        var result, error_1, collected, diagnostic;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, 3, 4]);
                    return [4 /*yield*/, parts.attempt()];
                case 1:
                    result = _c.sent();
                    return [2 /*return*/, parts.cancelled()
                            ? { output: parts.collectOutput(), stopReason: 'aborted' }
                            : result];
                case 2:
                    error_1 = _c.sent();
                    // Cover a rejection already queued when cancellation arrives.
                    if (parts.cancelled())
                        return [2 /*return*/, { output: parts.collectOutput(), stopReason: 'aborted' }
                            // Flatten post-publication transport failures while preserving diagnostics.
                        ];
                    // Flatten post-publication transport failures while preserving diagnostics.
                    try {
                        (_a = parts.onError) === null || _a === void 0 ? void 0 : _a.call(parts, toError(error_1), 'error');
                    }
                    catch (_d) {
                        // The diagnostic sink cannot reject the run result.
                    }
                    collected = (_b = parts.collectDiagnostic) === null || _b === void 0 ? void 0 : _b.call(parts);
                    diagnostic = collected === undefined
                        ? undefined
                        : limitSubagentDiagnostic(collected);
                    return [2 /*return*/, __assign(__assign({ output: parts.collectOutput() }, diagnostic === undefined ? {} : { diagnostic: diagnostic }), { stopReason: 'error' })];
                case 3:
                    parts.signal.removeEventListener('abort', parts.onAbort);
                    return [7 /*endfinally*/];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Publish the seam run handle for an out-of-process child. `dispose()` is
 * idempotent (one memoized teardown): it removes the abort listener, settles
 * local cancellation — there is no assumption the child cooperates — and then
 * awaits the backend's teardown to actual exit.
 * @param parts - the run identity, result, cancellation wiring, and teardown.
 * @returns the seam run handle (`localAgent` is `undefined` for remote runs).
 */
function subprocessRunHandle(parts) {
    var disposal;
    return {
        id: parts.id,
        localAgent: undefined,
        result: parts.result,
        dispose: function () {
            if (disposal !== undefined)
                return disposal;
            parts.signal.removeEventListener('abort', parts.onAbort);
            parts.requestCancel();
            disposal = parts.teardown();
            return disposal;
        },
    };
}
