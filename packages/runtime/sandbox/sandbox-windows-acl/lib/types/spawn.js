"use strict";
/**
 * Restricted-process spawning: anonymous pipes for stdio, STARTUPINFOW with
 * STARTF_USESTDHANDLES, CreateProcessAsUserW under the restricted token, then
 * asynchronous pipe draining and exit waiting. Console isolation
 * (CREATE_NO_WINDOW / CREATE_NEW_CONSOLE) is intentionally absent: under this
 * restriction scheme hidden-console children die with STATUS_DLL_INIT_FAILED
 * (0xC0000142) — verified empirically, see win32-abi.ts. Stdio redirection is
 * pipe-based and unaffected; the child shares the host console.
 * @module @z/dsh-sandbox-windows-acl/spawn
 */
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
exports.quoteArg = quoteArg;
exports.buildCommandLine = buildCommandLine;
exports.spawnSandboxed = spawnSandboxed;
exports.drainPipe = drainPipe;
exports.waitForExit = waitForExit;
exports.spawnSandboxedInherited = spawnSandboxedInherited;
var ffi_ts_1 = require("./ffi.ts");
var abi = require("./win32-abi.ts");
/**
 * Quote one argument per the CommandLineToArgvW parsing rules: backslashes
 * are doubled only before a quote character — including the closing quote
 * this function appends, so a trailing backslash run is doubled as well
 * (otherwise an odd run would escape the closing quote into a literal
 * character and corrupt the rest of the command line). Mirrors the CRT
 * ArgvQuote behavior Microsoft documents for command-line arguments.
 * @param argument - one argv entry to quote.
 * @returns the quoted entry (bare when quoting is unnecessary).
 */
function quoteArg(argument) {
    if (argument === '')
        return '""';
    if (!/[\s"]/u.test(argument))
        return argument;
    var quoted = '"';
    for (var index = 0; index < argument.length; index++) {
        var backslashes = 0;
        while (index < argument.length && argument.charAt(index) === '\\') {
            backslashes++;
            index++;
        }
        if (index === argument.length) {
            // Trailing backslash run: doubled so it cannot escape the closing quote.
            quoted += '\\'.repeat(backslashes * 2);
        }
        else if (argument.charAt(index) === '"') {
            quoted += '\\'.repeat(backslashes * 2 + 1) + '"';
        }
        else {
            quoted += '\\'.repeat(backslashes) + argument.charAt(index);
        }
    }
    return quoted + '"';
}
/**
 * Build the single command line CreateProcess parses from program + argv.
 * @param program - the executable (argv[0]).
 * @param args - the remaining argv entries.
 * @returns the joined, quoted command line.
 */
function buildCommandLine(program, args) {
    return __spreadArray([program], args, true).map(quoteArg).join(' ');
}
function createPipe(api) {
    var readSlot = (0, ffi_ts_1.allocPtrSlot)();
    var writeSlot = (0, ffi_ts_1.allocPtrSlot)();
    if (api.createPipe(readSlot, writeSlot, null, 0) === 0)
        (0, ffi_ts_1.throwLastError)(api, 'CreatePipe');
    var read = (0, ffi_ts_1.decodePtr)(readSlot);
    var write = (0, ffi_ts_1.decodePtr)(writeSlot);
    if (read === null || write === null)
        (0, ffi_ts_1.throwLastError)(api, 'CreatePipe', 'null pipe handle');
    return { read: read, write: write };
}
function setInheritable(api, handle, label) {
    if (api.setHandleInformation(handle, abi.HANDLE_FLAG_INHERIT, abi.HANDLE_FLAG_INHERIT) === 0) {
        (0, ffi_ts_1.throwLastError)(api, 'SetHandleInformation', label);
    }
}
/**
 * Create a process under the restricted token with piped stdio. The child's
 * stdin is closed immediately (EOF), matching the POC; stdout/stderr read ends
 * are returned for draining. The child inherits the caller's environment block
 * (lpEnvironment NULL); the caller rewrites entries through
 * SetEnvironmentVariableW before spawning (the runner's per-session temp
 * contract) — passing an explicit block through koffi trips
 * ERROR_INVALID_PARAMETER in CreateProcessAsUserW (verified empirically).
 * @param api - the binding table.
 * @param token - the restricted token the child runs under.
 * @param options - command, args, and working directory.
 * @returns the spawned child's handles.
 */
function spawnSandboxed(api, token, options) {
    var stdIn = createPipe(api);
    var stdOut = createPipe(api);
    var stdErr = createPipe(api);
    // Child side of each pipe must be inheritable (POC lines 262-268).
    setInheritable(api, stdIn.read, 'stdin read end');
    setInheritable(api, stdOut.write, 'stdout write end');
    setInheritable(api, stdErr.write, 'stderr write end');
    var startupInfo = (0, ffi_ts_1.allocStartupInfo)();
    (0, ffi_ts_1.encodeStartupInfo)(startupInfo, {
        cb: abi.STARTUPINFOW_SIZE,
        dwFlags: abi.STARTF_USESTDHANDLES,
        hStdInput: stdIn.read,
        hStdOutput: stdOut.write,
        hStdError: stdErr.write,
    });
    var processInfo = (0, ffi_ts_1.allocProcessInfo)();
    var commandLine = buildCommandLine(options.command, options.args);
    var created = api.createProcessAsUserW(token, null, commandLine, null, null, 1, // bInheritHandles: required for redirection
    0, // no creation flags: suspended/no-window variants are unusable under the restriction
    null, options.cwd, startupInfo, processInfo);
    // Capture the failure before CloseHandle calls clobber GetLastError, then
    // close every pipe handle created so far — the six-close contract this test
    // surface pins (tests/failure-paths.spec.ts).
    if (created === 0) {
        var win32Code = api.getLastError();
        api.closeHandle(stdIn.read);
        api.closeHandle(stdIn.write);
        api.closeHandle(stdOut.read);
        api.closeHandle(stdOut.write);
        api.closeHandle(stdErr.read);
        api.closeHandle(stdErr.write);
        (0, ffi_ts_1.throwWin32)(api, 'CreateProcessAsUserW', win32Code, "command: ".concat(options.command, ", cwd: ").concat(options.cwd));
    }
    var info = (0, ffi_ts_1.decodeProcessInfo)(processInfo);
    var processHandle = info.hProcess;
    var threadHandle = info.hThread;
    if (processHandle === null || threadHandle === null) {
        throw new Error("CreateProcessAsUserW succeeded but returned null process/thread handles (pid ".concat(info.dwProcessId, ")"));
    }
    // Host-side cleanup: child handles are now duplicated in the child; the
    // host closes its copies so ReadFile sees EOF when the child exits.
    api.closeHandle(stdIn.read);
    api.closeHandle(stdOut.write);
    api.closeHandle(stdErr.write);
    api.closeHandle(stdIn.write);
    api.closeHandle(threadHandle);
    return {
        pid: info.dwProcessId,
        process: processHandle,
        stdoutRead: stdOut.read,
        stderrRead: stdErr.read,
    };
}
/**
 * Drain one pipe read end to a Buffer via non-blocking PeekNamedPipe polling.
 * @param api - the binding table.
 * @param handle - the pipe read end to drain (closed when done).
 * @returns the complete pipe contents.
 */
function drainPipe(api, handle) {
    return __awaiter(this, void 0, void 0, function () {
        var chunks, bytesReadSlot, totalAvailSlot, leftThisMessageSlot, peeked, win32Code, available, chunk, readSlot;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    chunks = [];
                    _a.label = 1;
                case 1:
                    bytesReadSlot = (0, ffi_ts_1.allocUint32)();
                    totalAvailSlot = (0, ffi_ts_1.allocUint32)();
                    leftThisMessageSlot = (0, ffi_ts_1.allocUint32)();
                    peeked = api.peekNamedPipe(handle, null, 0, bytesReadSlot, totalAvailSlot, leftThisMessageSlot);
                    if (peeked === 0) {
                        win32Code = api.getLastError();
                        if (win32Code === abi.ERROR_BROKEN_PIPE || win32Code === abi.ERROR_NO_DATA)
                            return [3 /*break*/, 4]; // child closed its end: clean EOF
                        (0, ffi_ts_1.throwLastError)(api, 'PeekNamedPipe', "drain failure after ".concat(chunks.length, " chunk(s)"));
                    }
                    available = (0, ffi_ts_1.decodeUint32)(totalAvailSlot);
                    if (available > 0) {
                        chunk = Buffer.alloc(available);
                        readSlot = (0, ffi_ts_1.allocUint32)();
                        if (api.readFile(handle, chunk, chunk.length, readSlot, null) === 0) {
                            (0, ffi_ts_1.throwLastError)(api, 'ReadFile', "drain failure after ".concat(chunks.length, " chunk(s)"));
                        }
                        chunks.push(chunk.subarray(0, (0, ffi_ts_1.decodeUint32)(readSlot)));
                    }
                    // Small backoff instead of setImmediate: a bare next-tick would busy-poll
                    // the pipe at full event-loop speed while the child produces no output.
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1); })];
                case 2:
                    // Small backoff instead of setImmediate: a bare next-tick would busy-poll
                    // the pipe at full event-loop speed while the child produces no output.
                    _a.sent();
                    _a.label = 3;
                case 3: return [3 /*break*/, 1];
                case 4:
                    api.closeHandle(handle);
                    return [2 /*return*/, Buffer.concat(chunks)];
            }
        });
    });
}
/**
 * Wait for process exit and return its exit code. Call only after both drains
 * have resolved — the drains finish when the child closed its pipe ends, i.e.
 * the child has already exited, so this wait returns immediately. Calling it
 * earlier would block the event loop and starve the drains (the pipe-buffer
 * deadlock the POC comments warn about).
 * @param api - the binding table.
 * @param process - the child process handle (closed when done).
 * @returns the child's exit code.
 */
function waitForExit(api, process) {
    var waitResult = api.waitForSingleObject(process, abi.INFINITE);
    if (waitResult === 0xFFFFFFFF)
        (0, ffi_ts_1.throwLastError)(api, 'WaitForSingleObject');
    var exitCodeSlot = (0, ffi_ts_1.allocUint32)();
    if (api.getExitCodeProcess(process, exitCodeSlot) === 0)
        (0, ffi_ts_1.throwLastError)(api, 'GetExitCodeProcess');
    api.closeHandle(process);
    return (0, ffi_ts_1.decodeUint32)(exitCodeSlot);
}
/**
 * Create a kill-on-close job object (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE at
 * LimitFlags offset 16 of JOBOBJECT_EXTENDED_LIMIT_INFORMATION, layout
 * verified by abi-probe.cpp). When the caller dies with the job handle open,
 * Windows terminates every process in the job — the orphan-child backstop.
 * The caller keeps the returned handle open for the child's lifetime.
 */
function createKillOnCloseJob(api) {
    var job = api.createJobObjectW(null, null);
    if ((0, ffi_ts_1.isNullPtr)(job))
        (0, ffi_ts_1.throwLastError)(api, 'CreateJobObjectW');
    var information = Buffer.alloc(abi.JOBOBJECT_EXTENDED_LIMIT_SIZE);
    information.writeUInt32LE(abi.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, abi.JOBOBJECT_EXTENDED_LIMIT_FLAGS_OFFSET);
    if (api.setInformationJobObject(job, abi.JobObjectExtendedLimitInformation, information, information.length) === 0) {
        var win32Code = api.getLastError();
        api.closeHandle(job);
        (0, ffi_ts_1.throwWin32)(api, 'SetInformationJobObject', win32Code);
    }
    return job;
}
/**
 * Create a process under the restricted token whose stdio passes straight
 * through to the caller's pipes. This is the runner shape: the harness spawns
 * the runner with piped stdio, and the runner's confined child writes to
 * those same pipes.
 *
 * Node clears the inheritability of its stdio handles at startup
 * (uv_disable_stdio_inheritance), so raw spawns must re-enable the inherit
 * bit around the call (libuv instead duplicates the handles; re-enabling is
 * equivalent here and cheaper) and pass them explicitly via
 * STARTF_USESTDHANDLES — otherwise the child receives INVALID std handles
 * ("The handle is invalid", verified the hard way). The child starts
 * suspended so it can be assigned to a kill-on-close job before it runs.
 * @param api - the binding table.
 * @param token - the restricted token the child runs under.
 * @param options - command, args, and working directory.
 * @returns the spawned child's handles and job.
 */
function spawnSandboxedInherited(api, token, options) {
    var job = createKillOnCloseJob(api);
    var stdIn = api.getStdHandle(abi.STD_INPUT_HANDLE);
    var stdOut = api.getStdHandle(abi.STD_OUTPUT_HANDLE);
    var stdErr = api.getStdHandle(abi.STD_ERROR_HANDLE);
    if ((0, ffi_ts_1.isNullPtr)(stdIn) || (0, ffi_ts_1.isNullPtr)(stdOut) || (0, ffi_ts_1.isNullPtr)(stdErr)) {
        api.closeHandle(job);
        (0, ffi_ts_1.throwLastError)(api, 'GetStdHandle', 'null standard handle');
    }
    var makeInheritable = function (handle, label) {
        if (api.setHandleInformation(handle, abi.HANDLE_FLAG_INHERIT, abi.HANDLE_FLAG_INHERIT) === 0) {
            (0, ffi_ts_1.throwLastError)(api, 'SetHandleInformation', "".concat(label, " (enable inherit)"));
        }
    };
    var restoreInherit = function (handle) {
        // Best-effort hygiene: the runner spawns nothing else; failures here must
        // not mask the child outcome, so the result is deliberately unchecked.
        api.setHandleInformation(handle, abi.HANDLE_FLAG_INHERIT, 0);
    };
    makeInheritable(stdIn, 'stdin');
    makeInheritable(stdOut, 'stdout');
    makeInheritable(stdErr, 'stderr');
    var startupInfo = (0, ffi_ts_1.allocStartupInfo)();
    (0, ffi_ts_1.encodeStartupInfo)(startupInfo, {
        cb: abi.STARTUPINFOW_SIZE,
        dwFlags: abi.STARTF_USESTDHANDLES,
        hStdInput: stdIn,
        hStdOutput: stdOut,
        hStdError: stdErr,
    });
    var processInfo = (0, ffi_ts_1.allocProcessInfo)();
    var commandLine = buildCommandLine(options.command, options.args);
    var created = api.createProcessAsUserW(token, null, commandLine, null, null, 1, // bInheritHandles: the re-enabled std handles must be inheritable
    abi.CREATE_SUSPENDED, // suspended so job assignment precedes any execution
    null, options.cwd, startupInfo, processInfo);
    restoreInherit(stdIn);
    restoreInherit(stdOut);
    restoreInherit(stdErr);
    if (created === 0) {
        var win32Code = api.getLastError();
        api.closeHandle(job);
        (0, ffi_ts_1.throwWin32)(api, 'CreateProcessAsUserW', win32Code, "command: ".concat(options.command, ", cwd: ").concat(options.cwd));
    }
    var info = (0, ffi_ts_1.decodeProcessInfo)(processInfo);
    var processHandle = info.hProcess;
    var threadHandle = info.hThread;
    if (processHandle === null || threadHandle === null) {
        api.closeHandle(job);
        throw new Error("CreateProcessAsUserW succeeded but returned null process/thread handles (pid ".concat(info.dwProcessId, ")"));
    }
    if (api.assignProcessToJobObject(job, processHandle) === 0) {
        // The child was created suspended and is NOT in the kill-on-close job:
        // closing handles would leave it suspended forever. Terminate it first,
        // then drop the handles and throw.
        var win32Code = api.getLastError();
        api.terminateProcess(processHandle, 1);
        api.closeHandle(threadHandle);
        api.closeHandle(processHandle);
        api.closeHandle(job);
        (0, ffi_ts_1.throwWin32)(api, 'AssignProcessToJobObject', win32Code, "pid ".concat(info.dwProcessId));
    }
    if (api.resumeThread(threadHandle) === 0xFFFFFFFF) {
        // Closing the job triggers kill-on-close, so the suspended child dies
        // instead of hanging until this process exits; the process/thread handles
        // must go too.
        var win32Code = api.getLastError();
        api.closeHandle(threadHandle);
        api.closeHandle(processHandle);
        api.closeHandle(job);
        (0, ffi_ts_1.throwWin32)(api, 'ResumeThread', win32Code, "pid ".concat(info.dwProcessId));
    }
    api.closeHandle(threadHandle);
    return { pid: info.dwProcessId, process: processHandle, job: job };
}
