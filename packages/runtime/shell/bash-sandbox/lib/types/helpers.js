"use strict";
/**
 * Internal sandbox-result classification helpers.
 *
 * @module @z/dsh-bash-sandbox/helpers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRunnerSpawnFailure = isRunnerSpawnFailure;
exports.classifyDenial = classifyDenial;
exports.classifyRunnerFailure = classifyRunnerFailure;
exports.matchesSignature = matchesSignature;
var node_fs_1 = require("node:fs");
/** Node-local spawn codes proven to identify executable resolution or permission failure. */
var EXECUTABLE_SPAWN_CODES = new Set(['EACCES', 'ENOENT']);
/** Whether the caller-owned spawn cwd can be entered. */
function isUsableWorkdir(path) {
    try {
        if (!(0, node_fs_1.statSync)(path).isDirectory())
            return false;
        (0, node_fs_1.accessSync)(path, node_fs_1.constants.X_OK);
        return true;
    }
    catch (_a) {
        return false;
    }
}
/**
 * Attribute only Node ENOENT/EACCES failures whose error path equals argv[0]
 * after independently ruling out the caller-owned cwd. A supplied error path
 * must exactly identify the runner; without one, the syscall must. With a
 * usable cwd, these codes describe resolution or execute permission for that
 * argv[0] or its shebang interpreter.
 * The workdir is checked at classification time, not atomically with spawn;
 * concurrent path replacement may change attribution but cannot permit an
 * unconfined execution.
 * @param error - the original spawn rejection.
 * @param runnerProgram - provider argv[0], the executable that establishes confinement.
 * @param workdir - the caller-owned spawn cwd, checked independently for usability.
 * @returns whether the rejection has executable-specific runner evidence.
 */
function isRunnerSpawnFailure(error, runnerProgram, workdir) {
    if (runnerProgram === undefined || !isUsableWorkdir(workdir))
        return false;
    if (typeof error !== 'object' || error === null)
        return false;
    var _a = error, code = _a.code, path = _a.path, syscall = _a.syscall;
    if (typeof code !== 'string' || !EXECUTABLE_SPAWN_CODES.has(code))
        return false;
    if (typeof syscall !== 'string')
        return false;
    var exactSyscall = "spawn ".concat(runnerProgram);
    if (path === undefined)
        return syscall === exactSyscall;
    if (typeof path !== 'string' || path.length === 0 || path !== runnerProgram)
        return false;
    return syscall === 'spawn' || syscall === exactSyscall;
}
/**
 * Classify a failed run against the selected backend's denial dialect.
 * @param result - settled foreground run.
 * @param signatures - case-insensitive denial substrings from the active wrap.
 * @returns whether the failed run matches that denial dialect.
 */
function classifyDenial(result, signatures) {
    return matchesSignature(result.exitCode, result.stderr.text, signatures);
}
/**
 * Classify one settled process against the selected backend's structured
 * runner-failure rules. Each rule requires a nonzero exit, its optional
 * exit-code gate, and a fatal signature on one stderr line after exact
 * informational lines are excluded.
 * @param exitCode - process exit code; null means signal termination.
 * @param stderr - collected stderr text, left unchanged.
 * @param rules - structured runner-failure rules from the active wrap.
 * @returns the first matching fatal line, or undefined when evidence is insufficient.
 */
function classifyRunnerFailure(exitCode, stderr, rules) {
    var _a;
    if (exitCode === null || exitCode === 0)
        return undefined;
    var lines = stderr.split(/\r?\n/);
    for (var _i = 0, rules_1 = rules; _i < rules_1.length; _i++) {
        var rule = rules_1[_i];
        if (rule.allowedExitCodes !== undefined && !rule.allowedExitCodes.includes(exitCode))
            continue;
        var informationalLines = new Set(((_a = rule.informationalLines) !== null && _a !== void 0 ? _a : []).map(function (line) { return line.toLowerCase(); }));
        // An empty or whitespace-only substring is not meaningful runner evidence.
        // Ignore it while keeping any valid signatures beside it active.
        var fatalSignatures = rule.fatalSignatures
            .filter(function (signature) { return signature.trim().length > 0; })
            .map(function (signature) { return signature.toLowerCase(); });
        var _loop_1 = function (line) {
            var lowered = line.toLowerCase();
            if (informationalLines.has(lowered))
                return "continue";
            if (fatalSignatures.some(function (signature) { return lowered.includes(signature); }))
                return { value: { detail: line } };
        };
        for (var _b = 0, lines_1 = lines; _b < lines_1.length; _b++) {
            var line = lines_1[_b];
            var state_1 = _loop_1(line);
            if (typeof state_1 === "object")
                return state_1.value;
        }
    }
    return undefined;
}
/**
 * Match a non-zero exit against case-insensitive stderr signatures.
 * @param exitCode - process exit code; null means signal termination.
 * @param stderr - collected stderr text.
 * @param signatures - substrings identifying the selected backend's dialect.
 * @returns whether this is a non-zero exit whose stderr matches a signature.
 */
function matchesSignature(exitCode, stderr, signatures) {
    if (exitCode === null || exitCode === 0)
        return false;
    var lowered = stderr.toLowerCase();
    return signatures.some(function (signature) { return lowered.includes(signature.toLowerCase()); });
}
