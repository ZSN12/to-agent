import type { EmbeddingService } from './types.ts'
import { createHash } from 'node:crypto'

interface EmbeddingResponse { data?: Array<{ embedding?: number[] }> }
const MAX_EMBEDDING_CACHE_ENTRIES = 1024

function getCachedEmbedding(cache: Map<string, number[]>, key: string): number[] | undefined {
  const embedding = cache.get(key)
  if (!embedding) return undefined
  cache.delete(key)
  cache.set(key, embedding)
  return embedding
}

function setCachedEmbedding(cache: Map<string, number[]>, key: string, embedding: number[]): void {
  cache.delete(key)
  if (cache.size >= MAX_EMBEDDING_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) cache.delete(oldestKey)
  }
  cache.set(key, embedding)
}

async function readEmbeddings(response: Response): Promise<number[][]> {
  const payload = await response.json() as EmbeddingResponse
  if (!Array.isArray(payload.data) || payload.data.some(item => !Array.isArray(item.embedding))) throw new Error('Embedding API returned an invalid response')
  return payload.data.map(item => item.embedding!)
}

export class JinaEmbeddingService implements EmbeddingService {
  private apiKey: string
  private model: string = 'jina-embeddings-v2-base-code'
  private apiUrl: string = 'https://api.jina.ai/v1/embeddings'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async embed(text: string): Promise<number[]> {
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
    })

    if (!response.ok) {
      throw new Error(`Jina API error: ${response.statusText}`)
    }

    const [embedding] = await readEmbeddings(response)
    if (!embedding) throw new Error('Embedding API returned no embedding')
    return embedding
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // 批量处理，最多 100 个
    const chunks: string[][] = []
    for (let i = 0; i < texts.length; i += 100) {
      chunks.push(texts.slice(i, i + 100))
    }

    const results = await Promise.all(
      chunks.map(chunk => this.embedChunk(chunk))
    )

    return results.flat()
  }

  private async embedChunk(texts: string[]): Promise<number[][]> {
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
    })

    if (!response.ok) {
      throw new Error(`Jina API error: ${response.statusText}`)
    }

    return readEmbeddings(response)
  }
}

export class OpenAIEmbeddingService implements EmbeddingService {
  private apiKey: string
  private model: string = 'text-embedding-ada-002'
  private apiUrl: string = 'https://api.openai.com/v1/embeddings'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async embed(text: string): Promise<number[]> {
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
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const [embedding] = await readEmbeddings(response)
    if (!embedding) throw new Error('Embedding API returned no embedding')
    return embedding
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
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
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    return readEmbeddings(response)
  }
}

// 缓存包装器
export class CachedEmbeddingService implements EmbeddingService {
  private cache = new Map<string, number[]>()
  private underlying: EmbeddingService

  constructor(underlying: EmbeddingService) {
    this.underlying = underlying
  }

  async embed(text: string): Promise<number[]> {
    const hash = this.hash(text)
    const cached = getCachedEmbedding(this.cache, hash)
    if (cached) return cached

    const embedding = await this.underlying.embed(text)
    setCachedEmbedding(this.cache, hash, embedding)
    return embedding
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = []
    const toEmbed: string[] = []
    const toEmbedIndices: number[] = []

    // 检查缓存
    for (let i = 0; i < texts.length; i++) {
      const hash = this.hash(texts[i])
      const cached = getCachedEmbedding(this.cache, hash)
      if (cached) {
        results[i] = cached
      } else {
        toEmbed.push(texts[i])
        toEmbedIndices.push(i)
      }
    }

    // 批量嵌入未缓存的
    if (toEmbed.length > 0) {
      const embeddings = await this.underlying.embedBatch(toEmbed)
      for (let i = 0; i < toEmbed.length; i++) {
        const hash = this.hash(toEmbed[i])
        setCachedEmbedding(this.cache, hash, embeddings[i])
        results[toEmbedIndices[i]] = embeddings[i]
      }
    }

    return results
  }

  private hash(text: string): string {
    return createHash('sha256').update(text).digest('hex')
  }

  getCacheSize(): number {
    return this.cache.size
  }

  clearCache(): void {
    this.cache.clear()
  }
}

// 常见编程语言关键字与虚词停用词表
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during',
  'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself',
  'him', 'himself', 'his', 'how', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'just', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while',
  'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves',
  // 编程常用但无特定语义的修饰符
  'const', 'let', 'var', 'function', 'return', 'import', 'export', 'from', 'class', 'interface', 'type',
  'async', 'await', 'true', 'false', 'null', 'undefined', 'void', 'this', 'self',
])

/**
 * 内置本地代码向量化服务（参考 Claude Code 开箱即用架构）
 * 零外部 API 依赖，基于代码符号大纲、语法结构与特征哈希生成稠密向量，
 * 毫秒级响应，与内存向量存储及余弦相似度无缝兼容。
 */
export class BuiltinLocalEmbeddingService implements EmbeddingService {
  private readonly dimension = 384
  private readonly cache = new Map<string, number[]>()

  async embed(text: string): Promise<number[]> {
    const key = this.hashKey(text)
    const cached = getCachedEmbedding(this.cache, key)
    if (cached) return cached
    const vector = this.computeEmbedding(text)
    setCachedEmbedding(this.cache, key, vector)
    return vector
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.embed(text)))
  }

  getCacheSize(): number {
    return this.cache.size
  }

  clearCache(): void {
    this.cache.clear()
  }

  private hashKey(text: string): string {
    return createHash('sha256').update(text).digest('hex')
  }

  private computeEmbedding(text: string): number[] {
    const vector = new Float64Array(this.dimension)
    const tokens = this.extractTokens(text)
    if (tokens.length === 0) {
      return Array.from(vector)
    }

    // 统计词频并应用代码元素权重
    const tfMap = new Map<string, number>()
    for (const { token, weight } of tokens) {
      tfMap.set(token, (tfMap.get(token) ?? 0) + weight)
    }

    for (const [token, weightedTf] of tfMap) {
      const slot = this.tokenHash(token) % this.dimension
      const sign = (this.tokenHash(token + '_sign') & 1) === 0 ? 1 : -1
      // 对数词频平滑
      const score = Math.log1p(weightedTf)
      vector[slot] += sign * score
    }

    // L2 范数归一化，使得点积即为余弦相似度
    let norm = 0
    for (let i = 0; i < this.dimension; i++) {
      norm += vector[i] * vector[i]
    }
    norm = Math.sqrt(norm)

    if (norm > 0) {
      for (let i = 0; i < this.dimension; i++) {
        vector[i] /= norm
      }
    }

    return Array.from(vector)
  }

  private extractTokens(text: string): Array<{ token: string; weight: number }> {
    const lines = text.split('\n')
    const result: Array<{ token: string; weight: number }> = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      let lineWeight = 1.0
      // 符号大纲、注释与导出结构加权
      if (trimmed.startsWith('Symbol:')) {
        lineWeight = 3.5
      } else if (trimmed.startsWith('Comments:') || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('#')) {
        lineWeight = 2.0
      } else if (trimmed.startsWith('export ') || trimmed.startsWith('export default ')) {
        lineWeight = 2.2
      } else if (trimmed.startsWith('import ')) {
        lineWeight = 1.2
      }

      const matches = trimmed.match(/[a-zA-Z_0-9$]+|[\u4e00-\u9fa5]{1,2}/g) || []
      for (const tokenStr of matches) {
        if (/^[\u4e00-\u9fa5]+$/.test(tokenStr)) {
          // 中文关键词
          result.push({ token: tokenStr, weight: lineWeight * 1.5 })
          continue
        }

        const lower = tokenStr.toLowerCase()
        if (STOP_WORDS.has(lower)) {
          result.push({ token: lower, weight: lineWeight * 0.2 })
          continue
        }

        result.push({ token: lower, weight: lineWeight })

        // 驼峰命名分解（例如 getSemanticSearchSettings -> get, semantic, search, settings）
        const subWords = tokenStr.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-$]/g, ' ').split(/\s+/)
        if (subWords.length > 1) {
          for (const sub of subWords) {
            const subLower = sub.toLowerCase()
            if (subLower.length > 1 && !STOP_WORDS.has(subLower)) {
              result.push({ token: subLower, weight: lineWeight * 1.3 })
            }
          }
        }
      }
    }

    return result
  }

  private tokenHash(str: string): number {
    let hash = 2166136261
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    return Math.abs(hash)
  }
}

export { BuiltinLocalEmbeddingService as LocalEmbeddingService }
