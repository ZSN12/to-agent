"use strict";
// Notifier: subscription + batched notification primitive shared by Session and
// SessionManager. Semantics: N markDirty calls collapse into one microtask flush, while
// N markFrameDirty calls collapse into one animation-frame flush;
// the flush rebuilds the snapshot cache BEFORE notifying (useSyncExternalStore requires a stable
// getSnapshot reference). With no listeners the rebuild is skipped and only the dirty bit is set
// (keeps frame storms cheap); the next getSnapshot rebuilds lazily.
//
// Freshness and notification are SEPARATE bits: a pull (ensureFresh) between
// markDirty and the scheduled flush rebuilds the snapshot but must not
// swallow the notification — push subscribers (object-layer watchers) would
// otherwise starve whenever any reader pulls first.
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notifier = void 0;
/** Subscription + batched notification primitive (shared by Session and SessionManager). */
var Notifier = /** @class */ (function () {
    /** @param rebuild - snapshot rebuild function injected by the owner (writes the owner's snapshotCache). */
    function Notifier(rebuild) {
        this.rebuild = rebuild;
        this.listeners = new Set();
        this.dirty = false;
        this.notifyPending = false;
        this.scheduled = 'none';
        this.scheduleGeneration = 0;
    }
    /**
     * uSES subscription entry.
     * @param listener - change callback.
     * @returns the unsubscribe function.
     */
    Notifier.prototype.subscribe = function (listener) {
        var _this = this;
        this.listeners.add(listener);
        return function () {
            _this.listeners.delete(listener);
        };
    };
    /** State-change entry: mark dirty and schedule the batched flush. */
    Notifier.prototype.markDirty = function () {
        this.dirty = true;
        this.notifyPending = true;
        if (this.scheduled === 'microtask')
            return;
        this.schedule('microtask');
    };
    /** Stream-change entry: mark dirty and publish the cumulative state at most once per frame. */
    Notifier.prototype.markFrameDirty = function () {
        this.dirty = true;
        this.notifyPending = true;
        if (this.scheduled !== 'none')
            return;
        this.schedule(typeof globalThis.requestAnimationFrame === 'function' ? 'frame' : 'microtask');
    };
    /**
     * Synchronous flush: controlled-input writes must notify in the same tick as
     * onChange, or React rolls the DOM back to the stale value and the caret jumps to the end.
     */
    Notifier.prototype.notifyNow = function () {
        this.dirty = true;
        this.notifyPending = true;
        this.invalidateSchedule();
        this.flush();
    };
    /**
     * Pre-getSnapshot check: rebuild synchronously when dirty (read path
     * before first subscribe / while unobserved). Notification stays pending.
     */
    Notifier.prototype.ensureFresh = function () {
        if (!this.dirty)
            return;
        this.dirty = false;
        this.rebuild();
    };
    Notifier.prototype.schedule = function (kind) {
        var _this = this;
        var generation = ++this.scheduleGeneration;
        this.scheduled = kind;
        var publish = function () {
            if (generation !== _this.scheduleGeneration)
                return;
            _this.scheduled = 'none';
            _this.flush();
        };
        if (kind === 'frame') {
            globalThis.requestAnimationFrame(publish);
        }
        else {
            queueMicrotask(publish);
        }
    };
    Notifier.prototype.invalidateSchedule = function () {
        this.scheduleGeneration++;
        this.scheduled = 'none';
    };
    Notifier.prototype.flush = function () {
        if (!this.notifyPending)
            return;
        if (this.listeners.size === 0)
            return; // lazy: dirty (if still set) rebuilds on next getSnapshot
        this.notifyPending = false;
        if (this.dirty) {
            this.dirty = false;
            this.rebuild();
        }
        for (var _i = 0, _a = this.listeners; _i < _a.length; _i++) {
            var listener = _a[_i];
            listener();
        }
    };
    return Notifier;
}());
exports.Notifier = Notifier;
