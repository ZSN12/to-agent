"use strict";
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
exports.ProjectionValueStore = void 0;
var notifier_ts_1 = require("./notifier.ts");
/**
 * One session's projection values. Framework semantics, uniform across every
 * key: a baseline seeds rows at its cut, a push frame updates one row, and in
 * both paths a lower-or-equal seq loses — a replayed frame cannot regress a
 * value, a stale baseline cannot overwrite a newer frame. A key the store has
 * never seen reads `undefined` (capability absent). Faces are identity-stable
 * per key (create-on-demand, cached) so the React side binds each exactly
 * once; the store-level channel (`subscribeAny`) serves coarse consumers (the
 * manager's list projection reads the `title` key).
 */
var ProjectionValueStore = /** @class */ (function () {
    function ProjectionValueStore() {
        this.rows = new Map();
        this.channels = new Map();
        /** Coarse any-key channel (no snapshot cache to rebuild: reads hit rows directly). */
        this.anyNotifier = new notifier_ts_1.Notifier(function () { });
    }
    /**
     * Key-addressed bare observable face (the useProjection resolution path).
     * Always defined — absence is an `undefined` snapshot, never a missing
     * face, so a component may subscribe before the key ever carries a value.
     * @param key - projection key.
     * @returns the identity-stable face for this key.
     */
    ProjectionValueStore.prototype.faceOf = function (key) {
        return this.channel(key).face;
    };
    /**
     * Current whole value for a key (erased framework read; typed reads go
     * through `useProjection`'s map lookup).
     * @param key - projection key.
     * @returns the value, or undefined while the key is absent.
     */
    ProjectionValueStore.prototype.get = function (key) {
        var _a;
        return (_a = this.rows.get(key)) === null || _a === void 0 ? void 0 : _a.value;
    };
    /**
     * Read every current projection value as one reference-stable snapshot.
     * @returns The same frozen value map until a row changes.
     */
    ProjectionValueStore.prototype.values = function () {
        if (this.valuesCache === undefined) {
            this.valuesCache = Object.freeze(Object.fromEntries(__spreadArray([], this.rows, true).map(function (_a) {
                var key = _a[0], row = _a[1];
                return [key, row.value];
            })));
        }
        return this.valuesCache;
    };
    /**
     * Subscribe to any-key changes (microtask-batched) — the manager's list
     * rebuild channel.
     * @param listener - change callback.
     * @returns the unsubscribe function.
     */
    ProjectionValueStore.prototype.subscribeAny = function (listener) {
        return this.anyNotifier.subscribe(listener);
    };
    /**
     * Apply one finished value (the `session/projection` push-frame path).
     * @param key - projection key.
     * @param value - whole value computed by the host unit.
     * @param seq - the unit's watermark at emission.
     */
    ProjectionValueStore.prototype.apply = function (key, value, seq) {
        var row = this.rows.get(key);
        if (row !== undefined && seq <= row.seq)
            return; // higher seq wins; replays and stale frames drop
        this.rows.set(key, { value: value, seq: seq });
        this.changed(key);
    };
    /**
     * Seed from a history tail page's projections block: every carried key
     * lands under the same seq rule as frames; a key the block omits is
     * capability-absent as of the cut — its row clears unless a newer frame
     * already superseded the cut (a stale baseline can neither overwrite nor
     * clear newer values).
     * @param baseline - the response's projections block.
     */
    ProjectionValueStore.prototype.seed = function (baseline) {
        // Erased walk: the framework crosses the open key space; per-key typing
        // is re-established at the consumer (useProjection's map lookup).
        var values = baseline.values;
        for (var _i = 0, _a = Object.keys(values); _i < _a.length; _i++) {
            var key = _a[_i];
            this.apply(key, values[key], baseline.asOfSeq);
        }
        for (var _b = 0, _c = this.rows; _b < _c.length; _b++) {
            var _d = _c[_b], key = _d[0], row = _d[1];
            if (Object.hasOwn(values, key))
                continue;
            if (row.seq > baseline.asOfSeq)
                continue;
            this.rows.delete(key);
            this.changed(key);
        }
    };
    /**
     * Drop rows past a mux-generation baseline (`session/subscribed.lastSeq`):
     * a row claiming knowledge beyond the host's own durable baseline rode
     * state a restart lost — under last-wins it would wrongly outrank the
     * host's recomputed (lower-seq) values forever. Durable replay and the next
     * baseline re-seed whatever truly survived (the title-snapshot precedent,
     * generalized).
     * @param lastSeq - the subscribed frame's durable baseline seq.
     */
    ProjectionValueStore.prototype.truncate = function (lastSeq) {
        for (var _i = 0, _a = this.rows; _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], row = _b[1];
            if (row.seq <= lastSeq)
                continue;
            this.rows.delete(key);
            this.changed(key);
        }
    };
    ProjectionValueStore.prototype.changed = function (key) {
        var _a;
        this.valuesCache = undefined;
        (_a = this.channels.get(key)) === null || _a === void 0 ? void 0 : _a.notifier.markDirty();
        this.anyNotifier.markDirty();
    };
    ProjectionValueStore.prototype.channel = function (key) {
        var _this = this;
        var channel = this.channels.get(key);
        if (channel === undefined) {
            // The notifier only batches (no snapshot cache to rebuild: faces read rows directly).
            var notifier_1 = new notifier_ts_1.Notifier(function () { });
            channel = {
                notifier: notifier_1,
                face: {
                    getSnapshot: function () { var _a; return (_a = _this.rows.get(key)) === null || _a === void 0 ? void 0 : _a.value; },
                    subscribe: function (listener) { return notifier_1.subscribe(listener); },
                },
            };
            this.channels.set(key, channel);
        }
        return channel;
    };
    return ProjectionValueStore;
}());
exports.ProjectionValueStore = ProjectionValueStore;
