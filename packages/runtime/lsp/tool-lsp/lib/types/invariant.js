"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-tool-lsp`.
 * @module @z/dsh-tool-lsp/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-tool-lsp';
/** Cordis companion plugin name. */
exports.name = 'tool-lsp-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: this stateless adapter contributes one tool and prompt section, while query
 * lifecycle and result relations remain owned by the tool and LSP seams it composes.
 */
var install = function () { };
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
/* jscpd:ignore-end */
