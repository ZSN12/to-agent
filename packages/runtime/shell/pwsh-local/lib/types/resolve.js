"use strict";
/**
 * PowerShell executable resolution, dependency-free so non-package consumers
 * (the repository's coverage-gate probe in `vitest.config.ts`) can share the
 * ONE resolution definition with the executor and its suites — a probe that
 * resolved differently from the code under test could exempt a file whose
 * suites actually run.
 *
 * @module @z/dsh-pwsh-local/resolve
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.candidatePwshPaths = candidatePwshPaths;
exports.resolvePwshPath = resolvePwshPath;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
/**
 * Well-known Windows PowerShell install locations plus PATH entries, newest
 * first. Explicitly parameterized (env) so resolution is a pure function of
 * its inputs on every platform.
 * @param env - the environment to probe; defaults to the process environment.
 * @returns candidate `pwsh` executable paths in resolution order.
 */
function candidatePwshPaths(env) {
    var _a, _b, _c;
    if (env === void 0) { env = process.env; }
    var programFiles = (_a = env.ProgramFiles) !== null && _a !== void 0 ? _a : 'C:\\Program Files';
    var systemRoot = (_b = env.SystemRoot) !== null && _b !== void 0 ? _b : 'C:\\Windows';
    var candidates = [
        (0, node_path_1.join)(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    ];
    // Microsoft Store installs (and any user-added location) live on PATH;
    // entries may carry surrounding quotes from `setx`-style definitions.
    for (var _i = 0, _d = ((_c = env.PATH) !== null && _c !== void 0 ? _c : '').split(';'); _i < _d.length; _i++) {
        var entry = _d[_i];
        var trimmed = entry.trim().replace(/^"|"$/g, '');
        if (trimmed.length === 0)
            continue;
        candidates.push((0, node_path_1.join)(trimmed, 'pwsh.exe'));
    }
    // Windows PowerShell 5.1 remains the last-resort fallback on legacy hosts.
    candidates.push((0, node_path_1.join)(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
    return candidates;
}
/**
 * Whether a candidate can be spawned. lstat opens the entry itself instead of
 * following reparse points, so it sees the Store app execution alias where
 * stat hits the target's ACL (EACCES); Node reports that alias as a symlink
 * on current releases and as a plain file on older ones, and CreateProcess
 * resolves either shape. A real directory never matches.
 */
function candidateExists(candidate) {
    try {
        var stat = (0, node_fs_1.lstatSync)(candidate);
        return stat.isFile() || stat.isSymbolicLink();
    }
    catch (_a) {
        // ENOENT (the candidate vanished between listing and probing) is the only
        // expected failure; any other error names an unspawnable path, so false
        // is the safe answer for it too.
        return false;
    }
}
/**
 * Resolve the pwsh executable this executor spawns.
 * @param configured - an explicit `pwshPath` config value, trusted as-is.
 * @param env - the environment to probe on Windows; defaults to the process environment.
 * @param platform - the platform to resolve for; defaults to the process platform.
 * @returns the first existing well-known location on Windows (PowerShell 7
 *   install, a PATH entry such as the Microsoft Store install, then Windows
 *   PowerShell 5.1), else `pwsh` for PATH resolution.
 */
function resolvePwshPath(configured, env, platform) {
    if (env === void 0) { env = process.env; }
    if (platform === void 0) { platform = process.platform; }
    if (configured !== undefined && configured.length > 0)
        return configured;
    if (platform === 'win32') {
        for (var _i = 0, _a = candidatePwshPaths(env); _i < _a.length; _i++) {
            var candidate = _a[_i];
            if (candidateExists(candidate))
                return candidate;
        }
    }
    return 'pwsh';
}
