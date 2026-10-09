"use strict";
/** Package-owned subagent registry and lifecycle invariants. @module @z/dsh-subagent/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-subagent';
/** Cordis companion plugin name. */
exports.name = 'subagent-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** Assert that a terminal lifecycle payload matches its start identity. */
function validateRunEnd(start, end, fail) {
    if (start.provider !== end.provider || start.id !== end.id || start.local !== end.local) {
        fail("subagent/end identity diverges from subagent/start for run ".concat(JSON.stringify(end.runId)));
    }
}
/** Install provider-registry and start/end pairing checks. */
var install = Object.assign(function (ctx, fail) {
    var providers = new Set(ctx.subagents.list());
    var runs = new Map();
    var stagedProviders = new WeakSet();
    var stagedRemovals = new Set();
    var stagedStarts = new WeakSet();
    var stagedEnds = new WeakSet();
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName === 'subagent/provider-added') {
            var provider = args[0];
            if (provider.name.length === 0)
                fail('subagent provider names must be non-empty');
            if (providers.has(provider.name))
                fail("subagent/provider-added repeated ".concat(JSON.stringify(provider.name)));
            stagedProviders.add(provider);
            return;
        }
        if (eventName === 'subagent/provider-removed') {
            var providerName = args[0];
            if (!providers.has(providerName))
                fail("subagent/provider-removed names unknown provider ".concat(JSON.stringify(providerName)));
            stagedRemovals.add(providerName);
            return;
        }
        if (eventName === 'subagent/start') {
            var info_1 = args[0];
            // Provider availability is an admission-time relationship. A published
            // one-shot run may outlive provider removal, and a cold-resumed Activation
            // records the initial provider name without dispatching through it.
            if (info_1.provider.length === 0 || String(info_1.runId).length === 0 || String(info_1.id).length === 0) {
                fail('subagent/start provider, runId, and child id must be non-empty');
            }
            if (runs.has(info_1.runId))
                fail("subagent/start repeated run id ".concat(JSON.stringify(info_1.runId)));
            stagedStarts.add(info_1);
            return;
        }
        if (eventName !== 'subagent/end')
            return;
        var info = args[0];
        var start = runs.get(info.runId);
        if (start === undefined)
            fail("subagent/end has no matching subagent/start for run ".concat(JSON.stringify(info.runId)));
        validateRunEnd(start, info, fail);
        stagedEnds.add(info);
    }, { global: true });
    ctx.on('subagent/provider-added', function (provider) {
        /* v8 ignore next -- internal/dispatch stages the same provider object */
        if (!stagedProviders.delete(provider))
            return;
        providers.add(provider.name);
    }, { global: true });
    ctx.on('subagent/provider-removed', function (providerName) {
        /* v8 ignore next -- internal/dispatch stages the same provider name */
        if (!stagedRemovals.delete(providerName))
            return;
        providers.delete(providerName);
    }, { global: true });
    ctx.on('subagent/start', function (info) {
        /* v8 ignore next -- internal/dispatch stages the same lifecycle object */
        if (!stagedStarts.delete(info))
            return;
        runs.set(info.runId, info);
    }, { global: true });
    ctx.on('subagent/end', function (info) {
        /* v8 ignore next -- internal/dispatch stages the same lifecycle object */
        if (!stagedEnds.delete(info))
            return;
        runs.delete(info.runId);
    }, { global: true });
}, { inject: ['subagents'] });
/**
 * Register the subagent invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
