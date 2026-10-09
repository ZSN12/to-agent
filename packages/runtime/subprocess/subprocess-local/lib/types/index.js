"use strict";
/**
 * Local Service Provider for the subprocess capability seam. Each spawn is a detached
 * process tree with the spec's per-stream stdio dispositions. Normal disposal
 * terminates and joins live trees; Node's synchronous exit phase force-stops
 * any trees the service still owns. It has no config: every disposition and
 * limit arrives on the spec, so the deployment-varying choices stay with the
 * caller's config (the bash executor's, the LSP host's, …).
 * @module @z/dsh-subprocess-local
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
exports.LocalSubprocessRuntime = void 0;
var node_fs_1 = require("node:fs");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var nodePty = require("node-pty");
var dsh_subprocess_1 = require("@z/dsh-subprocess");
var spawn_ts_1 = require("./spawn.ts");
var process_inspector_ts_1 = require("./process-inspector.ts");
var terminal_ts_1 = require("./terminal.ts");
/**
 * Local subprocess service: detached process trees, Node-shaped stdio
 * dispositions (raw pipes, inherit, bounded tail-keep collection with spill
 * files), credential-scrubbed environment, and tree-scoped signalling with
 * SIGTERM→grace→SIGKILL escalation, plus synchronous final termination during
 * JavaScript-observable host exit.
 */
var LocalSubprocessRuntime = /** @class */ (function (_super) {
    __extends(LocalSubprocessRuntime, _super);
    function LocalSubprocessRuntime(ctx) {
        var _this = _super.call(this, ctx) || this;
        /** Live handles retained for normal disposal and synchronous host-exit finalization. */
        _this.live = new Set();
        /** Live terminals retained through normal quiescence or host-exit finalization. */
        _this.terminals = new Set();
        /** Test hook: spill and platform knobs forwarded to spawnSubprocess. */
        _this.internals = {};
        ctx.effect(function () {
            var onHostExit = function () { _this.terminateForHostExit(); };
            process.prependListener('exit', onHostExit);
            return function () { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, , 2, 3]);
                            return [4 /*yield*/, this.disposeManagedProcesses()];
                        case 1:
                            _a.sent();
                            return [3 /*break*/, 3];
                        case 2:
                            process.off('exit', onHostExit);
                            return [7 /*endfinally*/];
                        case 3: return [2 /*return*/];
                    }
                });
            }); };
        }, 'local subprocess teardown');
        return _this;
    }
    LocalSubprocessRuntime.prototype.terminateForHostExit = function () {
        for (var _i = 0, _a = this.live; _i < _a.length; _i++) {
            var handle = _a[_i];
            try {
                handle.terminateForHostExit();
            }
            catch (_ordinaryTreeTerminationFailed) {
                // Host exit cannot await or report one target; continue with the rest.
            }
        }
        for (var _b = 0, _c = this.terminals; _b < _c.length; _b++) {
            var terminal = _c[_b];
            try {
                terminal.terminateForHostExit();
            }
            catch (_terminalTerminationFailed) {
                // One terminal must not prevent final termination of another target.
            }
        }
    };
    LocalSubprocessRuntime.prototype.disposeManagedProcesses = function () {
        return __awaiter(this, void 0, void 0, function () {
            var pending, _loop_1, _i, _a, handle, _b, _c, terminal, outcomes, failures;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        pending = [];
                        _loop_1 = function (handle) {
                            handle.terminate();
                            // Spawn-failure rejections already settled and left the live set.
                            pending.push(handle.done.catch(function () { }).then(function () { return handle.waitForExit(); }));
                        };
                        for (_i = 0, _a = this.live; _i < _a.length; _i++) {
                            handle = _a[_i];
                            _loop_1(handle);
                        }
                        for (_b = 0, _c = this.terminals; _b < _c.length; _b++) {
                            terminal = _c[_b];
                            pending.push(terminal.terminate());
                        }
                        return [4 /*yield*/, Promise.allSettled(pending)];
                    case 1:
                        outcomes = _d.sent();
                        failures = outcomes.flatMap(function (outcome) { return outcome.status === 'rejected'
                            ? [outcome.reason]
                            : []; });
                        if (failures.length > 0)
                            this.terminateForHostExit();
                        this.live.clear();
                        this.terminals.clear();
                        if (failures.length === 1)
                            throw failures[0];
                        if (failures.length > 1)
                            throw new AggregateError(failures, 'local subprocess teardown failed');
                        return [2 /*return*/];
                }
            });
        });
    };
    LocalSubprocessRuntime.prototype.resolveExecutable = function (command, env, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var environment, absolute, candidates, _i, candidates_1, candidate, info, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (command.length === 0)
                            throw new Error('subprocess-local: executable must be non-empty');
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        environment = (0, spawn_ts_1.childEnv)(env);
                        absolute = (0, node_path_1.isAbsolute)(command);
                        if (!absolute && (command.includes('/') || (process.platform === 'win32' && command.includes('\\')))) {
                            throw new Error("subprocess-local: command ".concat(JSON.stringify(command), " is a relative path; use an absolute path or a bare PATH name"));
                        }
                        candidates = absolute ? [command] : this.executableCandidates(command, environment);
                        _i = 0, candidates_1 = candidates;
                        _b.label = 1;
                    case 1:
                        if (!(_i < candidates_1.length)) return [3 /*break*/, 7];
                        candidate = candidates_1[_i];
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 5, , 6]);
                        return [4 /*yield*/, (0, promises_1.stat)(candidate)];
                    case 3:
                        info = _b.sent();
                        if (!info.isFile())
                            return [3 /*break*/, 6];
                        return [4 /*yield*/, (0, promises_1.access)(candidate, node_fs_1.constants.X_OK)];
                    case 4:
                        _b.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [2 /*return*/, candidate];
                    case 5:
                        _a = _b.sent();
                        return [3 /*break*/, 6];
                    case 6:
                        _i++;
                        return [3 /*break*/, 1];
                    case 7:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        throw new Error(absolute
                            ? "subprocess-local: command ".concat(JSON.stringify(command), " is not an executable file")
                            : "subprocess-local: command ".concat(JSON.stringify(command), " was not found on PATH"));
                }
            });
        });
    };
    LocalSubprocessRuntime.prototype.executableCandidates = function (command, env) {
        var _a, _b;
        var path = (_a = environmentValue(env, 'PATH')) !== null && _a !== void 0 ? _a : '';
        var extensions = process.platform === 'win32' && (0, node_path_1.extname)(command) === ''
            ? ((_b = environmentValue(env, 'PATHEXT')) !== null && _b !== void 0 ? _b : '.COM;.EXE;.BAT;.CMD').split(';')
            : [''];
        return path.split(node_path_1.delimiter).flatMap(function (directory) {
            return extensions.map(function (extension) { return (0, node_path_1.resolve)(process.cwd(), directory, command + extension); });
        });
    };
    LocalSubprocessRuntime.prototype.spawn = function (spec) {
        var _this = this;
        var handle = (0, spawn_ts_1.spawnSubprocess)(spec, this.internals);
        this.live.add(handle);
        // Release ownership only once the whole TREE is gone, not at direct-child
        // settlement — a TERM-trapping helper that outlives the leader must stay
        // owned so teardown can still escalate it. For the common no-survivor
        // case waitForExit resolves immediately after settlement.
        var release = function () {
            return handle.waitForExit().then(function () { _this.live.delete(handle); });
        };
        handle.done.then(release, release);
        return handle;
    };
    // Local PTY allocation is synchronous, but the provider contract permits remote asynchronous allocation.
    // oxlint-disable-next-line typescript/require-await -- Preserve promise rejection semantics at the async provider contract.
    LocalSubprocessRuntime.prototype.spawnTerminal = function (spec) {
        return __awaiter(this, void 0, void 0, function () {
            var file, options, inspector, terminal, handle, release;
            var _this = this;
            var _a, _b;
            return __generator(this, function (_c) {
                file = spec.argv[0];
                if (file === undefined || file.length === 0) {
                    throw new Error('subprocess-local: terminal argv must contain a program');
                }
                (_a = spec.signal) === null || _a === void 0 ? void 0 : _a.throwIfAborted();
                options = {
                    name: 'dumb',
                    rows: spec.rows,
                    cols: spec.cols,
                    cwd: spec.cwd,
                    env: (0, spawn_ts_1.childEnv)(spec.env),
                };
                inspector = (_b = this.terminalInspector) !== null && _b !== void 0 ? _b : (0, process_inspector_ts_1.createProcessInspector)();
                terminal = nodePty.spawn(file, __spreadArray([], spec.argv.slice(1), true), options);
                handle = new terminal_ts_1.LocalTerminalHandle(terminal, inspector, spec.graceMs);
                this.terminals.add(handle);
                release = function () { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, handle.terminate()];
                            case 1:
                                _a.sent();
                                this.terminals.delete(handle);
                                return [2 /*return*/];
                        }
                    });
                }); };
                void handle.done.then(release, release).catch(function () { });
                return [2 /*return*/, handle];
            });
        });
    };
    return LocalSubprocessRuntime;
}(dsh_subprocess_1.SubprocessRuntime));
exports.LocalSubprocessRuntime = LocalSubprocessRuntime;
/** Read a Windows environment key using the platform's case-insensitive semantics. */
function environmentValue(env, name) {
    var _a;
    var exact = env[name];
    if (exact !== undefined || process.platform !== 'win32')
        return exact;
    var normalized = name.toUpperCase();
    return (_a = Object.entries(env).find(function (_a) {
        var key = _a[0];
        return key.toUpperCase() === normalized;
    })) === null || _a === void 0 ? void 0 : _a[1];
}
exports.default = LocalSubprocessRuntime;
