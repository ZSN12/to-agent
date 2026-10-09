"use strict";
/**
 * Local Service Provider for the bash capability seam over the subprocess
 * capability seam. Public commands run as `bash -c` in a managed process group spawned
 * through `ctx.subprocess`; subclasses may reuse the same mechanics with an
 * explicit argv. This executor owns command defaulting, deadlines and cause
 * classification, the model-friendly terminal environment, and the model-facing
 * stdout/stderr merge for background reads. Execution policy belongs in
 * `tools/pre-execute` or a sandboxing executor.
 * @module @z/dsh-bash-local
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
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalBashExecutor = exports.ENV_OVERRIDES = void 0;
exports.assertServiceableBashConfig = assertServiceableBashConfig;
var schemastery_1 = require("@z/schemastery");
var dsh_shell_1 = require("@z/dsh-shell");
var dsh_settings_1 = require("@z/dsh-settings");
var dsh_timeout_1 = require("@z/dsh-timeout");
/**
 * Model-friendly environment overrides: disable colors, pagers, and
 * interactive terminal features that would garble tool output (the same set
 * Codex hardcodes; Claude Code achieves it via TERM=dumb). Bash-tool policy —
 * merged first into the spawn's explicit env, so a trusted caller's own entry
 * still wins; the subprocess service applies its credential scrub independently.
 */
exports.ENV_OVERRIDES = {
    NO_COLOR: '1',
    TERM: 'dumb',
    PAGER: 'cat',
    GIT_PAGER: 'cat',
};
/** Default SIGTERM→SIGKILL grace period (the `graceMs` config; matches OpenCode's 3s). */
var DEFAULT_GRACE_MS = 3000;
/** Default per-stream spill cap (the `maxSpillBytes` config). */
var DEFAULT_MAX_SPILL_BYTES = 64 * 1024 * 1024;
/** Project a settled collect-mode reader into the final CollectedOutput shape. */
function finalOutput(reader) {
    var read = reader.readFrom(0);
    return __assign({ text: read.text, truncated: read.lossy }, read.spillPath !== undefined ? { spillPath: read.spillPath } : {});
}
function assertPositiveFinite(name, value) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error("bash-local: ".concat(name, " must be a positive finite number"));
    }
}
/**
 * Reject a resolved section this executor could not run with. The schema
 * expresses neither "positive and finite" nor the timer bound `graceMs` has to
 * fit, so a stored value is refused where it is written instead of failing at
 * the next command.
 * @param config - the resolved section, schema-valid by construction.
 * @throws Error naming the field that cannot be used.
 */
function assertServiceableBashConfig(config) {
    var resolved = config;
    assertPositiveFinite('timeoutMs', resolved.timeoutMs);
    assertPositiveFinite('maxTimeoutMs', resolved.maxTimeoutMs);
    assertPositiveFinite('maxOutputBytes', resolved.maxOutputBytes);
    assertPositiveFinite('maxSpillBytes', resolved.maxSpillBytes);
    assertPositiveFinite('graceMs', resolved.graceMs);
    if (resolved.graceMs > dsh_timeout_1.MAX_TIMER_DELAY_MS) {
        throw new Error("bash-local: graceMs must be no greater than ".concat(dsh_timeout_1.MAX_TIMER_DELAY_MS));
    }
}
/**
 * Local bash executor over `ctx.subprocess`. Bounded output, spill files, and
 * process-group SIGTERM→SIGKILL escalation are the subprocess service's
 * mechanics; this executor supplies their configured budgets per spawn, so a
 * still-running background process stays managed (killed and joined at
 * composition teardown) even across an executor reload.
 */
var LocalBashExecutor = /** @class */ (function (_super) {
    __extends(LocalBashExecutor, _super);
    function LocalBashExecutor(ctx, config) {
        var _this = _super.call(this, ctx) || this;
        // Schemastery fills these fields before construction; the type does not encode that step.
        var entry = config;
        assertServiceableBashConfig(entry);
        _this.source = function () { return entry; };
        (0, dsh_settings_1.installSettingsSection)(ctx, dsh_shell_1.SHELL_SETTINGS_NAMESPACE, LocalBashExecutor.Config, entry, {
            validate: assertServiceableBashConfig,
            setSource: function (current) {
                _this.source = current;
            },
            // Every field is read through the getter at each command, so nothing
            // derived from the source needs rebuilding when the document changes.
            onChange: function () { },
        });
        return _this;
    }
    Object.defineProperty(LocalBashExecutor.prototype, "config", {
        /** Validated config (schemastery applied the defaults before construction). */
        get: function () {
            return this.source();
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Resolve a request into a fully-specified spec: fill `workdir` from
     * `config.cwd` (else `process.cwd()`), and `timeoutMs` from
     * `config.timeoutMs`, capped at `config.maxTimeoutMs`. The tool layer calls
     * this before {@link run}/{@link start}, so those methods receive explicit
     * values and never re-default.
     */
    LocalBashExecutor.prototype.resolve = function (request) {
        var _a, _b, _c;
        var timeoutMs = (0, dsh_timeout_1.clampTimeout)(request.timeoutMs, this.config.timeoutMs, this.config.maxTimeoutMs, 'bash-local: request.timeoutMs');
        var stdoutMaxBytes = (_a = request.stdoutMaxBytes) !== null && _a !== void 0 ? _a : this.config.maxOutputBytes;
        assertPositiveFinite('request.stdoutMaxBytes', stdoutMaxBytes);
        return __assign(__assign(__assign(__assign(__assign({ command: request.command, workdir: (_c = (_b = request.workdir) !== null && _b !== void 0 ? _b : this.config.cwd) !== null && _c !== void 0 ? _c : process.cwd(), timeoutMs: timeoutMs, stdoutMaxBytes: stdoutMaxBytes }, request.signal ? { signal: request.signal } : {}), request.stdin !== undefined ? { stdin: request.stdin } : {}), request.env !== undefined ? { env: request.env } : {}), request.dshEnv !== undefined ? { dshEnv: request.dshEnv } : {}), { 
            // Carry a sandbox policy through verbatim: this executor never
            // confines, so the field is inert here (the seam contract) — a
            // sandboxing subclass overrides resolve() to stamp its default instead.
            sandboxPolicy: request.sandboxPolicy });
    };
    /** Map one resolved bash spec and explicit argv onto a fully-specified subprocess spawn. */
    // XXX(stateful-shell): evaluate persistent cwd or PTY sessions when workflows require shell state.
    LocalBashExecutor.prototype.spawnSpec = function (spec, argv, stdoutMaxBytes, signal) {
        var _this = this;
        var collect = function (maxBytes) {
            return ({ maxBytes: maxBytes, spill: { maxBytes: _this.config.maxSpillBytes } });
        };
        return {
            argv: argv,
            cwd: spec.workdir,
            stdio: {
                stdin: spec.stdin !== undefined ? { data: spec.stdin } : 'ignore',
                stdout: collect(stdoutMaxBytes),
                stderr: collect(this.config.maxOutputBytes),
            },
            graceMs: this.config.graceMs,
            signal: signal,
            // One explicit env map for the seam, layered so the trusted dshEnv
            // snapshot beats both the caller's env and the terminal overrides; the
            // subprocess service merges the whole map after its ambient scrub.
            env: __assign(__assign(__assign({}, exports.ENV_OVERRIDES), spec.env), spec.dshEnv),
        };
    };
    /** The collect-mode readers the executor itself requested (present by construction). */
    LocalBashExecutor.collected = function (handle) {
        var _a = handle.collected, stdout = _a.stdout, stderr = _a.stderr;
        /* v8 ignore start -- collect dispositions expose both readers by the seam contract; defensive. */
        if (stdout === undefined || stderr === undefined) {
            throw new Error('bash-local: subprocess implementation dropped a requested collect stream');
        }
        /* v8 ignore stop */
        return { stdout: stdout, stderr: stderr };
    };
    LocalBashExecutor.prototype.run = function (spec) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.runArgv(spec, ['bash', '-c', spec.command])];
            });
        });
    };
    /**
     * Run an explicit argv with the foreground lifecycle, environment, output,
     * timeout, and cancellation semantics of this executor. Subclasses use this
     * after replacing the public command's shell argv at an execution boundary.
     * @param spec - resolved execution settings and caller-owned command metadata.
     * @param argv - exact executable and arguments to hand to `ctx.subprocess`.
     * @returns the settled foreground result with collected output and cause facts.
     */
    LocalBashExecutor.prototype.runArgv = function (spec, argv) {
        return __awaiter(this, void 0, void 0, function () {
            var env_1, d, handle, outcome, collected, timedOut, aborted, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        env_1 = { stack: [], error: void 0, hasError: false };
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, 4, 5]);
                        d = __addDisposableResource(env_1, (0, dsh_timeout_1.deadline)(spec.signal, spec.timeoutMs, 'BASH_TIMEOUT'), false);
                        handle = this.ctx.subprocess.spawn(this.spawnSpec(spec, argv, spec.stdoutMaxBytes, d.signal));
                        return [4 /*yield*/, handle.done];
                    case 2:
                        outcome = _a.sent();
                        collected = LocalBashExecutor.collected(handle);
                        timedOut = (0, dsh_timeout_1.timeoutOf)(d.signal, 'BASH_TIMEOUT') !== undefined;
                        aborted = d.signal.aborted && !timedOut;
                        return [2 /*return*/, __assign(__assign({}, outcome), { timedOut: timedOut, aborted: aborted, timeoutMs: spec.timeoutMs, stdout: finalOutput(collected.stdout), stderr: finalOutput(collected.stderr) })];
                    case 3:
                        e_1 = _a.sent();
                        env_1.error = e_1;
                        env_1.hasError = true;
                        return [3 /*break*/, 5];
                    case 4:
                        __disposeResources(env_1);
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    LocalBashExecutor.prototype.start = function (spec) {
        return this.startArgv(spec, ['bash', '-c', spec.command]);
    };
    /**
     * Start an explicit argv with the background lifecycle, environment, output,
     * cancellation, and process-tree ownership semantics of this executor.
     * Subclasses use this after replacing the public command's shell argv at an
     * execution boundary.
     * @param spec - resolved execution settings and caller-owned command metadata.
     * @param argv - exact executable and arguments to hand to `ctx.subprocess`.
     * @returns the live background handle; spawn rejection settles it as killed.
     */
    LocalBashExecutor.prototype.startArgv = function (spec, argv) {
        var _this = this;
        // Background runs ignore timeoutMs; callers stop them through kill() or spec.signal.
        var running = this.ctx.subprocess.spawn(this.spawnSpec(spec, argv, this.config.maxOutputBytes, spec.signal));
        var collected = LocalBashExecutor.collected(running);
        // A spawn failure produces no process output, so the subprocess service has nothing
        // to buffer; the note is delivered exactly once through the read path.
        var spawnFailureNote;
        var consumeSpawnFailure = function () {
            var note = spawnFailureNote !== null && spawnFailureNote !== void 0 ? spawnFailureNote : '';
            spawnFailureNote = undefined;
            return note;
        };
        var stdoutOffset = 0;
        var stderrOffset = 0;
        var proc = {
            status: 'running',
            exitCode: null,
            signal: null,
            done: running.done.then(function (outcome) {
                var _a;
                // Any signal termination is killed, including a command signaling itself.
                if (proc.status === 'running') {
                    proc.status = ((_a = spec.signal) === null || _a === void 0 ? void 0 : _a.aborted) === true || outcome.signal !== null ? 'killed' : 'completed';
                }
                proc.exitCode = outcome.exitCode;
                proc.signal = outcome.signal;
                _this.onProcessDone(proc, collected.stderr.readFrom(0).text, false);
            }, function (error) {
                // Background spawn failures settle as killed and surface through the read path.
                proc.status = 'killed';
                spawnFailureNote = "spawn failed: ".concat(String(error));
                _this.onProcessDone(proc, spawnFailureNote, true, error);
            }),
            readOutput: function () {
                var out = collected.stdout.readFrom(stdoutOffset);
                var err = collected.stderr.readFrom(stderrOffset);
                stdoutOffset = out.nextOffset;
                stderrOffset = err.nextOffset;
                // A failed spawn never produced process output, so the note and real
                // stderr text are mutually exclusive.
                var errText = err.text.length > 0 ? err.text : consumeSpawnFailure();
                // Single newline between sections: stdout chunks usually end with one
                // already; add it only when missing.
                var separator = out.text.length > 0 && !out.text.endsWith('\n') ? '\n' : '';
                var delta = out.text
                    + (errText.length > 0 ? "".concat(separator, "[stderr]\n").concat(errText) : '');
                return __assign(__assign({ delta: delta, lossy: out.lossy || err.lossy }, out.spillPath !== undefined ? { stdoutSpillPath: out.spillPath } : {}), err.spillPath !== undefined ? { stderrSpillPath: err.spillPath } : {});
            },
            kill: function () {
                if (proc.status !== 'running')
                    return false;
                proc.status = 'killed';
                running.terminate();
                return true;
            },
        };
        return proc;
    };
    /**
     * Settlement hook for subclasses that attach execution facts to a process.
     * Called after exit facts or spawn-failure output are stamped and before
     * {@link ShellProcess.done} resolves. The base implementation is intentionally
     * empty.
     * @param _proc - the settled process handle.
     * @param _stderr - the process's retained stderr tail used by subclasses for settlement classification.
     * @param _spawnFailed - whether the subprocess promise rejected before a process started.
     * @param _spawnError - the original spawn rejection reason, which may itself be undefined.
     */
    LocalBashExecutor.prototype.onProcessDone = function (_proc, _stderr, _spawnFailed, _spawnError) { };
    LocalBashExecutor.inject = ['subprocess'];
    LocalBashExecutor.Config = schemastery_1.default.object({
        cwd: schemastery_1.default.string(),
        timeoutMs: schemastery_1.default.number().default(120000),
        maxTimeoutMs: schemastery_1.default.number().default(600000),
        maxOutputBytes: schemastery_1.default.number().default(64000),
        maxSpillBytes: schemastery_1.default.number().default(DEFAULT_MAX_SPILL_BYTES),
        graceMs: schemastery_1.default.number().default(DEFAULT_GRACE_MS),
    });
    return LocalBashExecutor;
}(dsh_shell_1.ShellExecutor));
exports.LocalBashExecutor = LocalBashExecutor;
exports.default = LocalBashExecutor;
