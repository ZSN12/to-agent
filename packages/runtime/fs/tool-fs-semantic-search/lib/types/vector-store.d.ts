import type { VectorStore, CodeChunk, SearchResult, SearchFilters } from './types.ts';
export declare class InMemoryVectorStore implements VectorStore {
    private chunks;
    private embeddings;
    private norms;
    init(): Promise<void>;
    add(chunks: CodeChunk[], embeddings: number[][]): Promise<void>;
    search(_query: string, queryEmbedding: number[], topK: number, filters?: SearchFilters): Promise<SearchResult[]>;
    clear(): Promise<void>;
    count(): Promise<number>;
    /**
     * 计算向量范数
     */
    private computeNorm;
    /**
     * 优化的余弦相似度计算 - 使用预计算的范数
     * 对于归一化向量（norm = 1），直接返回点积
     */
    private cosineSimilarity;
}
//# sourceMappingURL=vector-store.d.ts.map