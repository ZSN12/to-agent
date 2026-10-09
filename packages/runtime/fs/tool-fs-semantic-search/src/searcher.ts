import type { EmbeddingService, VectorStore, CodeChunk, SearchResult } from './types'
import { CodeChunker } from './chunker'

export class SemanticSearcher {
  constructor(private readonly embedding: EmbeddingService, private readonly store: VectorStore, private readonly chunker: CodeChunker) {}
  async indexChunks(chunks: CodeChunk[]): Promise<void> {
    if (!chunks.length) return
    const vectors = await this.embedding.embedBatch(chunks.map(chunk => [chunk.metadata.comments, chunk.content].filter(Boolean).join('\n\n')))
    if (vectors.length !== chunks.length) throw new Error('Embedding result count did not match input')
    await this.store.add(chunks, vectors)
  }
  chunkFile(file: string, text: string, language: string): Promise<CodeChunk[]> { return this.chunker.chunk(file, text, language) }
  async search(query: string, topK = 10, filters?: { language?: string; type?: string; file?: string }): Promise<SearchResult[]> {
    const vector = await this.embedding.embed(query)
    const found = await this.store.search(query, vector, topK * 3)
    return found.filter(({ chunk }) => (!filters?.language || chunk.language === filters.language)
      && (!filters?.type || chunk.type === filters.type) && (!filters?.file || chunk.file.includes(filters.file)))
      .sort((a, b) => b.score - a.score).slice(0, topK)
  }
  async getStats(): Promise<{ totalChunks: number; cacheSize: number }> {
    return { totalChunks: await this.store.count?.() ?? 0, cacheSize: (this.embedding as EmbeddingService & { getCacheSize?: () => number }).getCacheSize?.() ?? 0 }
  }
}
