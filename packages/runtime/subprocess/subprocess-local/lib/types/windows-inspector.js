"use strict";
/**
 * Windows process-table operations for terminal readiness, signalling, and
 * teardown: Toolhelp32 snapshot enumeration with GetProcessTimes creation-time
 * identity and process-handle wait-state liveness, the shell pid as a pseudo
 * process group (Windows has no POSIX groups), and taskkill tree signalling.
 * The koffi bindings load lazily so
 * non-Windows processes never touch Win32 libraries; all decision logic takes
 * an injectable internals boundary so suites can pin it on any host.
 * @module dsh-subprocess-local/windows-inspector
 */
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
exports.WindowsProcessInspector = void 0;
exports.windowsProcessTree = windowsProcessTree;
exports.createWindowsProcessInspector = createWindowsProcessInspector;
exports.isInvalidHandle = isInvalidHandle;
var node_child_process_1 = require("node:child_process");
var koffi_1 = require("koffi");
/**
 * Walk a process table from one root in children-first order, retaining only
 * members whose start identity is readable (unreadable members are detector
 * misses, exactly like an unreadable `/proc` entry on Linux).
 * @param entries - the process table snapshot.
 * @param rootPid - the tree root to descend from.
 * @param started - creation-time identity resolver for one member.
 * @returns the root and its current transitive descendants, children first.
 */
/* jscpd:ignore-start -- the Windows inspector deliberately mirrors process-inspector.ts:
   the decision logic (tree walk, identity fencing, group signalling) is the same contract over
   Win32 primitives, per the persistent-pty note 2026-08-11-pwsh-persistent-pty. */
function windowsProcessTree(entries, rootPid, started) {
    var _a;
    var byPid = new Map(entries.map(function (entry) { return [entry.pid, entry]; }));
    var root = byPid.get(rootPid);
    if (root === undefined)
        return [];
    var byParent = new Map();
    for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
        var entry = entries_1[_i];
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
        var identity = started(entry.pid);
        if (identity !== undefined)
            result.push({ pid: entry.pid, started: identity });
    };
    visit(root);
    return result;
}
/**
 * Windows {@link ProcessInspector}. The shell pid stands in for a foreground
 * process group: it is a stable pseudo-group that lets the prompt-marker
 * readiness path compare foreground identities, while every actual signal
 * targets the console-wide tree through taskkill (SIGINT is delivered by the
 * terminal handle as a `\x03` input write and never reaches this layer).
 */
var WindowsProcessInspector = /** @class */ (function () {
    function WindowsProcessInspector(internals) {
        if (internals === void 0) { internals = defaultWindowsProcessInternals(); }
        this.internals = internals;
    }
    WindowsProcessInspector.prototype.foregroundPgid = function (shellPid) {
        return shellPid;
    };
    WindowsProcessInspector.prototype.isStdinWaiting = function (_pgid) {
        return false;
    };
    WindowsProcessInspector.prototype.processTree = function (rootPid) {
        var _this = this;
        return windowsProcessTree(this.internals.snapshot(), rootPid, function (pid) { var _a; return (_a = _this.internals.processState(pid)) === null || _a === void 0 ? void 0 : _a.started; });
    };
    WindowsProcessInspector.prototype.processSession = function (_sessionId) {
        return [];
    };
    WindowsProcessInspector.prototype.isAlive = function (identity) {
        var state = this.internals.processState(identity.pid);
        return (state === null || state === void 0 ? void 0 : state.active) === true && state.started === identity.started;
    };
    WindowsProcessInspector.prototype.signalGroup = function (pgid, signal) {
        this.internals.taskkill(pgid, signal === 'SIGKILL');
    };
    WindowsProcessInspector.prototype.signalProcess = function (identity, signal) {
        if (this.isAlive(identity))
            this.internals.taskkill(identity.pid, signal === 'SIGKILL');
    };
    return WindowsProcessInspector;
}());
exports.WindowsProcessInspector = WindowsProcessInspector;
/* jscpd:ignore-end */
/**
 * Create the Windows process inspector.
 * @param internals - injectable process operations; defaults to the koffi-backed table.
 * @returns the Windows inspector.
 */
function createWindowsProcessInspector(internals) {
    if (internals === void 0) { internals = defaultWindowsProcessInternals(); }
    return new WindowsProcessInspector(internals);
}
/** Terminate one Windows process tree with taskkill, contained like POSIX group signalling. */
function taskkillTree(pid, force) {
    if (pid <= 0)
        return;
    // Outcome deliberately unchecked: an already-absent tree, exit races, and a
    // missing taskkill binary are as tolerable here as ESRCH is for POSIX.
    (0, node_child_process_1.spawnSync)('taskkill', __spreadArray(['/PID', String(pid), '/T'], (force ? ['/F'] : []), true), { stdio: 'ignore' });
}
/**
 * True for NULL and INVALID_HANDLE_VALUE returns from Win32 handle APIs.
 * @param value - a handle as koffi may hand it back (pointer, null, or 0n).
 * @returns whether the value signals an invalid handle.
 */
function isInvalidHandle(value) {
    if (value === null || value === undefined)
        return true;
    var asBigInt = value;
    return asBigInt === 0n || asBigInt === 0xffffffffffffffffn || asBigInt === -1n;
}
var PVOID = koffi_1.default.pointer('void');
/**
 * Resolve the koffi Win32 struct types once. Registration is lazy and cached
 * because koffi's type registry is global per process: test runners that
 * re-evaluate this module (a hoisted `vi.mock` re-imports the graph) must not
 * re-register the names.
 */
function win32Structs() {
    if (cachedStructs !== undefined)
        return cachedStructs;
    // koffi PROCESSENTRY32W layout (tlhelp32.h); the size assert pins the x64 layout.
    var PROCESSENTRY32W = koffi_1.default.struct('PROCESSENTRY32W', {
        dwSize: 'uint32',
        cntUsage: 'uint32',
        th32ProcessID: 'uint32',
        th32DefaultHeapID: PVOID,
        th32ModuleID: 'uint32',
        cCntThreads: 'uint32',
        th32ParentProcessID: 'uint32',
        pcPriClassBase: 'int32',
        dwFlags: 'uint32',
        szExeFile: koffi_1.default.array('char16', 260),
    });
    // koffi FILETIME layout (minwinbase.h): two 32-bit halves of the 64-bit timestamp.
    var FILETIME = koffi_1.default.struct('FILETIME', {
        dwLowDateTime: 'uint32',
        dwHighDateTime: 'uint32',
    });
    /* v8 ignore start -- a layout-mismatch guard fires only on ABI breakage; the windows-native suites exercise the real struct. */
    if (PROCESSENTRY32W.size !== 568) {
        throw new Error("PROCESSENTRY32W layout mismatch: koffi computed ".concat(PROCESSENTRY32W.size, ", Windows headers say 568"));
    }
    /* v8 ignore stop */
    cachedStructs = { PROCESSENTRY32W: PROCESSENTRY32W, FILETIME: FILETIME };
    return cachedStructs;
}
var cachedStructs;
var TH32CS_SNAPPROCESS = 0x2;
var PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
var SYNCHRONIZE = 0x00100000;
var WAIT_OBJECT_0 = 0;
var WAIT_TIMEOUT = 0x102;
var cachedBindings;
/**
 * Resolve the lazy Win32 bindings (throws the first binding failure, fail-closed).
 * @returns the cached binding table.
 */
function win32Bindings() {
    if (cachedBindings !== undefined)
        return cachedBindings;
    var _a = win32Structs(), PROCESSENTRY32W = _a.PROCESSENTRY32W, FILETIME = _a.FILETIME;
    var kernel32 = koffi_1.default.load('kernel32.dll');
    var bind = function (name, result, args) { return kernel32.func('__stdcall', name, result, args); };
    cachedBindings = {
        createToolhelp32Snapshot: bind('CreateToolhelp32Snapshot', PVOID, ['uint32', 'uint32']),
        process32FirstW: bind('Process32FirstW', 'int', [PVOID, koffi_1.default.pointer(PROCESSENTRY32W)]),
        process32NextW: bind('Process32NextW', 'int', [PVOID, koffi_1.default.pointer(PROCESSENTRY32W)]),
        openProcess: bind('OpenProcess', PVOID, ['uint32', 'int', 'uint32']),
        getProcessTimes: bind('GetProcessTimes', 'int', [
            PVOID,
            koffi_1.default.pointer(FILETIME),
            koffi_1.default.pointer(FILETIME),
            koffi_1.default.pointer(FILETIME),
            koffi_1.default.pointer(FILETIME),
        ]),
        waitForSingleObject: bind('WaitForSingleObject', 'uint32', [PVOID, 'uint32']),
        closeHandle: bind('CloseHandle', 'int', [PVOID]),
    };
    return cachedBindings;
}
/**
 * Allocate koffi memory as a branded {@link NativePtr}; koffi's TS types are
 * `any`, so the cast goes through `unknown` to keep the unsafe surface here.
 * @param type - the koffi type to allocate.
 * @param count - element count.
 * @returns the branded allocation pointer.
 */
function allocNative(type, count) {
    var value = koffi_1.default.alloc(type, count);
    return value;
}
/** Enumerate the current process table through Toolhelp32. */
function snapshotWindowsProcesses(bindings) {
    var PROCESSENTRY32W = win32Structs().PROCESSENTRY32W;
    var snapshot = bindings.createToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    /* v8 ignore next -- an invalid snapshot for the process flag is not producible through the public API;
       the guard mirrors POSIX's unreadable-proc tolerance and isInvalidHandle is unit-tested. */
    if (isInvalidHandle(snapshot))
        return [];
    var entries = [];
    try {
        var entry = allocNative(PROCESSENTRY32W, 1);
        koffi_1.default.encode(entry, 'uint32', PROCESSENTRY32W.size);
        var ok = bindings.process32FirstW(snapshot, entry);
        while (ok !== 0) {
            var record = koffi_1.default.decode(entry, PROCESSENTRY32W);
            entries.push({ pid: record.th32ProcessID, parentPid: record.th32ParentProcessID });
            ok = bindings.process32NextW(snapshot, entry);
        }
    }
    finally {
        bindings.closeHandle(snapshot);
    }
    return entries;
}
/** Read one process's creation identity and current wait state. */
function windowsProcessState(bindings, pid) {
    var FILETIME = win32Structs().FILETIME;
    var handle = bindings.openProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, 0, pid);
    if (isInvalidHandle(handle))
        return undefined;
    try {
        var creation = allocNative(FILETIME, 1);
        var exit = allocNative(FILETIME, 1);
        var kernel = allocNative(FILETIME, 1);
        var user = allocNative(FILETIME, 1);
        /* v8 ignore next -- a GetProcessTimes failure after a successful open races process exit and
           cannot be staged deterministically; the absent-process path is covered and the caller
           treats undefined as a detector miss. */
        if (bindings.getProcessTimes(handle, creation, exit, kernel, user) === 0)
            return undefined;
        var record = koffi_1.default.decode(creation, FILETIME);
        var wait = bindings.waitForSingleObject(handle, 0);
        /* v8 ignore next -- an opened process handle has exactly one of these two
           zero-time wait states; an unexpected Win32 failure is an unreadable process. */
        if (wait !== WAIT_OBJECT_0 && wait !== WAIT_TIMEOUT)
            return undefined;
        return {
            started: "".concat(record.dwHighDateTime, ":").concat(record.dwLowDateTime),
            active: wait === WAIT_TIMEOUT,
        };
    }
    finally {
        bindings.closeHandle(handle);
    }
}
/** The koffi-backed default internals; bindings resolve lazily on first use. */
function defaultWindowsProcessInternals() {
    return {
        snapshot: function () { return snapshotWindowsProcesses(win32Bindings()); },
        processState: function (pid) { return windowsProcessState(win32Bindings(), pid); },
        taskkill: taskkillTree,
    };
}
