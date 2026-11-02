/**
 * 性能优化工具 - 用于语义搜索加速
 */
/**
 * MinHeap - 用于高效 Top-K 选择
 * 时间复杂度: O(n log k) vs O(n log n) 全排序
 */
export declare class MinHeap<T> {
    private readonly k;
    private readonly compareFn;
    private items;
    constructor(k: number, compareFn: (a: T, b: T) => number);
    push(item: T): void;
    toSortedArray(): T[];
    size(): number;
    private bubbleUp;
    private bubbleDown;
}
/**
 * BM25 排序算法 - 关键词精确匹配
 * 用于补充向量语义搜索，提升精确关键词的召回
 */
export declare class BM25Scorer {
    private readonly k1;
    private readonly b;
    private readonly maxCachedDocuments;
    private docCount;
    private avgDocLength;
    private idfCache;
    private documentStats;
    private seenDocuments;
    /**
   * 计算文档集合的 IDF（逆文档频率）
     * @param documents 所有文档内容
     */
    buildIndex(documents: string[]): void;
    /**
     * 计算查询与文档的 BM25 分数
     */
    score(query: string, document: string): number;
    /**
     * Score multiple candidate documents while tokenizing the query only once.
     * Candidate token frequencies use a bounded second-hit cache: one-off search
     * results are scored without retaining their token maps, while repeated
     * candidates are promoted into the LRU cache.
     */
    scoreMany(query: string, documents: readonly string[]): number[];
    tokenizeQuery(query: string): string[];
    scoreManyTokens(queryTokens: readonly string[], documents: readonly string[]): number[];
    scoreManyCandidates(queryTokens: readonly string[], candidates: readonly {
        key: string;
        document: string;
    }[]): number[];
    private rememberSeenDocument;
    private scoreTokens;
    private buildDocumentStats;
    /**
     * 分词 - 提取有意义的 token
     */
    private tokenize;
}
//# sourceMappingURL=performance-utils.d.ts.map