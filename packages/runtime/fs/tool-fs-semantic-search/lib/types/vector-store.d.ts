import type { VectorStore, CodeChunk, SearchResult } from './types';
export declare class ChromaVectorStore implements VectorStore {
    private client;
    private collection;
    private collectionName;
    private host;
    private port;
    constructor(collectionName: string, host?: string, port?: number);
    init(): Promise<void>;
    add(chunks: CodeChunk[], embeddings: number[][]): Promise<void>;
    search(_query: string, queryEmbedding: number[], topK: number): Promise<SearchResult[]>;
    clear(): Promise<void>;
    count(): Promise<number>;
}
export declare class InMemoryVectorStore implements VectorStore {
    private chunks;
    private embeddings;
    init(): Promise<void>;
    add(chunks: CodeChunk[], embeddings: number[][]): Promise<void>;
    search(_query: string, queryEmbedding: number[], topK: number): Promise<SearchResult[]>;
    clear(): Promise<void>;
    count(): Promise<number>;
    private cosineSimilarity;
}
//# sourceMappingURL=vector-store.d.ts.map