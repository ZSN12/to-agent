"use strict";
/**
 * Local sandbox backend. It selects the platform runner (Linux bwrap; macOS
 * Seatbelt; Windows the ACL restricted-token runner), functionally probes
 * competing candidates once, and reports each wrap's enforcement and stderr
 * classification facts. Missing or unusable confinement fails closed rather
 * than returning the original argv.
 *
 * The windows-acl rung additionally owns the write grants: the write SID is
 * the per-WORKSPACE identity derived from the canonical workspace path
 * (`workspaceWriteSid`), while every live session receives a RANDOM private
 * temp directory and its own derived capability (`tempWriteSid`). The
 * workspace-root ACE materializes once per workspace per server lifetime
 * and STANDS (the cross-session reuse cache — the exact-ACE skip makes
 * every later provision O(1) instead of re-propagating the tree per
 * session); the private-temp ACEs are revoked on dispose. The runner
 * receives both SIDs (their presence marks the seam-managed contract) and
 * stops managing DACLs itself. The rung reports partial enforcement because
 * WRITE_RESTRICTED must retain Everyone in its
 * restricting list and NTFS hard links alias one file object across paths.
 * @module @z/dsh-sandbox-local
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
exports.LocalSandboxProvider = void 0;
var node_child_process_1 = require("node:child_process");
var node_fs_1 = require("node:fs");
var node_os_1 = require("node:os");
var node_path_1 = require("node:path");
var node_url_1 = require("node:url");
var schemastery_1 = require("@z/schemastery");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_sandbox_1 = require("@z/dsh-sandbox");
var dsh_sandbox_windows_acl_1 = require("@z/dsh-sandbox-windows-acl");
var profiles_ts_1 = require("./profiles.ts");
/** Probe whether `bwrap` can create the profile; the provider caches the bounded result. */
function defaultProbeBwrap(timeoutMs) {
    var probe = (0, node_child_process_1.spawnSync)('bwrap', __spreadArray(__spreadArray([], (0, profiles_ts_1.bwrapProfileArgs)({ mode: 'read-only', workspaceRoot: '/' }), true), ['--', 'true'], false), {
        timeout: timeoutMs,
        stdio: 'ignore',
    });
    return probe.status === 0;
}
/**
 * Functional Seatbelt probe: apply the real `read-only` profile through
 * `sandbox-exec -p` and run `true` under it — exit 0 means the kernel
 * accepted and enforced the profile (`sandbox-exec` exits non-zero when
 * `sandbox_init` refuses it). A missing `sandbox-exec` (every non-macOS
 * host) fails the spawn and probes `unusable`, exactly like the other
 * rungs' absent binaries. Apple marks the CLI deprecated but ships it on
 * every macOS; if it ever disappears, this probe is what fails closed.
 */
function defaultProbeSeatbelt(seatbeltExec, timeoutMs) {
    var probe = (0, node_child_process_1.spawnSync)(seatbeltExec, __spreadArray(__spreadArray([], (0, profiles_ts_1.seatbeltProfileArgs)({ mode: 'read-only', workspaceRoot: '/' }), true), ['--', 'true'], false), {
        timeout: timeoutMs,
        stdio: 'ignore',
    });
    return probe.status === 0;
}
/**
 * Functional windows-acl probe: run the runner in read-only mode (zero grants,
 * no ACL mutation) around `cmd /c exit 0` — exit 0 means the runner created
 * the restricted token and spawned the child under it. The win32 chain is a
 * sole candidate, so the product never probes; the probe exists for override
 * chains and mirrors the other rungs' shape.
 */
function defaultProbeWindowsAcl(runnerInvocation, timeoutMs) {
    var program = runnerInvocation[0];
    if (program === undefined)
        return false;
    var probe = (0, node_child_process_1.spawnSync)(program, __spreadArray(__spreadArray([], runnerInvocation.slice(1), true), [
        '--workspace', (0, node_os_1.tmpdir)(), '--temp', (0, node_os_1.tmpdir)(), '--mode', 'read-only',
        '--', 'cmd', '/c', 'exit', '0',
    ], false), {
        timeout: timeoutMs,
        stdio: 'ignore',
    });
    return probe.status === 0;
}
/**
 * The runner chain per platform — selection is BY PLATFORM first, probes
 * second: a platform's chain is probed in preference order only when it has
 * MORE than one candidate (probing arbitrates; it does not re-validate a
 * choice that has no alternative). A platform with no chain fails closed at
 * `confine()`. Linux uses the bwrap mount profile; darwin has exactly one
 * Seatbelt candidate, selected without any probe.
 */
var PLATFORM_CHAINS = {
    linux: ['bwrap'],
    darwin: ['seatbelt'],
    // The Windows restricted-token runner (@z/dsh-sandbox-windows-acl):
    // a sole candidate, selected without a probe — its execution-time refusal
    // fails closed through its stderr signature (windows-acl-run:) and exit 127.
    win32: ['windows-acl'],
};
/**
 * Enforcement completeness a rung claims when selected WITHOUT a probe (a
 * chain of one). `bwrap` and Seatbelt govern every promised file effect by
 * construction; the Windows runner reports its documented partial boundary.
 */
var STATIC_ENFORCEMENT = {
    bwrap: 'full',
    seatbelt: 'full',
    // WRITE_RESTRICTED needs Everyone in both restricting lists for process
    // initialization. An external object that grants Everyone write access
    // therefore remains writable, and NTFS hard links can alias a granted
    // workspace file to a path outside it. The backend enforces the remaining
    // ACL-addressable surface but must not advertise the absolute promise.
    'windows-acl': 'partial',
};
/**
 * A probe bound must be a positive finite number: Node treats
 * `spawnSync({ timeout: 0 })` as NO timeout, so an unvalidated 0 would
 * silently mean "unbounded" — the opposite of what the field promises.
 */
function assertPositiveFinite(name, value) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error("sandbox-local: ".concat(name, " must be a positive finite number"));
    }
}
/**
 * The denial dialect each runner's kernel speaks — the case-insensitive stderr substrings a
 * denied file effect produces under it, carried on every wrap (the seam's
 * `ConfinedArgv.denialSignatures`).
 */
var DENIAL_SIGNATURES = {
    bwrap: ['read-only file system'],
    seatbelt: ['operation not permitted'],
    // pwsh/.NET: "Access to the path '...' is denied."; cmd: "Access is denied.";
    // node EACCES: "permission denied".
    'windows-acl': ['access is denied', 'access to the path', 'permission denied'],
    runnerCommand: ['read-only file system', 'permission denied'],
};
/** The windows-acl runner's documented failure exit. */
var WINDOWS_ACL_RUNNER_FAILURE_EXIT = 127;
/**
 * Runner-owned fatal diagnostics. Bubblewrap's current fatal paths exit
 * 1 but its public contract does not reserve that status, while sandbox-exec
 * publishes no launcher-failure status; those backends remain signature-only.
 * The windows-acl runner prints `windows-acl-run: <detail>` on every
 * runner-side failure and exits 127 — the rule is exit-gated on that status
 * so a confined command that merely PRINTS the signature (or a runner
 * cleanup failure reported on a non-zero child exit) is never misclassified
 * as "the command did not run".
 */
var RUNNER_FAILURE_RULES = {
    bwrap: [{ fatalSignatures: ['bwrap: '] }],
    seatbelt: [{ fatalSignatures: ['sandbox-exec: '] }],
    'windows-acl': [{ allowedExitCodes: [WINDOWS_ACL_RUNNER_FAILURE_EXIT], fatalSignatures: ['windows-acl-run: '] }],
};
/**
 * Local process-sandbox provider. Registers as `ctx.sandbox`. Caches the
 * chain verdict and, on the windows-acl rung, the write grants
 * ({@link AclWriteGrant}: the standing workspace-root grant per workspace
 * and the revocable private-temp grant per live session/workspace pair, the
 * latter revoked on provider dispose); the one-time probes spawn nothing
 * else.
 */
var LocalSandboxProvider = /** @class */ (function (_super) {
    __extends(LocalSandboxProvider, _super);
    function LocalSandboxProvider(ctx, config) {
        var _this = _super.call(this, ctx) || this;
        /** Test hook (mirrors the bash executors' `internals`). */
        _this.internals = {};
        /**
         * Server-lifetime write grants (windows-acl rung): the STANDING
         * workspace-root grant per workspace (its ACE is the cross-session reuse
         * cache and outlives the provider — never revoked) and the REVOCABLE
         * private-temp grant per live session/workspace pair (revoked on provider
         * dispose).
         */
        _this.workspaceGrants = new Map();
        _this.tempCapabilities = new Map();
        // The schema (static Config) defaults every field — the casts record
        // those runtime facts. An empty runnerCommand means "not configured":
        // use the platform chain.
        var runner = config.runnerCommand;
        var runnerFailureSignatures = config.runnerFailureSignatures;
        if (runner.length === 0 && runnerFailureSignatures.length > 0) {
            throw new Error('sandbox-local: runnerFailureSignatures requires runnerCommand');
        }
        if (runner.length > 0 && runnerFailureSignatures.length === 0) {
            throw new Error('sandbox-local: runnerCommand requires at least one runnerFailureSignatures entry');
        }
        if (runnerFailureSignatures.some(function (signature) { return signature.trim().length === 0 || /[\r\n]/u.test(signature); })) {
            throw new Error('sandbox-local: runnerFailureSignatures entries must be non-empty single-line strings');
        }
        _this.runnerCommand = runner.length > 0 ? runner : undefined;
        _this.configuredRunnerFailureSignatures = runnerFailureSignatures;
        _this.probeTimeoutMs = config.probeTimeoutMs;
        assertPositiveFinite('probeTimeoutMs', _this.probeTimeoutMs);
        // The temp grants are revoked with the provider: a clean server
        // shutdown leaves no temp ACEs behind (workspace ACEs stand by design —
        // the reuse cache; an unclean shutdown leaves them for the next
        // provision's exact-ACE skip).
        ctx.effect(function () { return function () {
            _this.revokeAclGrants();
        }; });
        return _this;
    }
    /**
     * Wrap `argv` in the selected runner's invocation for `policy` — the configured
     * `runnerCommand` when present (the operator's assertion, no probe), else the platform
     * chain's runner speaking its own profile dialect.
     *
     * @param argv - the exact argv the caller is about to spawn.
     * @param policy - the file-effect policy this execution runs under.
     * @returns the wrapped argv plus the selected backend's enforcement completeness, denial
     *   signatures, and structured runner-failure rules; throws the fail-closed
     *   `SANDBOX_UNAVAILABLE` error when the platform has no usable runner.
     */
    LocalSandboxProvider.prototype.confine = function (argv, policy) {
        if (this.runnerCommand !== undefined) {
            return {
                argv: __spreadArray(__spreadArray(__spreadArray(__spreadArray([], this.runnerCommand, true), (0, profiles_ts_1.bwrapProfileArgs)(policy), true), ['--'], false), argv, true),
                enforcement: 'full',
                denialSignatures: DENIAL_SIGNATURES.runnerCommand,
                runnerFailureRules: [{ fatalSignatures: this.configuredRunnerFailureSignatures }],
            };
        }
        var selected = this.selectRunner(policy.mode);
        var runnerArgv = this.runnerArgv(selected.runner, policy);
        return {
            argv: __spreadArray(__spreadArray(__spreadArray([], runnerArgv, true), ['--'], false), argv, true),
            enforcement: selected.enforcement,
            denialSignatures: DENIAL_SIGNATURES[selected.runner],
            runnerFailureRules: RUNNER_FAILURE_RULES[selected.runner],
        };
    };
    /** The selected rung's runner invocation (program + profile arguments) for one policy. */
    LocalSandboxProvider.prototype.runnerArgv = function (runner, policy) {
        switch (runner) {
            case 'bwrap': return __spreadArray(['bwrap'], (0, profiles_ts_1.bwrapProfileArgs)(policy), true);
            case 'seatbelt': return __spreadArray([this.seatbeltExec()], (0, profiles_ts_1.seatbeltProfileArgs)(policy), true);
            case 'windows-acl': return this.windowsAclRunnerArgv(policy);
            default: return (0, dsh_llm_1.assertNever)(runner);
        }
    };
    /**
     * The windows-acl runner argv for one policy. With a calling session (the
     * policy's `sessionId`) under workspace-write, the grants are materialized
     * once per provider lifetime — the standing workspace-root grant per
     * workspace and a revocable, RANDOM private-temp capability per live
     * session/workspace pair. The runner receives `--write-sid` plus
     * `--temp-write-sid` and grants nothing itself. Agentless workspace-write
     * calls pass the ambient temp ROOT and no SID flags: the runner creates and
     * removes a random private child directory for that one invocation.
     * @param policy - the resolved per-call policy.
     * @returns the runner invocation.
     */
    LocalSandboxProvider.prototype.windowsAclRunnerArgv = function (policy) {
        var sessionId = policy.sessionId;
        if (sessionId === undefined || policy.mode === 'read-only') {
            return __spreadArray(__spreadArray([], this.windowsAclRunnerInvocation(), true), [
                '--workspace', policy.workspaceRoot,
                '--temp', (0, node_os_1.tmpdir)(),
                '--mode', policy.mode,
            ], false);
        }
        var temp = this.materializeAclGrant(sessionId, policy.workspaceRoot);
        return __spreadArray(__spreadArray([], this.windowsAclRunnerInvocation(), true), [
            '--workspace', policy.workspaceRoot,
            '--temp', temp.dir,
            '--mode', policy.mode,
            '--write-sid', (0, dsh_sandbox_windows_acl_1.workspaceWriteSid)(policy.workspaceRoot),
            '--temp-write-sid', temp.writeSid,
        ], false);
    };
    /**
     * Materialize one workspace-write policy's ACEs once per provider
     * lifetime. The workspace SID and standing root grant are shared by the
     * workspace. The temp directory is random and carries a distinct SID, so
     * another session on the same workspace cannot use the shared workspace
     * SID to enter it. A fresh provider always chooses a new path; crash
     * residue therefore cannot collide with or authorize a resumed session.
     * Fail-closed: a half-materialized temp grant is revoked and its directory
     * removed before the error propagates.
     * @param sessionId - the policy's calling-session identity.
     * @param workspaceRoot - the resolved policy root.
     * @returns the pair's private temp directory and write capability.
     */
    LocalSandboxProvider.prototype.materializeAclGrant = function (sessionId, workspaceRoot) {
        (0, dsh_sandbox_windows_acl_1.assertTempRootOutsideWorkspace)(workspaceRoot, (0, node_os_1.tmpdir)());
        var writeSid = (0, dsh_sandbox_windows_acl_1.workspaceWriteSid)(workspaceRoot);
        if (!this.workspaceGrants.has(workspaceRoot)) {
            var grant_1 = dsh_sandbox_windows_acl_1.AclWriteGrant.create(writeSid);
            try {
                grant_1.add(workspaceRoot, true);
            }
            catch (error) {
                // Free the SID; a standing ACE (if the apply succeeded before a
                // post-apply throw) is the intended end state, not an error
                // artifact — nothing to revoke.
                try {
                    grant_1.dispose();
                }
                catch (cleanupError) {
                    throw new AggregateError([error, cleanupError], 'sandbox-local windows-acl workspace grant failed and its cleanup also failed');
                }
                throw error;
            }
            this.workspaceGrants.set(workspaceRoot, grant_1);
        }
        var key = JSON.stringify([String(sessionId), workspaceRoot]);
        var existing = this.tempCapabilities.get(key);
        if (existing !== undefined)
            return existing;
        var tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'dsh-'));
        var tempSid = (0, dsh_sandbox_windows_acl_1.tempWriteSid)(tempDir);
        var grant;
        try {
            grant = dsh_sandbox_windows_acl_1.AclWriteGrant.create(tempSid);
            grant.add(tempDir);
        }
        catch (error) {
            var cleanupFailures = [];
            if (grant !== undefined) {
                try {
                    grant.dispose();
                }
                catch (cleanupError) {
                    cleanupFailures.push(cleanupError);
                }
            }
            try {
                this.removeTempDir(tempDir);
            }
            catch (cleanupError) {
                cleanupFailures.push(cleanupError);
            }
            if (cleanupFailures.length > 0) {
                throw new AggregateError(__spreadArray([error], cleanupFailures, true), 'sandbox-local windows-acl temp grant materialization failed and its cleanup also failed');
            }
            throw error;
        }
        var capability = { dir: tempDir, writeSid: tempSid, grant: grant };
        this.tempCapabilities.set(key, capability);
        return capability;
    };
    /**
     * Dispose every write grant (provider dispose): the revocable temp ACEs
     * are revoked, the private temp directories this provider created are
     * removed, and every SID allocation is freed; the standing workspace ACEs
     * stay (the reuse cache). Cleanup failures are reported, not thrown:
     * cordis teardown must not be aborted by grant cleanup. A crash skips all
     * of it, but a new provider never reuses the residue's random path or SID;
     * OS temp hygiene (or manual removal) eventually reclaims it.
     */
    LocalSandboxProvider.prototype.revokeAclGrants = function () {
        if (this.workspaceGrants.size === 0 && this.tempCapabilities.size === 0)
            return;
        var failures = [];
        for (var _i = 0, _a = __spreadArray(__spreadArray([], this.workspaceGrants.values(), true), __spreadArray([], this.tempCapabilities.values(), true).map(function (capability) { return capability.grant; }), true); _i < _a.length; _i++) {
            var grant = _a[_i];
            try {
                grant.dispose();
            }
            catch (error) {
                failures.push(error);
            }
        }
        for (var _b = 0, _c = this.tempCapabilities.values(); _b < _c.length; _b++) {
            var dir = _c[_b].dir;
            try {
                this.removeTempDir(dir);
            }
            catch (error) {
                failures.push(error);
            }
        }
        this.workspaceGrants.clear();
        this.tempCapabilities.clear();
        if (failures.length > 0) {
            this.ctx.logger.warn("sandbox-local: windows-acl grant cleanup completed with ".concat(failures.length, " failure(s)"));
            for (var _d = 0, failures_1 = failures; _d < failures_1.length; _d++) {
                var error = failures_1[_d];
                this.ctx.logger.warn(error);
            }
        }
    };
    /** Remove one provider-owned private temp directory (injectable for cleanup tests). */
    LocalSandboxProvider.prototype.removeTempDir = function (dir) {
        var _a;
        var remove = (_a = this.internals.rmTempDir) !== null && _a !== void 0 ? _a : (function (path) { (0, node_fs_1.rmSync)(path, { recursive: true, force: true }); });
        remove(dir);
    };
    /**
     * Resolve which runner confines commands, once, for the provider's
     * lifetime: this platform's chain ({@link PLATFORM_CHAINS}), its sole
     * candidate selected directly, multiple candidates arbitrated by
     * functional probes in chain order. Fail closed when the platform has no
     * chain or no candidate passes — the command never runs.
     */
    LocalSandboxProvider.prototype.selectRunner = function (mode) {
        var _a;
        (_a = this.selectedRunner) !== null && _a !== void 0 ? _a : (this.selectedRunner = this.chainVerdict());
        if (this.selectedRunner === 'unavailable')
            throw new dsh_sandbox_1.SandboxUnavailableError(mode);
        return this.selectedRunner;
    };
    /** Walk this platform's chain: sole candidate unprobed, several probed in order, none usable → unavailable. */
    LocalSandboxProvider.prototype.chainVerdict = function () {
        var _a, _b, _c;
        var chain = (_c = (_a = this.internals.chain) !== null && _a !== void 0 ? _a : PLATFORM_CHAINS[(_b = this.internals.platform) !== null && _b !== void 0 ? _b : process.platform]) !== null && _c !== void 0 ? _c : [];
        var first = chain[0], rest = chain.slice(1);
        if (first === undefined)
            return 'unavailable';
        // A sole candidate needs no arbitration; its execution-time refusal still fails closed.
        if (rest.length === 0)
            return { runner: first, enforcement: STATIC_ENFORCEMENT[first] };
        for (var _i = 0, chain_1 = chain; _i < chain_1.length; _i++) {
            var runner = chain_1[_i];
            var enforcement = this.probeRunner(runner);
            if (enforcement !== 'unusable')
                return { runner: runner, enforcement: enforcement };
        }
        return 'unavailable';
    };
    /** One rung's functional probe (each at most once, via the chain walk). */
    LocalSandboxProvider.prototype.probeRunner = function (runner) {
        var _this = this;
        var _a, _b, _c;
        // bwrap's mount profile and Seatbelt's deny-file-write* profile govern
        // every promised file effect by construction, so their passing probes
        // are always full enforcement; windows-acl is always partial for its
        // documented Everyone and hard-link boundaries.
        switch (runner) {
            case 'bwrap': {
                var probe = (_a = this.internals.probeBwrap) !== null && _a !== void 0 ? _a : (function () { return defaultProbeBwrap(_this.probeTimeoutMs); });
                return probe() ? 'full' : 'unusable';
            }
            case 'seatbelt': {
                var probe = (_b = this.internals.probeSeatbelt) !== null && _b !== void 0 ? _b : (function (exec) { return defaultProbeSeatbelt(exec, _this.probeTimeoutMs); });
                return probe(this.seatbeltExec()) ? 'full' : 'unusable';
            }
            case 'windows-acl': {
                var probe = (_c = this.internals.probeWindowsAcl) !== null && _c !== void 0 ? _c : (function () { return defaultProbeWindowsAcl(_this.windowsAclRunnerInvocation(), _this.probeTimeoutMs); });
                return probe() ? 'partial' : 'unusable';
            }
            default: return (0, dsh_llm_1.assertNever)(runner);
        }
    };
    /** The `sandbox-exec` executable to probe and exec (test hook over the system one). */
    LocalSandboxProvider.prototype.seatbeltExec = function () {
        var _a;
        return (_a = this.internals.seatbeltExec) !== null && _a !== void 0 ? _a : 'sandbox-exec';
    };
    /**
     * The windows-acl runner argv prefix: the built lib/runner.js entry when
     * present (production), else the package source through tsx (development).
     * The prefix stays `[node, runner, ...]` — a future native-exe runner keeps
     * the same argv contract and only swaps these entries.
     */
    LocalSandboxProvider.prototype.windowsAclRunnerInvocation = function () {
        var _a;
        var override = this.internals.windowsAclRunnerArgs;
        if (override !== undefined)
            return override;
        var builtEntry = (_a = this.internals.windowsAclRunnerEntry) !== null && _a !== void 0 ? _a : (0, node_url_1.fileURLToPath)(import.meta.resolve('@z/dsh-sandbox-windows-acl/runner'));
        if ((0, node_fs_1.existsSync)(builtEntry))
            return [process.execPath, builtEntry];
        var sourceEntry = (0, node_url_1.fileURLToPath)(import.meta.resolve('@z/dsh-sandbox-windows-acl/src/runner.ts'));
        return [process.execPath, '--import', 'tsx/esm', sourceEntry];
    };
    // Inline schema call: the config catalog walks `static Config` statically.
    LocalSandboxProvider.Config = schemastery_1.default.object({
        runnerCommand: schemastery_1.default.array(schemastery_1.default.string()).default([]),
        runnerFailureSignatures: schemastery_1.default.array(schemastery_1.default.string()).default([]),
        probeTimeoutMs: schemastery_1.default.natural().default(5000),
    });
    return LocalSandboxProvider;
}(dsh_sandbox_1.SandboxProvider));
exports.LocalSandboxProvider = LocalSandboxProvider;
exports.default = LocalSandboxProvider;
