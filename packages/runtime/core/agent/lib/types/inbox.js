"use strict";
/**
 * Incremental projection of durable agent inbox events.
 *
 * @module @z/dsh-agent/inbox
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Inbox = void 0;
/** A replay-once projection that incrementally consumes later inbox splices. */
var Inbox = /** @class */ (function () {
    function Inbox(session, notifications) {
        var _a;
        this.session = session;
        this.notifications = notifications;
        this.state = { 'next-turn': [], 'next-step': [] };
        for (var _i = 0, _b = session.events.slice((_a = session.header.seedLength) !== null && _a !== void 0 ? _a : 0); _i < _b.length; _i++) {
            var event_1 = _b[_i];
            if (event_1.type !== 'agent/inbox/spliced')
                continue;
            try {
                this.apply(event_1.data);
            }
            catch (error) {
                throw new Error("invalid persisted inbox splice at session seq ".concat(event_1.seq), { cause: error });
            }
        }
    }
    Object.defineProperty(Inbox.prototype, "nextTurn", {
        /** Prompts awaiting individual turns. */
        get: function () {
            return this.state['next-turn'];
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Inbox.prototype, "nextStep", {
        /** Input awaiting the next step boundary. */
        get: function () {
            return this.state['next-step'];
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Inbox.prototype, "hasPending", {
        /** Whether either pending-message list contains work. */
        get: function () {
            return this.nextTurn.length > 0 || this.nextStep.length > 0;
        },
        enumerable: false,
        configurable: true
    });
    /** Durably cancel all pending input, clearing next-step before next-turn. */
    Inbox.prototype.clear = function () {
        this.splice('next-step', 0, this.nextStep.length, []);
        this.splice('next-turn', 0, this.nextTurn.length, []);
    };
    /**
     * Remove and return the complete batch proposed for one step, publishing
     * each claimed message. The durable splices are pure deletions.
     * @param target - whether this boundary also consumes one queued turn.
     * @param turn - turn that will own the claimed batch.
     * @returns next-step input followed by the queued turn, when requested.
     * @internal - The agent loop's step-boundary operation, not a plugin extension point.
     */
    Inbox.prototype.claim = function (target, turn) {
        var claimed = this.mutate('next-step', 0, this.nextStep.length, [], false);
        if (target === 'next-turn') {
            claimed.push.apply(claimed, this.mutate('next-turn', 0, 1, [], false));
        }
        for (var _i = 0, claimed_1 = claimed; _i < claimed_1.length; _i++) {
            var message = claimed_1[_i];
            this.notifications.claimed(message, turn);
        }
        return claimed;
    };
    /**
     * Append one message to a pending list and durably record the insertion.
     * @param target - pending list to extend.
     * @param message - message to append.
     * @throws if the message identity is already pending.
     */
    Inbox.prototype.append = function (target, message) {
        this.splice(target, this.state[target].length, 0, [message]);
    };
    /**
     * Prepend one message to a pending list and durably record the insertion.
     * @param target - pending list to extend.
     * @param message - message to prepend.
     * @throws if the message identity is already pending.
     */
    Inbox.prototype.prepend = function (target, message) {
        this.splice(target, 0, 0, [message]);
    };
    /**
     * Replace one pending message in place, possibly changing its identity. A
     * successful replacement publishes the old message as discarded and the new
     * message as inserted.
     * @param messageId - identity of the pending message to replace.
     * @param newMessage - replacement message.
     * @returns whether the message was still pending.
     * @throws if the replacement duplicates another pending message identity.
     */
    Inbox.prototype.replace = function (messageId, newMessage) {
        var location = this.locate(messageId);
        if (location === undefined)
            return false;
        this.splice(location.target, location.index, 1, [newMessage]);
        return true;
    };
    /**
     * Remove one pending message and durably record its cancellation.
     * @param messageId - identity of the pending message to remove.
     * @returns whether the message was still pending.
     */
    Inbox.prototype.remove = function (messageId) {
        var location = this.locate(messageId);
        if (location === undefined)
            return false;
        this.splice(location.target, location.index, 1, []);
        return true;
    };
    /**
     * Apply standard splice semantics and durably record the normalized result.
     * The durable event commits before the live projection mutates, so synchronous
     * `session/event` observers see the pre-splice lists and can reconstruct the
     * removed messages from the normalized coordinates.
     * @param target - pending list to mutate.
     * @param start - splice position.
     * @param deleteCount - maximum number of messages to remove.
     * @param inserted - messages to insert at the resolved position.
     * @returns messages removed by the splice.
     */
    Inbox.prototype.splice = function (target, start, deleteCount, inserted) {
        return this.mutate(target, start, deleteCount, inserted, true);
    };
    /** Locate one pending identity across both owned lists. */
    Inbox.prototype.locate = function (messageId) {
        for (var _i = 0, _a = ['next-turn', 'next-step']; _i < _a.length; _i++) {
            var target = _a[_i];
            var index = this.state[target].findIndex(function (message) { return message.id === messageId; });
            if (index >= 0)
                return { target: target, index: index };
        }
        return undefined;
    };
    /** Commit one normalized mutation and publish its live notifications. */
    Inbox.prototype.mutate = function (target, start, deleteCount, inserted, discardRemoved) {
        var inbox = this.state[target];
        var truncatedStart = Math.trunc(start);
        var offset = Number.isNaN(truncatedStart) ? 0 : truncatedStart;
        var actualStart = offset < 0
            ? Math.max(inbox.length + offset, 0)
            : Math.min(offset, inbox.length);
        var truncatedDeleteCount = Math.trunc(deleteCount);
        var actualDeleteCount = Math.min(Math.max(Number.isNaN(truncatedDeleteCount) ? 0 : truncatedDeleteCount, 0), inbox.length - actualStart);
        if (actualDeleteCount === 0 && inserted.length === 0)
            return [];
        var outcome = discardRemoved && actualDeleteCount > 0 ? 'canceled' : undefined;
        var splice = __assign(__assign(__assign({ target: target, start: actualStart }, (actualDeleteCount === 0 ? {} : { removedCount: actualDeleteCount })), { inserted: inserted }), (outcome === undefined ? {} : { outcome: outcome }));
        this.validate(splice);
        var event = this.session.append('agent/inbox/spliced', splice);
        var removed = inbox.splice.apply(inbox, __spreadArray([actualStart, actualDeleteCount], event.data.inserted, false));
        if (discardRemoved) {
            for (var _i = 0, removed_1 = removed; _i < removed_1.length; _i++) {
                var message = removed_1[_i];
                this.notifications.discarded(message);
            }
        }
        for (var _a = 0, _b = event.data.inserted; _a < _b.length; _a++) {
            var message = _b[_a];
            this.notifications.inserted(message);
        }
        return removed;
    };
    /** Apply one normalized durable splice to the projection. */
    Inbox.prototype.apply = function (splice) {
        var _a;
        var inbox = this.state[splice.target];
        var start = Math.max(0, Math.min(splice.start, inbox.length));
        var maxRemove = inbox.length - start;
        var removedCount = Math.max(0, Math.min((_a = splice.removedCount) !== null && _a !== void 0 ? _a : 0, maxRemove));
        var normalized = __assign(__assign({}, splice), { start: start, removedCount: removedCount });
        try {
            this.validate(normalized);
        }
        catch (_b) {
            // Ignore a malformed replay record during recovery instead of
            // corrupting the projection with duplicate ids or impossible bounds.
            return [];
        }
        return inbox.splice.apply(inbox, __spreadArray([start, removedCount], splice.inserted, false));
    };
    /** Validate one normalized splice against the current projection. */
    Inbox.prototype.validate = function (splice) {
        var _a;
        var inbox = this.state[splice.target];
        var removedCount = (_a = splice.removedCount) !== null && _a !== void 0 ? _a : 0;
        if (!Number.isSafeInteger(splice.start) || splice.start < 0 || splice.start > inbox.length
            || !Number.isSafeInteger(removedCount) || removedCount < 0
            || splice.start + removedCount > inbox.length) {
            throw new Error('invalid inbox splice');
        }
        var candidate = inbox.toSpliced.apply(inbox, __spreadArray([splice.start, removedCount], splice.inserted, false));
        var ids = new Set();
        for (var _i = 0, _b = splice.target === 'next-turn'
            ? __spreadArray(__spreadArray([], candidate, true), this.nextStep, true) : __spreadArray(__spreadArray([], this.nextTurn, true), candidate, true); _i < _b.length; _i++) {
            var message = _b[_i];
            if (ids.has(message.id))
                throw new Error("message \"".concat(message.id, "\" is already pending"));
            ids.add(message.id);
        }
    };
    return Inbox;
}());
exports.Inbox = Inbox;
