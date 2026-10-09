"use strict";
/**
 * Tool-pairing balance over a session surface. Compaction changes surface
 * positions, so safe cuts are derived from tool-call/result content in current
 * surface order rather than step markers.
 * @module @z/dsh-compaction/tool-pairing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolPairingBalancedBefore = toolPairingBalancedBefore;
exports.toolPairingBalancedAfter = toolPairingBalancedAfter;
var balanceCacheBySession = new WeakMap();
/** Return how one surface event changes the in-progress tool-call count. */
function eventDelta(event) {
    switch (event.type) {
        case 'assistant/message':
            return event.data.message.content.filter(function (block) { return block.type === 'tool-call'; }).length;
        case 'tool/result':
            return -1;
        default:
            return 0;
    }
}
/** Read and validate the event named by a surface sequence. */
function eventForSeq(events, seq) {
    var event = events[seq];
    if (event === undefined || event.seq !== seq) {
        throw new Error("tool-pairing balance: surface seq ".concat(seq, " has no matching session event (corrupt surface)"));
    }
    return event;
}
/** Fold surface sequences not yet in the cache into its balance state. */
function extendCache(session, cache, seqs) {
    var processed = cache.cutBalanced.length - 1;
    var tail = seqs.slice(processed);
    // Validate the unseen tail before mutating the live cache, so a corrupt
    // append cannot leave a partially advanced state behind.
    var events = session.events;
    var pendingCuts = [];
    var inProgressToolCalls = cache.inProgressToolCalls;
    for (var _i = 0, tail_1 = tail; _i < tail_1.length; _i++) {
        var seq = tail_1[_i];
        inProgressToolCalls += eventDelta(eventForSeq(events, seq));
        if (inProgressToolCalls < 0) {
            throw new Error("tool-pairing balance: tool/result at surface seq ".concat(seq, " has no matching tool-call (corrupt surface)"));
        }
        pendingCuts.push(inProgressToolCalls === 0);
    }
    tail.forEach(function (seq, offset) { return cache.indexBySeq.set(seq, processed + offset); });
    cache.cutBalanced = cache.cutBalanced.concat(pendingCuts);
    cache.inProgressToolCalls = inProgressToolCalls;
    return cache;
}
/** Return balance state synchronized with the current session surface. */
function balanceCache(session) {
    var surface = session.surface;
    var seqs = surface.nodes;
    var generation = surface.replaceGeneration;
    var cached = balanceCacheBySession.get(session);
    if (cached === undefined || cached.generation !== generation || cached.cutBalanced.length - 1 > seqs.length) {
        // A rebuild is the same fold started from the empty-surface state, whose
        // single leading cut is trivially balanced.
        var rebuilt = extendCache(session, {
            generation: generation,
            cutBalanced: [true],
            indexBySeq: new Map(),
            inProgressToolCalls: 0,
        }, seqs);
        balanceCacheBySession.set(session, rebuilt);
        return rebuilt;
    }
    if (cached.cutBalanced.length - 1 < seqs.length)
        return extendCache(session, cached, seqs);
    return cached;
}
/** Balance of the cut at a sequence's position plus offset, rejecting seqs outside current membership. */
function cutBalance(cache, seq, offset) {
    var index = cache.indexBySeq.get(seq);
    var balanced = index === undefined ? undefined : cache.cutBalanced[index + offset];
    if (balanced === undefined) {
        throw new Error("tool-pairing balance: surface seq ".concat(seq, " not found"));
    }
    return balanced;
}
/**
 * Whether the cut immediately before a current surface sequence is tool-pairing balanced.
 * @param session - session whose surface is checked.
 * @param seq - event sequence whose leading cut is checked.
 * @returns true when no unanswered tool call crosses the cut.
 * @throws when the seq is absent from the current surface, a surface sequence has no
 * matching log event, or a tool result has no preceding open call.
 */
function toolPairingBalancedBefore(session, seq) {
    return cutBalance(balanceCache(session), seq, 0);
}
/**
 * Whether the cut immediately after a current surface sequence is tool-pairing balanced.
 * @param session - session whose surface is checked.
 * @param seq - event sequence whose trailing cut is checked.
 * @returns true when no unanswered tool call crosses the cut.
 * @throws when the seq is absent from the current surface, a surface sequence has no
 * matching log event, or a tool result has no preceding open call.
 */
function toolPairingBalancedAfter(session, seq) {
    return cutBalance(balanceCache(session), seq, 1);
}
