// Type definitions for semantic search
export interface CodeChunk {
  id: string
  file: string
  language: string
  type: 'function' | 'class' | 'method' | 'interface' | 'block'
  name: string
  content: string
  startLine: number
  endLine: number
  metadata: {
    imports?: string[]
    exports?: string[]
    comments?: string
  }
}

export interface SearchResult {
  chunk: CodeChunk
  score: number
}

export interface EmbeddingService {
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
}

export interface VectorStore {
  init(): Promise<void>
  add(chunks: CodeChunk[], embeddings: number[][]): Promise<void>
  search(query: string, queryEmbedding: number[], topK: number): Promise<SearchResult[]>
  clear(): Promise<void>
  count?(): Promise<number>
}

export interface DiffLine {
  type: 'addition' | 'deletion' | 'context'
  oldNumber: number | null
  newNumber: number | null
  indicator: string
  content: string
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  changes: DiffChange[]
}

export interface DiffChange {
  type: 'add' | 'delete' | 'context'
  content: string
  lineNumber: number
}

export interface EditResult {
  success: boolean
  file: string
  bytesChanged: number
  linesChanged: number
  diff?: {
    old: string
    new: string
    hunks: DiffHunk[]
  }
}

export interface InlinePreview {
  context_before: string[]
  old_content: string[]
  new_content: string[]
  context_after: string[]
}
