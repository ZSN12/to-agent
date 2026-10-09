"use strict";
/** Platform process-table inspection for terminal readiness, signals, and teardown. */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseProcStat = parseProcStat;
exports.linuxProcessGroupHasLiveMembers = linuxProcessGroupHasLiveMembers;
exports.createProcessInspector = createProcessInspector;
var node_fs_1 = require("node:fs");
var node_child_process_1 = require("node:child_process");
var windows_inspector_ts_1 = require("./windows-inspector.ts");
/* v8 ignore start -- thin OS bindings; injected logic is unit-tested and real platform composition exercises them. */
var DEFAULT_INTERNALS = {
    readFile: function (path) { return (0, node_fs_1.readFileSync)(path, 'utf8'); },
    readDir: function (path) { return (0, node_fs_1.readdirSync)(path); },
    open: function (path) { return (0, node_fs_1.openSync)(path, 'r'); },
    read: function (fd, buffer, length, position) { return (0, node_fs_1.readSync)(fd, buffer, 0, length, position); },
    close: node_fs_1.closeSync,
    exec: function (file, args) { return (0, node_child_process_1.execFileSync)(file, args, { encoding: 'utf8' }); },
    kill: function (pid, signal) { return process.kill(pid, signal); },
};
/**
 * Parse fields used from Linux `/proc/<pid>/stat`, including parenthesized comm text.
 * @param text - complete stat line.
 * @returns Parsed identity/group fields, or undefined for malformed input.
 */
function parseProcStat(text) {
    var open = text.indexOf('(');
    var close = text.lastIndexOf(')');
    if (open <= 0 || close <= open)
        return undefined;
    var pid = Number(text.slice(0, open).trim());
    var rest = text.slice(close + 2).trim().split(/\s+/);
    var state = rest[0] || '';
    var parentPid = Number(rest[1]);
    var pgrp = Number(rest[2]);
    var session = Number(rest[3]);
    var tpgid = Number(rest[5]);
    var started = rest[19];
    if (![pid, parentPid, pgrp, session, tpgid].every(Number.isSafeInteger)
        || state.length !== 1 || started === undefined)
        return undefined;
    return { pid: pid, parentPid: parentPid, pgrp: pgrp, session: session, state: state, tpgid: tpgid, started: started };
}
function readLinuxStat(internals, pid) {
    try {
        return parseProcStat(internals.readFile("/proc/".concat(pid, "/stat")));
    }
    catch (_unreadableProcEntry) {
        return undefined;
    }
}
/**
 * Report whether a Linux process group has an executing member. `false`
 * means the group contains only zombie/dead entries; `undefined` means the
 * process table could not prove either outcome.
 * @param processGroupId - POSIX process-group id to inspect.
 * @param internals - injectable process-table operations.
 * @returns Live-member presence, or `undefined` when unavailable/absent.
 */
function linuxProcessGroupHasLiveMembers(processGroupId, internals) {
    if (internals === void 0) { internals = DEFAULT_INTERNALS; }
    var entries;
    try {
        entries = internals.readDir('/proc');
    }
    catch (_unreadableProcDirectory) {
        return undefined;
    }
    var matched = false;
    for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
        var entry = entries_1[_i];
        if (!/^\d+$/.test(entry))
            continue;
        var stat = readLinuxStat(internals, Number(entry));
        if ((stat === null || stat === void 0 ? void 0 : stat.pgrp) !== processGroupId)
            continue;
        matched = true;
        if (!/^[ZXx]$/.test(stat.state))
            return true;
    }
    return matched ? false : undefined;
}
function numericEntries(internals, path) {
    try {
        return internals.readDir(path).filter(function (entry) { return /^\d+$/.test(entry); }).map(Number);
    }
    catch (_unreadableProcDirectory) {
        return [];
    }
}
function readSyscall(internals, pid, tid) {
    try {
        var text = internals.readFile("/proc/".concat(pid, "/task/").concat(tid, "/syscall")).trim();
        if (text === 'running' || text.startsWith('-1 '))
            return undefined;
        var fields = text.split(/\s+/);
        var number = Number(fields[0]);
        var args = fields.slice(1, 7).map(function (field) { return Number.parseInt(field, 16); });
        if (!Number.isSafeInteger(number) || args.some(function (value) { return !Number.isSafeInteger(value); }))
            return undefined;
        return { number: number, args: args };
    }
    catch (_unreadableSyscall) {
        return undefined;
    }
}
function readMemory(internals, pid, address, length) {
    var fd;
    try {
        fd = internals.open("/proc/".concat(pid, "/mem"));
        var buffer = Buffer.alloc(length);
        var count = internals.read(fd, buffer, length, address);
        return buffer.subarray(0, count);
    }
    catch (_unreadableProcessMemory) {
        return undefined;
    }
    finally {
        if (fd !== undefined)
            internals.close(fd);
    }
}
function fdSetHasStdin(internals, pid, address) {
    var _a, _b;
    return address !== 0 && ((_b = (_a = readMemory(internals, pid, address, 8)) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : 0) % 2 === 1;
}
function pollHasStdin(internals, pid, address, count) {
    if (address === 0 || count <= 0)
        return false;
    var memory = readMemory(internals, pid, address, Math.min(count, 1024) * 8);
    if (memory === undefined)
        return false;
    for (var offset = 0; offset + 8 <= memory.length; offset += 8) {
        if (memory.readInt32LE(offset) === 0 && (memory.readInt16LE(offset + 4) & 0x001) !== 0)
            return true;
    }
    return false;
}
function epollHasStdin(internals, pid, epfd) {
    try {
        return internals.readFile("/proc/".concat(pid, "/fdinfo/").concat(epfd))
            .split('\n')
            .some(function (line) { return /^tfd:\s+0\b/.test(line.trim()); });
    }
    catch (_unreadableFdInfo) {
        return false;
    }
}
var SYSCALLS = {
    x64: { read: 0, select: 23, pselect: 270, poll: 7, ppoll: 271, epollWait: 232, epollPwait: 281 },
    arm64: { read: 63, pselect: 72, ppoll: 73, epollPwait: 22 },
};
function syscallWaitsOnStdin(internals, pid, syscall, table) {
    var _a = syscall.args, _b = _a[0], a0 = _b === void 0 ? 0 : _b, _c = _a[1], a1 = _c === void 0 ? 0 : _c, _d = _a[2], a2 = _d === void 0 ? 0 : _d;
    if (syscall.number === table.read)
        return a0 === 0;
    if (syscall.number === table.select || syscall.number === table.pselect) {
        return a0 >= 1 && fdSetHasStdin(internals, pid, a1);
    }
    if (syscall.number === table.poll || syscall.number === table.ppoll) {
        return a1 >= 1 && pollHasStdin(internals, pid, a0, a1);
    }
    if (syscall.number === table.epollWait || syscall.number === table.epollPwait) {
        return a2 >= 1 && epollHasStdin(internals, pid, a0);
    }
    return false;
}
var PosixProcessInspector = /** @class */ (function () {
    function PosixProcessInspector(internals) {
        this.internals = internals;
    }
    PosixProcessInspector.prototype.signalGroup = function (pgid, signal) {
        this.internals.kill(-pgid, signal);
    };
    PosixProcessInspector.prototype.signalProcess = function (identity, signal) {
        if (this.isAlive(identity))
            this.internals.kill(identity.pid, signal);
    };
    return PosixProcessInspector;
}());
function processTree(entries, rootPid) {
    var _a;
    var byPid = new Map(entries.map(function (entry) { return [entry.pid, entry]; }));
    var root = byPid.get(rootPid);
    if (root === undefined)
        return [];
    var byParent = new Map();
    for (var _i = 0, entries_2 = entries; _i < entries_2.length; _i++) {
        var entry = entries_2[_i];
        var children = (_a = byParent.get(entry.parentPid)) !== null && _a !== void 0 ? _a : [];
        children.push(entry);
        byParent.set(entry.parentPid, children);
    }
    var visited = new Set();
    var result = [];
    var visit = function (entry) {
        var _a;
        if (visited.has(entry.pid))
            return;
        visited.add(entry.pid);
        for (var _i = 0, _b = (_a = byParent.get(entry.pid)) !== null && _a !== void 0 ? _a : []; _i < _b.length; _i++) {
            var child = _b[_i];
            visit(child);
        }
        result.push({ pid: entry.pid, started: entry.started });
    };
    visit(root);
    return result;
}
var LinuxProcessInspector = /** @class */ (function (_super) {
    __extends(LinuxProcessInspector, _super);
    function LinuxProcessInspector(arch, internals) {
        var _this = _super.call(this, internals) || this;
        _this.arch = arch;
        return _this;
    }
    LinuxProcessInspector.prototype.foregroundPgid = function (shellPid) {
        var _a;
        var tpgid = (_a = readLinuxStat(this.internals, shellPid)) === null || _a === void 0 ? void 0 : _a.tpgid;
        return tpgid !== undefined && tpgid > 0 ? tpgid : undefined;
    };
    LinuxProcessInspector.prototype.isStdinWaiting = function (pgid) {
        var _a;
        var table = SYSCALLS[this.arch];
        if (table === undefined)
            return false;
        for (var _i = 0, _b = numericEntries(this.internals, '/proc'); _i < _b.length; _i++) {
            var pid = _b[_i];
            if (((_a = readLinuxStat(this.internals, pid)) === null || _a === void 0 ? void 0 : _a.pgrp) !== pgid)
                continue;
            for (var _c = 0, _d = numericEntries(this.internals, "/proc/".concat(pid, "/task")); _c < _d.length; _c++) {
                var tid = _d[_c];
                var syscall = readSyscall(this.internals, pid, tid);
                if (syscall !== undefined && syscallWaitsOnStdin(this.internals, pid, syscall, table))
                    return true;
            }
        }
        return false;
    };
    LinuxProcessInspector.prototype.processTree = function (rootPid) {
        var _this = this;
        var entries = numericEntries(this.internals, '/proc').flatMap(function (pid) {
            var stat = readLinuxStat(_this.internals, pid);
            return stat === undefined ? [] : [{ pid: pid, parentPid: stat.parentPid, started: stat.started }];
        });
        return processTree(entries, rootPid);
    };
    LinuxProcessInspector.prototype.processSession = function (sessionId) {
        var _this = this;
        return numericEntries(this.internals, '/proc').flatMap(function (pid) {
            var stat = readLinuxStat(_this.internals, pid);
            return (stat === null || stat === void 0 ? void 0 : stat.session) === sessionId ? [{ pid: pid, started: stat.started }] : [];
        });
    };
    LinuxProcessInspector.prototype.isAlive = function (identity) {
        var stat = readLinuxStat(this.internals, identity.pid);
        return (stat === null || stat === void 0 ? void 0 : stat.started) === identity.started && !/^[ZXx]$/.test(stat.state);
    };
    return LinuxProcessInspector;
}(PosixProcessInspector));
function macProcessTable(internals) {
    return internals.exec('/bin/ps', ['-axo', 'pid=,ppid=,lstart=']).split('\n').flatMap(function (line) {
        var match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
        if ((match === null || match === void 0 ? void 0 : match[1]) === undefined || match[2] === undefined || match[3] === undefined)
            return [];
        return [{ pid: Number(match[1]), parentPid: Number(match[2]), started: match[3] }];
    });
}
var MacProcessInspector = /** @class */ (function (_super) {
    __extends(MacProcessInspector, _super);
    function MacProcessInspector() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    MacProcessInspector.prototype.foregroundPgid = function (shellPid) {
        try {
            var value = Number(this.internals.exec('/bin/ps', ['-o', 'tpgid=', '-p', String(shellPid)]).trim());
            return Number.isSafeInteger(value) && value > 0 ? value : undefined;
        }
        catch (_missingProcess) {
            return undefined;
        }
    };
    MacProcessInspector.prototype.isStdinWaiting = function (_pgid) {
        return false;
    };
    MacProcessInspector.prototype.processTree = function (rootPid) {
        return processTree(macProcessTable(this.internals), rootPid);
    };
    MacProcessInspector.prototype.processSession = function (_sessionId) {
        return [];
    };
    MacProcessInspector.prototype.isAlive = function (identity) {
        return macProcessTable(this.internals).some(function (entry) { return entry.pid === identity.pid && entry.started === identity.started; });
    };
    return MacProcessInspector;
}(PosixProcessInspector));
/**
 * Create the supported platform inspector or fail at plugin load.
 * @param platform - target Node platform.
 * @param arch - target CPU architecture for Linux syscall numbers.
 * @param internals - filesystem/process boundary, injectable for deterministic tests.
 * @returns Platform process inspector.
 */
function createProcessInspector(platform, arch, internals) {
    if (platform === void 0) { platform = process.platform; }
    if (arch === void 0) { arch = process.arch; }
    if (internals === void 0) { internals = DEFAULT_INTERNALS; }
    if (platform === 'linux')
        return new LinuxProcessInspector(arch, internals);
    if (platform === 'darwin')
        return new MacProcessInspector(internals);
    if (platform === 'win32')
        return (0, windows_inspector_ts_1.createWindowsProcessInspector)();
    throw new Error("subprocess-local: terminal inspection is unsupported on platform ".concat(platform));
}
