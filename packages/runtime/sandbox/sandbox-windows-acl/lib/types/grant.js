"use strict";
/**
 * Server-side write-grant materialization. The sandbox seam holds one
 * standing workspace grant per workspace and one revocable temp grant per
 * live session/workspace pair. Workspace identities survive by deterministic
 * derivation and their standing ACE; temp identities derive from random
 * private paths and are deliberately new after a restart.
 *
 * Fail-closed: `add` throws on any grant failure and the caller disposes the
 * instance (revoking every path granted so far); `dispose` revokes every
 * standing grant and reports every cleanup failure.
 * @module @z/dsh-sandbox-windows-acl/grant
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
exports.AclWriteGrant = void 0;
var acl_ts_1 = require("./acl.ts");
var ffi_ts_1 = require("./ffi.ts");
/**
 * One write SID's provider-lifetime grant materialization: the parsed SID
 * pointer plus every directory whose DACL currently carries its ACE.
 * Workspace paths are added STANDING (their ACEs are the cross-session reuse
 * cache and outlive the grant — dispose() skips revoking them, or the next
 * provision would re-propagate the whole tree); temp paths are revocable
 * (dispose() revokes them — an inheritable ACE must not outlive its
 * session's temp directory). Create with {@link AclWriteGrant.create};
 * dispose revokes the revocable paths and frees the SID.
 */
var AclWriteGrant = /** @class */ (function () {
    function AclWriteGrant(api, sidPtr, writeSid) {
        this.revocablePaths = [];
        this.standingPaths = [];
        this.api = api;
        this.sidPtr = sidPtr;
        this.writeSid = writeSid;
    }
    /**
     * Parse the SID string and open the binding table (lazily, once per
     * server). Fail-closed: any failure throws — nothing is granted yet.
     * @param writeSid - the workspace (`S-1-4-x-y`) or temp (`S-1-4-x-y-1`) capability SID string.
     * @param api - optional already-resolved bindings (tests).
     * @returns the ready grant (no ACEs yet).
     */
    AclWriteGrant.create = function (writeSid, api) {
        var bindings = api !== null && api !== void 0 ? api : (0, ffi_ts_1.win32Sync)();
        var sidSlot = (0, ffi_ts_1.allocPtrSlot)();
        if (bindings.convertStringSidToSidW(writeSid, sidSlot) === 0) {
            (0, ffi_ts_1.throwLastError)(bindings, 'ConvertStringSidToSidW', writeSid);
        }
        var sidPtr = (0, ffi_ts_1.decodePtr)(sidSlot);
        if (sidPtr === null)
            (0, ffi_ts_1.throwLastError)(bindings, 'ConvertStringSidToSidW', "null SID for ".concat(writeSid));
        return new AclWriteGrant(bindings, sidPtr, writeSid);
    };
    /**
     * Grant the write ACE on one directory (idempotent: an already-standing
     * exact ACE skips the eager full-tree re-propagation — see
     * {@link grantWrite}) and record the path for {@link dispose} unless it is
     * standing. The path is recorded BEFORE the grant: a post-apply throw (a
     * LocalFree failure after SetNamedSecurityInfoW succeeded) must still
     * revoke it, and revoking an ungranted path is a no-op merge. Callers
     * treat a throw as a failed materialization and dispose the instance to
     * revoke the paths granted so far.
     * @param path - the directory whose DACL gains the grant.
     * @param standing - the ACE outlives this grant (the workspace reuse
     *   cache; dispose() skips revoking it). Default false (revoked on
     *   dispose — the temp-directory lifecycle).
     */
    AclWriteGrant.prototype.add = function (path, standing) {
        if (standing === void 0) { standing = false; }
        ;
        (standing ? this.standingPaths : this.revocablePaths).push(path);
        (0, acl_ts_1.grantWrite)(this.api, path, this.sidPtr);
    };
    Object.defineProperty(AclWriteGrant.prototype, "paths", {
        /** Every directory currently carrying the grant, in grant order. */
        get: function () {
            return __spreadArray(__spreadArray([], this.standingPaths, true), this.revocablePaths, true);
        },
        enumerable: false,
        configurable: true
    });
    /** Revoke every revocable grant (standing ACEs stay) and free the SID; reports every cleanup failure. */
    AclWriteGrant.prototype.dispose = function () {
        var failures = [];
        for (var _i = 0, _a = this.revocablePaths; _i < _a.length; _i++) {
            var path = _a[_i];
            try {
                (0, acl_ts_1.revokeWrite)(this.api, path, this.sidPtr);
            }
            catch (error) {
                failures.push(error);
            }
        }
        try {
            var freed = this.api.localFree(this.sidPtr);
            if (!(0, ffi_ts_1.isNullPtr)(freed))
                (0, ffi_ts_1.throwLastError)(this.api, 'LocalFree', 'write SID');
        }
        catch (error) {
            failures.push(error);
        }
        if (failures.length > 0) {
            throw new AggregateError(failures, "AclWriteGrant dispose completed with ".concat(failures.length, " cleanup failure(s)"));
        }
    };
    return AclWriteGrant;
}());
exports.AclWriteGrant = AclWriteGrant;
