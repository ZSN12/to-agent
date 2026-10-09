import type { EmbeddingService } from './types';
export declare class JinaEmbeddingService implements EmbeddingService {
    private apiKey;
    private model;
    private apiUrl;
    constructor(apiKey: string);
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    private embedChunk;
}
export declare class OpenAIEmbeddingService implements EmbeddingService {
    private apiKey;
    private model;
    private apiUrl;
    constructor(apiKey: string);
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
}
export declare class CachedEmbeddingService implements EmbeddingService {
    private cache;
    private underlying;
    constructor(underlying: EmbeddingService);
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    private hash;
    getCacheSize(): number;
    clearCache(): void;
}
//# sourceMappingURL=embedding.d.ts.map