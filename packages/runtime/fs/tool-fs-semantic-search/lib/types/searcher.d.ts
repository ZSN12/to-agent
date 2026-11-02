import type { EmbeddingService, VectorStore, CodeChunk, SearchResult, SearchFilters } from './types.ts';
export declare class SemanticSearcher {
    private readonly embedding;
    private readonly store;
    private bm25;
    private allDocuments;
    private documentByChunkId;
    private indexing;
    constructor(embedding: EmbeddingService, store: VectorStore);
    indexChunks(chunks: CodeChunk[]): Promise<void>;
    private replaceChunks;
    search(query: string, topK?: number, filters?: SearchFilters): Promise<SearchResult[]>;
    private formatDocument;
    getStats(): Promise<{
        totalChunks: number;
        cacheSize: number;
    }>;
}
//# sourceMappingURL=searcher.d.ts.map