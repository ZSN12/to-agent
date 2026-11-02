export declare const DEFAULT_MAX_INDEXED_WORKSPACES = 2;
export declare function validateIndexCapacity(capacity: number): void;
/** Owns completed and in-flight indexes; entries never re-register after completion. */
export declare class WorkspaceIndexCache<T> {
    private capacity;
    private readonly entries;
    private disposed;
    constructor(capacity?: number);
    setCapacity(capacity: number): void;
    get(key: string): Promise<T> | undefined;
    replace(key: string, build: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T>;
    clear(): void;
    dispose(): void;
    private evictOldest;
    private remove;
}
//# sourceMappingURL=index-cache.d.ts.map