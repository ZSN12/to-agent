import type { Context } from '@taskweaver/cordis'
import { defineTool } from '@taskweaver/dsh-tools'
import type { ToolRunContext, ToolDefinition } from '@taskweaver/dsh-tools'
import type { FsTarget } from '@taskweaver/dsh-fs'
import { credentialRef } from '@taskweaver/dsh-credentials'
import type {} from '@taskweaver/dsh-credentials'
import { launchEnvironmentOf } from '@taskweaver/dsh-launch-environment'
import { installSettingsSection, settingsNamespace } from '@taskweaver/dsh-settings'
import { sessionResolveOptions } from '@taskweaver/dsh-tool-fs'
import z from '@taskweaver/schemastery'
import { createHash } from 'node:crypto'
import { CodeChunker } from './chunker.ts'
import { BuiltinLocalEmbeddingService, CachedEmbeddingService, JinaEmbeddingService, OpenAIEmbeddingService } from './embedding.ts'
import { SemanticSearcher } from './searcher.ts'
import type { CodeChunk, EmbeddingService } from './types.ts'
import { createSemanticToolGate } from './tool-gate.ts'
import { InMemoryVectorStore } from './vector-store.ts'
import { DEFAULT_MAX_INDEXED_WORKSPACES, validateIndexCapacity, WorkspaceIndexCache } from './index-cache.ts'

export const name = 'tool-fs-semantic-search'
export const inject = ['tools', 'fs', 'systemPrompt']

export type EmbeddingProvider = 'builtin-local' | 'jina' | 'openai'
export interface Config { embeddingProvider?: EmbeddingProvider; maxFiles?: number; maxFileBytes?: number; maxTotalBytes?: number; maxIndexedWorkspaces?: number }
export const Config: z<Config> = z.object({
  embeddingProvider: z.union(['builtin-local', 'jina', 'openai']).default('builtin-local'),
  maxFiles: z.number().default(500), maxFileBytes: z.number().default(262144), maxTotalBytes: z.number().default(8388608),
  maxIndexedWorkspaces: z.number().min(1).step(1).default(DEFAULT_MAX_INDEXED_WORKSPACES),
})
type ResolvedConfig = Required<Config>

export const SETTINGS_NAMESPACE = settingsNamespace(name)
const CREDENTIAL_REFS: Partial<Record<EmbeddingProvider, ReturnType<typeof credentialRef>>> = {
  jina: credentialRef('JINA_API_KEY'),
  openai: credentialRef('OPENAI_API_KEY'),
}
type SemanticIndex = { root: FsTarget; searcher: SemanticSearcher; files: number; chunks: number }
const skipDirs = new Set(['.git', '.hg', '.svn', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', '.turbo', '__pycache__', '.venv', 'runtime-packages'])
const languageByExt: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', py: 'python' }

function selectedProvider(config: Config): EmbeddingProvider {
  if (config.embeddingProvider === 'openai') return 'openai'
  if (config.embeddingProvider === 'jina') return 'jina'
  return 'builtin-local'
}

async function hasCredential(ctx: Context, provider: EmbeddingProvider): Promise<boolean> {
  if (provider === 'builtin-local') return true
  const ref = CREDENTIAL_REFS[provider]
  if (!ref) return false
  const credentials = ctx.get('credentials')
  if (credentials) return (await credentials.describe(ref)).configured
  const ambient = launchEnvironmentOf(ctx).get(ref)
  return Boolean(ambient?.value?.trim())
}

async function embeddingFor(ctx: Context, provider: EmbeddingProvider): Promise<EmbeddingService> {
  if (provider === 'builtin-local') {
    return new BuiltinLocalEmbeddingService()
  }
  const ref = CREDENTIAL_REFS[provider]
  if (!ref) return new BuiltinLocalEmbeddingService()
  const credentials = ctx.get('credentials')
  const resolved = credentials ? await credentials.resolve(ref) : undefined
  const key = resolved?.value ?? launchEnvironmentOf(ctx).get(ref)?.value
  if (!key?.trim()) {
    // 平滑降级到内置本地搜索服务，免密可用
    return new BuiltinLocalEmbeddingService()
  }
  const service = provider === 'jina' ? new JinaEmbeddingService(key) : new OpenAIEmbeddingService(key)
  return new CachedEmbeddingService(service)
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
    signal?.throwIfAborted()
    for (const entry of await ctx.fs.listDir(dir, signal)) {
      signal?.throwIfAborted()
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
    signal?.throwIfAborted()
    const info = await ctx.fs.stat(file.target, signal)
    if (!info || info.type !== 'file' || (info.size ?? 0) > config.maxFileBytes) continue
    if (totalBytes + (info.size ?? 0) > config.maxTotalBytes) break
    const content = await ctx.fs.readText(file.target, signal)
    signal?.throwIfAborted()
    const size = new TextEncoder().encode(content).byteLength
    if (size > config.maxFileBytes || totalBytes + size > config.maxTotalBytes) continue
    totalBytes += size
    chunks.push(...await chunker.chunk(file.target.displayPath, content, file.language))
  }
  return chunks
}

async function resolveEffectiveProvider(ctx: Context, provider: EmbeddingProvider): Promise<EmbeddingProvider> {
  if (provider === 'jina' || provider === 'openai') {
    const configured = await hasCredential(ctx, provider)
    if (configured) return provider
  }
  return 'builtin-local'
}

function createTools(ctx: Context, getConfig: () => Config, indexes: WorkspaceIndexCache<SemanticIndex>): ToolDefinition[] {
  return [
    defineTool({
      name: 'index_project_for_semantic_search', description: 'Create an in-memory semantic index for code in the current session workspace.',
      parameters: { workspace: { type: 'string', description: 'Optional workspace directory; defaults to the session cwd.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { files: { type: 'integer', required: true }, chunks: { type: 'integer', required: true }, workspace: { type: 'string', required: true } } }, render: (_a, v) => [{ type: 'text', text: `Indexed ${v.files} files (${v.chunks} chunks) in ${v.workspace}.` }] },
      async execute(args, exec) {
        const config = getConfig() as ResolvedConfig
        const provider = selectedProvider(config)
        const root = await resolveRoot(ctx, args.workspace ?? exec.agent?.session.header.cwd ?? '.', exec)
        const effective = await resolveEffectiveProvider(ctx, provider)
        const key = `${indexKey(root)}:${effective}`
        const index = await indexes.replace(key, async signal => {
          const chunks = await readCode(ctx, root, config, signal)
          signal.throwIfAborted()
          const embedding = await embeddingFor(ctx, effective)
          signal.throwIfAborted()
          const searcher = new SemanticSearcher(embedding, new InMemoryVectorStore())
          await searcher.indexChunks(chunks)
          signal.throwIfAborted()
          return { root, searcher, files: new Set(chunks.map(c => c.file)).size, chunks: chunks.length }
        }, exec.signal)
        return { files: index.files, chunks: index.chunks, workspace: root.displayPath }
      },
    }),
    defineTool({
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
        const config = getConfig() as ResolvedConfig
        const provider = selectedProvider(config)
        const effective = await resolveEffectiveProvider(ctx, provider)
        const key = `${indexKey(root)}:${effective}`
        const pending = indexes.get(key)
        if (!pending) throw new Error('Workspace is not indexed; call index_project_for_semantic_search first')
        const index = await pending
        const results = await index.searcher.search(args.query, Math.max(1, Math.min(30, args.top_k ?? 10)), {
          ...(args.language ? { language: args.language } : {}), ...(args.type ? { type: args.type } : {}), ...(args.file ? { file: args.file } : {}),
        })
        return JSON.stringify(results, null, 2)
      },
    }),
    defineTool({
      name: 'semantic_search_stats', description: 'Show the indexed chunk count for the current workspace.',
      parameters: { workspace: { type: 'string', description: 'Optional workspace directory.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { indexed: { type: 'boolean', required: true }, chunks: { type: 'integer', required: true }, workspace: { type: 'string', required: true } } }, render: (_a, v) => [{ type: 'text', text: v.indexed ? `${v.chunks} chunks indexed in ${v.workspace}.` : `No index for ${v.workspace}.` }] },
      async execute(args, exec) {
        const root = await resolveRoot(ctx, args.workspace ?? exec.agent?.session.header.cwd ?? '.', exec)
        const config = getConfig() as ResolvedConfig
        const provider = selectedProvider(config)
        const effective = await resolveEffectiveProvider(ctx, provider)
        const key = `${indexKey(root)}:${effective}`
        const pending = indexes.get(key)
        const index = pending ? await pending : undefined
        const stats = index ? await index.searcher.getStats() : { totalChunks: 0, cacheSize: 0 }
        return { indexed: Boolean(index), chunks: stats.totalChunks, workspace: root.displayPath }
      },
    }),
  ]
}

export async function apply(ctx: Context, config: Config): Promise<void> {
  const cfg = config as ResolvedConfig
  for (const [key, value] of Object.entries({ maxFiles: cfg.maxFiles, maxFileBytes: cfg.maxFileBytes, maxTotalBytes: cfg.maxTotalBytes })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${key} must be a positive integer`)
  }
  const indexes = new WorkspaceIndexCache<SemanticIndex>(config.maxIndexedWorkspaces ?? DEFAULT_MAX_INDEXED_WORKSPACES)

  let current: () => Config = () => config
  let effectiveProvider: EmbeddingProvider = 'builtin-local'

  const refreshEffectiveProvider = async () => {
    indexes.setCapacity(current().maxIndexedWorkspaces ?? DEFAULT_MAX_INDEXED_WORKSPACES)
    effectiveProvider = await resolveEffectiveProvider(ctx, selectedProvider(current()))
  }

  const gate = createSemanticToolGate({
    getProvider: () => effectiveProvider,
    hasCredential: provider => hasCredential(ctx, provider),
    mount: (provider) => {
      const disposers: Array<() => void> = []
      try {
        for (const tool of createTools(ctx, current, indexes)) disposers.push(ctx.tools.register(tool))
        const isCloud = provider === 'jina' || provider === 'openai'
        disposers.push(ctx.systemPrompt.section({
          name: 'tool:semantic_search_code',
          order: 104,
          text: isCloud
            ? `语义代码搜索已启用（云端向量增强模式：${provider === 'jina' ? 'Jina AI' : 'OpenAI'}）。代码片段将用于生成向量并查找相关实现。需要先建立工作区索引，再调用语义搜索。`
            : '代码搜索已启用（内置本地检索模式，基于代码符号大纲与本地切片权重，无需外部网络与 API 密钥）。需要先建立工作区索引，再调用语义搜索。',
        }))
        return disposers
      } catch (error) {
        for (const dispose of disposers.reverse()) dispose()
        throw error
      }
    },
    onReset: () => indexes.clear(),
  })
  const safeSynchronize = () => {
    void (async () => {
      await refreshEffectiveProvider()
      await gate.synchronize()
    })().catch((error: unknown) => {
      ctx.logger.warn('semantic search: failed to update tool availability', error)
    })
  }

  installSettingsSection(ctx, SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => { current = source },
    onChange: safeSynchronize,
    validate: value => validateIndexCapacity(value.maxIndexedWorkspaces ?? DEFAULT_MAX_INDEXED_WORKSPACES),
  })
  ctx.on('credentials/reference-updated', (ref) => {
    const active = selectedProvider(current())
    if (active === 'builtin-local' || ref !== CREDENTIAL_REFS[active as 'jina' | 'openai']) return
    indexes.clear()
    safeSynchronize()
  })
  ctx.effect(() => () => { indexes.dispose(); gate.dispose() })
  await refreshEffectiveProvider()
  await gate.synchronize()
}
