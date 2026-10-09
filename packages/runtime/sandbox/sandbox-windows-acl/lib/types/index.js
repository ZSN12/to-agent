"use strict";
/**
 * Windows ACL write-restriction sandbox backend for the DeepSeek Harness
 * sandbox seam. Mirrors the mechanism of github.com/huoyaoyuan/
 * windows-acl-restrict-poc @ 10e4dfb (the fixed revision): a WRITE_RESTRICTED
 * token whose restricting SIDs include distinct workspace and temp write
 * SIDs that this sandbox adds to their owning directories' DACLs — the
 * intersection check then allows writes exactly where either capability has
 * a Write ACE, and nowhere else those SIDs are concerned (the check ALSO
 * inherits the ambient write ACEs of the other restricting SIDs — the
 * keep-alive group logon SID + Everyone; Authenticated Users, INTERACTIVE,
 * and LOCAL are absent from both lists — see the seam's dual-list contract
 * in `packages/sandbox/sandbox-local` and the package README's Modes section
 * for the complete boundary). The write SID is the per-WORKSPACE identity
 * ({@link workspaceWriteSid}): deterministic from the canonical workspace
 * path, so the workspace-root ACE materializes once per workspace per
 * machine and every later provision hits the exact-ACE skip — the
 * grant-reuse story the per-session random SID paid a full tree propagation
 * per session for. Each private temp directory instead receives its own SID,
 * so sibling sessions sharing a workspace cannot enter one another's temp
 * trees. Unlike the POC, every API failure throws with the API
 * name and exact Win32 code; a child is NEVER spawned unrestricted.
 *
 * Known boundaries (inherent to restricted tokens, not this port):
 *  - writes are restricted; reads, network, and process visibility are NOT
 *    (WRITE_RESTRICTED intersects only write accesses);
 *  - console isolation is unavailable — children share the host console
 *    (CREATE_NO_WINDOW / CREATE_NEW_CONSOLE children die with
 *    STATUS_DLL_INIT_FAILED under the restriction);
 *  - the private temp directory and every writable directory must be owned by the
 *    caller (owner-implicit WRITE_DAC);
 *  - grants are standing ACE mutations on real directories. WORKSPACE grants
 *    are deliberately never revoked — the ACE is the cross-session reuse
 *    cache (revoking would force the next session to re-propagate the whole
 *    tree). TEMP grants are revocable: dispose() removes them so a standing
 *    inheritable ACE never outlives its session's temp directory. The
 *    ambient temp root is never granted implicitly. With `manageDacls: false`
 *    the CALLER owns the DACLs (the sandbox seam's grant reuse):
 *    init()/dispose() skip grant/revoke entirely and the caller must not
 *    revoke under live children.
 * @module @z/dsh-sandbox-windows-acl
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
exports.AclSandbox = exports.Win32Error = exports.workspaceWriteSid = exports.tempWriteSid = exports.assertTempRootOutsideWorkspace = exports.AclWriteGrant = exports.quoteArg = void 0;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var acl_ts_1 = require("./acl.ts");
var errors_ts_1 = require("./errors.ts");
var ffi_ts_1 = require("./ffi.ts");
var path_boundary_ts_1 = require("./path-boundary.ts");
var spawn_ts_1 = require("./spawn.ts");
var token_ts_1 = require("./token.ts");
var abi = require("./win32-abi.ts");
var spawn_ts_2 = require("./spawn.ts");
Object.defineProperty(exports, "quoteArg", { enumerable: true, get: function () { return spawn_ts_2.quoteArg; } });
var grant_ts_1 = require("./grant.ts");
Object.defineProperty(exports, "AclWriteGrant", { enumerable: true, get: function () { return grant_ts_1.AclWriteGrant; } });
var path_boundary_ts_2 = require("./path-boundary.ts");
Object.defineProperty(exports, "assertTempRootOutsideWorkspace", { enumerable: true, get: function () { return path_boundary_ts_2.assertTempRootOutsideWorkspace; } });
var workspace_sid_ts_1 = require("./workspace-sid.ts");
Object.defineProperty(exports, "tempWriteSid", { enumerable: true, get: function () { return workspace_sid_ts_1.tempWriteSid; } });
Object.defineProperty(exports, "workspaceWriteSid", { enumerable: true, get: function () { return workspace_sid_ts_1.workspaceWriteSid; } });
var errors_ts_2 = require("./errors.ts");
Object.defineProperty(exports, "Win32Error", { enumerable: true, get: function () { return errors_ts_2.Win32Error; } });
/** Free one optional SID while retaining a failure for best-effort sibling cleanup. */
function freeSidBestEffort(api, sidPtr, label, failures) {
    if (sidPtr === undefined)
        return;
    try {
        var freed = api.localFree(sidPtr);
        if (!(0, ffi_ts_1.isNullPtr)(freed))
            (0, ffi_ts_1.throwLastError)(api, 'LocalFree', label);
    }
    catch (error) {
        failures.push(error);
    }
}
/**
 * One write-restricted sandbox instance: token + write-SID grants + spawn.
 * `init()` is fail-closed — any Win32 failure revokes the revocable (temp)
 * grants and throws; `dispose()` revokes the temp grants, leaves the
 * standing workspace ACEs in place (the cross-instance reuse cache), frees
 * every allocation, and reports every cleanup failure. With
 * `manageDacls: false` the caller owns the grants (the sandbox seam's grant
 * reuse): init() applies none and dispose() revokes none.
 */
var AclSandbox = /** @class */ (function () {
    function AclSandbox(options) {
        var _a;
        /** The well-known/logon SID allocations init() makes; freed by dispose() alongside the write SIDs. */
        this.sidAllocations = [];
        this.grantedPaths = [];
        this.mode = options.mode;
        this.manageDacls = (_a = options.manageDacls) !== null && _a !== void 0 ? _a : true;
        this.writableDirs = options.writableDirs.map(function (directory) {
            var absolute = (0, node_path_1.resolve)(directory);
            if (!(0, node_fs_1.existsSync)(absolute) || !(0, node_fs_1.statSync)(absolute).isDirectory()) {
                throw new Error("AclSandbox writable dir does not exist or is not a directory: ".concat(absolute));
            }
            return absolute;
        });
        this.tempDirOption = options.tempDir;
        this.writeSid = options.writeSid;
        this.tempWriteSid = options.tempWriteSid;
        if (this.mode === 'workspace-write' && this.writeSid === undefined) {
            throw new Error('AclSandbox workspace-write requires a write SID — derive it from the workspace via workspaceWriteSid()');
        }
        if (this.mode === 'workspace-write' && this.tempDirOption === undefined) {
            throw new Error('AclSandbox workspace-write requires an explicit private temp directory or null');
        }
        if (this.mode === 'read-only' && this.tempDirOption !== undefined && this.tempDirOption !== null) {
            throw new Error('AclSandbox read-only does not accept a temp directory');
        }
        if (this.mode === 'read-only' && (this.writeSid !== undefined || this.tempWriteSid !== undefined)) {
            throw new Error('AclSandbox read-only does not accept write SIDs');
        }
        if (this.mode === 'workspace-write' && this.tempDirOption !== null && this.tempWriteSid === undefined) {
            throw new Error('AclSandbox workspace-write with temp requires a temp write SID — derive it via tempWriteSid()');
        }
        if (this.tempDirOption === null && this.tempWriteSid !== undefined) {
            throw new Error('AclSandbox temp write SID requires a temp directory');
        }
        if (this.writeSid !== undefined && this.tempWriteSid === this.writeSid) {
            throw new Error('AclSandbox workspace and temp write SIDs must be distinct');
        }
    }
    Object.defineProperty(AclSandbox.prototype, "tempDir", {
        /** Resolved temp directory (available after init; null when temp grants are disabled). */
        get: function () {
            return this.tempDirResolved;
        },
        enumerable: false,
        configurable: true
    });
    /** Create the restricted token and apply the capability-SID grants. Idempotent-unsafe: once per instance. */
    AclSandbox.prototype.init = function () {
        return __awaiter(this, void 0, void 0, function () {
            var api, currentToken, currentTokenOpen, restrictedToken, parseSid, tempDir, _i, _a, path, logonSid, worldSid, writeSids, cleanupFailures, _b, _c, grant, _d, _e, _f, label, sidPtr, _g, _h, sidPtr;
            var _j, _k;
            return __generator(this, function (_l) {
                switch (_l.label) {
                    case 0:
                        if (this.api !== undefined)
                            throw new Error('AclSandbox is already initialized');
                        return [4 /*yield*/, (0, ffi_ts_1.win32)()];
                    case 1:
                        api = _l.sent();
                        currentToken = (0, token_ts_1.openCurrentProcessToken)(api);
                        currentTokenOpen = true;
                        try {
                            parseSid = function (sid) {
                                var sidSlot = (0, ffi_ts_1.allocPtrSlot)();
                                if (api.convertStringSidToSidW(sid, sidSlot) === 0) {
                                    (0, ffi_ts_1.throwLastError)(api, 'ConvertStringSidToSidW', sid);
                                }
                                var parsedSid = (0, ffi_ts_1.decodePtr)(sidSlot);
                                if (parsedSid === null)
                                    throw new errors_ts_1.Win32Error('ConvertStringSidToSidW', api.getLastError(), sid);
                                return parsedSid;
                            };
                            this.writeSidPtr = this.writeSid === undefined ? undefined : parseSid(this.writeSid);
                            this.tempWriteSidPtr = this.tempWriteSid === undefined ? undefined : parseSid(this.tempWriteSid);
                            tempDir = this.mode === 'read-only' || this.tempDirOption === null ? null : this.tempDirOption;
                            /* v8 ignore next -- constructor validation requires workspace-write to supply
                               an explicit temp directory or null; the other branches normalize to null. */
                            if (tempDir === undefined)
                                throw new Error('AclSandbox workspace-write temp directory was not resolved');
                            if (tempDir !== null) {
                                if (!(0, node_fs_1.existsSync)(tempDir) || !(0, node_fs_1.statSync)(tempDir).isDirectory()) {
                                    throw new Error("AclSandbox temp dir does not exist or is not a directory: ".concat(tempDir));
                                }
                                (0, path_boundary_ts_1.assertPrivateTempDisjoint)(this.writableDirs, tempDir);
                            }
                            this.tempDirResolved = tempDir;
                            // manageDacls: false — the caller (the sandbox seam's grant) already
                            // materialized the ACEs; this instance must neither add nor remove any.
                            // When this instance owns the DACLs, writableDir ACEs are STANDING (the
                            // per-workspace reuse cache — dispose() never revokes them, or the next
                            // provision would re-propagate the whole tree) and the temp ACE is
                            // REVOCABLE (dispose() removes it before the private directory is
                            // deleted; the ambient temp root is never granted).
                            if (this.manageDacls) {
                                if (this.writeSidPtr !== undefined) {
                                    for (_i = 0, _a = this.writableDirs; _i < _a.length; _i++) {
                                        path = _a[_i];
                                        (0, acl_ts_1.grantWrite)(api, path, this.writeSidPtr);
                                    }
                                    if (tempDir !== null && this.tempWriteSidPtr !== undefined) {
                                        // Record BEFORE granting: grantWrite can throw after a successful
                                        // apply (a LocalFree failure), and the fail-closed catch must still
                                        // revoke that path (revoking an ungranted path is a no-op merge).
                                        this.grantedPaths.push({ path: tempDir, sidPtr: this.tempWriteSidPtr });
                                        (0, acl_ts_1.grantWrite)(api, tempDir, this.tempWriteSidPtr);
                                    }
                                }
                            }
                            logonSid = (0, token_ts_1.findLogonSid)(api, currentToken);
                            this.sidAllocations.push(logonSid);
                            worldSid = (0, token_ts_1.makeWellKnownSid)(api, abi.WinWorldSid);
                            this.sidAllocations.push(worldSid);
                            writeSids = [this.writeSidPtr, this.tempWriteSidPtr].filter(function (sid) { return sid !== undefined; });
                            restrictedToken = (0, token_ts_1.createRestrictedToken)(api, currentToken, logonSid, writeSids, { world: worldSid }, this.mode);
                            this.token = restrictedToken;
                            // The restricted token's default DACL still names only the user's
                            // ambient SIDs — none of the restricting SIDs. Every NEW object the
                            // confined process creates (anonymous stdio pipes, sync objects) takes
                            // its DACL from that default, so the write pass-2 check would deny
                            // pipe creation (ERROR_ACCESS_DENIED; Node EPERM) and break every
                            // piped-stdio grandchild spawn. Merge a full-access ACE for a
                            // restricting SID (the PRIVATE temp SID when present, otherwise the
                            // workspace SID, or Everyone under read-only): new-object creation
                            // stays gated by the parent object's DACL, while the new object's own
                            // DACL passes pass-2. Choosing the temp SID prevents default-DACL
                            // objects in one session's temp tree from acquiring the shared
                            // workspace capability.
                            (0, token_ts_1.setTokenDefaultDaclGrant)(api, restrictedToken, (_k = (_j = this.tempWriteSidPtr) !== null && _j !== void 0 ? _j : this.writeSidPtr) !== null && _k !== void 0 ? _k : worldSid);
                            if (api.closeHandle(currentToken) === 0)
                                (0, ffi_ts_1.throwLastError)(api, 'CloseHandle', 'current process token');
                            currentTokenOpen = false;
                            this.api = api;
                        }
                        catch (error) {
                            cleanupFailures = [];
                            if (currentTokenOpen && api.closeHandle(currentToken) === 0) {
                                cleanupFailures.push(new errors_ts_1.Win32Error('CloseHandle', api.getLastError(), 'current process token after init failure'));
                            }
                            if (restrictedToken !== undefined && api.closeHandle(restrictedToken) === 0) {
                                cleanupFailures.push(new errors_ts_1.Win32Error('CloseHandle', api.getLastError(), 'restricted token after init failure'));
                            }
                            for (_b = 0, _c = this.grantedPaths; _b < _c.length; _b++) {
                                grant = _c[_b];
                                try {
                                    (0, acl_ts_1.revokeWrite)(api, grant.path, grant.sidPtr);
                                }
                                catch (cleanupError) {
                                    cleanupFailures.push(cleanupError);
                                }
                            }
                            for (_d = 0, _e = [['workspace write SID', this.writeSidPtr], ['temp write SID', this.tempWriteSidPtr]]; _d < _e.length; _d++) {
                                _f = _e[_d], label = _f[0], sidPtr = _f[1];
                                freeSidBestEffort(api, sidPtr, label, cleanupFailures);
                            }
                            for (_g = 0, _h = this.sidAllocations.splice(0); _g < _h.length; _g++) {
                                sidPtr = _h[_g];
                                freeSidBestEffort(api, sidPtr, 'init SID allocation', cleanupFailures);
                            }
                            this.token = undefined;
                            this.writeSidPtr = undefined;
                            this.tempWriteSidPtr = undefined;
                            this.tempDirResolved = undefined;
                            this.grantedPaths = [];
                            if (cleanupFailures.length > 0) {
                                throw new AggregateError(__spreadArray([error], cleanupFailures, true), "AclSandbox init failed and ".concat(cleanupFailures.length, " cleanup operation(s) also failed"));
                            }
                            throw error;
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Spawn a process under the restricted token. Fails closed: throws on every
     * Win32 failure; the child is never created unrestricted. With
     * `stdio: 'inherit'` the child shares the caller's stdio directly and is
     * placed in a kill-on-close job (dies with the caller). Call dispose() only
     * after all children have exited — revoking grants under a live child
     * removes its remaining write allowance.
     * @param options - the program, argv/cwd, and stdio shape.
     * @returns the running child.
     */
    AclSandbox.prototype.spawn = function (options) {
        var _this = this;
        var _a, _b;
        var api = this.api;
        var token = this.token;
        if (api === undefined || token === undefined)
            throw new Error('AclSandbox is not initialized: call init() first');
        var args = (_a = options.args) !== null && _a !== void 0 ? _a : [];
        var cwd = (_b = options.cwd) !== null && _b !== void 0 ? _b : process.cwd();
        if (options.stdio === 'inherit') {
            var native_1 = (0, spawn_ts_1.spawnSandboxedInherited)(api, token, { command: options.command, args: args, cwd: cwd });
            var exitCodePromise_1;
            return {
                pid: native_1.pid,
                wait: function () { return __awaiter(_this, void 0, void 0, function () {
                    var exitCode;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                exitCodePromise_1 !== null && exitCodePromise_1 !== void 0 ? exitCodePromise_1 : (exitCodePromise_1 = Promise.resolve((0, spawn_ts_1.waitForExit)(api, native_1.process)));
                                return [4 /*yield*/, exitCodePromise_1];
                            case 1:
                                exitCode = _a.sent();
                                if (api.closeHandle(native_1.job) === 0)
                                    (0, ffi_ts_1.throwLastError)(api, 'CloseHandle', 'kill-on-close job');
                                return [2 /*return*/, { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: exitCode }];
                        }
                    });
                }); },
            };
        }
        var native = (0, spawn_ts_1.spawnSandboxed)(api, token, { command: options.command, args: args, cwd: cwd });
        var stdout = (0, spawn_ts_1.drainPipe)(api, native.stdoutRead);
        var stderr = (0, spawn_ts_1.drainPipe)(api, native.stderrRead);
        // waitForExit is deliberately NOT started here: WaitForSingleObject blocks
        // the thread and would starve the drains while the child is still running
        // (pipe-buffer deadlock). The drains resolve only after the child closed
        // its pipe ends — by then the wait returns immediately.
        var exitCodePromise;
        return {
            pid: native.pid,
            wait: function () { return __awaiter(_this, void 0, void 0, function () {
                var stdoutBuffer, stderrBuffer;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, stdout];
                        case 1:
                            stdoutBuffer = _b.sent();
                            return [4 /*yield*/, stderr];
                        case 2:
                            stderrBuffer = _b.sent();
                            exitCodePromise !== null && exitCodePromise !== void 0 ? exitCodePromise : (exitCodePromise = Promise.resolve((0, spawn_ts_1.waitForExit)(api, native.process)));
                            _a = { stdout: stdoutBuffer, stderr: stderrBuffer };
                            return [4 /*yield*/, exitCodePromise];
                        case 3: return [2 /*return*/, (_a.exitCode = _b.sent(), _a)];
                    }
                });
            }); },
        };
    };
    /**
     * Revoke the revocable (temp) grants, free the SID, close the token; the
     * standing workspace ACEs stay (the reuse cache). Reports every cleanup
     * failure.
     */
    AclSandbox.prototype.dispose = function () {
        var api = this.api;
        if (api === undefined)
            return;
        var failures = [];
        if (this.manageDacls) {
            for (var _i = 0, _a = this.grantedPaths; _i < _a.length; _i++) {
                var grant = _a[_i];
                try {
                    (0, acl_ts_1.revokeWrite)(api, grant.path, grant.sidPtr);
                }
                catch (error) {
                    failures.push(error);
                }
            }
        }
        for (var _b = 0, _c = [['workspace write SID', this.writeSidPtr], ['temp write SID', this.tempWriteSidPtr]]; _b < _c.length; _b++) {
            var _d = _c[_b], label = _d[0], sidPtr = _d[1];
            freeSidBestEffort(api, sidPtr, label, failures);
        }
        var token = this.token;
        /* v8 ignore next -- init assigns this.api only after this.token, so an initialized instance always
           has its token; the guard mirrors the write-SID guard. */
        if (token !== undefined) {
            try {
                if (api.closeHandle(token) === 0)
                    (0, ffi_ts_1.throwLastError)(api, 'CloseHandle', 'restricted token');
            }
            catch (error) {
                failures.push(error);
            }
        }
        for (var _e = 0, _f = this.sidAllocations.splice(0); _e < _f.length; _e++) {
            var sidPtr = _f[_e];
            freeSidBestEffort(api, sidPtr, 'init SID allocation', failures);
        }
        this.api = undefined;
        this.token = undefined;
        this.writeSidPtr = undefined;
        this.tempWriteSidPtr = undefined;
        this.grantedPaths = [];
        if (failures.length > 0) {
            throw new AggregateError(failures, "AclSandbox dispose completed with ".concat(failures.length, " cleanup failure(s)"));
        }
    };
    return AclSandbox;
}());
exports.AclSandbox = AclSandbox;
