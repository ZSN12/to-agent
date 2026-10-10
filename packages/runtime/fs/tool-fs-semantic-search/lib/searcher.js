export class SemanticSearcher {
    embedding;
    store;
    chunker;
    constructor(embedding, store, chunker) {
        this.embedding = embedding;
        this.store = store;
        this.chunker = chunker;
    }
    async indexChunks(chunks) {
        if (!chunks.length)
            return;
        const vectors = await this.embedding.embedBatch(chunks.map(chunk => [chunk.metadata.comments, chunk.content].filter(Boolean).join('\n\n')));
        if (vectors.length !== chunks.length)
            throw new Error('Embedding result count did not match input');
        await this.store.add(chunks, vectors);
    }
    chunkFile(file, text, language) { return this.chunker.chunk(file, text, language); }
    async search(query, topK = 10, filters) {
        const vector = await this.embedding.embed(query);
        const found = await this.store.search(query, vector, topK * 3);
        return found.filter(({ chunk }) => (!filters?.language || chunk.language === filters.language)
            && (!filters?.type || chunk.type === filters.type) && (!filters?.file || chunk.file.includes(filters.file)))
            .sort((a, b) => b.score - a.score).slice(0, topK);
    }
    async getStats() {
        return { totalChunks: await this.store.count?.() ?? 0, cacheSize: this.embedding.getCacheSize?.() ?? 0 };
    }
}
//# sourceMappingURL=searcher.js.map