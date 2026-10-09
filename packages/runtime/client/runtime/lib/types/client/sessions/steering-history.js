"use strict";
/** Reconstruct durable steering identity from the event-sourced agent inbox. */
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
exports.SteeringHistory = void 0;
/**
 * Incrementally identifies `user/message` events claimed from the next-step
 * inbox. The agent loop records all admitted input as `user/message`; the
 * preceding `agent/inbox/spliced` events preserve whether it came from the
 * queued-turn list or the next-step list.
 */
var SteeringHistory = /** @class */ (function () {
    function SteeringHistory() {
        this.inbox = {
            'next-turn': [],
            'next-step': [],
        };
        this.claimedNextStep = new Set();
    }
    /** Clear all replay state before rebuilding a history window. */
    SteeringHistory.prototype.reset = function () {
        this.inbox['next-turn'] = [];
        this.inbox['next-step'] = [];
        this.claimedNextStep.clear();
    };
    /**
     * Apply one event and report whether it is a durable human steering message.
     * @param event - next raw session event in sequence order.
     * @returns true only for a user-origin message previously claimed from `next-step`.
     */
    SteeringHistory.prototype.apply = function (event) {
        if (event.type === 'agent/inbox/spliced') {
            this.applySplice(event.data);
            return false;
        }
        if (event.type !== 'user/message')
            return false;
        var id = event.data.id;
        if (!this.claimedNextStep.delete(id))
            return false;
        return event.data.source.kind === 'user';
    };
    /** Replay one host-validated inbox splice. */
    SteeringHistory.prototype.applySplice = function (_a) {
        var _b;
        var target = _a.target, start = _a.start, _c = _a.removedCount, removedCount = _c === void 0 ? 0 : _c, inserted = _a.inserted, outcome = _a.outcome;
        var removed = (_b = this.inbox[target]).splice.apply(_b, __spreadArray([start, removedCount], inserted, false));
        for (var _i = 0, inserted_1 = inserted; _i < inserted_1.length; _i++) {
            var identity = inserted_1[_i];
            this.claimedNextStep.delete(identity.id);
        }
        if (target !== 'next-step' || outcome === 'canceled')
            return;
        for (var _d = 0, removed_1 = removed; _d < removed_1.length; _d++) {
            var identity = removed_1[_d];
            this.claimedNextStep.add(identity.id);
        }
    };
    return SteeringHistory;
}());
exports.SteeringHistory = SteeringHistory;
