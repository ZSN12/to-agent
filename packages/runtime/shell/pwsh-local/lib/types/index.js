"use strict";
/**
 * Local PowerShell Service Provider for the bash capability seam. Each command runs
 * as `pwsh -NoLogo -NoProfile -NonInteractive -Command <command>` in a managed
 * process spawned through `ctx.subprocess`; the executor owns command
 * defaulting, deadlines and cause classification, the model-friendly terminal
 * environment, and the model-facing stdout/stderr merge for background reads.
 *
 * The command string is passed as ONE argv element to `-Command`: PowerShell
 * itself parses the text, and no intermediate shell exists, so there is no
 * shell-quoting layer to escape (the `bash -c` string domain has no
 * equivalent here). Native Win32 paths (`C:\...`) pass through unchanged.
 *
 * @module @z/dsh-pwsh-local
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
exports.PwshLocalExecutor = exports.resolvePwshPath = exports.candidatePwshPaths = exports.ENCODING_PREAMBLE = exports.ENV_OVERRIDES = void 0;
exports.assertServiceablePwshConfig = assertServiceablePwshConfig;
var schemastery_1 = require("@z/schemastery");
var dsh_shell_1 = require("@z/dsh-shell");
var dsh_settings_1 = require("@z/dsh-settings");
var dsh_timeout_1 = require("@z/dsh-timeout");
/* jscpd:ignore-end */
var resolve_ts_1 = require("./resolve.ts");
/* jscpd:ignore-start -- deliberate call-for-call mirror of dsh-bash-local (Agent Note: pwsh-tool-and-executor). */
/**
 * Model-friendly environment overrides for PowerShell: disable colors and
 * pagers that would garble tool output. `TERM=dumb` is a POSIX concept and is
 * deliberately absent; `NO_COLOR` is honored by modern pwsh renderers.
 */
exports.ENV_OVERRIDES = {
    NO_COLOR: '1',
    PAGER: 'cat',
    GIT_PAGER: 'cat',
};
/**
 * UTF-8 output pinning prepended to every command. The subprocess collector
 * decodes output bytes as UTF-8, but Windows PowerShell 5.1 (the last-resort
 * executable fallback) writes the console/OEM code page by default, which
 * garbles non-ASCII output; pwsh 7 defaults to UTF-8 and is unaffected. The
 * statements ride on line 1 after `; ` separators so PowerShell error line
 * numbers stay accurate.
 */
exports.ENCODING_PREAMBLE = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false); ';
/** Default SIGTERM→SIGKILL grace period (the `graceMs` config). */
var DEFAULT_GRACE_MS = 3000;
/** Default per-stream spill cap (the `maxSpillBytes` config). */
var DEFAULT_MAX_SPILL_BYTES = 64 * 1024 * 1024;
// Resolution lives in its own dependency-free module so the repository's
// coverage-gate probe shares the exact definition the suites use.
var resolve_ts_2 = require("./resolve.ts");
Object.defineProperty(exports, "candidatePwshPaths", { enumerable: true, get: function () { return resolve_ts_2.candidatePwshPaths; } });
Object.defineProperty(exports, "resolvePwshPath", { enumerable: true, get: function () { return resolve_ts_2.resolvePwshPath; } });
/** Project a settled collect-mode reader into the final CollectedOutput shape. */
function finalOutput(reader) {
    var read = reader.readFrom(0);
    return __assign({ text: read.text, truncated: read.lossy }, read.spillPath !== undefined ? { spillPath: read.spillPath } : {});
}
function assertPositiveFinite(name, value) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error("pwsh-local: ".concat(name, " must be a positive finite number"));
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
function assertServiceablePwshConfig(config) {
    var resolved = config;
    assertPositiveFinite('timeoutMs', resolved.timeoutMs);
    assertPositiveFinite('maxTimeoutMs', resolved.maxTimeoutMs);
    assertPositiveFinite('maxOutputBytes', resolved.maxOutputBytes);
    assertPositiveFinite('maxSpillBytes', resolved.maxSpillBytes);
    assertPositiveFinite('graceMs', resolved.graceMs);
    if (resolved.graceMs > dsh_timeout_1.MAX_TIMER_DELAY_MS) {
        throw new Error("pwsh-local: graceMs must be no greater than ".concat(dsh_timeout_1.MAX_TIMER_DELAY_MS));
    }
}
/**
 * Local PowerShell executor over `ctx.subprocess`. Bounded output, spill
 * files, and process-tree termination are the subprocess service's mechanics;
 * this executor supplies their configured budgets per spawn.
 */
var PwshLocalExecutor = /** @class */ (function (_super) {
    __extends(PwshLocalExecutor, _super);
    function PwshLocalExecutor(ctx, config) {
        var _this = _super.call(this, ctx) || this;
        // Schemastery fills these fields before construction; the type does not encode that step.
        var entry = config;
        assertServiceablePwshConfig(entry);
        _this.source = function () { return entry; };
        _this.declaredPwshPath = entry.pwshPath;
        _this.resolvedPwshPath = (0, resolve_ts_1.resolvePwshPath)(entry.pwshPath);
        (0, dsh_settings_1.installSettingsSection)(ctx, dsh_shell_1.SHELL_SETTINGS_NAMESPACE, PwshLocalExecutor.Config, entry, {
            validate: assertServiceablePwshConfig,
            setSource: function (current) {
                _this.source = current;
            },
            // Probing the filesystem is the one fact derived from the source: every
            // other field is read through the getter at each command.
            onChange: function () {
                var declared = _this.source().pwshPath;
                if (declared === _this.declaredPwshPath)
                    return;
                _this.declaredPwshPath = declared;
                _this.resolvedPwshPath = (0, resolve_ts_1.resolvePwshPath)(declared);
            },
        });
        return _this;
    }
    Object.defineProperty(PwshLocalExecutor.prototype, "config", {
        /** Validated config (schemastery applied the defaults before construction). */
        get: function () {
            return this.source();
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(PwshLocalExecutor.prototype, "pwshPath", {
        /** The pwsh executable every command runs through. */
        get: function () {
            return this.resolvedPwshPath;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Resolve a request into a fully-specified spec: fill `workdir` from
     * `config.cwd` (else `process.cwd()`), and `timeoutMs` from
     * `config.timeoutMs`, capped at `config.maxTimeoutMs`.
     */
    PwshLocalExecutor.prototype.resolve = function (request) {
        var _a, _b, _c;
        var timeoutMs = (0, dsh_timeout_1.clampTimeout)(request.timeoutMs, this.config.timeoutMs, this.config.maxTimeoutMs, 'pwsh-local: request.timeoutMs');
        var stdoutMaxBytes = (_a = request.stdoutMaxBytes) !== null && _a !== void 0 ? _a : this.config.maxOutputBytes;
        assertPositiveFinite('request.stdoutMaxBytes', stdoutMaxBytes);
        return __assign(__assign(__assign(__assign(__assign({ command: request.command, workdir: (_c = (_b = request.workdir) !== null && _b !== void 0 ? _b : this.config.cwd) !== null && _c !== void 0 ? _c : process.cwd(), timeoutMs: timeoutMs, stdoutMaxBytes: stdoutMaxBytes }, request.signal ? { signal: request.signal } : {}), request.stdin !== undefined ? { stdin: request.stdin } : {}), request.env !== undefined ? { env: request.env } : {}), request.dshEnv !== undefined ? { dshEnv: request.dshEnv } : {}), { sandboxPolicy: request.sandboxPolicy });
    };
    /**
     * The pwsh invocation argv for one resolved spec — the argv-level seam a
     * confining subclass wraps through `ctx.sandbox.confine` (the pwsh twin of
     * `dsh-bash-local`'s `runArgv`/`startArgv` hooks; see
     * `@z/dsh-pwsh-sandbox`).
     */
    PwshLocalExecutor.prototype.argv = function (spec) {
        return [this.pwshPath, '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', "".concat(exports.ENCODING_PREAMBLE).concat(spec.command)];
    };
    /** Map one resolved spec plus its argv onto a fully-specified subprocess spawn. */
    PwshLocalExecutor.prototype.spawnSpec = function (spec, stdoutMaxBytes, signal, argv) {
        var _this = this;
        var collect = function (maxBytes) {
            return ({ maxBytes: maxBytes, spill: { maxBytes: _this.config.maxSpillBytes } });
        };
        return {
            argv: __spreadArray([], argv, true),
            cwd: spec.workdir,
            stdio: {
                stdin: spec.stdin !== undefined ? { data: spec.stdin } : 'ignore',
                stdout: collect(stdoutMaxBytes),
                stderr: collect(this.config.maxOutputBytes),
            },
            graceMs: this.config.graceMs,
            signal: signal,
            env: __assign(__assign(__assign({}, exports.ENV_OVERRIDES), spec.env), spec.dshEnv),
        };
    };
    /** The collect-mode readers the executor itself requested (present by construction). */
    PwshLocalExecutor.collected = function (handle) {
        var _a = handle.collected, stdout = _a.stdout, stderr = _a.stderr;
        /* v8 ignore start -- collect dispositions expose both readers by the seam contract; defensive. */
        if (stdout === undefined || stderr === undefined) {
            throw new Error('pwsh-local: subprocess implementation dropped a requested collect stream');
        }
        /* v8 ignore stop */
        return { stdout: stdout, stderr: stderr };
    };
    PwshLocalExecutor.prototype.run = function (spec) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.runArgv(spec, this.argv(spec))];
            });
        });
    };
    /** Foreground run of an exact argv (the confining subclass re-wraps it). */
    PwshLocalExecutor.prototype.runArgv = function (spec, argv) {
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
                        handle = this.ctx.subprocess.spawn(this.spawnSpec(spec, spec.stdoutMaxBytes, d.signal, argv));
                        return [4 /*yield*/, handle.done];
                    case 2:
                        outcome = _a.sent();
                        collected = PwshLocalExecutor.collected(handle);
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
    PwshLocalExecutor.prototype.start = function (spec) {
        return this.startArgv(spec, this.argv(spec));
    };
    /** Background start of an exact argv (the confining subclass re-wraps it). */
    PwshLocalExecutor.prototype.startArgv = function (spec, argv) {
        var _this = this;
        // Background runs ignore timeoutMs; callers stop them through kill() or spec.signal.
        var running = this.ctx.subprocess.spawn(this.spawnSpec(spec, this.config.maxOutputBytes, spec.signal, argv));
        var collected = PwshLocalExecutor.collected(running);
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
     * The base implementation is intentionally empty. Mirrored from
     * `dsh-bash-local` (whose sandboxing subclass consumes the same hook); the
     * pwsh-confining consumer is `@z/dsh-pwsh-sandbox`.
     * @param _proc - the settled process handle.
     * @param _stderr - the process's retained stderr tail used by subclasses for settlement classification.
     * @param _spawnFailed - whether the spawn rejected before any process existed.
     * @param _spawnError - the spawn rejection, when `_spawnFailed`.
     */
    PwshLocalExecutor.prototype.onProcessDone = function (_proc, _stderr, _spawnFailed, _spawnError) { };
    PwshLocalExecutor.inject = ['subprocess'];
    PwshLocalExecutor.Config = schemastery_1.default.object({
        cwd: schemastery_1.default.string(),
        timeoutMs: schemastery_1.default.number().default(120000),
        maxTimeoutMs: schemastery_1.default.number().default(600000),
        maxOutputBytes: schemastery_1.default.number().default(64000),
        maxSpillBytes: schemastery_1.default.number().default(DEFAULT_MAX_SPILL_BYTES),
        graceMs: schemastery_1.default.number().default(DEFAULT_GRACE_MS),
        pwshPath: schemastery_1.default.string(),
    });
    return PwshLocalExecutor;
}(dsh_shell_1.ShellExecutor));
exports.PwshLocalExecutor = PwshLocalExecutor;
/* jscpd:ignore-end */
exports.default = PwshLocalExecutor;
