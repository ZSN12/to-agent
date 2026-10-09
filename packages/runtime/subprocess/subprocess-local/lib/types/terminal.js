"use strict";
/** Local node-pty terminal-process implementation for the subprocess seam. */
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
exports.LocalTerminalHandle = void 0;
var node_buffer_1 = require("node:buffer");
var node_os_1 = require("node:os");
var node_stream_1 = require("node:stream");
function delay(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
function signalName(number) {
    if (number === undefined || number === 0)
        return null;
    for (var _i = 0, _a = Object.entries(node_os_1.constants.signals); _i < _a.length; _i++) {
        var _b = _a[_i], name_1 = _b[0], value = _b[1];
        if (value === number)
            return name_1;
    }
    return null;
}
/**
 * A local terminal whose process-session ownership stays below the PTY backend.
 * The seam's terminate() promise — no write, inspection, or signal in flight
 * after settlement — holds here without operation tracking only because every
 * handle call completes synchronously under the hood (node-pty write, ps-based
 * inspection). A first genuinely asynchronous step in any handle call must add
 * the tracking a remote provider needs.
 */
var LocalTerminalHandle = /** @class */ (function () {
    /**
     * @param terminal - allocated node-pty process.
     * @param inspector - platform process/session operations.
     * @param graceMs - TERM-to-KILL and exit-wait grace.
     * @param platform - host platform; defaults to the running platform, injectable for deterministic tests.
     */
    function LocalTerminalHandle(terminal, inspector, graceMs, platform) {
        if (platform === void 0) { platform = process.platform; }
        var _this = this;
        this.terminal = terminal;
        this.inspector = inspector;
        this.graceMs = graceMs;
        this.platform = platform;
        this.output = new node_stream_1.PassThrough();
        this.outcome = Promise.withResolvers();
        this.exited = false;
        this.trackedDescendants = [];
        this.pid = terminal.pid;
        this.rootIdentity = inspector.processTree(this.pid).find(function (member) { return member.pid === _this.pid; });
        this.done = this.outcome.promise;
        this.dataDisposable = terminal.onData(function (data) { _this.output.write(node_buffer_1.Buffer.from(data, 'utf8')); });
        this.exitDisposable = terminal.onExit(function (_a) {
            var exitCode = _a.exitCode, exitSignal = _a.signal;
            if (_this.exited)
                return;
            _this.exited = true;
            _this.output.end();
            _this.outcome.resolve({
                exitCode: exitSignal === undefined || exitSignal === 0 ? exitCode : null,
                signal: signalName(exitSignal),
            });
        });
    }
    // node-pty writes synchronously; the seam returns a promise for remote transports.
    // oxlint-disable-next-line typescript/require-await -- Preserve promise rejection semantics at the async provider contract.
    LocalTerminalHandle.prototype.write = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.exited)
                    throw new Error('terminal process has exited');
                this.terminal.write(data);
                return [2 /*return*/];
            });
        });
    };
    // Local inspection is synchronous; the seam returns a promise for remote transports.
    // oxlint-disable-next-line typescript/require-await -- Preserve promise rejection semantics at the async provider contract.
    LocalTerminalHandle.prototype.inspectForeground = function () {
        return __awaiter(this, void 0, void 0, function () {
            var processGroupId;
            return __generator(this, function (_a) {
                this.descendants();
                processGroupId = this.inspector.foregroundPgid(this.pid);
                if (processGroupId === undefined)
                    return [2 /*return*/, undefined];
                return [2 /*return*/, {
                        processGroupId: processGroupId,
                        inputWaiting: this.inspector.isStdinWaiting(processGroupId),
                    }];
            });
        });
    };
    LocalTerminalHandle.prototype.signalForeground = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            var foreground;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.inspectForeground()];
                    case 1:
                        foreground = _a.sent();
                        if (foreground === undefined) {
                            throw new Error("cannot resolve foreground process group for terminal ".concat(this.pid));
                        }
                        if (signal === 'SIGKILL' && foreground.processGroupId === this.pid) {
                            throw new Error('refusing to SIGKILL the terminal shell; terminate the terminal session instead');
                        }
                        if (this.platform === 'win32') {
                            if (signal === 'SIGINT') {
                                // Windows has no process-group signalling: a `\x03` input write is the
                                // Ctrl-C delivery path conhost turns into a console-wide CTRL_C event
                                // for attached processes. node-pty's signal kills throw on Windows, so
                                // no signal ever reaches the inspector.
                                this.terminal.write('\x03');
                                return [2 /*return*/, foreground.processGroupId];
                            }
                            if (signal === 'SIGTSTP' || signal === 'SIGHUP') {
                                throw new Error("signal ".concat(signal, " is unsupported on Windows; only SIGINT, SIGTERM, and SIGKILL are available"));
                            }
                        }
                        this.inspector.signalGroup(foreground.processGroupId, signal);
                        return [2 /*return*/, foreground.processGroupId];
                }
            });
        });
    };
    LocalTerminalHandle.prototype.terminate = function () {
        var _this = this;
        if (this.cleanup !== undefined)
            return this.cleanup;
        var cleanup = this.closeOnce();
        this.cleanup = cleanup;
        void cleanup.catch(function () { _this.cleanup = undefined; });
        return cleanup;
    };
    /**
     * Force-terminate the observable session synchronously during Node's exit
     * event. This does not claim quiescence and does not replace terminate().
     */
    LocalTerminalHandle.prototype.terminateForHostExit = function () {
        this.forceStopDescendants();
        this.forceStopShell();
        this.forceStopDescendants();
    };
    LocalTerminalHandle.prototype.forceStopShell = function () {
        if (this.exited)
            return;
        if (this.rootIdentity !== undefined) {
            try {
                this.inspector.signalProcess(this.rootIdentity, 'SIGKILL');
            }
            catch (_rootExitedDuringHostExit) {
                // Exact identity signalling contains both exit races and PID reuse.
            }
            return;
        }
        try {
            this.terminal.kill('SIGKILL');
        }
        catch (_unidentifiedShellExitedDuringHostExit) {
            // Without a captured identity, node-pty is the only root kill primitive.
        }
    };
    LocalTerminalHandle.prototype.survivors = function (members) {
        var _this = this;
        return members.filter(function (member) { return _this.inspector.isAlive(member); });
    };
    LocalTerminalHandle.prototype.descendants = function () {
        var _this = this;
        // Adopt newly scanned members only while the numeric root pid provably
        // still carries the spawned shell's start identity: after the shell dies,
        // a recycled pid's tree and session must not donate an unrelated
        // process's children to this session's signalling. Already-adopted
        // members keep their own start identities, which every signal rechecks.
        var tree = this.inspector.processTree(this.pid);
        var root = tree.find(function (member) { return member.pid === _this.pid; });
        var rootVerified = this.rootIdentity !== undefined
            && root !== undefined
            && root.started === this.rootIdentity.started;
        this.trackedDescendants = this.survivors(this.unionMembers.apply(this, __spreadArray([this.trackedDescendants], rootVerified ? [tree, this.inspector.processSession(this.pid)] : [], false)).filter(function (member) { return member.pid !== _this.pid; }));
        return this.trackedDescendants;
    };
    LocalTerminalHandle.prototype.waitForMembers = function (members) {
        return __awaiter(this, void 0, void 0, function () {
            var until, survivors;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        until = Date.now() + this.graceMs;
                        survivors = this.survivors(members);
                        _a.label = 1;
                    case 1:
                        if (!(survivors.length > 0 && Date.now() < until)) return [3 /*break*/, 3];
                        return [4 /*yield*/, delay(Math.min(25, Math.max(1, until - Date.now())))];
                    case 2:
                        _a.sent();
                        survivors = this.survivors(members);
                        return [3 /*break*/, 1];
                    case 3: return [2 /*return*/, survivors];
                }
            });
        });
    };
    LocalTerminalHandle.prototype.signalMembers = function (members, signal) {
        for (var _i = 0, members_1 = members; _i < members_1.length; _i++) {
            var member = members_1[_i];
            try {
                this.inspector.signalProcess(member, signal);
            }
            catch (_alreadyExitedDuringSignal) {
                // The exact process identity is rechecked; a same-tick exit is success.
            }
        }
    };
    LocalTerminalHandle.prototype.forceStopDescendants = function () {
        var members = this.trackedDescendants;
        try {
            members = this.descendants();
        }
        catch (_processTableUnavailableDuringHostExit) {
            // Preserve already-captured identities when a final process-table scan fails.
        }
        this.signalMembers(members, 'SIGKILL');
    };
    LocalTerminalHandle.prototype.unionMembers = function () {
        var groups = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            groups[_i] = arguments[_i];
        }
        var members = [];
        var seen = new Set();
        for (var _a = 0, groups_1 = groups; _a < groups_1.length; _a++) {
            var group = groups_1[_a];
            for (var _b = 0, group_1 = group; _b < group_1.length; _b++) {
                var member = group_1[_b];
                var key = "".concat(member.pid, ":").concat(member.started);
                if (seen.has(key))
                    continue;
                seen.add(key);
                members.push(member);
            }
        }
        return members;
    };
    LocalTerminalHandle.prototype.stopDescendants = function () {
        return __awaiter(this, void 0, void 0, function () {
            var captured, capturedSurvivors, members, survivors;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        captured = this.descendants();
                        this.signalMembers(captured, 'SIGTERM');
                        return [4 /*yield*/, this.waitForMembers(captured)];
                    case 1:
                        capturedSurvivors = _a.sent();
                        members = this.unionMembers(capturedSurvivors, this.descendants());
                        this.signalMembers(members, 'SIGKILL');
                        return [4 /*yield*/, this.waitForMembers(members)];
                    case 2:
                        survivors = _a.sent();
                        return [2 /*return*/, this.survivors(this.unionMembers(survivors, this.descendants()))];
                }
            });
        });
    };
    LocalTerminalHandle.prototype.stopShell = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(this.platform === 'win32')) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.stopShellWindows()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                    case 2:
                        if (!!this.exited) return [3 /*break*/, 4];
                        try {
                            this.terminal.kill('SIGTERM');
                        }
                        catch (_topLevelAlreadyExitedDuringTerm) {
                            // The exit callback is authoritative.
                        }
                        return [4 /*yield*/, Promise.race([this.done.then(function () { return undefined; }), delay(this.graceMs)])];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        if (!!this.exited) return [3 /*break*/, 6];
                        try {
                            this.terminal.kill('SIGKILL');
                        }
                        catch (_topLevelAlreadyExitedDuringKill) {
                            // The exit callback is authoritative.
                        }
                        return [4 /*yield*/, Promise.race([this.done.then(function () { return undefined; }), delay(this.graceMs)])];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6:
                        if (!this.exited)
                            throw new Error("terminal cleanup failed; surviving pid: ".concat(this.pid));
                        return [2 /*return*/];
                }
            });
        });
    };
    LocalTerminalHandle.prototype.stopShellWindows = function () {
        return __awaiter(this, void 0, void 0, function () {
            var shellGone;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        shellGone = function () {
                            return _this.exited || (_this.rootIdentity !== undefined && !_this.inspector.isAlive(_this.rootIdentity));
                        };
                        if (!(!shellGone() && this.rootIdentity !== undefined)) return [3 /*break*/, 2];
                        this.inspector.signalProcess(this.rootIdentity, 'SIGTERM');
                        return [4 /*yield*/, this.waitForWindowsShellExit()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        if (!(!shellGone() && this.rootIdentity === undefined)) return [3 /*break*/, 4];
                        try {
                            this.terminal.kill();
                        }
                        catch (_topLevelAlreadyExitedDuringKill) {
                            // The exit callback is authoritative.
                        }
                        return [4 /*yield*/, Promise.race([this.done.then(function () { return undefined; }), delay(this.graceMs)])];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        if (!(!shellGone() && this.rootIdentity !== undefined)) return [3 /*break*/, 6];
                        this.inspector.signalProcess(this.rootIdentity, 'SIGKILL');
                        return [4 /*yield*/, this.waitForWindowsShellExit()];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6:
                        if (!shellGone())
                            throw new Error("terminal cleanup failed; surviving pid: ".concat(this.pid));
                        return [2 /*return*/];
                }
            });
        });
    };
    LocalTerminalHandle.prototype.waitForWindowsShellExit = function () {
        return __awaiter(this, void 0, void 0, function () {
            var until;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        until = Date.now() + this.graceMs;
                        _a.label = 1;
                    case 1:
                        if (!(!this.exited && Date.now() < until)) return [3 /*break*/, 3];
                        if (this.rootIdentity !== undefined && !this.inspector.isAlive(this.rootIdentity))
                            return [2 /*return*/];
                        return [4 /*yield*/, delay(Math.min(25, Math.max(1, until - Date.now())))];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 1];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    LocalTerminalHandle.prototype.closeOnce = function () {
        return __awaiter(this, void 0, void 0, function () {
            var survivors;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.stopDescendants()];
                    case 1:
                        survivors = _a.sent();
                        if (survivors.length > 0) {
                            throw new Error("terminal cleanup failed; surviving pids: ".concat(survivors.map(function (member) { return member.pid; }).join(', ')));
                        }
                        return [4 /*yield*/, this.stopShell()];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.stopDescendants()];
                    case 3:
                        survivors = _a.sent();
                        if (survivors.length > 0) {
                            throw new Error("terminal cleanup failed; surviving pids: ".concat(survivors.map(function (member) { return member.pid; }).join(', ')));
                        }
                        this.settleExitIfGone();
                        this.dataDisposable.dispose();
                        this.exitDisposable.dispose();
                        return [2 /*return*/];
                }
            });
        });
    };
    LocalTerminalHandle.prototype.settleExitIfGone = function () {
        // An externally taskkilled Windows shell may never fire node-pty's exit
        // notification (its console-list agent fails without a parent console),
        // which would leave `done` — and every consumer awaiting it — unsettled
        // forever. Teardown has just verified the shell's absence through the
        // inspector, so a missing exit event is itself the outcome.
        if (this.platform !== 'win32')
            return;
        if (this.exited)
            return;
        /* v8 ignore next -- stopShellWindows() verified the shell is gone or threw;
           the identity re-check is a defensive fence for a future caller. */
        if (this.rootIdentity !== undefined && this.inspector.isAlive(this.rootIdentity))
            return;
        this.exited = true;
        this.output.end();
        this.outcome.resolve({ exitCode: null, signal: null });
    };
    return LocalTerminalHandle;
}());
exports.LocalTerminalHandle = LocalTerminalHandle;
