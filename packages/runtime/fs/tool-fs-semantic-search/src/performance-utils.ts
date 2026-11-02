/**
 * 性能优化工具 - 用于语义搜索加速
 */

/**
 * MinHeap - 用于高效 Top-K 选择
 * 时间复杂度: O(n log k) vs O(n log n) 全排序
 */
export class MinHeap<T> {
  private items: T[] = []

  constructor(
    private readonly k: number,
    private readonly compareFn: (a: T, b: T) => number
  ) {}

  push(item: T): void {
    if (this.items.length < this.k) {
      this.items.push(item)
      this.bubbleUp(this.items.length - 1)
    } else if (this.compareFn(item, this.items[0]) > 0) {
      // 如果新元素比堆顶大，替换堆顶
      this.items[0] = item
      this.bubbleDown(0)
    }
  }

  toSortedArray(): T[] {
    // 降序返回（最大的在前）
    return [...this.items].sort((a, b) => -this.compareFn(a, b))
  }

  size(): number {
    return this.items.length
  }

  private bubbleUp(index: number): void {
    const item = this.items[index]
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      const parent = this.items[parentIndex]
      if (this.compareFn(item, parent) >= 0) break
      this.items[index] = parent
      index = parentIndex
    }
    this.items[index] = item
  }

  private bubbleDown(index: number): void {
    const length = this.items.length
    const item = this.items[index]

    while (true) {
      const leftIndex = 2 * index + 1
      const rightIndex = 2 * index + 2
      if (leftIndex >= length) break
      let smallestIndex = leftIndex
      if (rightIndex < length && this.compareFn(this.items[rightIndex], this.items[smallestIndex]) < 0) {
        smallestIndex = rightIndex
      }

      if (this.compareFn(this.items[smallestIndex], item) >= 0) break
      this.items[index] = this.items[smallestIndex]
      index = smallestIndex
    }
    this.items[index] = item
  }
}

/**
 * BM25 排序算法 - 关键词精确匹配
 * 用于补充向量语义搜索，提升精确关键词的召回
 */
export class BM25Scorer {
  private readonly k1 = 1.5  // 词频饱和参数
  private readonly b = 0.75  // 长度归一化参数
  private readonly maxCachedDocuments = 512

  private docCount = 0
  private avgDocLength = 0
  private idfCache = new Map<string, number>()
  private documentStats = new Map<string, { length: number; termFrequency: Map<string, number> }>()
  private seenDocuments = new Map<string, true>()

  /**
 * 计算文档集合的 IDF（逆文档频率）
   * @param documents 所有文档内容
   */
  buildIndex(documents: string[]): void {
    this.idfCache.clear()
    this.documentStats.clear()
    this.seenDocuments.clear()
    this.avgDocLength = 0
    this.docCount = documents.length
    if (this.docCount === 0) return

    // 计算平均文档长度
    let totalLength = 0
    const termDocCount = new Map<string, number>()

    for (const doc of documents) {
      const tokens = this.tokenize(doc)
      totalLength += tokens.length

      // 计算包含每个词的文档数
      const uniqueTokens = new Set(tokens)
      for (const token of uniqueTokens) {
        termDocCount.set(token, (termDocCount.get(token) || 0) + 1)
      }
    }

    this.avgDocLength = totalLength / this.docCount

    // 计算 IDF
    for (const [term, df] of termDocCount) {
      this.idfCache.set(term, Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1))
    }
  }

  /**
   * 计算查询与文档的 BM25 分数
   */
  score(query: string, document: string): number {
    return this.scoreMany(query, [document])[0] ?? 0
  }

  /**
   * Score multiple candidate documents while tokenizing the query only once.
   * Candidate token frequencies use a bounded second-hit cache: one-off search
   * results are scored without retaining their token maps, while repeated
   * candidates are promoted into the LRU cache.
   */
  scoreMany(query: string, documents: readonly string[]): number[] {
    return this.scoreManyTokens(this.tokenizeQuery(query), documents)
  }

  tokenizeQuery(query: string): string[] {
    return this.tokenize(query)
  }

  scoreManyTokens(queryTokens: readonly string[], documents: readonly string[]): number[] {
    return this.scoreManyCandidates(queryTokens, documents.map(document => ({ key: document, document })))
  }

  scoreManyCandidates(queryTokens: readonly string[], candidates: readonly { key: string; document: string }[]): number[] {
    if (this.avgDocLength === 0) return candidates.map(() => 0)
    const queryTermSet = new Set(queryTokens)

    return candidates.map(({ key, document }) => {
      const cached = this.documentStats.get(key)
      if (cached) {
        // Refresh the LRU position only for an actual reusable hit.
        this.documentStats.delete(key)
        this.documentStats.set(key, cached)
        return this.scoreTokens(queryTokens, cached)
      }

      const shouldCache = this.maxCachedDocuments > 0 && this.seenDocuments.has(key)
      // On a one-off candidate, retain frequencies only for this query's
      // terms. A second-seen candidate gets a full map so later queries can
      // reuse the cached statistics regardless of their query terms.
      const stats = this.buildDocumentStats(document, shouldCache ? undefined : queryTermSet)
      if (shouldCache) {
        // Admit only a second-seen candidate. This avoids filling and churning
        // the heavier term-frequency cache for one-off search results.
        this.seenDocuments.delete(key)
        if (this.documentStats.size >= this.maxCachedDocuments) {
          const oldestDocument = this.documentStats.keys().next().value
          if (oldestDocument !== undefined) this.documentStats.delete(oldestDocument)
        }
        this.documentStats.set(key, stats)
      } else if (this.maxCachedDocuments > 0) {
        this.rememberSeenDocument(key)
      }

      return this.scoreTokens(queryTokens, stats)
    })
  }

  private rememberSeenDocument(key: string): void {
    if (this.seenDocuments.size >= this.maxCachedDocuments) {
      const oldestDocument = this.seenDocuments.keys().next().value
      if (oldestDocument !== undefined) this.seenDocuments.delete(oldestDocument)
    }
    this.seenDocuments.set(key, true)
  }

  private scoreTokens(queryTokens: readonly string[], document: { length: number; termFrequency: Map<string, number> }): number {
    let score = 0
    for (const queryToken of queryTokens) {
      const tf = document.termFrequency.get(queryToken) || 0
      const idf = this.idfCache.get(queryToken) || 0

      // BM25 公式
      const numerator = tf * (this.k1 + 1)
      const denominator = tf + this.k1 * (1 - this.b + this.b * (document.length / this.avgDocLength))

      score += idf * (numerator / denominator)
    }

    return score
  }

  private buildDocumentStats(document: string, relevantTerms?: ReadonlySet<string>): { length: number; termFrequency: Map<string, number> } {
    const tokens = this.tokenize(document)
    const termFrequency = new Map<string, number>()
    for (const token of tokens) {
      if (relevantTerms && !relevantTerms.has(token)) continue
      termFrequency.set(token, (termFrequency.get(token) || 0) + 1)
    }
    return { length: tokens.length, termFrequency }
  }

  /**
   * 分词 - 提取有意义的 token
   */
  private tokenize(text: string): string[] {
    const normalized = text
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // 驼峰分割
      .replace(/[_\-$/.]/g, ' ')
      .toLowerCase()
    return normalized.split(/\s+/)
      .filter(token => token.length > 1 && /[a-z0-9\u4e00-\u9fff]/.test(token))
  }
}
