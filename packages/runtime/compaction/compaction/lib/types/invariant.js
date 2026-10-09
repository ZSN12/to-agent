"use strict";
/** Package-owned compaction log-stream invariants. @module @z/dsh-compaction/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var dsh_session_1 = require("@z/dsh-session");
var checkpoint_ts_1 = require("./checkpoint.ts");
var PACKAGE_NAME = '@z/dsh-compaction';
/** Cordis companion plugin name. */
exports.name = 'compaction-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** Require a durable opaque identity to be a non-empty string. */
function validateId(value, label, fail) {
    if (typeof value !== 'string' || value.length === 0)
        fail("".concat(label, " must be a non-empty string"));
}
/** Keep the optional initiating command identity stable across one transaction. */
function validateSourceCommandId(eventType, value, expected, fail) {
    if (value !== undefined)
        validateId(value, "".concat(eventType, " sourceCommandId"), fail);
    if (value !== expected) {
        fail("".concat(eventType, " sourceCommandId ").concat(String(value), " does not match compaction/start sourceCommandId ").concat(String(expected)));
    }
}
/** Validate one replacement checkpoint against its open compaction transaction. */
function validateCheckpoint(trace, event, fail) {
    var source = event.data.source;
    validateId(source.compactionId, 'compaction checkpoint compactionId', fail);
    if (source.sourceCommandId !== undefined) {
        validateId(source.sourceCommandId, 'compaction checkpoint sourceCommandId', fail);
    }
    var open = trace.compaction;
    if (open === undefined)
        fail('compaction checkpoint has no matching compaction/start');
    if (source.compactionId !== open.compactionId) {
        fail("compaction checkpoint id ".concat(source.compactionId, " does not match compaction/start id ").concat(open.compactionId));
    }
    validateSourceCommandId('compaction checkpoint', source.sourceCommandId, open.sourceCommandId, fail);
}
/** Compaction starts still unmatched when a later seed boundary made them stale. */
function inheritedOrphanStartSeqs(events) {
    var stale = new Set();
    var openStartSeq;
    for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
        var event_1 = events_1[_i];
        if (event_1.type === 'compaction/start') {
            openStartSeq = event_1.seq;
        }
        else if (event_1.type === 'compaction/end') {
            openStartSeq = undefined;
        }
        else if (event_1.type === 'session/end-seed') {
            if (openStartSeq !== undefined)
                stale.add(openStartSeq);
            openStartSeq = undefined;
        }
    }
    return stale;
}
/** Keep every live compaction bracket on one side of each turn boundary. */
function validateTurnBoundary(trace, event, fail) {
    if ((event.type !== 'turn/start' && event.type !== 'turn/end')
        || trace.compaction === undefined)
        return;
    var owner = trace.compaction.turn === null
        ? 'standalone compaction'
        : "compaction for turn ".concat(trace.compaction.turn);
    fail("".concat(event.type, " cannot cross an open ").concat(owner));
}
/** Advance the committed turn cursor after its boundary has been accepted. */
function applyTurnBoundary(trace, event) {
    if (event.type === 'turn/start') {
        trace.openTurn = event.data.turn;
        return true;
    }
    if (event.type === 'turn/end') {
        trace.openTurn = null;
        return true;
    }
    return false;
}
/** Require a numbered bracket inside its exact turn, or a standalone bracket between turns. */
function validateOwner(owner, openTurn, eventType, fail) {
    if (owner === null) {
        if (openTurn !== null)
            fail("".concat(eventType, " is standalone but turn ").concat(openTurn, " is open"));
        return;
    }
    if (openTurn === null)
        fail("".concat(eventType, " for turn ").concat(owner, " appended outside any open turn"));
    if (owner !== openTurn)
        fail("".concat(eventType, " names turn ").concat(owner, " but open turn is ").concat(openTurn));
}
/** Validate one compaction event without advancing committed trace state. */
function validateCompactionEvent(trace, event, fail) {
    if (event.type === 'session/end-seed')
        return { kind: 'end-seed' };
    if (event.type === 'user/message'
        && (0, dsh_session_1.isReplacementSurfaceEvent)(event)
        && (0, checkpoint_ts_1.isCompactCheckpointSource)(event.data.source)) {
        validateCheckpoint(trace, event, fail);
        return undefined;
    }
    if (event.type !== 'compaction/start' && event.type !== 'compaction/summary' && event.type !== 'compaction/end') {
        return undefined;
    }
    var open = trace.compaction;
    if (event.type === 'compaction/start') {
        validateId(event.data.compactionId, 'compaction/start compactionId', fail);
        if (event.data.sourceCommandId !== undefined) {
            validateId(event.data.sourceCommandId, 'compaction/start sourceCommandId', fail);
        }
        if (open !== undefined) {
            var owner = open.turn === null ? 'standalone compaction' : "turn ".concat(open.turn);
            fail("compaction/start while ".concat(owner, " is still compacting"));
        }
        validateOwner(event.data.turn, trace.openTurn, event.type, fail);
        return {
            kind: 'start',
            compactionId: event.data.compactionId,
            sourceCommandId: event.data.sourceCommandId,
            startSeq: event.seq,
            turn: event.data.turn,
        };
    }
    if (event.type === 'compaction/summary') {
        validateId(event.data.compactionId, 'compaction/summary compactionId', fail);
        if (event.data.sourceCommandId !== undefined) {
            validateId(event.data.sourceCommandId, 'compaction/summary sourceCommandId', fail);
        }
        if (open === undefined)
            fail('compaction/summary has no matching compaction/start');
        if (event.data.compactionId !== open.compactionId) {
            fail("compaction/summary id ".concat(event.data.compactionId, " does not match compaction/start id ").concat(open.compactionId));
        }
        validateSourceCommandId('compaction/summary', event.data.sourceCommandId, open.sourceCommandId, fail);
        validateOwner(open.turn, trace.openTurn, event.type, fail);
        if (open.summarized)
            fail('compaction/summary repeated within one compaction');
        var seqs = event.data.shadowedSeqs;
        if (seqs.length === 0)
            fail('compaction/summary shadowedSeqs must be non-empty');
        if (seqs[0] !== event.data.shadowedRange.start || seqs.at(-1) !== event.data.shadowedRange.end) {
            fail('compaction/summary shadowedRange must match the first and last shadowedSeqs');
        }
        if (!Number.isSafeInteger(event.data.shadowedTokenCount) || event.data.shadowedTokenCount < 0) {
            fail('compaction/summary shadowedTokenCount must be a non-negative safe integer');
        }
        return {
            kind: 'summary',
            compactionId: open.compactionId,
            sourceCommandId: open.sourceCommandId,
            startSeq: open.startSeq,
            turn: open.turn,
        };
    }
    validateId(event.data.compactionId, 'compaction/end compactionId', fail);
    if (event.data.sourceCommandId !== undefined) {
        validateId(event.data.sourceCommandId, 'compaction/end sourceCommandId', fail);
    }
    if (open === undefined)
        fail('compaction/end has no matching compaction/start');
    if (event.data.compactionId !== open.compactionId) {
        fail("compaction/end id ".concat(event.data.compactionId, " does not match compaction/start id ").concat(open.compactionId));
    }
    validateSourceCommandId('compaction/end', event.data.sourceCommandId, open.sourceCommandId, fail);
    if (event.data.turn !== open.turn) {
        fail("compaction/end owner ".concat(String(event.data.turn), " does not match compaction/start owner ").concat(String(open.turn)));
    }
    validateOwner(open.turn, trace.openTurn, event.type, fail);
    if (event.data.error === undefined && !open.summarized) {
        fail('successful compaction/end requires one compaction/summary');
    }
    return { kind: 'end' };
}
/** Apply one committed compaction transition. */
function applyCompactionTransition(transition) {
    if (transition.kind === 'start') {
        return {
            compactionId: transition.compactionId,
            sourceCommandId: transition.sourceCommandId,
            startSeq: transition.startSeq,
            turn: transition.turn,
            summarized: false,
        };
    }
    if (transition.kind === 'summary') {
        return {
            compactionId: transition.compactionId,
            sourceCommandId: transition.sourceCommandId,
            startSeq: transition.startSeq,
            turn: transition.turn,
            summarized: true,
        };
    }
    return undefined;
}
/** Install compaction start/summary/end checks. */
// Event owners keep precommit staging local so their vocabularies never move into a central helper.
/* jscpd:ignore-start */
var install = Object.assign(function (ctx, fail) {
    var traces = new WeakMap();
    var staged = new WeakMap();
    var seed = function (session) {
        var trace = { openTurn: null, compaction: undefined };
        traces.set(session, trace);
        var staleOrphanStartSeqs = inheritedOrphanStartSeqs(session.events);
        for (var _i = 0, _a = session.events; _i < _a.length; _i++) {
            var event_2 = _a[_i];
            // Constructor-seed repair boundaries can precede the end-seed marker
            // that proves an inherited orphan stale. Replay that inherited prefix
            // without letting the soon-to-be-cleared bracket veto its repair.
            if (trace.compaction === undefined
                || !staleOrphanStartSeqs.has(trace.compaction.startSeq)) {
                validateTurnBoundary(trace, event_2, fail);
            }
            var transition = validateCompactionEvent(trace, event_2, fail);
            if (transition !== undefined)
                trace.compaction = applyCompactionTransition(transition);
            applyTurnBoundary(trace, event_2);
        }
        return trace;
    };
    var traceFor = function (session) { var _a; return (_a = traces.get(session)) !== null && _a !== void 0 ? _a : seed(session); };
    for (var _i = 0, _a = ctx.sessions.list(); _i < _a.length; _i++) {
        var session = _a[_i];
        seed(session);
    }
    ctx.on('session/created', function (session) { seed(session); }, { global: true });
    ctx.on('session/event', function (session, event) {
        var trace = traceFor(session);
        validateTurnBoundary(trace, event, fail);
        if (applyTurnBoundary(trace, event))
            return;
        if (event.type !== 'session/end-seed'
            && event.type !== 'compaction/start'
            && event.type !== 'compaction/summary'
            && event.type !== 'compaction/end')
            return;
        var candidate = staged.get(event);
        /* v8 ignore next -- internal/dispatch stages every compaction event */
        if (candidate === undefined || candidate.session !== session)
            return fail('compaction event published without pre-commit validation');
        staged.delete(event);
        trace.compaction = applyCompactionTransition(candidate.transition);
    }, { global: true });
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName !== 'session/event')
            return;
        var _a = args, session = _a[0], event = _a[1];
        var trace = traceFor(session);
        validateTurnBoundary(trace, event, fail);
        var transition = validateCompactionEvent(trace, event, fail);
        if (transition !== undefined)
            staged.set(event, { session: session, transition: transition });
    }, { global: true });
}, { inject: ['sessions'] });
/* jscpd:ignore-end */
/**
 * Register the compact invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
