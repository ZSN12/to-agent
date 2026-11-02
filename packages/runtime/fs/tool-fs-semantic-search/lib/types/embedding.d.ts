import type { EmbeddingService } from './types.ts';
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
/**
 * 内置本地代码向量化服务（参考 Claude Code 开箱即用架构）
 * 零外部 API 依赖，基于代码符号大纲、语法结构与特征哈希生成稠密向量，
 * 毫秒级响应，与内存向量存储及余弦相似度无缝兼容。
 */
export declare class BuiltinLocalEmbeddingService implements EmbeddingService {
    private readonly dimension;
    private readonly cache;
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    getCacheSize(): number;
    clearCache(): void;
    private hashKey;
    private computeEmbedding;
    private extractTokens;
    private tokenHash;
}
export { BuiltinLocalEmbeddingService as LocalEmbeddingService };
//# sourceMappingURL=embedding.d.ts.map