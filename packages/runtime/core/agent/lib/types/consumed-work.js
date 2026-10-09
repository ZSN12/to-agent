"use strict";
/**
 * How one agent log accounts for the work it consumed.
 *
 * The turn and step vocabulary alone cannot answer this. A turn that stops
 * before its first step leaves a `turn/end` shaped exactly like the balanced
 * no-op turns a rejection or an empty claim produces, so reading turns in
 * isolation either credits cut-short work as finished or convicts every no-op.
 * The missing fact is the inbox's own record: {@link Inbox} logs each mutation
 * with `removedCount` and marks a cancellation `outcome: 'canceled'`, which
 * separates a turn claiming its input from work being dropped unrun.
 *
 * @module @z/dsh-agent/consumed-work
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
exports.foldConsumedWork = foldConsumedWork;
/**
 * Whether a turn that consumed input but never reached a step ends in a way
 * that accounts for that input. Only a `completed` end does not: it had
 * nothing left to run once its claim was rewritten away. A `blocked` end is
 * that input's ending too — the pre-step rejection that produced it discarded
 * the claimed messages, so the work it took will never run.
 * @param reason - the turn's recorded ending.
 * @returns whether the ending accounts for the input the turn took.
 */
function accountsForClaim(reason) {
    switch (reason.kind) {
        case 'completed':
            return false;
        case 'blocked':
        case 'aborted':
        case 'interrupted':
        case 'error':
            return true;
        /* v8 ignore next 4 -- unreachable: the one unnamed built-in, `max-tokens`, requires a step,
         * so its turn short-circuits as stepped before this call, and `TurnEndReasonMap` is
         * merge-extensible, so a backend-added variant cannot be listed; an unnameable ending over
         * consumed input must not read as success. */
        default:
            return true;
    }
}
/**
 * Fold one agent log, or an owned suffix of one, into its account of consumed
 * work. Single pass, and every input is the log itself: no caller has to sample
 * live state before cancelling, so a cancellation issued by anyone — the owner's
 * teardown, an ancestor's interrupt, an unloading plugin — reads the same.
 * @param events - the log, or an owned suffix, to fold.
 * @returns the accounting turn when one closed, and whether work was dropped unrun after it.
 */
function foldConsumedWork(events) {
    var stepped = new Set();
    var claimed = new Set();
    var open;
    var end;
    var droppedUnrun = false;
    for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
        var event_1 = events_1[_i];
        switch (event_1.type) {
            case 'turn/start':
                open = event_1.data.turn;
                break;
            case 'step/start':
                stepped.add(event_1.data.turn);
                break;
            case 'agent/inbox/spliced': {
                var _a = event_1.data, removedCount = _a.removedCount, outcome = _a.outcome, inserted = _a.inserted;
                if (removedCount === undefined)
                    break;
                // A replacement keeps the work pending under a new identity, so only a
                // cancellation that leaves nothing behind drops it.
                if (outcome === 'canceled')
                    droppedUnrun || (droppedUnrun = inserted.length === 0);
                // Claims are the loop's own step-boundary reads, always inside a turn.
                else if (open !== undefined)
                    claimed.add(open);
                break;
            }
            case 'turn/end': {
                var _b = event_1.data, turn = _b.turn, reason = _b.reason;
                open = undefined;
                if (stepped.delete(turn) || (claimed.delete(turn) && accountsForClaim(reason))) {
                    end = event_1;
                    // Anything dropped before this turn closed is what its own ending
                    // reports; only a later drop is still unaccounted for.
                    droppedUnrun = false;
                }
                break;
            }
            default:
                break;
        }
    }
    return __assign(__assign({}, end === undefined ? {} : { end: end }), { droppedUnrun: droppedUnrun });
}
