"use strict";
/**
 * The windows-acl confinement runner: the argv-prefix wrapper the sandbox
 * seam spawns in place of the caller's command. It creates the
 * WRITE_RESTRICTED token with the workspace write-SID allowlist, spawns the
 * wrapped argv under it with the CALLER'S stdio inherited (bytes flow
 * straight through), mirrors the child's exit code, and revokes its temp
 * grant on exit (workspace ACEs stay standing as the reuse cache).
 *
 * Stable argv contract (the seam builds it; a native-exe replacement would
 * keep the same contract):
 *   [node, runner.js, '--workspace', <dir>, '--temp', <dir>,
 *    '--mode', <read-only|workspace-write>,
 *    ['--write-sid', <S-1-4-…>,
 *     '--temp-write-sid', <S-1-4-…>], '--', <argv...>]
 *
 * Modes:
 *  - workspace-write: the workspace and temp directories carry distinct
 *    capability-SID Write grants; other ACL-addressable writes are denied
 *    except for the documented Everyone and hard-link boundaries.
 *  - read-only: no capability-SID grants; the restricting list carries no
 *    capability SID, so a standing grant ACE from an earlier
 *    workspace-write period stays inert. BOTH modes drop Authenticated Users
 *    (CIM unavailable — documented in README) and INTERACTIVE/LOCAL (the
 *    Public tree writes are denied); the two lists share the keep-alive group
 *    (logon SID, EVERYONE) and differ only by the capabilities.
 *
 * `--write-sid` + `--temp-write-sid`: the seam's grant contract — the
 * CALLER has already materialized distinct workspace and private-temp ACEs
 * and owns their revocation, so the runner neither grants nor revokes
 * (`manageDacls: false`). Both values are checked against their owning paths.
 * Without the pair (standalone/agentless use), workspace-write treats
 * `--temp` as a ROOT, creates a random private child directory, derives its
 * own temp SID, and removes that directory after the child exits. In both
 * flows the runner rewrites TMP/TEMP in its OWN environment to the private
 * directory before spawning; the child inherits that block (`lpEnvironment`
 * NULL; an explicit block through koffi trips ERROR_INVALID_PARAMETER in
 * CreateProcessAsUserW, verified empirically). Read-only leaves the ambient
 * temp entries untouched (writes there are denied anyway).
 *
 * Failure contract: every runner-side failure (bad args, missing
 * directories, token/grant/spawn errors) prints `windows-acl-run: <detail>`
 * to stderr and exits 127 — the seam's RUNNER_FAILURE_RULES matches that
 * signature. The child is NEVER spawned unrestricted.
 * @module @z/dsh-sandbox-windows-acl/runner
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
Object.defineProperty(exports, "__esModule", { value: true });
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var ffi_ts_1 = require("./ffi.ts");
var index_ts_1 = require("./index.ts");
var workspace_sid_ts_1 = require("./workspace-sid.ts");
var RUNNER_SIGNATURE = 'windows-acl-run';
var RUNNER_FAILURE_EXIT = 127;
var RunnerFailure = /** @class */ (function (_super) {
    __extends(RunnerFailure, _super);
    function RunnerFailure() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return RunnerFailure;
}(Error));
/** Print the runner-failure signature line and unwind. */
function fail(detail) {
    process.stderr.write("".concat(RUNNER_SIGNATURE, ": ").concat(detail, "\n"));
    throw new RunnerFailure(detail);
}
function parseArgs(raw) {
    var workspace;
    var temp;
    var mode;
    var writeSid;
    var parsedTempWriteSid;
    var index = 0;
    for (; index < raw.length; index++) {
        var token = raw[index];
        if (token === '--') {
            index++;
            break;
        }
        index++;
        var value = raw[index];
        if (value === undefined)
            fail("missing value after ".concat(token));
        switch (token) {
            case '--workspace':
                workspace = value;
                break;
            case '--temp':
                temp = value;
                break;
            case '--mode':
                mode = value;
                break;
            case '--write-sid':
                writeSid = value;
                break;
            case '--temp-write-sid':
                parsedTempWriteSid = value;
                break;
            default: fail("unknown argument: ".concat(token));
        }
    }
    if (workspace === undefined)
        fail('missing --workspace');
    if (temp === undefined)
        fail('missing --temp');
    if (mode !== 'read-only' && mode !== 'workspace-write')
        fail("unknown mode: ".concat(String(mode)));
    var argv = raw.slice(index);
    var command = argv[0];
    if (command === undefined)
        fail('missing command after --');
    return { workspace: workspace, temp: temp, mode: mode, writeSid: writeSid, tempWriteSid: parsedTempWriteSid, command: command, args: argv.slice(1) };
}
function requireDirectory(label, path) {
    if (!(0, node_fs_1.existsSync)(path) || !(0, node_fs_1.statSync)(path).isDirectory()) {
        fail("".concat(label, " is not an existing directory: ").concat(path));
    }
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var parsed, seamManaged, api, ownedTempDir, sandbox, initialized, privateTempDir, writeSid, privateTempSid, child, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    parsed = parseArgs(process.argv.slice(2));
                    // Both directories are validated in both modes: a provider bug that passes
                    // a bogus root must fail loudly at the runner boundary, never mid-child.
                    requireDirectory('--workspace', parsed.workspace);
                    requireDirectory('--temp', parsed.temp);
                    seamManaged = parsed.writeSid !== undefined || parsed.tempWriteSid !== undefined;
                    if (parsed.mode === 'read-only' && seamManaged) {
                        fail('read-only does not accept --write-sid or --temp-write-sid');
                    }
                    if (parsed.mode === 'workspace-write' && (parsed.writeSid === undefined) !== (parsed.tempWriteSid === undefined)) {
                        fail('workspace-write requires --write-sid and --temp-write-sid together');
                    }
                    if (parsed.mode === 'workspace-write') {
                        (0, index_ts_1.assertTempRootOutsideWorkspace)(parsed.workspace, parsed.temp);
                    }
                    return [4 /*yield*/, (0, ffi_ts_1.win32)()
                        // Ignore this process's own CTRL+C: the confined child (same console) keeps
                        // handling its own; the runner must survive to revoke grants and mirror the
                        // child's exit code.
                    ];
                case 1:
                    api = _a.sent();
                    // Ignore this process's own CTRL+C: the confined child (same console) keeps
                    // handling its own; the runner must survive to revoke grants and mirror the
                    // child's exit code.
                    if (api.setConsoleCtrlHandler(null, 1) === 0) {
                        fail("SetConsoleCtrlHandler failed (Win32 ".concat(api.getLastError(), ")"));
                    }
                    initialized = false;
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, , 5, 6]);
                    privateTempDir = null;
                    writeSid = void 0;
                    privateTempSid = void 0;
                    if (parsed.mode === 'workspace-write') {
                        writeSid = (0, workspace_sid_ts_1.workspaceWriteSid)(parsed.workspace);
                        if (seamManaged) {
                            if (parsed.writeSid !== writeSid)
                                fail('--write-sid does not match --workspace');
                            privateTempDir = parsed.temp;
                            privateTempSid = (0, workspace_sid_ts_1.tempWriteSid)(privateTempDir);
                            if (parsed.tempWriteSid !== privateTempSid)
                                fail('--temp-write-sid does not match --temp');
                        }
                        else {
                            ownedTempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(parsed.temp, 'dsh-'));
                            privateTempDir = ownedTempDir;
                            privateTempSid = (0, workspace_sid_ts_1.tempWriteSid)(privateTempDir);
                        }
                    }
                    sandbox = new index_ts_1.AclSandbox(__assign(__assign(__assign({ writableDirs: parsed.mode === 'workspace-write' ? [parsed.workspace] : [], tempDir: privateTempDir, mode: parsed.mode }, writeSid === undefined ? {} : { writeSid: writeSid }), privateTempSid === undefined ? {} : { tempWriteSid: privateTempSid }), { manageDacls: !seamManaged }));
                    return [4 /*yield*/, sandbox.init()];
                case 3:
                    _a.sent();
                    initialized = true;
                    if (privateTempDir !== null) {
                        if (api.setEnvironmentVariableW('TMP', privateTempDir) === 0) {
                            fail("SetEnvironmentVariableW TMP failed (Win32 ".concat(api.getLastError(), ")"));
                        }
                        if (api.setEnvironmentVariableW('TEMP', privateTempDir) === 0) {
                            fail("SetEnvironmentVariableW TEMP failed (Win32 ".concat(api.getLastError(), ")"));
                        }
                    }
                    child = sandbox.spawn({
                        command: parsed.command,
                        args: parsed.args,
                        stdio: 'inherit',
                    });
                    return [4 /*yield*/, child.wait()];
                case 4:
                    result = _a.sent();
                    return [2 /*return*/, result.exitCode];
                case 5:
                    // Cleanup failures must not mask the child's exit code: report and keep going.
                    if (initialized) {
                        try {
                            sandbox === null || sandbox === void 0 ? void 0 : sandbox.dispose();
                        }
                        catch (error) {
                            process.stderr.write("".concat(RUNNER_SIGNATURE, ": cleanup: ").concat(error instanceof Error ? error.message : String(error), "\n"));
                        }
                    }
                    if (ownedTempDir !== undefined) {
                        try {
                            (0, node_fs_1.rmSync)(ownedTempDir, { recursive: true, force: true });
                        }
                        catch (error) {
                            process.stderr.write("".concat(RUNNER_SIGNATURE, ": cleanup: ").concat(error instanceof Error ? error.message : String(error), "\n"));
                        }
                    }
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    });
}
main().then(function (exitCode) {
    // Exit-code mirroring is full-width on Windows, verified empirically on
    // this machine (Windows 11 build 26200, Node 24): a child that exits
    // with the NTSTATUS 0xC0000005 (STATUS_ACCESS_VIOLATION) is read back
    // by GetExitCodeProcess as the uint32 3221225477, and after
    // process.exitCode = 3221225477 the parent observes exactly
    // 3221225477 (spawnSync status). PowerShell's $LASTEXITCODE and cmd
    // print the signed view (-1073741819), but no truncation or masking
    // happens anywhere in the chain — the mirror contract holds for the
    // full 32-bit range, so no re-mapping is needed.
    process.exitCode = exitCode;
}, function (error) {
    if (!(error instanceof RunnerFailure)) {
        process.stderr.write("".concat(RUNNER_SIGNATURE, ": ").concat(error instanceof Error ? error.message : String(error), "\n"));
    }
    process.exitCode = RUNNER_FAILURE_EXIT;
});
