"use strict";
/**
 * The in-process FORK subagent backend: registers a {@link SubagentProvider} on
 * `ctx.subagents` that runs each child as a child {@link Agent} SEEDED with a prefix of the
 * parent's session log — so the child inherits the parent's conversation context instead of
 * starting fresh. The seed ends at the last `turn/end`: the current tool-call turn is
 * unbalanced and cannot be replayed as a valid child session.
 * @module @z/dsh-subagent-fork-in-process
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.inject = exports.name = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_subagent_in_process_driver_1 = require("@z/dsh-subagent-in-process-driver");
exports.name = 'subagent-fork-in-process';
// `tools` is deliberately NOT injected — same rationale as subagent-spawn-in-process: the
// per-run structured runtime gates its capture-tool registration on `tools`
// itself, so this backend's apply timing (and the delegation tool's position
// in the model-visible tool list) is unchanged by structured output.
exports.inject = ['subagents'];
exports.Config = schemastery_1.default.object({
    providerName: schemastery_1.default.string().default('fork'),
});
/**
 * The balanced completed-turn prefix of `parent`'s log: every event up to and including the
 * last `turn/end`. The in-flight turn is excluded; before any completed turn the child starts
 * fresh. Because live sequence numbers equal array indexes, the result remains a valid seed
 * beginning at sequence zero.
 * @param parent - the agent whose session log to slice.
 * @returns the seed events, contiguous from seq 0; empty when no turn has completed.
 */
function completedTurnPrefix(parent) {
    var events = parent.session.events;
    var lastEnd = events.findLast(function (e) { return e.type === 'turn/end'; });
    if (lastEnd === undefined)
        return [];
    // seq === array index (the append contract), so slice up to and including it.
    return events.slice(0, lastEnd.seq + 1);
}
/**
 * The fork provider. Supports `depthLimit` and `outputSchema` (via the shared
 * in-process structured runtime), plus `toolFilter`/`persona` (scoped
 * restrict() and a scoped shadowing persona section).
 */
var ForkInProcessProvider = /** @class */ (function () {
    function ForkInProcessProvider(name) {
        this.name = name;
        this.capabilities = { outputSchema: true, depthLimit: true, toolFilter: true, persona: true };
        // Context contract: a forked child IS seeded with the parent's completed-turn prefix.
        this.inheritsParentContext = true;
    }
    ForkInProcessProvider.prototype.start = function (request) {
        var seed = completedTurnPrefix(request.parent);
        return (0, dsh_subagent_in_process_driver_1.startInProcessRun)(request, __assign({}, seed.length > 0 ? { seed: seed } : {}));
    };
    // TODO(fork-continuable-prefix-reuse): no shipped composition calls this —
    // they bind fork to `backgroundMode: one-shot` because a continuable child's
    // `report` tool and prompt section precede the inherited history, defeating
    // the prefix reuse a fork exists for. Reopening needs a byte-identical child
    // system prompt and tool schemas; see issue #2124 and
    // .agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.md.
    ForkInProcessProvider.prototype.prepareContinuable = function (request) {
        // The fork prefix is captured ONCE, at creation: it becomes part of the
        // child's own durable transcript, so a later cold resume replays that
        // prefix instead of re-forking the parent's newer history.
        var seed = completedTurnPrefix(request.parent);
        return Promise.resolve(seed.length > 0 ? { seed: seed } : {});
    };
    return ForkInProcessProvider;
}());
function apply(ctx, config) {
    ctx.subagents.registerProvider(new ForkInProcessProvider(config.providerName));
}
