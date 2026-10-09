import type { DocumentOptions, DocumentReadResult } from './protocol.ts';
declare class DocumentWorkerPool {
    private readonly slots;
    private readonly queue;
    private nextId;
    run(bytes: Uint8Array, options: DocumentOptions, signal?: AbortSignal): Promise<DocumentReadResult>;
    private createWorker;
    private attachWorker;
    private pump;
    private stop;
    private settle;
}
export declare const documentWorkerPool: DocumentWorkerPool;
export {};
//# sourceMappingURL=worker-pool.d.ts.map