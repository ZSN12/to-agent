import type { EmbeddingService, VectorStore, CodeChunk, SearchResult, SearchFilters } from './types.ts'
import { BM25Scorer } from './performance-utils.ts'

export class SemanticSearcher {
  private bm25: BM25Scorer = new BM25Scorer()
  private allDocuments: string[] = []  // 保存所有文档文本用于 BM25
  private documentByChunkId = new Map<string, string>()
  private indexing: Promise<void> = Promise.resolve()

  constructor(private readonly embedding: EmbeddingService, private readonly store: VectorStore) {}

  indexChunks(chunks: CodeChunk[]): Promise<void> {
    // Rebuilds for one workspace must not interleave clear/add operations.
    const pending = this.indexing.then(() => this.replaceChunks(chunks))
    this.indexing = pending.catch(() => {})
    return pending
  }

  private async replaceChunks(chunks: CodeChunk[]): Promise<void> {

    // 构建文档文本（与搜索时格式一致）
    const documents = chunks.map(chunk => [
      chunk.name ? `Symbol: ${chunk.name} (${chunk.type})` : '',
      chunk.metadata.comments ? `Comments: ${chunk.metadata.comments}` : '',
      chunk.content,
    ].filter(Boolean).join('\n\n'))

    // 生成向量
    const vectors = chunks.length ? await this.embedding.embedBatch(documents) : []
    if (vectors.length !== chunks.length) throw new Error('Embedding result count did not match input')

    // Keep the previous index if embedding fails; publish only the new snapshot.
    await this.store.clear()
    if (chunks.length) await this.store.add(chunks, vectors)
    this.allDocuments = documents
    this.documentByChunkId = new Map(chunks.map((chunk, index) => [chunk.id, documents[index]]))
    this.bm25.buildIndex(this.allDocuments)
  }
  async search(query: string, topK = 10, filters?: SearchFilters): Promise<SearchResult[]> {
    if (!Number.isFinite(topK) || topK <= 0) return []
    const resultLimit = Math.max(1, Math.floor(topK))
    await this.indexing
    // Empty and punctuation-only queries have no lexical intent. Avoid searching
    // with a zero vector, which would otherwise make every stored chunk tie.
    const queryTokens = this.bm25.tokenizeQuery(query)
    if (queryTokens.length === 0) return []
    const vector = await this.embedding.embed(query)

    // 向量搜索：召回 topK * 3 个候选（为了留出 BM25 重排空间）
    const vectorResults = await this.store.search(query, vector,
      Math.min(Number.MAX_SAFE_INTEGER, resultLimit * 3), filters)

    // Share one tokenization pass between keyword boosts and BM25.
    // Apply filters before BM25 so only visible candidates need scoring.
    const filteredResults = vectorResults
      .filter(({ score }) => Number.isFinite(score))
      .filter(({ chunk }) => (!filters?.language || chunk.language === filters.language)
        && (!filters?.type || chunk.type === filters.type)
        && (!filters?.file || chunk.file.includes(filters.file)))
    const bm25Scores = this.allDocuments.length > 0
      ? this.bm25.scoreManyCandidates(queryTokens, filteredResults.map(({ chunk }) => ({
        key: chunk.id,
        document: this.documentByChunkId.get(chunk.id) ?? this.formatDocument(chunk),
      })))
      : []
    const maxBm25Score = bm25Scores.reduce((maximum, score) =>
      Number.isFinite(score) ? Math.max(maximum, score) : maximum, 0)

    // Apply keyword boosts and merge the already tokenized BM25 candidate scores.
    const enhancedResults = filteredResults
      .map(({ chunk, score }, index) => {
        let enhancedScore = Number.isFinite(score) ? score : 0
        const lowerName = (chunk.name || '').toLowerCase()
        const lowerFile = (chunk.file || '').toLowerCase()
        const lowerComments = (chunk.metadata.comments || '').toLowerCase()
        let keywordBoost = 0

        // 关键词精确匹配加权
        for (const token of queryTokens) {
          if (lowerName === token) {
            keywordBoost += 0.35 // 符号名全字精准匹配提权
          } else if (lowerName.includes(token)) {
            keywordBoost += 0.15 // 符号名子串匹配提权
          }
          if (lowerFile.includes(token)) {
            keywordBoost += 0.1 // 文件路径匹配提权
          }
          if (lowerComments.includes(token)) {
            keywordBoost += 0.08 // 文档注释匹配提权
          }
        }
        enhancedScore += queryTokens.length > 0 ? keywordBoost / queryTokens.length : 0

        // BM25 混合评分
        if (this.allDocuments.length > 0) {
          const bm25Score = bm25Scores[index] ?? 0
          const normalizedBm25Score = maxBm25Score > 0 && Number.isFinite(bm25Score)
            ? Math.max(0, Math.min(1, bm25Score / maxBm25Score))
            : 0

          // 融合向量相似度和 BM25 分数
          // 向量分数权重 0.7，BM25 权重 0.3
          enhancedScore = enhancedScore * 0.7 + normalizedBm25Score * 0.3
        }

        return { chunk, score: enhancedScore }
      })
      .filter(({ score }) => Number.isFinite(score))
      .sort((a, b) => b.score - a.score)
      .slice(0, resultLimit)

    return enhancedResults
  }

  private formatDocument(chunk: CodeChunk): string {
    return [
      chunk.name ? `Symbol: ${chunk.name} (${chunk.type})` : '',
      chunk.metadata.comments ? `Comments: ${chunk.metadata.comments}` : '',
      chunk.content,
    ].filter(Boolean).join('\n\n')
  }
  async getStats(): Promise<{ totalChunks: number; cacheSize: number }> {
    await this.indexing
    return { totalChunks: await this.store.count?.() ?? 0, cacheSize: (this.embedding as EmbeddingService & { getCacheSize?: () => number }).getCacheSize?.() ?? 0 }
  }
}
