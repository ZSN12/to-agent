import { MinHeap } from "./performance-utils.js";
// 内存向量存储（用于测试或小型项目）
export class InMemoryVectorStore {
    chunks = [];
    embeddings = [];
    norms = []; // 预计算的向量范数
    async init() {
        // No-op for in-memory store
    }
    async add(chunks, embeddings) {
        this.chunks.push(...chunks);
        this.embeddings.push(...embeddings);
        // 预计算每个向量的范数
        for (const emb of embeddings) {
            this.norms.push(this.computeNorm(emb));
        }
    }
    async search(_query, queryEmbedding, topK, filters) {
        if (!Number.isFinite(topK) || topK <= 0 || this.chunks.length === 0)
            return [];
        const resultLimit = Math.min(this.chunks.length, Math.max(1, Math.floor(topK)));
        // 使用 MinHeap 进行 Top-K 选择，O(n log k) 替代 O(n log n)。At equal
        // scores, the later insertion is worse, including at the cutoff.
        const heap = new MinHeap(resultLimit, (a, b) => a.score - b.score || b.index - a.index);
        const queryNorm = this.computeNorm(queryEmbedding);
        if (!Number.isFinite(queryNorm) || queryNorm <= 0)
            return [];
        // 遍历所有向量，维护 topK
        for (let i = 0; i < this.embeddings.length; i++) {
            const chunk = this.chunks[i];
            if ((filters?.language && chunk.language !== filters.language)
                || (filters?.type && chunk.type !== filters.type)
                || (filters?.file && !chunk.file.includes(filters.file)))
                continue;
            const score = this.cosineSimilarity(queryEmbedding, this.embeddings[i], queryNorm, this.norms[i]);
            if (Number.isFinite(score))
                heap.push({ score, index: i });
        }
        // 提取结果并按分数降序排列
        return heap.toSortedArray().map(({ score, index }) => ({
            chunk: this.chunks[index],
            score
        }));
    }
    async clear() {
        this.chunks = [];
        this.embeddings = [];
        this.norms = [];
    }
    async count() { return this.chunks.length; }
    /**
     * 计算向量范数
     */
    computeNorm(vec) {
        let sum = 0;
        for (let i = 0; i < vec.length; i++) {
            sum += vec[i] * vec[i];
        }
        return Math.sqrt(sum);
    }
    /**
     * 优化的余弦相似度计算 - 使用预计算的范数
     * 对于归一化向量（norm = 1），直接返回点积
     */
    cosineSimilarity(a, b, normA, normB) {
        if (!Number.isFinite(normA) || !Number.isFinite(normB) || normA <= 0 || normB <= 0)
            return 0;
        let dotProduct = 0;
        for (let i = 0; i < a.length; i++) {
            if (!Number.isFinite(a[i]) || !Number.isFinite(b[i]))
                return 0;
            dotProduct += a[i] * b[i];
        }
        if (!Number.isFinite(dotProduct))
            return 0;
        // 如果两个向量都已归一化（如 BuiltinLocalEmbeddingService 的输出）
        if (Math.abs(normA - 1.0) < 0.001 && Math.abs(normB - 1.0) < 0.001) {
            return Math.max(-1, Math.min(1, dotProduct)); // 点积 = 余弦相似度
        }
        const similarity = dotProduct / (normA * normB);
        return Number.isFinite(similarity) ? Math.max(-1, Math.min(1, similarity)) : 0;
    }
}
//# sourceMappingURL=vector-store.js.map