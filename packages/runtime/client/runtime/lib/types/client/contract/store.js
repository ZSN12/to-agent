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
exports.createSnapshotStore = createSnapshotStore;
/** Runtime-owned observable snapshot store used by session and workspace services. */
var vanilla_1 = require("zustand/vanilla");
var immer_1 = require("immer");
/** Batches subscriber notification into one flush per animation frame. */
function rafBatch(notify) {
    // Fall back to microtask batching where rAF is absent (node unit tests);
    // both preserve the N-changes=1-notification contract within a tick.
    var schedule = typeof requestAnimationFrame === 'function'
        ? function (fn) { requestAnimationFrame(function () { fn(); }); }
        : function (fn) { queueMicrotask(fn); };
    var scheduled = false;
    return function () {
        if (scheduled)
            return;
        scheduled = true;
        schedule(function () {
            scheduled = false;
            notify();
        });
    };
}
/**
 * Create a snapshot store.
 *
 * Flush default is 'sync' (controlled inputs need same-tick echo); frame-driven
 * stores opt into 'raf', where a frame's worth of updates coalesces into one
 * notification. Known raf-mode tradeoff: a component mounting mid-frame reads
 * fresh state while existing subscribers hear it next flush — transient
 * frame-level skew, same nature as the object layer's microtask batching.
 *
 * @param init - initial state.
 * @param opts - flush mode and opt-in persistence (localStorage, keyed by name).
 * @returns the store.
 */
function createSnapshotStore(init, opts) {
    // Immer enters through produce() in update() below (identical semantics to
    // the immer middleware without its setState-signature mutator generics).
    var api = (0, vanilla_1.createStore)()(function () { return init; });
    if (opts === null || opts === void 0 ? void 0 : opts.persist)
        attachPersistence(api, opts.persist.name);
    var subscribe = function (fn) { return api.subscribe(fn); };
    if ((opts === null || opts === void 0 ? void 0 : opts.flush) === 'raf') {
        var listeners_1 = new Set();
        var flush = rafBatch(function () { for (var _i = 0, _a = __spreadArray([], listeners_1, true); _i < _a.length; _i++) {
            var fn = _a[_i];
            fn();
        } });
        api.subscribe(flush);
        subscribe = function (fn) {
            listeners_1.add(fn);
            return function () { listeners_1.delete(fn); };
        };
    }
    return {
        getSnapshot: function () { return api.getState(); },
        subscribe: function (fn) { return subscribe(fn); },
        update: function (mutator) {
            // Immer's produce (not setState's partial-merge path) so scalar and
            // array roots replace correctly; produce also freezes in dev.
            api.setState((0, immer_1.produce)(api.getState(), function (draft) { mutator(draft); }), true);
        },
        set: function (next) {
            api.setState(devFreeze(next), true);
        },
    };
}
/**
 * Whole-value JSON persistence to localStorage. Hand-rolled instead of the
 * zustand persist middleware: its write path spreads state into an object
 * (`partialize({ ...get() })`), exploding primitive state (a persisted string
 * draft becomes {0:'h',1:'e',...}) — not fixable via merge/deserialize options
 * because the corruption happens before serialization. Storage failures
 * (quota, private mode) only disable persistence, never break the store.
 */
function attachPersistence(api, name) {
    // Non-browser runs (node e2e booting the client tree) have no localStorage:
    // persistence silently disables — same contract as a storage failure, minus
    // the per-store console noise a ReferenceError would produce.
    if (typeof localStorage === 'undefined')
        return;
    try {
        var raw = localStorage.getItem(name);
        if (raw !== null) {
            api.setState(devFreeze(JSON.parse(raw)), true);
        }
    }
    catch (error) {
        console.error("snapshot store '".concat(name, "' rehydration failed:"), error);
    }
    api.subscribe(function (state) {
        try {
            localStorage.setItem(name, JSON.stringify(state));
        }
        catch (error) {
            console.error("snapshot store '".concat(name, "' persistence failed:"), error);
        }
    });
}
/** Deep-freeze wholesale-set state outside production: set() bypasses immer's freeze. */
function devFreeze(value) {
    if (process.env.NODE_ENV === 'production')
        return value;
    deepFreeze(value);
    return value;
}
function deepFreeze(value) {
    if (typeof value !== 'object' || value === null || Object.isFrozen(value))
        return;
    Object.freeze(value);
    for (var _i = 0, _a = Reflect.ownKeys(value); _i < _a.length; _i++) {
        var key = _a[_i];
        deepFreeze(value[key]);
    }
}
