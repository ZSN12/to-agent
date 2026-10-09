"use strict";
/**
 * Internal registry of deployment capabilities composed into every continuable
 * child's unpublished creation context.
 *
 * A contribution grants a child-scoped capability without teaching the
 * continuation manager which capabilities exist. The manager owns residency;
 * this registry owns the join between plugin lifetime, unpublished setup, and
 * Activation disposal, so no installation outlives either owner and no removed
 * contribution can be installed after revocation reports completion.
 *
 * @module @z/dsh-subagent/activation-setup-registry
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
exports.SubagentActivationSetupRegistry = void 0;
var dsh_llm_1 = require("@z/dsh-llm");
var error_ts_1 = require("./error.ts");
/** Re-read mutable removal state after a contribution may have revoked itself. */
function isRemoved(registration) {
    return registration.removed;
}
/**
 * Owns continuable-child setup registrations, installations, rollback, child
 * cleanup, and immediate live revocation.
 */
var SubagentActivationSetupRegistry = /** @class */ (function () {
    function SubagentActivationSetupRegistry() {
        /** Live contributions in installation order. */
        this.registrations = new Set();
        /** Child context to its live installations. */
        this.byChild = new Map();
    }
    /**
     * Register one contribution.
     * @param contribution - synchronous child-scope installer.
     * @returns an idempotent registration undo.
     * @throws after attempting every installation when any disposer fails.
     */
    SubagentActivationSetupRegistry.prototype.register = function (contribution) {
        var _this = this;
        var registration = { contribution: contribution, removed: false, installations: new Set() };
        this.registrations.add(registration);
        return function () {
            if (registration.removed)
                return;
            // Close before disposal so a snapshotted apply() cannot install after
            // revocation reports completion.
            registration.removed = true;
            _this.registrations.delete(registration);
            _this.releaseAll(__spreadArray([], registration.installations, true), 'contribution removal');
        };
    };
    /**
     * Install every live contribution into one unpublished child context.
     * @param childCtx - the child's unpublished scoped context.
     * @returns the provisioning commit consumed at Agent publication.
     */
    SubagentActivationSetupRegistry.prototype.apply = function (childCtx) {
        var _this = this;
        var state = { installations: [], invalidated: false };
        try {
            for (var _i = 0, _a = __spreadArray([], this.registrations, true); _i < _a.length; _i++) {
                var registration = _a[_i];
                /* v8 ignore next -- only a synchronous re-entrant revocation of an
                 * already-snapshotted registration reaches this guard. */
                if (registration.removed)
                    continue;
                var installation = {
                    registration: registration,
                    childCtx: childCtx,
                    dispose: registration.contribution(childCtx),
                    released: false,
                    transaction: state,
                };
                registration.installations.add(installation);
                state.installations.push(installation);
                var indexed = this.byChild.get(childCtx);
                if (indexed === undefined) {
                    indexed = new Set();
                    this.byChild.set(childCtx, indexed);
                }
                indexed.add(installation);
                // An installer may revoke itself before its installation record exists.
                // Dispose that escaped record and invalidate the provisioning batch.
                if (isRemoved(registration))
                    this.release(installation);
            }
        }
        catch (error) {
            // Keep the installer failure authoritative, but attempt every rollback.
            try {
                this.releaseAll(__spreadArray([], state.installations, true), 'setup rollback');
            }
            catch (releaseFailure) {
                /* v8 ignore next -- requires independent installer and rollback faults. */
                void releaseFailure;
            }
            throw error;
        }
        childCtx.effect(function () { return function () { _this.releaseChild(childCtx); }; }, 'subagents.activationSetup()');
        return {
            commit: function () {
                if (state.invalidated) {
                    throw new error_ts_1.SubagentError('a continuable-subagent setup contribution was revoked while this child was being built; '
                        + 'the child was not established', 'ACTIVATION_SETUP_REVOKED');
                }
                for (var _i = 0, _a = state.installations; _i < _a.length; _i++) {
                    var installation = _a[_i];
                    installation.transaction = undefined;
                }
            },
        };
    };
    /** Release every remaining installation owned by one disposed child scope. */
    SubagentActivationSetupRegistry.prototype.releaseChild = function (childCtx) {
        var _a;
        var indexed = (_a = this.byChild.get(childCtx)) !== null && _a !== void 0 ? _a : [];
        this.releaseAll(__spreadArray([], indexed, true), 'child scope disposal');
    };
    /**
     * Release a batch completely before reporting disposer failures.
     * @param installations - records to release.
     * @param during - operation name for diagnostics.
     */
    SubagentActivationSetupRegistry.prototype.releaseAll = function (installations, during) {
        var failures = [];
        for (var _i = 0, installations_1 = installations; _i < installations_1.length; _i++) {
            var installation = installations_1[_i];
            try {
                this.release(installation);
            }
            catch (error) {
                failures.push(error);
            }
        }
        if (failures.length === 0)
            return;
        throw new error_ts_1.SubagentError("continuable-subagent setup ".concat(during, " failed to release ").concat(failures.length, " installation(s): ")
            + failures.map(function (failure) { return (0, dsh_llm_1.errorChain)(failure); }).join('; '), 'ACTIVATION_SETUP_RELEASE_FAILED');
    };
    /** Drop one installation from both indices and dispose it exactly once. */
    SubagentActivationSetupRegistry.prototype.release = function (installation) {
        if (installation.released)
            return;
        installation.released = true;
        installation.registration.installations.delete(installation);
        var indexed = this.byChild.get(installation.childCtx);
        /* v8 ignore next 4 -- every live installation is indexed until this method removes it. */
        if (indexed !== undefined) {
            indexed.delete(installation);
            if (indexed.size === 0)
                this.byChild.delete(installation.childCtx);
        }
        if (installation.transaction !== undefined)
            installation.transaction.invalidated = true;
        installation.dispose();
    };
    return SubagentActivationSetupRegistry;
}());
exports.SubagentActivationSetupRegistry = SubagentActivationSetupRegistry;
exports.default = SubagentActivationSetupRegistry;
