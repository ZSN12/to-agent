import type { EmbeddingService, VectorStore, CodeChunk, SearchResult } from './types';
import { CodeChunker } from './chunker';
export declare class SemanticSearcher {
    private readonly embedding;
    private readonly store;
    private readonly chunker;
    constructor(embedding: EmbeddingService, store: VectorStore, chunker: CodeChunker);
    indexChunks(chunks: CodeChunk[]): Promise<void>;
    chunkFile(file: string, text: string, language: string): Promise<CodeChunk[]>;
    search(query: string, topK?: number, filters?: {
        language?: string;
        type?: string;
        file?: string;
    }): Promise<SearchResult[]>;
    getStats(): Promise<{
        totalChunks: number;
        cacheSize: number;
    }>;
}
//# sourceMappingURL=searcher.d.ts.map