import type { Context } from '@z/cordis'
import { defineTool } from '@z/dsh-tools'
import type { ToolRunContext } from '@z/dsh-tools'
import type { FsTarget } from '@z/dsh-fs'
import { sessionResolveOptions } from '@z/dsh-tool-fs'
import z from '@z/schemastery'
import { createHash } from 'node:crypto'
import { CodeChunker } from './chunker'
import { CachedEmbeddingService, JinaEmbeddingService, OpenAIEmbeddingService } from './embedding'
import { SemanticSearcher } from './searcher'
import type { CodeChunk, EmbeddingService } from './types'
import { InMemoryVectorStore } from './vector-store'

export const name = 'tool-fs-semantic-search'
export const inject = ['tools', 'fs', 'systemPrompt']
export interface Config { embeddingProvider?: 'jina' | 'openai'; jinaApiKey?: string; openaiApiKey?: string; maxFiles?: number; maxFileBytes?: number; maxTotalBytes?: number }
export const Config: z<Config> = z.object({
  embeddingProvider: z.union(['jina', 'openai']).default('jina'),
  jinaApiKey: z.string().role('secret'), openaiApiKey: z.string().role('secret'),
  maxFiles: z.number().default(500), maxFileBytes: z.number().default(262144), maxTotalBytes: z.number().default(8388608),
})
type ResolvedConfig = Required<Config>
const indexes = new Map<string, { root: FsTarget; searcher: SemanticSearcher }>()
const skipDirs = new Set(['.git', '.hg', '.svn', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', '.turbo', '__pycache__', '.venv', 'runtime-packages'])
const languageByExt: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', py: 'python' }

function embeddingFor(config: ResolvedConfig): EmbeddingService {
  const jina = config.embeddingProvider === 'jina'
  const key = (jina ? config.jinaApiKey : config.openaiApiKey) || (jina ? process.env.JINA_API_KEY : process.env.OPENAI_API_KEY)
  if (!key) throw new Error(`Set ${jina ? 'JINA_API_KEY' : 'OPENAI_API_KEY'} to use semantic search`)
  return new CachedEmbeddingService(jina ? new JinaEmbeddingService(key) : new OpenAIEmbeddingService(key))
}
async function resolveRoot(ctx: Context, path: string, exec: ToolRunContext): Promise<FsTarget> {
  const root = await ctx.fs.resolve(path, sessionResolveOptions(exec, path))
  if ((await ctx.fs.stat(root, exec.signal))?.type !== 'directory') throw new Error(`Workspace is not a directory: ${root.displayPath}`)
  return root
}
function indexKey(root: FsTarget): string { return createHash('sha256').update(String(root.targetKey)).digest('hex').slice(0, 24) }

async function readCode(ctx: Context, root: FsTarget, config: ResolvedConfig, signal?: AbortSignal): Promise<CodeChunk[]> {
  const files: Array<{ target: FsTarget; language: string }> = []
  const visit = async (dir: FsTarget): Promise<void> => {
    for (const entry of await ctx.fs.listDir(dir, signal)) {
      if (files.length >= config.maxFiles) return
      if (!ctx.fs.contains(root, entry.target)) continue
      if (entry.type === 'directory') {
        if (!entry.name.startsWith('.') && !skipDirs.has(entry.name)) await visit(entry.target)
      } else if (entry.type === 'file') {
        const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
        if (languageByExt[ext]) files.push({ target: entry.target, language: languageByExt[ext] })
      }
    }
  }
  await visit(root)
  const chunks: CodeChunk[] = []
  const chunker = new CodeChunker()
  let totalBytes = 0
  for (const file of files) {
    const info = await ctx.fs.stat(file.target, signal)
    if (!info || info.type !== 'file' || (info.size ?? 0) > config.maxFileBytes) continue
    if (totalBytes + (info.size ?? 0) > config.maxTotalBytes) break
    const content = await ctx.fs.readText(file.target, signal)
    const size = new TextEncoder().encode(content).byteLength
    if (size > config.maxFileBytes || totalBytes + size > config.maxTotalBytes) continue
    totalBytes += size
    chunks.push(...await chunker.chunk(file.target.displayPath, content, file.language))
  }
  return chunks
}
function getIndex(root: FsTarget, config: ResolvedConfig) {
  const key = indexKey(root)
  let index = indexes.get(key)
  if (!index) {
    index = { root, searcher: new SemanticSearcher(embeddingFor(config), new InMemoryVectorStore(), new CodeChunker()) }
    indexes.set(key, index)
  }
  return index
}

export function apply(ctx: Context, config: Config): void {
  const cfg = config as ResolvedConfig
  for (const [key, value] of Object.entries({ maxFiles: cfg.maxFiles, maxFileBytes: cfg.maxFileBytes, maxTotalBytes: cfg.maxTotalBytes })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${key} must be a positive integer`)
  }
  ctx.systemPrompt.section({ name: 'tool:semantic_search_code', order: 104, text: 'Use semantic_search_code to find code by purpose. Call index_project_for_semantic_search first. Indexing is bounded to regular source files inside the session workspace and uses Jina/OpenAI embeddings; configure JINA_API_KEY or OPENAI_API_KEY.' })
  ctx.tools.register(defineTool({
    name: 'index_project_for_semantic_search', description: 'Create an in-memory semantic index for code in the current session workspace.',
    parameters: { workspace: { type: 'string', description: 'Optional workspace directory; defaults to the session cwd.' } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { files: { type: 'integer', required: true }, chunks: { type: 'integer', required: true }, workspace: { type: 'string', required: true } } }, render: (_a, v) => [{ type: 'text', text: `Indexed ${v.files} files (${v.chunks} chunks) in ${v.workspace}.` }] },
    async execute(args, exec) {
      const root = await resolveRoot(ctx, args.workspace ?? exec.agent?.session.header.cwd ?? '.', exec)
      const chunks = await readCode(ctx, root, cfg, exec.signal)
      await getIndex(root, cfg).searcher.indexChunks(chunks)
      return { files: new Set(chunks.map(c => c.file)).size, chunks: chunks.length, workspace: root.displayPath }
    },
  }))
  ctx.tools.register(defineTool({
    name: 'semantic_search_code', description: 'Search indexed code with a natural-language description.',
    parameters: {
      query: { type: 'string', required: true, description: 'Describe what the code does.' },
      top_k: { type: 'integer', description: 'Maximum result count (default 10, max 30).' },
      language: { type: 'string', description: 'Optional language filter.' }, type: { type: 'string', description: 'Optional code element type filter.' },
      file: { type: 'string', description: 'Optional file path substring.' }, workspace: { type: 'string', description: 'Optional workspace directory.' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args, exec) {
      const root = await resolveRoot(ctx, args.workspace ?? exec.agent?.session.header.cwd ?? '.', exec)
      const index = indexes.get(indexKey(root))
      if (!index) throw new Error('Workspace is not indexed; call index_project_for_semantic_search first')
      const results = await index.searcher.search(args.query, Math.max(1, Math.min(30, args.top_k ?? 10)), {
        ...(args.language ? { language: args.language } : {}), ...(args.type ? { type: args.type } : {}), ...(args.file ? { file: args.file } : {}),
      })
      return JSON.stringify(results, null, 2)
    },
  }))
  ctx.tools.register(defineTool({
    name: 'semantic_search_stats', description: 'Show the indexed chunk count for the current workspace.',
    parameters: { workspace: { type: 'string', description: 'Optional workspace directory.' } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { indexed: { type: 'boolean', required: true }, chunks: { type: 'integer', required: true }, workspace: { type: 'string', required: true } } }, render: (_a, v) => [{ type: 'text', text: v.indexed ? `${v.chunks} chunks indexed in ${v.workspace}.` : `No index for ${v.workspace}.` }] },
    async execute(args, exec) {
      const root = await resolveRoot(ctx, args.workspace ?? exec.agent?.session.header.cwd ?? '.', exec)
      const index = indexes.get(indexKey(root))
      const stats = index ? await index.searcher.getStats() : { totalChunks: 0, cacheSize: 0 }
      return { indexed: Boolean(index), chunks: stats.totalChunks, workspace: root.displayPath }
    },
  }))
}
