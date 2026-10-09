"use strict";
/**
 * ACL editing helpers: grant/revoke a capability SID on a directory via
 * SetEntriesInAclW + SetNamedSecurityInfoW (the same calls the POC uses, with
 * the failure handling the POC lacks). Every API call is checked and every
 * failure is reported with the API name, the exact Win32 code, the formatted
 * system text, and the affected path.
 *
 * Concurrency: grants are read-merge-write against the directory's CURRENT
 * DACL, and the whole get-merge-set sequence runs under a per-path exclusive
 * LockFileEx lock (see {@link withPathLock}) so concurrent sandbox instances
 * cannot clobber each other's ACEs.
 * @module @z/dsh-sandbox-windows-acl/acl
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildExplicitAccess = buildExplicitAccess;
exports.lockFilePath = lockFilePath;
exports.withPathLock = withPathLock;
exports.grantWrite = grantWrite;
exports.revokeWrite = revokeWrite;
var node_crypto_1 = require("node:crypto");
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var ffi_ts_1 = require("./ffi.ts");
var abi = require("./win32-abi.ts");
/**
 * Pack one EXPLICIT_ACCESS_W (48 bytes, layout verified by abi-probe.cpp):
 * perms@0, mode@4, inheritance@8, Trustee@16 { pMultipleTrustee@16,
 * MultipleTrusteeOperation@24, TrusteeForm@28, TrusteeType@32, ptstrName@40 }.
 * `permissions` is the access mask; the POC passes 0 for REVOKE_ACCESS, which
 * removes every ACE for the trustee.
 * @param sidPtr - the trustee SID the entry names.
 * @param mode - the access mode (GRANT_ACCESS or REVOKE_ACCESS).
 * @param permissions - the access mask to grant (0 for REVOKE_ACCESS).
 * @returns the packed entry buffer.
 */
function buildExplicitAccess(sidPtr, mode, permissions) {
    var entry = Buffer.alloc(abi.EXPLICIT_ACCESS_W_SIZE);
    entry.writeUInt32LE(permissions, 0); // grfAccessPermissions
    entry.writeUInt32LE(mode, 4); // grfAccessMode
    entry.writeUInt32LE(abi.SUB_CONTAINERS_AND_OBJECTS_INHERIT, 8); // grfInheritance: OI|CI
    entry.writeUInt32LE(abi.NO_MULTIPLE_TRUSTEE, 24); // Trustee.MultipleTrusteeOperation
    entry.writeUInt32LE(abi.TRUSTEE_IS_SID, 28); // Trustee.TrusteeForm
    entry.writeUInt32LE(abi.TRUSTEE_IS_UNKNOWN, 32); // Trustee.TrusteeType
    entry.writeBigUInt64LE((0, ffi_ts_1.ptrAddress)(sidPtr), 40); // Trustee.ptstrName = the capability SID
    return entry;
}
/**
 * One lock file per protected path: `<GetTempPathW()>\dsh-acl-locks\<first 16
 * hex of sha256(lowercased path)>.lock`. The lock root derives from
 * GetTempPathW (never from runner argv or DSH_HOME), and the lowercasing
 * maps Windows's case-insensitive path spellings onto one lock.
 * @param api - the binding table.
 * @param path - the protected directory (absolute).
 * @returns the lock file path for that directory.
 */
function lockFilePath(api, path) {
    var digest = (0, node_crypto_1.createHash)('sha256').update(path.toLowerCase()).digest('hex').slice(0, 16);
    return (0, node_path_1.join)((0, ffi_ts_1.getTempPath)(api), 'dsh-acl-locks', "".concat(digest, ".lock"));
}
/**
 * Run `action` holding the per-path exclusive lock: CreateFileW
 * (OPEN_ALWAYS, shared read/write but NOT delete — a deletable lock file
 * could be removed and recreated under the holder, letting two processes
 * hold "the same" lock), then a one-byte LockFileEx
 * (LOCKFILE_EXCLUSIVE_LOCK, zeroed OVERLAPPED = lock from offset 0 on the
 * synchronous handle — see allocOverlapped for why not NULL), then
 * UnlockFileEx + CloseHandle. Fail-closed: open/lock/unlock/close failures
 * throw like every other Win32 call in this package; an `action` failure
 * still unlocks (best-effort) and rethrows the original error.
 * @param api - the binding table.
 * @param path - the protected directory (absolute).
 * @param action - the get-merge-set sequence to serialize.
 * @returns the action's result.
 */
function withPathLock(api, path, action) {
    var lockPath = lockFilePath(api, path);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(lockPath), { recursive: true });
    var handle = api.createFileW(lockPath, abi.GENERIC_READ | abi.GENERIC_WRITE, abi.FILE_SHARE_READ | abi.FILE_SHARE_WRITE, null, abi.OPEN_ALWAYS, 0, null);
    if ((0, ffi_ts_1.isInvalidHandle)(handle))
        (0, ffi_ts_1.throwLastError)(api, 'CreateFileW', lockPath);
    var overlapped = (0, ffi_ts_1.allocOverlapped)(); // stays zeroed: offset 0, hEvent NULL
    if (api.lockFileEx(handle, abi.LOCKFILE_EXCLUSIVE_LOCK, 0, 1, 0, overlapped) === 0) {
        var win32Code = api.getLastError();
        api.closeHandle(handle); // best-effort on the lock-failure path
        (0, ffi_ts_1.throwWin32)(api, 'LockFileEx', win32Code, lockPath);
    }
    var result;
    try {
        result = action();
    }
    catch (error) {
        // Best-effort release on the action-failure path: cleanup failures must
        // not mask the action's error.
        api.unlockFileEx(handle, 0, 1, 0, overlapped);
        api.closeHandle(handle);
        throw error;
    }
    if (api.unlockFileEx(handle, 0, 1, 0, overlapped) === 0) {
        var win32Code = api.getLastError();
        api.closeHandle(handle); // best-effort on the unlock-failure path
        (0, ffi_ts_1.throwWin32)(api, 'UnlockFileEx', win32Code, lockPath);
    }
    if (api.closeHandle(handle) === 0)
        (0, ffi_ts_1.throwLastError)(api, 'CloseHandle', "lock file ".concat(lockPath));
    return result;
}
/**
 * Read the directory's current explicit DACL via GetNamedSecurityInfoW.
 * Allocation contract (the POC's RevokeAccess, minus its missing checks): the
 * returned ACL pointer sits INSIDE the security descriptor allocation — only
 * the descriptor may be LocalFree'd, and it must not be freed before
 * SetEntriesInAclW has consumed the ACL. Freeing the ACL pointer itself
 * corrupts the heap (verified the hard way).
 * @param api - the binding table.
 * @param path - the directory whose DACL is read.
 * @returns the current explicit DACL (null when the directory carries none) and its owning descriptor.
 */
function readCurrentDacl(api, path) {
    var ownerSlot = (0, ffi_ts_1.allocPtrSlot)();
    var groupSlot = (0, ffi_ts_1.allocPtrSlot)();
    var daclSlot = (0, ffi_ts_1.allocPtrSlot)();
    var saclSlot = (0, ffi_ts_1.allocPtrSlot)();
    var descriptorSlot = (0, ffi_ts_1.allocPtrSlot)();
    var readResult = api.getNamedSecurityInfoW(path, abi.SE_FILE_OBJECT, abi.DACL_SECURITY_INFORMATION, ownerSlot, groupSlot, daclSlot, saclSlot, descriptorSlot);
    if (readResult !== abi.ERROR_SUCCESS)
        (0, ffi_ts_1.throwWin32)(api, 'GetNamedSecurityInfoW', readResult, path);
    return { oldAcl: (0, ffi_ts_1.decodePtr)(daclSlot), descriptor: (0, ffi_ts_1.decodePtr)(descriptorSlot) };
}
/**
 * Shared tail of grantWrite and revokeWrite: merge `entry` into `oldAcl`
 * (null = no explicit DACL yet; SetEntriesInAclW builds one from scratch),
 * free the descriptor before applying the merged ACL, apply it, then free the
 * merged ACL — checking every call and reporting with the caller's label.
 * @param api - the binding table.
 * @param path - the directory the DACL edit applies to.
 * @param entry - the EXPLICIT_ACCESS_W to merge (grant or revoke).
 * @param oldAcl - the current explicit DACL (from {@link readCurrentDacl}).
 * @param descriptor - the descriptor allocation owning `oldAcl`.
 * @param label - the caller's name for error details.
 */
function mergeAndApply(api, path, entry, oldAcl, descriptor, label) {
    var newAclSlot = (0, ffi_ts_1.allocPtrSlot)();
    var mergeResult = api.setEntriesInAclW(1, entry, oldAcl, newAclSlot);
    if (mergeResult !== abi.ERROR_SUCCESS) {
        if (descriptor !== null)
            api.localFree(descriptor); // frees the ACL block too
        (0, ffi_ts_1.throwWin32)(api, 'SetEntriesInAclW', mergeResult, "".concat(label, "(").concat(path, ")"));
    }
    var newAcl = (0, ffi_ts_1.decodePtr)(newAclSlot);
    if (newAcl === null) {
        if (descriptor !== null)
            api.localFree(descriptor);
        (0, ffi_ts_1.throwWin32)(api, 'SetEntriesInAclW', api.getLastError(), "".concat(label, "(").concat(path, "): null new ACL"));
    }
    // The descriptor block (oldAcl included) is dead after the merge — free it
    // before applying, exactly like the POC.
    var freedDescriptor = descriptor !== null ? api.localFree(descriptor) : null;
    var applyResult = api.setNamedSecurityInfoW(path, abi.SE_FILE_OBJECT, abi.DACL_SECURITY_INFORMATION, null, null, newAcl, null);
    var freedNew = api.localFree(newAcl);
    if (applyResult !== abi.ERROR_SUCCESS)
        (0, ffi_ts_1.throwWin32)(api, 'SetNamedSecurityInfoW', applyResult, "".concat(label, "(").concat(path, ")"));
    if (freedDescriptor !== null && !(0, ffi_ts_1.isNullPtr)(freedDescriptor))
        (0, ffi_ts_1.throwLastError)(api, 'LocalFree', "".concat(label, "(").concat(path, ") descriptor"));
    if (!(0, ffi_ts_1.isNullPtr)(freedNew))
        (0, ffi_ts_1.throwLastError)(api, 'LocalFree', "".concat(label, "(").concat(path, ") new ACL"));
}
/**
 * True when the explicit DACL already carries the EXACT write grant this
 * module would add (Allow ACE, OI|CI inheritance, {@link abi.GRANT_MASK}, the
 * capability SID). Every field is read through koffi.decode at pointer offsets —
 * no memcpy, no pointer arithmetic. The ACE's SID is INLINE (embedded in the
 * ACE after the 4-byte mask — there is no pointer to read; reading one
 * yields garbage addresses and crashed EqualSid, verified by gdb), so it is
 * compared field-by-field against the capability SID through bounded offset
 * reads ({@link sameSidAt}). A malformed header reads as "no exact grant"
 * so the caller falls back to the merge-apply path, which owns the robust
 * failure handling.
 * @param oldAcl - the current explicit DACL pointer (from {@link readCurrentDacl}).
 * @param sidPtr - the capability SID to match.
 * @returns whether the exact grant ACE is already present.
 */
function hasExactGrant(oldAcl, sidPtr) {
    var aclSize = (0, ffi_ts_1.decodeUint16At)(oldAcl, 2);
    var aceCount = (0, ffi_ts_1.decodeUint16At)(oldAcl, 4);
    if (aclSize < 8 || aclSize > 1048576)
        return false; // implausible: fall back to the merge path
    var offset = 8; // the first ACE follows the 8-byte ACL header
    for (var index = 0; index < aceCount; index++) {
        // ACE_HEADER: AceType@0, AceFlags@1, AceSize@2 (WORD);
        // ACCESS_ALLOWED_ACE: Mask@4, inline SID@8.
        var aceSize = (0, ffi_ts_1.decodeUint16At)(oldAcl, offset + 2);
        if (aceSize < 8 || offset + aceSize > aclSize)
            return false; // implausible: fall back to the merge path
        var exact = (0, ffi_ts_1.decodeUint8At)(oldAcl, offset) === abi.ACCESS_ALLOWED_ACE_TYPE
            && (0, ffi_ts_1.decodeUint8At)(oldAcl, offset + 1) === abi.SUB_CONTAINERS_AND_OBJECTS_INHERIT
            && (0, ffi_ts_1.decodeUint32At)(oldAcl, offset + 4) === abi.GRANT_MASK;
        if (exact && (0, ffi_ts_1.sameSidAt)(oldAcl, offset + 8, sidPtr, 0))
            return true;
        offset += aceSize;
    }
    return false;
}
/**
 * Grant `GRANT_MASK` (Write+Delete, displays as "Modify") to the capability SID
 * on `path`, inheriting to subcontainers and objects. Idempotent: when the
 * directory's current explicit DACL already carries the exact ACE (the
 * per-session grant surviving from a previous server lifetime), the
 * SetNamedSecurityInfoW apply is SKIPPED — it would otherwise re-propagate
 * the identical ACE across the whole tree (eager inheritance; minutes on
 * large workspaces). Otherwise read-merge-write: the new ACE merges into the
 * directory's CURRENT explicit DACL (same shape as {@link revokeWrite}), so
 * pre-existing explicit ACEs survive. Runs under the per-path lock. The
 * directory must be owned by the caller (owner implicit WRITE_DAC) — same
 * precondition as the POC.
 * @param api - the binding table.
 * @param path - the directory whose DACL gains the grant (the workspace or temp root).
 * @param sidPtr - the capability SID the ACE names.
 */
function grantWrite(api, path, sidPtr) {
    withPathLock(api, path, function () {
        var _a = readCurrentDacl(api, path), oldAcl = _a.oldAcl, descriptor = _a.descriptor;
        if (oldAcl !== null && hasExactGrant(oldAcl, sidPtr)) {
            // The exact ACE stands: releasing the descriptor is the whole operation.
            if (descriptor !== null) {
                var freed = api.localFree(descriptor);
                if (!(0, ffi_ts_1.isNullPtr)(freed))
                    (0, ffi_ts_1.throwLastError)(api, 'LocalFree', "grantWrite(".concat(path, ") descriptor"));
            }
            return;
        }
        mergeAndApply(api, path, buildExplicitAccess(sidPtr, abi.GRANT_ACCESS, abi.GRANT_MASK), oldAcl, descriptor, 'grantWrite');
    });
}
/**
 * Remove every ACE for the capability SID from the directory DACL (REVOKE_ACCESS
 * merge — other entries are preserved). Returns whether an ACE removal was
 * attempted (false when the directory carries no DACL at all).
 *
 * Runs under the per-path lock (the whole get-merge-set sequence); the
 * descriptor/ACL allocation contract lives on {@link readCurrentDacl}.
 * @param api - the binding table.
 * @param path - the directory whose DACL loses the capability-SID ACEs.
 * @param sidPtr - the capability SID whose ACEs are removed.
 * @returns whether an ACE removal was attempted (false when the directory carries no DACL at all).
 */
function revokeWrite(api, path, sidPtr) {
    return withPathLock(api, path, function () {
        var _a = readCurrentDacl(api, path), oldAcl = _a.oldAcl, descriptor = _a.descriptor;
        if (oldAcl === null) {
            if (descriptor !== null) {
                var freed = api.localFree(descriptor);
                if (!(0, ffi_ts_1.isNullPtr)(freed))
                    (0, ffi_ts_1.throwLastError)(api, 'LocalFree', "revokeWrite(".concat(path, ") descriptor"));
            }
            return false;
        }
        mergeAndApply(api, path, buildExplicitAccess(sidPtr, abi.REVOKE_ACCESS, 0), oldAcl, descriptor, 'revokeWrite');
        return true;
    });
}
