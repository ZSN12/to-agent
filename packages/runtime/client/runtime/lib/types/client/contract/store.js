/** Runtime-owned observable snapshot store used by session and workspace services. */
import { createStore } from 'zustand/vanilla';
import { produce } from 'immer';
/** Batches subscriber notification into one flush per animation frame. */
function rafBatch(notify) {
    // Fall back to microtask batching where rAF is absent (node unit tests);
    // both preserve the N-changes=1-notification contract within a tick.
    const schedule = typeof requestAnimationFrame === 'function'
        ? (fn) => { requestAnimationFrame(() => { fn(); }); }
        : (fn) => { queueMicrotask(fn); };
    let scheduled = false;
    return () => {
        if (scheduled)
            return;
        scheduled = true;
        schedule(() => {
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
export function createSnapshotStore(init, opts) {
    // Immer enters through produce() in update() below (identical semantics to
    // the immer middleware without its setState-signature mutator generics).
    const api = createStore()(() => init);
    if (opts?.persist)
        attachPersistence(api, opts.persist.name);
    let subscribe = (fn) => api.subscribe(fn);
    if (opts?.flush === 'raf') {
        const listeners = new Set();
        const flush = rafBatch(() => { for (const fn of [...listeners])
            fn(); });
        api.subscribe(flush);
        subscribe = (fn) => {
            listeners.add(fn);
            return () => { listeners.delete(fn); };
        };
    }
    return {
        getSnapshot: () => api.getState(),
        subscribe: fn => subscribe(fn),
        update: (mutator) => {
            // Immer's produce (not setState's partial-merge path) so scalar and
            // array roots replace correctly; produce also freezes in dev.
            api.setState(produce(api.getState(), (draft) => { mutator(draft); }), true);
        },
        set: (next) => {
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
        const raw = localStorage.getItem(name);
        if (raw !== null) {
            api.setState(devFreeze(JSON.parse(raw)), true);
        }
    }
    catch (error) {
        console.error(`snapshot store '${name}' rehydration failed:`, error);
    }
    api.subscribe((state) => {
        try {
            localStorage.setItem(name, JSON.stringify(state));
        }
        catch (error) {
            console.error(`snapshot store '${name}' persistence failed:`, error);
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
    for (const key of Reflect.ownKeys(value)) {
        deepFreeze(value[key]);
    }
}
//# sourceMappingURL=store.js.map