"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-workspace`.
 * @module @z/dsh-workspace/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var dsh_workspace_1 = require("@z/dsh-workspace");
var PACKAGE_NAME = '@z/dsh-workspace';
/** Cordis companion plugin name. */
exports.name = 'workspace-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * Owned relationship: the registry's entity cache mirrors the workspace
 * domain's durable table. Every `domain/changed` for the `workspaces` table
 * must name a record the cache already holds an entity for (the registry
 * caches before the durable put and mutates only through cached entities).
 * A delete is valid only after the registry has removed the entity from its
 * cache, whether for create rollback or an explicit registration deletion;
 * deleting while the cache still publishes the entity proves a bypass.
 */
var install = Object.assign(function (ctx, fail) {
    ctx.on('domain/changed', function (change) {
        if (change.domain !== 'workspace' || change.table !== 'workspaces')
            return;
        if (change.operation === 'deleted') {
            if (ctx.workspaceRegistry.get((0, dsh_workspace_1.WorkspaceId)(change.key)) !== undefined) {
                fail("workspace record '".concat(change.key, "' was deleted while the registry cache still ")
                    + 'publishes it — some write path bypassed ctx.workspaceRegistry');
            }
            return;
        }
        if (ctx.workspaceRegistry.get((0, dsh_workspace_1.WorkspaceId)(change.key)) === undefined) {
            fail("workspace record '".concat(change.key, "' landed durably but the registry cache holds ")
                + 'no entity for it — the cache and the domain table have diverged');
        }
    });
}, { inject: ['workspaceRegistry'] });
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
