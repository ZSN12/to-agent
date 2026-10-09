"use strict";
/**
 * Lifecycle-edge publication for both subagent shapes: the contained emitter,
 * the one-shot run observer, and the continuable Activation observer.
 *
 * The public payload contracts ({@link SubagentRunInfo},
 * {@link SubagentRunEndInfo}) live in `./types.ts` with the rest of the seam's
 * consumer-facing types; this module owns only the implementation and the
 * package-private {@link ActivationObserver} the continuation manager consumes.
 * Keeping the internal control interface out of the published surface is
 * deliberate: the observer's `start`/`capture`/`settle` ordering is a contract
 * between this module and one in-package caller, not something a plugin may
 * depend on.
 *
 * @module @z/dsh-subagent/lifecycle
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
exports.createLifecycleEmitter = createLifecycleEmitter;
exports.observeRun = observeRun;
exports.createActivationObserver = createActivationObserver;
var node_crypto_1 = require("node:crypto");
var dsh_agent_1 = require("@z/dsh-agent");
var assistant_output_ts_1 = require("./assistant-output.ts");
var types_ts_1 = require("./types.ts");
/**
 * Build the contained lifecycle emitter this seam publishes every edge through.
 * Every listener is independently contained: a synchronous throw or a rejected
 * returned promise is logged without starving peer listeners, changing the run,
 * or — for provider removal, which fires from a disposer — breaking teardown.
 * @param ctx - the service's own context, owning dispatch and the logger.
 * @param carrier - resolve the scoped dispatch carrier for one delegating parent.
 * @returns the emitter both observers and the provider registry publish through.
 */
function createLifecycleEmitter(ctx, carrier) {
    return function (name, info, parent) {
        var dispatchArgs = parent === undefined
            ? [name, info]
            : [carrier(parent), name, info];
        for (var _i = 0, _a = ctx.events.dispatch('emit', dispatchArgs); _i < _a.length; _i++) {
            var callback = _a[_i];
            try {
                var returned = callback(info);
                void Promise.resolve(returned).catch(function (error) {
                    ctx.logger.warn("subagent: ".concat(name, " listener rejected: ").concat(renderThrown(error)));
                });
            }
            catch (error) {
                ctx.logger.warn("subagent: ".concat(name, " listener threw: ").concat(renderThrown(error)));
            }
        }
    };
}
/**
 * Emit the start/end lifecycle pair for one accepted one-shot run.
 * @param emit - the contained lifecycle emitter.
 * @param provider - the provider that established the run.
 * @param parent - the delegating parent keying scoped dispatch.
 * @param run - the published run whose settlement closes the pair.
 * @returns the same run, unchanged.
 */
function observeRun(emit, provider, parent, run) {
    var identity = {
        runId: (0, types_ts_1.SubagentRunId)((0, node_crypto_1.randomUUID)()),
        provider: provider,
        id: run.id,
        local: run.localAgent !== undefined,
    };
    // Attach the terminal observer before dispatching start. Promise reactions
    // still run after this synchronous start emission, preserving start → end.
    void run.result.then(function (result) {
        emit('subagent/end', __assign(__assign(__assign({}, identity), { stopReason: result.stopReason }), result.output.length === 0 ? {} : { lastAssistantMessage: result.output }), parent);
    }, function () {
        emit('subagent/end', __assign(__assign({}, identity), { stopReason: 'error' }), parent);
    });
    emit('subagent/start', identity, parent);
    return run;
}
/**
 * Build the observer for one continuable Activation's residency epoch. Observers
 * see the same vocabulary as a one-shot run, so a child's start and settlement
 * remain observable without exposing whether the manager materialized, woke, or
 * cold-resumed it. Creation failure before residency emits no lifecycle edge.
 * @param emit - the contained lifecycle emitter.
 * @param provider - the provider name recorded in the durable descriptor.
 * @param childId - the durable child session id.
 * @param parent - the exact live direct parent keying scoped dispatch.
 * @returns the observer whose edges this epoch publishes.
 */
function createActivationObserver(emit, provider, childId, parent) {
    var identity = { runId: (0, types_ts_1.SubagentRunId)((0, node_crypto_1.randomUUID)()), provider: provider, id: childId, local: true };
    // A cold resume replays earlier turns, so this epoch's telemetry must come
    // from the suffix it actually produced — never the whole session, which
    // would report a previous epoch's answer when this one opened no turn.
    var boundary = 0;
    // Assigned by `capture()`, which the disposal path always runs before
    // `settle()`; a resident epoch therefore always has its facts by then.
    var captured = { stopReason: 'completed' };
    // Teardown failure overrides the epoch's own outcome and withholds its
    // output: an answer this harness could not durably release is not a result.
    var terminal = function (failure) { return failure === undefined
        ? captured
        : { stopReason: 'error' }; };
    return {
        start: function (child) {
            boundary = child.session.events.length;
            emit('subagent/start', identity, parent);
        },
        capture: function (child) {
            var own = child.session.events.slice(boundary);
            var output = (0, assistant_output_ts_1.finalAssistantOutput)(own);
            captured = __assign({ stopReason: epochStopReason(own) }, output === undefined ? {} : { output: output });
        },
        terminal: terminal,
        settle: function (failure) {
            var _a = terminal(failure), stopReason = _a.stopReason, output = _a.output;
            emit('subagent/end', __assign(__assign(__assign({}, identity), { stopReason: stopReason }), output === undefined ? {} : { lastAssistantMessage: output }), parent);
        },
    };
}
/**
 * Why this child's epoch ended, for the terminal lifecycle edge and the
 * manager's own parent delivery. The child's own log is authoritative:
 * teardown succeeding says nothing about whether the model errored, hit its
 * token ceiling, or was cancelled, so deriving the reason from disposal would
 * report failed work as completed.
 *
 * {@link foldConsumedWork} supplies both halves the raw turn sequence cannot:
 * which turn accounts for the work this epoch consumed, and whether accepted
 * work was cancelled after it without any turn opening over it. A recorded
 * failure still wins over a cancellation — stopping a child that had already
 * failed does not turn its failure into a cancellation.
 * @param events - this epoch's own event suffix.
 * @returns its terminal stop reason; `completed` only for an epoch that both
 *   closed cleanly and had nothing left to run.
 */
function epochStopReason(events) {
    var _a = (0, dsh_agent_1.foldConsumedWork)(events), end = _a.end, droppedUnrun = _a.droppedUnrun;
    switch (end === null || end === void 0 ? void 0 : end.data.reason.kind) {
        case 'max-tokens':
            return 'max-tokens';
        case 'aborted':
        case 'interrupted':
            return 'aborted';
        case 'error':
            return 'error';
        // A pre-step rejection — a hook deny, a policy plugin — discarded input
        // this epoch had claimed: the work was declined, not done.
        case 'blocked':
            return 'refusal';
        // A clean ending and no accounting turn at all share one rule: the epoch
        // finished what it was given unless a cancelled queue says otherwise.
        case undefined:
        case 'completed':
            return droppedUnrun ? 'aborted' : 'completed';
        /* v8 ignore next 3 -- `TurnEndReason` is merge-extensible, so this arm needs a
         * backend that adds a variant; treating an unnameable reason as success would
         * report failed work as completed. */
        default:
            return 'error';
    }
}
/** Render any listener-thrown value without letting coercion escape containment. */
function renderThrown(value) {
    try {
        return value instanceof Error ? "".concat(value.name, ": ").concat(value.message) : String(value);
    }
    catch (_a) {
        return '<unrenderable thrown value>';
    }
}
