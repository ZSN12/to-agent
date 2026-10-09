"use strict";
/** Package-owned filesystem event-data invariants. @module @z/dsh-fs/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-fs';
/** Cordis companion plugin name. */
exports.name = 'fs-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** Assert that an event carries a usable opaque target identity. */
function validateTarget(target, fail) {
    if (target.targetKey.length === 0)
        fail('filesystem event targetKey must be non-empty');
    if (target.displayPath.length === 0)
        fail('filesystem event displayPath must be non-empty');
}
/** Install checks over the filesystem decision and observation event stream. */
var install = function (ctx, fail) {
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName !== 'fs/write-intent'
            && eventName !== 'fs/edit-intent'
            && eventName !== 'fs/observed')
            return;
        validateTarget(args[0], fail);
        if (eventName === 'fs/observed') {
            var observation = args[1];
            switch (observation.kind) {
                case 'present':
                    if (observation.version.length === 0)
                        fail('fs/observed present version must be non-empty');
                    break;
                case 'absent':
                    break;
                default:
                    fail('fs/observed kind must be present or absent');
            }
        }
    }, { global: true });
};
/**
 * Register the filesystem invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
