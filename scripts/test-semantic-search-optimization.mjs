#!/usr/bin/env node
/**
 * 测试语义搜索优化效果
 * 对比优化前后的性能提升：
 * 1. MinHeap Top-K vs 全排序
 * 2. BM25 混合搜索 vs 纯向量搜索
 */

import { performance } from 'node:perf_hooks'

// ============ 模拟数据生成 ============

function generateMockChunks(count) {
  const chunks = []
  const languages = ['typescript', 'javascript', 'python', 'go']
  const types = ['function', 'class', 'interface', 'const']

  for (let i = 0; i < count; i++) {
    chunks.push({
      id: `chunk-${i}`,
      file: `src/module-${Math.floor(i / 10)}.ts`,
      language: languages[i % languages.length],
      type: types[i % types.length],
      name: `symbol_${i}`,
      content: `function example_${i}() {\n  return ${i}\n}`,
      startLine: i * 10,
      endLine: i * 10 + 5,
      metadata: {
        imports: [],
        exports: [],
        comments: `This is a test function ${i}`
      }
    })
  }

  return chunks
}

function generateMockEmbedding(dim = 384) {
  const vec = new Array(dim)
  for (let i = 0; i < dim; i++) {
    vec[i] = Math.random() * 2 - 1
  }
  // L2 归一化
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
  return vec.map(v => v / norm)
}

// ============ 旧实现：全排序 ============

function oldTopKSearch(embeddings, queryEmbedding, topK) {
  const scores = embeddings.map((emb, index) => ({
    score: cosineSimilarityOld(queryEmbedding, emb),
    index
  }))

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

function cosineSimilarityOld(a, b) {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ============ 新实现：MinHeap ============

class MinHeap {
  constructor(k, compareFn) {
    this.k = k
    this.items = []
    this.compare = compareFn
  }

  push(item) {
    if (this.items.length < this.k) {
      this.items.push(item)
      this.bubbleUp(this.items.length - 1)
    } else if (this.compare(item, this.items[0]) > 0) {
      this.items[0] = item
      this.bubbleDown(0)
    }
  }

  toSortedArray() {
    return this.items.sort((a, b) => -this.compare(a, b))
  }

  bubbleUp(index) {
    const item = this.items[index]
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      const parent = this.items[parentIndex]
      if (this.compare(item, parent) >= 0) break
      this.items[index] = parent
      index = parentIndex
    }
    this.items[index] = item
  }

  bubbleDown(index) {
    const length = this.items.length
    const item = this.items[index]

    while (true) {
      const leftIndex = 2 * index + 1
      const rightIndex = 2 * index + 2
      let smallestIndex = index

      if (leftIndex < length && this.compare(this.items[leftIndex], this.items[smallestIndex]) < 0) {
        smallestIndex = leftIndex
      }
      if (rightIndex < length && this.compare(this.items[rightIndex], this.items[smallestIndex]) < 0) {
        smallestIndex = rightIndex
      }

      if (smallestIndex === index) break
      this.items[index] = this.items[smallestIndex]
      index = smallestIndex
    }
    this.items[index] = item
  }
}

function newTopKSearch(embeddings, norms, queryEmbedding, topK) {
  const heap = new MinHeap(topK, (a, b) => a.score - b.score)
  const queryNorm = computeNorm(queryEmbedding)

  for (let i = 0; i < embeddings.length; i++) {
    const score = cosineSimilarityNew(queryEmbedding, embeddings[i], queryNorm, norms[i])
    heap.push({ score, index: i })
  }

  return heap.toSortedArray()
}

function computeNorm(vec) {
  let sum = 0
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i]
  }
  return Math.sqrt(sum)
}

function cosineSimilarityNew(a, b, normA, normB) {
  let dotProduct = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
  }

  // 归一化向量优化
  if (Math.abs(normA - 1.0) < 0.001 && Math.abs(normB - 1.0) < 0.001) {
    return dotProduct
  }

  return dotProduct / (normA * normB)
}

// ============ BM25 实现 ============

class BM25Scorer {
  constructor() {
    this.k1 = 1.5
    this.b = 0.75
    this.docCount = 0
    this.avgDocLength = 0
    this.idfCache = new Map()
  }

  buildIndex(documents) {
    this.docCount = documents.length
    if (this.docCount === 0) return

    let totalLength = 0
    const termDocCount = new Map()

    for (const doc of documents) {
      const tokens = this.tokenize(doc)
      totalLength += tokens.length

      const uniqueTokens = new Set(tokens)
      for (const token of uniqueTokens) {
        termDocCount.set(token, (termDocCount.get(token) || 0) + 1)
      }
    }

    this.avgDocLength = totalLength / this.docCount

    for (const [term, df] of termDocCount) {
      this.idfCache.set(term, Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1))
    }
  }

  score(query, document) {
    const queryTokens = this.tokenize(query)
    const docTokens = this.tokenize(document)
    const docLength = docTokens.length

    const termFreq = new Map()
    for (const token of docTokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1)
    }

    let score = 0
    for (const queryToken of queryTokens) {
      const tf = termFreq.get(queryToken) || 0
      const idf = this.idfCache.get(queryToken) || 0

      const numerator = tf * (this.k1 + 1)
      const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength))

      score += idf * (numerator / denominator)
    }

    return score
  }

  tokenize(text) {
    return text.toLowerCase()
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_\-$/.]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1)
  }
}

// ============ 基准测试 ============

function benchmark(name, fn, iterations = 5) {
  const times = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    fn()
    const end = performance.now()
    times.push(end - start)
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length
  const min = Math.min(...times)
  const max = Math.max(...times)

  return { name, avg, min, max, times }
}

function runBenchmarks() {
  console.log('🔬 语义搜索性能优化基准测试\n')

  const sizes = [1000, 5000, 10000]
  const topK = 10
  const dim = 384

  for (const size of sizes) {
    console.log(`\n📊 测试规模: ${size} chunks, Top-${topK}\n`)

    // 生成测试数据
    const chunks = generateMockChunks(size)
    const embeddings = Array.from({ length: size }, () => generateMockEmbedding(dim))
    const norms = embeddings.map(computeNorm)
    const queryEmbedding = generateMockEmbedding(dim)

    // 1. Top-K 搜索对比
    const oldResult = benchmark('旧实现 (全排序)', () => {
      oldTopKSearch(embeddings, queryEmbedding, topK)
    })

    const newResult = benchmark('新实现 (MinHeap)', () => {
      newTopKSearch(embeddings, norms, queryEmbedding, topK)
    })

    console.log('⚡ Top-K 搜索性能:')
    console.log(`  旧实现: ${oldResult.avg.toFixed(2)} ms (${oldResult.min.toFixed(2)} - ${oldResult.max.toFixed(2)})`)
    console.log(`  新实现: ${newResult.avg.toFixed(2)} ms (${newResult.min.toFixed(2)} - ${newResult.max.toFixed(2)})`)
    console.log(`  🚀 提升: ${((oldResult.avg / newResult.avg - 1) * 100).toFixed(1)}%\n`)

    // 2. BM25 索引构建
    const documents = chunks.map(c => `${c.name} ${c.content} ${c.metadata.comments}`)
    const bm25 = new BM25Scorer()

    const bm25BuildResult = benchmark('BM25 索引构建', () => {
      bm25.buildIndex(documents)
    }, 3)

    console.log('📚 BM25 索引:')
    console.log(`  构建时间: ${bm25BuildResult.avg.toFixed(2)} ms`)
    console.log(`  缓存大小: ${bm25.idfCache.size} terms\n`)

    // 3. BM25 评分性能
    const query = 'function example test'
    const bm25ScoreResult = benchmark('BM25 评分 (单次)', () => {
      bm25.score(query, documents[0])
    })

    console.log('🎯 BM25 评分:')
    console.log(`  单次耗时: ${bm25ScoreResult.avg.toFixed(3)} ms`)
    console.log(`  预估 ${topK} 次: ${(bm25ScoreResult.avg * topK).toFixed(2)} ms\n`)
  }

  console.log('✅ 基准测试完成！\n')
  console.log('📝 优化总结:')
  console.log('  1. MinHeap Top-K: O(n log k) 替代 O(n log n) 全排序')
  console.log('  2. 余弦相似度: 预计算范数，归一化向量直接用点积')
  console.log('  3. BM25 混合: 向量语义 + 关键词精确，互补增强')
}

// ============ 运行测试 ============

runBenchmarks()
