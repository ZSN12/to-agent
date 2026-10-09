"use strict";
/** Package-owned background-job snapshot invariants. @module @z/dsh-jobs/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-jobs';
var TERMINAL_STATUSES = new Set(['completed', 'killed', 'failed']);
/** Cordis companion plugin name. */
exports.name = 'jobs-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** Validate the cross-field relationships in one registry snapshot. */
function validateSnapshot(snapshot, owner, fail) {
    var id = String(snapshot.id);
    var prefix = "".concat(snapshot.kind, "-");
    var ordinal = Number(id.slice(prefix.length));
    if (snapshot.kind.length === 0 || !id.startsWith(prefix)
        || !Number.isSafeInteger(ordinal) || ordinal < 1) {
        fail("job snapshot id ".concat(JSON.stringify(id), " must be ").concat(JSON.stringify(prefix), " followed by a positive ordinal"));
    }
    if (snapshot.label.length === 0)
        fail("job ".concat(JSON.stringify(id), " label must be non-empty"));
    if (!Number.isSafeInteger(snapshot.startedAt) || snapshot.startedAt < 0) {
        fail("job ".concat(JSON.stringify(id), " startedAt must be a non-negative epoch integer"));
    }
    var terminal = TERMINAL_STATUSES.has(snapshot.status);
    if (terminal !== (snapshot.finishedAt !== undefined)) {
        fail("job ".concat(JSON.stringify(id), " finishedAt must be present exactly for a terminal status"));
    }
    if (snapshot.finishedAt !== undefined
        && (!Number.isSafeInteger(snapshot.finishedAt) || snapshot.finishedAt < snapshot.startedAt)) {
        fail("job ".concat(JSON.stringify(id), " finishedAt must be an epoch integer no earlier than startedAt"));
    }
    var expectedOwner = owner === null || owner === void 0 ? void 0 : owner.id;
    if (snapshot.ownerSession !== expectedOwner) {
        fail("job ".concat(JSON.stringify(id), " ownerSession does not match its completion owner"));
    }
}
/** Install checks over current unowned records and every terminal snapshot. */
var install = Object.assign(function (ctx, fail) {
    for (var _i = 0, _a = ctx.jobs.list(); _i < _a.length; _i++) {
        var snapshot = _a[_i];
        validateSnapshot(snapshot, undefined, fail);
    }
    ctx.jobs.onJobDone(function (snapshot, owner) { validateSnapshot(snapshot, owner, fail); });
}, { inject: ['jobs'] });
/**
 * Register the job-registry invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
