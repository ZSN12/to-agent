import type { DocumentOptions, ParsedDocumentResult } from './protocol.ts';
export interface DocumentWorkerPoolOptions {
    size?: number;
    timeoutMs?: number;
    memoryMb?: number;
    workerURL?: URL;
}
export declare class DocumentWorkerPool {
    private readonly slots;
    private readonly queue;
    private nextId;
    private readonly size;
    private readonly timeoutMs;
    private readonly memoryMb;
    private readonly workerURL;
    constructor(options?: DocumentWorkerPoolOptions);
    run(bytes: Uint8Array, options: DocumentOptions, signal?: AbortSignal): Promise<ParsedDocumentResult>;
    private createWorker;
    private attachWorker;
    private pump;
    private stop;
    private settle;
}
export declare const documentWorkerPool: DocumentWorkerPool;
//# sourceMappingURL=worker-pool.d.ts.map