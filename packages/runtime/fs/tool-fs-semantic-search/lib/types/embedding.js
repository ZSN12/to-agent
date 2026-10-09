async function readEmbeddings(response) {
    const payload = await response.json();
    if (!Array.isArray(payload.data) || payload.data.some(item => !Array.isArray(item.embedding)))
        throw new Error('Embedding API returned an invalid response');
    return payload.data.map(item => item.embedding);
}
export class JinaEmbeddingService {
    apiKey;
    model = 'jina-embeddings-v2-base-code';
    apiUrl = 'https://api.jina.ai/v1/embeddings';
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    async embed(text) {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: text,
                model: this.model
            })
        });
        if (!response.ok) {
            throw new Error(`Jina API error: ${response.statusText}`);
        }
        const [embedding] = await readEmbeddings(response);
        if (!embedding)
            throw new Error('Embedding API returned no embedding');
        return embedding;
    }
    async embedBatch(texts) {
        // 批量处理，最多 100 个
        const chunks = [];
        for (let i = 0; i < texts.length; i += 100) {
            chunks.push(texts.slice(i, i + 100));
        }
        const results = await Promise.all(chunks.map(chunk => this.embedChunk(chunk)));
        return results.flat();
    }
    async embedChunk(texts) {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: texts,
                model: this.model
            })
        });
        if (!response.ok) {
            throw new Error(`Jina API error: ${response.statusText}`);
        }
        return readEmbeddings(response);
    }
}
export class OpenAIEmbeddingService {
    apiKey;
    model = 'text-embedding-ada-002';
    apiUrl = 'https://api.openai.com/v1/embeddings';
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    async embed(text) {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: text,
                model: this.model
            })
        });
        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.statusText}`);
        }
        const [embedding] = await readEmbeddings(response);
        if (!embedding)
            throw new Error('Embedding API returned no embedding');
        return embedding;
    }
    async embedBatch(texts) {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: texts,
                model: this.model
            })
        });
        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.statusText}`);
        }
        return readEmbeddings(response);
    }
}
// 缓存包装器
export class CachedEmbeddingService {
    cache = new Map();
    underlying;
    constructor(underlying) {
        this.underlying = underlying;
    }
    async embed(text) {
        const hash = this.hash(text);
        if (this.cache.has(hash)) {
            return this.cache.get(hash);
        }
        const embedding = await this.underlying.embed(text);
        this.cache.set(hash, embedding);
        return embedding;
    }
    async embedBatch(texts) {
        const results = [];
        const toEmbed = [];
        const toEmbedIndices = [];
        // 检查缓存
        for (let i = 0; i < texts.length; i++) {
            const hash = this.hash(texts[i]);
            if (this.cache.has(hash)) {
                results[i] = this.cache.get(hash);
            }
            else {
                toEmbed.push(texts[i]);
                toEmbedIndices.push(i);
            }
        }
        // 批量嵌入未缓存的
        if (toEmbed.length > 0) {
            const embeddings = await this.underlying.embedBatch(toEmbed);
            for (let i = 0; i < toEmbed.length; i++) {
                const hash = this.hash(toEmbed[i]);
                this.cache.set(hash, embeddings[i]);
                results[toEmbedIndices[i]] = embeddings[i];
            }
        }
        return results;
    }
    hash(text) {
        // 简单的哈希函数
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }
    getCacheSize() {
        return this.cache.size;
    }
    clearCache() {
        this.cache.clear();
    }
}
//# sourceMappingURL=embedding.js.map