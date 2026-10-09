"use strict";
/**
 * The in-process SPAWN subagent backend: registers a {@link SubagentProvider} on
 * `ctx.subagents` that runs each child as a fresh child {@link Agent} on the same cordis
 * context (its own session, own system prompt, zero parent context). The cheapest transport,
 * reusing the agent factory's quiescent teardown.
 * @module @z/dsh-subagent-spawn-in-process
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.inject = exports.name = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_subagent_in_process_driver_1 = require("@z/dsh-subagent-in-process-driver");
exports.name = 'subagent-spawn-in-process';
// `tools` is deliberately not injected: the child factory already provides it during setup,
// and adding it here would unnecessarily change this provider's apply timing.
exports.inject = ['subagents'];
exports.Config = schemastery_1.default.object({
    providerName: schemastery_1.default.string().default('spawn'),
});
/**
 * The spawn provider. Supports every start-time capability: `depthLimit` (it
 * constructs the child, so it can enforce a recursion cap), `outputSchema`
 * (the scoped structured runtime), and `toolFilter`/`persona` (scoped
 * `restrict()` and a scoped shadowing persona section, applied in the child's
 * creation window).
 */
var SpawnInProcessProvider = /** @class */ (function () {
    function SpawnInProcessProvider(name) {
        this.name = name;
        this.capabilities = { outputSchema: true, depthLimit: true, toolFilter: true, persona: true };
        // Context contract: a spawned child starts fresh — it never sees the parent conversation.
        this.inheritsParentContext = false;
    }
    SpawnInProcessProvider.prototype.start = function (request) {
        // Fresh child: no seed. The shared driver mints ids, stamps cwd/lineage/
        // depth, drives the one-shot (including the structured capture when the
        // request carries an outputSchema), and maps the result.
        return (0, dsh_subagent_in_process_driver_1.startInProcessRun)(request, {});
    };
    SpawnInProcessProvider.prototype.prepareContinuable = function () {
        // A spawned child starts fresh, so it contributes no seed; the continuation
        // manager owns every later operation on it.
        return Promise.resolve({});
    };
    return SpawnInProcessProvider;
}());
function apply(ctx, config) {
    ctx.subagents.registerProvider(new SpawnInProcessProvider(config.providerName));
}
