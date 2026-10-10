export class ChromaVectorStore {
    client;
    collection;
    collectionName;
    host;
    port;
    constructor(collectionName, host = 'localhost', port = 8000) {
        this.collectionName = collectionName;
        this.host = host;
        this.port = port;
    }
    async init() {
        try {
            // 动态导入 chromadb
            const { ChromaClient } = await import('chromadb');
            this.client = new ChromaClient({
                path: `http://${this.host}:${this.port}`
            });
            this.collection = await this.client.getOrCreateCollection({
                name: this.collectionName,
                metadata: { 'hnsw:space': 'cosine' }
            });
        }
        catch (error) {
            console.error('Failed to initialize ChromaDB:', error);
            throw new Error('ChromaDB initialization failed. Make sure ChromaDB server is running.');
        }
    }
    async add(chunks, embeddings) {
        if (chunks.length !== embeddings.length) {
            throw new Error('Chunks and embeddings length mismatch');
        }
        const ids = chunks.map(c => c.id);
        const documents = chunks.map(c => c.content);
        const metadatas = chunks.map(c => ({
            file: c.file,
            language: c.language,
            type: c.type,
            name: c.name,
            startLine: c.startLine,
            endLine: c.endLine,
            imports: JSON.stringify(c.metadata.imports || []),
            exports: JSON.stringify(c.metadata.exports || []),
            comments: c.metadata.comments || ''
        }));
        await this.collection.add({
            ids,
            embeddings,
            documents,
            metadatas
        });
    }
    async search(_query, queryEmbedding, topK) {
        const results = await this.collection.query({
            queryEmbeddings: [queryEmbedding],
            nResults: topK,
            include: ['documents', 'metadatas', 'distances']
        });
        if (!results.ids || !results.ids[0]) {
            return [];
        }
        return results.ids[0].map((id, i) => ({
            chunk: {
                id,
                file: results.metadatas[0][i].file,
                language: results.metadatas[0][i].language,
                type: results.metadatas[0][i].type,
                name: results.metadatas[0][i].name,
                content: results.documents[0][i],
                startLine: results.metadatas[0][i].startLine,
                endLine: results.metadatas[0][i].endLine,
                metadata: {
                    imports: JSON.parse(results.metadatas[0][i].imports || '[]'),
                    exports: JSON.parse(results.metadatas[0][i].exports || '[]'),
                    comments: results.metadatas[0][i].comments
                }
            },
            score: 1 - (results.distances[0][i] || 0) // 余弦距离转相似度
        }));
    }
    async clear() {
        try {
            await this.client.deleteCollection(this.collectionName);
            await this.init();
        }
        catch (error) {
            console.error('Failed to clear collection:', error);
        }
    }
    async count() {
        try {
            const count = await this.collection.count();
            return count;
        }
        catch (error) {
            return 0;
        }
    }
}
// 内存向量存储（用于测试或小型项目）
export class InMemoryVectorStore {
    chunks = [];
    embeddings = [];
    async init() {
        // No-op for in-memory store
    }
    async add(chunks, embeddings) {
        this.chunks.push(...chunks);
        this.embeddings.push(...embeddings);
    }
    async search(_query, queryEmbedding, topK) {
        // 计算余弦相似度
        const scores = this.embeddings.map(embedding => this.cosineSimilarity(queryEmbedding, embedding));
        // 排序并取 topK
        const indices = scores
            .map((score, index) => ({ score, index }))
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
        return indices.map(({ score, index }) => ({
            chunk: this.chunks[index],
            score
        }));
    }
    async clear() {
        this.chunks = [];
        this.embeddings = [];
    }
    async count() { return this.chunks.length; }
    cosineSimilarity(a, b) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
//# sourceMappingURL=vector-store.js.map