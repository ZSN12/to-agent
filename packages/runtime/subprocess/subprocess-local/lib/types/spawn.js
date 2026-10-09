"use strict";
/**
 * Process plumbing for the local subprocess service: detached process-tree
 * spawn with per-stream stdio dispositions, tail-keep collection with spill
 * files, tree-scoped signalling (POSIX groups; Windows taskkill), and the
 * SIGTERM→SIGKILL escalation. This layer reacts to an abort signal; callers
 * own deadlines, teardown ladders, and cause classification.
 * @module dsh-subprocess-local/spawn
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
exports.OutputCollector = void 0;
exports.childEnv = childEnv;
exports.killGroup = killGroup;
exports.taskkillProcessTree = taskkillProcessTree;
exports.spawnSubprocess = spawnSubprocess;
var node_child_process_1 = require("node:child_process");
var node_crypto_1 = require("node:crypto");
var node_fs_1 = require("node:fs");
var node_os_1 = require("node:os");
var node_path_1 = require("node:path");
var promises_1 = require("node:timers/promises");
var dsh_subprocess_1 = require("@z/dsh-subprocess");
var dsh_timeout_1 = require("@z/dsh-timeout");
var process_inspector_ts_1 = require("./process-inspector.ts");
/**
 * The system directories that must always be on a child's `PATH` for the
 * platform's core tooling (bash, node, pkill, …) to resolve, independent of
 * how the host process was launched. A GUI-app launch (Finder/LaunchServices)
 * gives a macOS process a minimal `PATH` that omits these, which breaks every
 * `spawn bash` under DSH; merge them in whenever the inherited `PATH` lacks
 * them rather than overloading a caller-provided `PATH` on purpose.
 */
var REQUIRED_PATH_DIRS = [
    (0, node_path_1.join)((0, node_os_1.homedir)(), '.local', 'bin'),
    (0, node_path_1.join)((0, node_os_1.homedir)(), '.local', 'node', 'bin'),
    (0, node_path_1.join)((0, node_os_1.homedir)(), '.cargo', 'bin'),
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
];
/**
 * Build a child environment: explicit caller entries override the scrubbed
 * parent base using the target platform's environment-key semantics. A string
 * deliberately restores or overrides an entry; an explicit `undefined`
 * tombstone removes an ordinary ambient entry. A guaranteed-present minimal
 * system `PATH` is merged under the caller's own `PATH` (never over it), so a
 * caller that sets `PATH` still controls lookup order while GUI-launched hosts
 * never lose the core binaries.
 * @param extra - explicit caller entries and tombstones, merged after the scrub.
 * @returns the environment to hand to `spawn` for the child process.
 */
/** Merge the system path dirs under a caller-supplied (or ambient) PATH. */
function mergedPath(callerPath, sep) {
    var existing = (callerPath !== null && callerPath !== void 0 ? callerPath : '').split(sep).filter(function (entry) { return entry !== ''; });
    return __spreadArray(__spreadArray([], existing, true), REQUIRED_PATH_DIRS.filter(function (dir) { return !existing.includes(dir); }), true).join(sep);
}
function childEnv(extra) {
    var _a, _b;
    var env = (0, dsh_subprocess_1.scrubbedParentEnv)();
    if (process.platform !== 'win32') {
        var callerPath = (_b = (_a = extra === null || extra === void 0 ? void 0 : extra.PATH) !== null && _a !== void 0 ? _a : env.PATH) !== null && _b !== void 0 ? _b : '';
        return __assign(__assign(__assign({}, env), extra), { PATH: mergedPath(callerPath, ':') });
    }
    var entries = Object.entries(env);
    var _loop_1 = function (key, value) {
        var normalized = key.toUpperCase();
        entries = entries.filter(function (_a) {
            var inherited = _a[0];
            return inherited.toUpperCase() !== normalized;
        });
        entries.push([key, value]);
    };
    for (var _i = 0, _c = Object.entries(extra !== null && extra !== void 0 ? extra : {}); _i < _c.length; _i++) {
        var _d = _c[_i], key = _d[0], value = _d[1];
        _loop_1(key, value);
    }
    return Object.fromEntries(entries);
}
/**
 * Liveness-poll cadence for tree-exit waits. The timer stays ref'd: an
 * awaited teardown must keep the event loop alive until the tree really
 * exits, or the parent can exit while claiming quiescence and orphan the
 * survivors it promised to reap.
 */
function sleepTick() {
    return (0, promises_1.setTimeout)(15);
}
var spillCounter = 0;
var defaultSpillDir;
/**
 * The default spill location: a private (0700) per-process directory under
 * the OS tmpdir, created lazily. Predictable world-readable paths would let
 * other local users read command output or pre-create symlinks.
 */
function privateSpillDir() {
    defaultSpillDir !== null && defaultSpillDir !== void 0 ? defaultSpillDir : (defaultSpillDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'dsh-subprocess-')));
    return defaultSpillDir;
}
/**
 * Collects one stream with a bounded in-memory tail. With a spill cap, on
 * first overflow a spill file is created and every chunk (including those
 * already collected) is appended there while the full stream remains within
 * the cap; without one, only the in-memory tail is ever retained (the
 * diagnostic-tail shape — a language server's stderr).
 *
 * Tail-keep rationale (pi/OpenCode): errors and final results cluster at the
 * end of command output; the spill file covers the head.
 */
var OutputCollector = /** @class */ (function () {
    function OutputCollector(maxBytes, maxSpillBytes, label, spillDir) {
        this.maxBytes = maxBytes;
        this.maxSpillBytes = maxSpillBytes;
        this.label = label;
        this.spillDir = spillDir;
        this.chunks = [];
        this.bytes = 0;
        this.dropped = false;
        /** Total bytes ever pushed (not just retained). */
        this.total = 0;
        this.spillDisabled = maxSpillBytes === undefined;
    }
    /**
     * Ingest one stream chunk, counting it toward the whole-stream total. On
     * first overflow of the in-memory cap a spill file is opened (when spilling
     * is enabled) and every chunk (already-collected ones included) is appended
     * there from then on; the in-memory tail then drops whole chunks from its
     * head (or the head of a single over-cap chunk) until it fits the cap again.
     * @param chunk - the raw bytes from one stream 'data' event.
     */
    OutputCollector.prototype.push = function (chunk) {
        this.total += chunk.length;
        var overflows = this.bytes + chunk.length > this.maxBytes;
        if (!this.spillDisabled && (overflows || this.spillFd !== undefined))
            this.spillAll(chunk);
        this.chunks.push(chunk);
        this.bytes += chunk.length;
        while (this.bytes > this.maxBytes) {
            var head = this.chunks[0];
            var excess = this.bytes - this.maxBytes;
            if (head.length <= excess) {
                // Drop the whole head chunk (length ≥ 1 is guaranteed while over cap).
                this.chunks.shift();
                this.bytes -= head.length;
            }
            else {
                // Trim the head so the retained window is byte-exact at the cap — a
                // diagnostic tail (an LSP server's stderr) must hold the LAST
                // maxBytes regardless of how the stream was chunked.
                this.chunks[0] = head.subarray(excess);
                this.bytes -= excess;
            }
            this.dropped = true;
        }
    };
    /** Open the spill file lazily and append `chunk` (and any prior chunks once). */
    OutputCollector.prototype.spillAll = function (chunk) {
        if (this.maxSpillBytes !== undefined && this.total > this.maxSpillBytes) {
            this.discardSpill();
            return;
        }
        if (this.spillFd === undefined) {
            // Random suffix + O_EXCL + no-follow-equivalent ('wx' fails on any
            // existing path, symlink or not) + owner-only mode: defeats spill-path
            // prediction and symlink planting in shared tmp dirs.
            this.spillFile = (0, node_path_1.join)(this.spillDir, "dsh-subprocess-".concat(process.pid, "-").concat(++spillCounter, "-").concat((0, node_crypto_1.randomBytes)(6).toString('hex'), "-").concat(this.label, ".log"));
            this.spillFd = (0, node_fs_1.openSync)(this.spillFile, 'wx', 384);
            for (var _i = 0, _a = this.chunks; _i < _a.length; _i++) {
                var prior = _a[_i];
                (0, node_fs_1.writeSync)(this.spillFd, prior);
            }
        }
        (0, node_fs_1.writeSync)(this.spillFd, chunk);
    };
    /** Stop spilling and remove the file once it can no longer hold the complete stream. */
    OutputCollector.prototype.discardSpill = function () {
        var fd = this.spillFd;
        var file = this.spillFile;
        this.spillFd = undefined;
        this.spillFile = undefined;
        this.spillDisabled = true;
        if (fd !== undefined) {
            try {
                (0, node_fs_1.closeSync)(fd);
            }
            catch (_a) {
                // Retain the descriptor so finalize can retry the failed close.
                this.spillFd = fd;
            }
        }
        if (file !== undefined) {
            try {
                (0, node_fs_1.unlinkSync)(file);
            }
            catch (_b) {
                // A failed unlink leaves at most maxSpillBytes behind, never an unbounded file.
            }
        }
    };
    /**
     * Incremental read in whole-stream byte coordinates: returns everything
     * pushed since `fromByte`. When `fromByte` has already slid out of the
     * in-memory tail window, the read is `lossy` — it returns the whole
     * retained tail and the gap is only recoverable from the spill file.
     * @param fromByte - whole-stream offset to resume from (a prior read's `nextOffset`; 0 for the first read).
     * @returns the delta text, the offset for the next read, the `lossy` flag, and the spill path when one was created.
     */
    OutputCollector.prototype.readFrom = function (fromByte) {
        var windowStart = this.total - this.bytes;
        var buffer = Buffer.concat(this.chunks);
        var lossy = fromByte < windowStart;
        var slice = lossy ? buffer : buffer.subarray(fromByte - windowStart);
        return __assign({ text: slice.toString('utf8'), nextOffset: this.total, lossy: lossy }, this.spillFile !== undefined ? { spillPath: this.spillFile } : {});
    };
    /**
     * Close the spill file once the stream has ended. A failed close (delayed
     * writeback fault) stops advertising the spill path — the file may be
     * missing its tail — while every in-memory read keeps working. Idempotent;
     * the spawn path seals both collectors at settlement so reads after exit
     * never point at a still-open file.
     */
    OutputCollector.prototype.seal = function () {
        if (this.spillFd === undefined)
            return;
        try {
            (0, node_fs_1.closeSync)(this.spillFd);
        }
        catch (_a) {
            // A delayed writeback failure makes the spill unreliable; keep the
            // in-memory result but stop advertising that file.
            this.spillFile = undefined;
        }
        this.spillFd = undefined;
    };
    /**
     * Seal the spill file and return the final output.
     * @returns the final collected output: tail text, truncation flag, and the spill path when intact.
     */
    OutputCollector.prototype.finalize = function () {
        this.seal();
        return __assign({ text: Buffer.concat(this.chunks).toString('utf8'), truncated: this.dropped }, this.spillFile !== undefined ? { spillPath: this.spillFile } : {});
    };
    return OutputCollector;
}());
exports.OutputCollector = OutputCollector;
/**
 * Send `sig` to a detached POSIX process group. Never throws: delivery races
 * process exit and may run in a timer callback, so failures are contained and
 * a non-positive pid is a no-op.
 * @param pid - the group leader's pid; non-positive means the spawn failed and the call is a no-op.
 * @param sig - the signal to deliver to the whole group.
 */
function killGroup(pid, sig) {
    if (pid <= 0)
        return;
    try {
        process.kill(-pid, sig);
    }
    catch (_a) {
        // Swallow: see contract above.
    }
}
/**
 * Terminate one Windows process tree with `taskkill /T /F`. Contained like
 * POSIX group signalling — delivery races tree exit, so an absent tree, a
 * nonzero status, or a missing taskkill binary must not break idempotent
 * teardown.
 * @param pid - root process id; non-positive is a no-op.
 */
function taskkillProcessTree(pid) {
    if (pid <= 0)
        return;
    // Outcome deliberately unchecked: an already-absent tree (status 128), exit
    // races, and a missing taskkill binary (spawnSync reports, never throws) are
    // as tolerable here as ESRCH is for a POSIX group signal.
    (0, node_child_process_1.spawnSync)('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
}
/**
 * Signal a detached process tree with platform-correct semantics: POSIX
 * signals the negative process-group id and falls back to the direct child
 * when the group is gone; Windows terminates the tree via taskkill (any
 * signal value force-terminates — Node maps signals to TerminateProcess).
 */
function signalTree(platform, pid, sig, child, taskkill) {
    if (platform === 'win32') {
        taskkill(pid);
        return;
    }
    /* v8 ignore next -- kill/terminate gate on treeAlive(), which is false for pid -1; this guard protects direct callers only. */
    if (pid <= 0)
        return;
    try {
        process.kill(-pid, sig);
    }
    catch (_a) {
        /* v8 ignore start -- the fallback needs a live child whose group signal fails
           (EPERM-style), which POSIX CI cannot stage; the swallow keeps teardown idempotent. */
        try {
            child.kill(sig);
        }
        catch (_b) {
            // The direct child already exited; teardown remains idempotent.
        }
        /* v8 ignore stop */
    }
}
/**
 * Spawn one isolated detached process tree with the spec's per-stream stdio
 * dispositions. Runtime exits resolve `done` as {@link SubprocessOutcome};
 * only spawn failures reject.
 * @param spec - fully resolved argv, cwd, stdio, grace, cancellation, environment.
 * @param internals - test-only spill-directory, platform, and taskkill overrides.
 * @returns live subprocess handle.
 * @throws when `graceMs` cannot be represented by one Node timer.
 */
function spawnSubprocess(spec, internals) {
    var _this = this;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    if (internals === void 0) { internals = {}; }
    if (!Number.isFinite(spec.graceMs) || spec.graceMs <= 0 || spec.graceMs > dsh_timeout_1.MAX_TIMER_DELAY_MS) {
        throw new Error("subprocess graceMs must be a positive finite number no greater than ".concat(dsh_timeout_1.MAX_TIMER_DELAY_MS));
    }
    var spillDir = (_a = internals.spillDir) !== null && _a !== void 0 ? _a : privateSpillDir();
    var platform = (_b = internals.platform) !== null && _b !== void 0 ? _b : process.platform;
    var taskkill = (_c = internals.taskkill) !== null && _c !== void 0 ? _c : taskkillProcessTree;
    var linuxGroupHasLiveMembers = (_d = internals.linuxProcessGroupHasLiveMembers) !== null && _d !== void 0 ? _d : process_inspector_ts_1.linuxProcessGroupHasLiveMembers;
    if ((_e = spec.signal) === null || _e === void 0 ? void 0 : _e.aborted) {
        throw new Error("aborted before spawn: ".concat(String((_f = spec.signal.reason) !== null && _f !== void 0 ? _f : 'aborted')));
    }
    var _m = spec.argv, program = _m[0], args = _m.slice(1);
    if (program === undefined || program.length === 0) {
        throw new Error('invalid argv: expected a non-empty program name at argv[0]');
    }
    var isCollect = function (mode) {
        return mode !== 'pipe' && mode !== 'inherit';
    };
    var outMode = spec.stdio.stdout;
    var errMode = spec.stdio.stderr;
    var stdinMode = spec.stdio.stdin;
    var env = childEnv(spec.env);
    var child = (0, node_child_process_1.spawn)(program, args, {
        cwd: spec.cwd,
        env: env,
        stdio: [
            stdinMode === 'ignore' ? 'ignore' : 'pipe',
            outMode === 'inherit' ? 'inherit' : 'pipe',
            errMode === 'inherit' ? 'inherit' : 'pipe',
        ],
        // `detached` gives teardown a tree root on POSIX (its own process group);
        // Windows terminates by root pid through taskkill /T instead.
        detached: platform !== 'win32',
    });
    var collectStream = function (mode, stream, label) {
        var _a;
        if (!isCollect(mode) || stream === null)
            return undefined;
        var collector = new OutputCollector(mode.maxBytes, (_a = mode.spill) === null || _a === void 0 ? void 0 : _a.maxBytes, label, spillDir);
        stream.on('data', function (chunk) { collector.push(chunk); });
        return collector;
    };
    var stdoutCollector = collectStream(outMode, child.stdout, 'stdout');
    var stderrCollector = collectStream(errMode, child.stderr, 'stderr');
    var graceTimer;
    var treeExitObserved = false;
    var treeExitObservation;
    var settled = false;
    // Failed spawns use pid -1 so signalling remains a no-op.
    var pid = (_g = child.pid) !== null && _g !== void 0 ? _g : -1;
    /** Whether the detached tree's root (or POSIX group) is still alive. */
    var treeAlive = function () {
        /* v8 ignore next -- only a timer callback already queued when the observer settles can enter here;
           the guard is the final defense against probing an id after its tree was confirmed absent. */
        if (treeExitObserved)
            return false;
        if (pid <= 0)
            return false;
        if (platform === 'win32') {
            // Windows has no group-liveness probe; the direct child's exit is the
            // observable boundary (taskkill /T already took the tree with it).
            return child.exitCode === null && child.signalCode === null;
        }
        try {
            process.kill(-pid, 0);
            // A group containing only unreaped zombies still answers kill(0), but
            // it can execute no work and cannot be signalled into quiescence. Only
            // inspect after direct-child settlement so live-process polls remain a
            // syscall rather than repeated process-table scans.
            if (settled && platform === 'linux' && linuxGroupHasLiveMembers(pid) === false)
                return false;
            return true;
        }
        catch (error) {
            var code = error.code;
            /* v8 ignore next 2 -- POSIX reports an absent group as ESRCH; child-reaping timing
               makes observing the other arm platform-dependent. */
            if (code === 'ESRCH')
                return false;
            /* v8 ignore start -- EPERM and non-POSIX negative-pid failures are platform defenses; CI runs
               tree-lifecycle tests on POSIX hosts where absence reports ESRCH. */
            if (code === 'EPERM')
                return true;
            return child.exitCode === null && child.signalCode === null;
            /* v8 ignore stop */
        }
    };
    /**
     * Start or reuse the handle's single whole-tree exit observer. The first
     * confirmed absence is a permanent no-more-signals boundary: it cancels a
     * pending escalation before this process-group id can be reused.
     */
    var observeTreeExit = function () {
        treeExitObservation !== null && treeExitObservation !== void 0 ? treeExitObservation : (treeExitObservation = (function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!treeAlive()) return [3 /*break*/, 2];
                        return [4 /*yield*/, sleepTick()];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 0];
                    case 2:
                        treeExitObserved = true;
                        if (graceTimer !== undefined)
                            clearTimeout(graceTimer);
                        graceTimer = undefined;
                        return [2 /*return*/];
                }
            });
        }); })());
        return treeExitObservation;
    };
    // The escalation's tier primitive (not on the handle — terminate() is the
    // only consumer-facing termination verb). Guards on TREE liveness, not
    // outcome settlement: a TERM-trapping helper can outlive the settled direct
    // child and must stay signalable, while a fully-dead tree (possible pid
    // reuse) must not be re-signalled by a later tier.
    var kill = function (sig) {
        /* v8 ignore next -- the shared exit observer cancels the ordinary dead-tree timer;
           this remains the timer/death race guard and cannot be staged deterministically. */
        if (!treeAlive())
            return;
        signalTree(platform, pid, sig, child, taskkill);
    };
    var terminate = function () {
        if (treeExitObserved || graceTimer !== undefined)
            return;
        // Observe from the first termination tier onward, even when inherited
        // pipes delay `done` and no consumer has begun its own teardown wait.
        void observeTreeExit();
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- observer can record absence before its first await.
        if (treeExitObserved)
            return;
        kill('SIGTERM');
        // The escalation must survive direct-child settlement — the leader dying
        // does not mean the tree died — so settle does not clear this timer, and
        // kill() re-probes tree liveness before force-killing. It stays ref'd:
        // the pending SIGKILL is a commitment, and a parent exiting before it
        // fires would orphan a trapped survivor. Self-bounds at graceMs.
        graceTimer = setTimeout(function () { kill('SIGKILL'); }, spec.graceMs);
    };
    var terminateForHostExit = function () {
        kill('SIGKILL');
    };
    // The caller owns timeout classification; this layer only reacts to abort.
    var onAbort = function () { terminate(); };
    (_h = spec.signal) === null || _h === void 0 ? void 0 : _h.addEventListener('abort', onAbort, { once: true });
    // Batch stdin is written and closed up front; process exit and captured
    // output remain authoritative, so write errors (EPIPE) are best-effort.
    if (typeof stdinMode === 'object' && child.stdin !== null) {
        child.stdin.on('error', function () { });
        child.stdin.end(stdinMode.data);
    }
    var done = new Promise(function (resolve, reject) {
        var pipeDrainTimer;
        var settle = function (exitCode, signal) {
            var _a, _b;
            if (settled)
                return;
            settled = true;
            // Only harness-collected pipes are force-closed at the drain boundary;
            // a 'pipe'-mode stream belongs to the caller and closes with the child.
            if (stdoutCollector !== undefined)
                (_a = child.stdout) === null || _a === void 0 ? void 0 : _a.destroy();
            if (stderrCollector !== undefined)
                (_b = child.stderr) === null || _b === void 0 ? void 0 : _b.destroy();
            stdoutCollector === null || stdoutCollector === void 0 ? void 0 : stdoutCollector.seal();
            stderrCollector === null || stderrCollector === void 0 ? void 0 : stderrCollector.seal();
            cleanup();
            resolve({ exitCode: exitCode, signal: signal });
        };
        child.on('error', function (error) {
            // No meaningful close outcome follows a spawn failure.
            settled = true;
            cleanup();
            reject(error);
        });
        child.on('exit', function (exitCode, signal) {
            // A surviving descendant that inherited a pipe must not hold the
            // outcome open indefinitely: after exit, the same bounded grace that
            // governs kills also bounds the close wait.
            pipeDrainTimer = setTimeout(function () {
                settle(exitCode, signal);
            }, spec.graceMs);
        });
        child.on('close', settle);
        function cleanup() {
            var _a;
            // graceTimer deliberately NOT cleared: the SIGKILL escalation must be
            // able to reach tree survivors after the direct child settles.
            if (pipeDrainTimer !== undefined)
                clearTimeout(pipeDrainTimer);
            (_a = spec.signal) === null || _a === void 0 ? void 0 : _a.removeEventListener('abort', onAbort);
        }
    });
    var waitForExit = function (signal) { return __awaiter(_this, void 0, void 0, function () {
        var observed, aborted, onAbort;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    observed = observeTreeExit();
                    if (treeExitObserved)
                        return [2 /*return*/, true];
                    if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                        return [2 /*return*/, false];
                    if (!(signal === undefined)) return [3 /*break*/, 2];
                    return [4 /*yield*/, observed];
                case 1:
                    _a.sent();
                    return [2 /*return*/, true];
                case 2:
                    aborted = Promise.withResolvers();
                    onAbort = function () { aborted.resolve(false); };
                    signal.addEventListener('abort', onAbort, { once: true });
                    /* v8 ignore next -- closes the event-loop race between the preceding aborted check and listener registration. */
                    if (signal.aborted)
                        onAbort();
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, , 5, 6]);
                    return [4 /*yield*/, Promise.race([observed.then(function () { return true; }), aborted.promise])];
                case 4: return [2 /*return*/, _a.sent()];
                case 5:
                    signal.removeEventListener('abort', onAbort);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); };
    return {
        pid: pid,
        /* v8 ignore start -- pipe-mode fds exist on every spawn Node returns; the null-coalesces guard a nonconforming ChildProcess only. */
        stdin: stdinMode === 'pipe' ? (_j = child.stdin) !== null && _j !== void 0 ? _j : undefined : undefined,
        stdout: outMode === 'pipe' ? (_k = child.stdout) !== null && _k !== void 0 ? _k : undefined : undefined,
        stderr: errMode === 'pipe' ? (_l = child.stderr) !== null && _l !== void 0 ? _l : undefined : undefined,
        /* v8 ignore stop */
        collected: __assign(__assign({}, stdoutCollector !== undefined ? { stdout: stdoutCollector } : {}), stderrCollector !== undefined ? { stderr: stderrCollector } : {}),
        done: done,
        terminate: terminate,
        terminateForHostExit: terminateForHostExit,
        waitForExit: waitForExit,
    };
}
