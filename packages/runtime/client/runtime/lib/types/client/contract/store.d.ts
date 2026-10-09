/** Minimal observable snapshot source: Session objects and snapshot stores both satisfy it. */
export interface ObservableSnapshot<T> {
    getSnapshot(): T;
    subscribe(fn: () => void): () => void;
}
/** Writable snapshot store used by runtime-owned services. */
export interface SnapshotStore<T> extends ObservableSnapshot<T> {
    /**
     * Mutate the state through an immer draft.
     * @param mutator - draft mutator.
     */
    update(mutator: (draft: T) => void): void;
    /**
     * Replace the state wholesale.
     * @param next - next state.
     */
    set(next: T): void;
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
export declare function createSnapshotStore<T>(init: T, opts?: {
    flush?: 'raf' | 'sync';
    persist?: {
        name: string;
    };
}): SnapshotStore<T>;
//# sourceMappingURL=store.d.ts.map