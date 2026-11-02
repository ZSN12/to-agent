export interface CodeChunk {
    id: string;
    file: string;
    language: string;
    type: 'function' | 'class' | 'method' | 'interface' | 'block';
    name: string;
    content: string;
    startLine: number;
    endLine: number;
    metadata: {
        imports?: string[];
        exports?: string[];
        comments?: string;
    };
}
export interface SearchResult {
    chunk: CodeChunk;
    score: number;
}
export interface SearchFilters {
    language?: string;
    type?: string;
    /** Case-sensitive file path substring; all specified filters must match. */
    file?: string;
}
export interface EmbeddingService {
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
}
export interface VectorStore {
    init(): Promise<void>;
    add(chunks: CodeChunk[], embeddings: number[][]): Promise<void>;
    search(query: string, queryEmbedding: number[], topK: number, filters?: SearchFilters): Promise<SearchResult[]>;
    clear(): Promise<void>;
    count?(): Promise<number>;
}
//# sourceMappingURL=types.d.ts.map