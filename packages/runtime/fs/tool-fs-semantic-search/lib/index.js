import { defineTool } from '@taskweaver/dsh-tools';
import { credentialRef } from '@taskweaver/dsh-credentials';
import { launchEnvironmentOf } from '@taskweaver/dsh-launch-environment';
import { installSettingsSection, settingsNamespace } from '@taskweaver/dsh-settings';
import { sessionResolveOptions } from '@taskweaver/dsh-tool-fs';
import z from '@taskweaver/schemastery';
import { createHash } from 'node:crypto';
import { CodeChunker } from './chunker';
import { CachedEmbeddingService, JinaEmbeddingService, OpenAIEmbeddingService } from './embedding';
import { SemanticSearcher } from './searcher';
import { createSemanticToolGate } from './tool-gate';
import { InMemoryVectorStore } from './vector-store';
export const name = 'tool-fs-semantic-search';
export const inject = ['tools', 'fs', 'systemPrompt'];
export const Config = z.object({
    embeddingProvider: z.union(['jina', 'openai']).default('jina'),
    maxFiles: z.number().default(500), maxFileBytes: z.number().default(262144), maxTotalBytes: z.number().default(8388608),
});
export const SETTINGS_NAMESPACE = settingsNamespace(name);
const CREDENTIAL_REFS = {
    jina: credentialRef('JINA_API_KEY'),
    openai: credentialRef('OPENAI_API_KEY'),
};
const indexes = new Map();
const skipDirs = new Set(['.git', '.hg', '.svn', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', '.turbo', '__pycache__', '.venv', 'runtime-packages']);
const languageByExt = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', py: 'python' };
function selectedProvider(config) {
    return config.embeddingProvider === 'openai' ? 'openai' : 'jina';
}
async function hasCredential(ctx, provider) {
    const ref = CREDENTIAL_REFS[provider];
    const credentials = ctx.get('credentials');
    if (credentials)
        return (await credentials.describe(ref)).configured;
    const ambient = launchEnvironmentOf(ctx).get(ref);
    return Boolean(ambient?.value.trim());
}
async function embeddingFor(ctx, provider) {
    const ref = CREDENTIAL_REFS[provider];
    const credentials = ctx.get('credentials');
    const resolved = credentials ? await credentials.resolve(ref) : undefined;
    const key = resolved?.value ?? launchEnvironmentOf(ctx).get(ref)?.value;
    if (!key?.trim())
        throw new Error(`请先在设置中配置 ${provider === 'jina' ? 'Jina' : 'OpenAI'} Embedding API 密钥`);
    const service = provider === 'jina' ? new JinaEmbeddingService(key) : new OpenAIEmbeddingService(key);
    return new CachedEmbeddingService(service);
}
async function resolveRoot(ctx, path, exec) {
    const root = await ctx.fs.resolve(path, sessionResolveOptions(exec, path));
    if ((await ctx.fs.stat(root, exec.signal))?.type !== 'directory')
        throw new Error(`Workspace is not a directory: ${root.displayPath}`);
    return root;
}
function indexKey(root) { return createHash('sha256').update(String(root.targetKey)).digest('hex').slice(0, 24); }
async function readCode(ctx, root, config, signal) {
    const files = [];
    const visit = async (dir) => {
        for (const entry of await ctx.fs.listDir(dir, signal)) {
            if (files.length >= config.maxFiles)
                return;
            if (!ctx.fs.contains(root, entry.target))
                continue;
            if (entry.type === 'directory') {
                if (!entry.name.startsWith('.') && !skipDirs.has(entry.name))
                    await visit(entry.target);
            }
            else if (entry.type === 'file') {
                const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
                if (languageByExt[ext])
                    files.push({ target: entry.target, language: languageByExt[ext] });
            }
        }
    };
    await visit(root);
    const chunks = [];
    const chunker = new CodeChunker();
    let totalBytes = 0;
    for (const file of files) {
        const info = await ctx.fs.stat(file.target, signal);
        if (!info || info.type !== 'file' || (info.size ?? 0) > config.maxFileBytes)
            continue;
        if (totalBytes + (info.size ?? 0) > config.maxTotalBytes)
            break;
        const content = await ctx.fs.readText(file.target, signal);
        const size = new TextEncoder().encode(content).byteLength;
        if (size > config.maxFileBytes || totalBytes + size > config.maxTotalBytes)
            continue;
        totalBytes += size;
        chunks.push(...await chunker.chunk(file.target.displayPath, content, file.language));
    }
    return chunks;
}
async function getIndex(ctx, root, provider) {
    const key = indexKey(root);
    let pending = indexes.get(key);
    if (!pending) {
        pending = embeddingFor(ctx, provider).then(embedding => ({
            root,
            searcher: new SemanticSearcher(embedding, new InMemoryVectorStore(), new CodeChunker()),
        }));
        indexes.set(key, pending);
    }
    try {
        return await pending;
    }
    catch (error) {
        if (indexes.get(key) === pending)
            indexes.delete(key);
        throw error;
    }
}
function createTools(ctx, getConfig) {
    return [
        defineTool({
            name: 'index_project_for_semantic_search', description: 'Create an in-memory semantic index for code in the current session workspace.',
            parameters: { workspace: { type: 'string', description: 'Optional workspace directory; defaults to the session cwd.' } },
            output: { schema: { type: 'object', additionalProperties: false, properties: { files: { type: 'integer', required: true }, chunks: { type: 'integer', required: true }, workspace: { type: 'string', required: true } } }, render: (_a, v) => [{ type: 'text', text: `Indexed ${v.files} files (${v.chunks} chunks) in ${v.workspace}.` }] },
            async execute(args, exec) {
                const config = getConfig();
                const provider = selectedProvider(config);
                const root = await resolveRoot(ctx, args.workspace ?? exec.agent?.session.header.cwd ?? '.', exec);
                const chunks = await readCode(ctx, root, config, exec.signal);
                await (await getIndex(ctx, root, provider)).searcher.indexChunks(chunks);
                return { files: new Set(chunks.map(c => c.file)).size, chunks: chunks.length, workspace: root.displayPath };
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
                const root = await resolveRoot(ctx, args.workspace ?? exec.agent?.session.header.cwd ?? '.', exec);
                const pending = indexes.get(indexKey(root));
                if (!pending)
                    throw new Error('Workspace is not indexed; call index_project_for_semantic_search first');
                const index = await pending;
                const results = await index.searcher.search(args.query, Math.max(1, Math.min(30, args.top_k ?? 10)), {
                    ...(args.language ? { language: args.language } : {}), ...(args.type ? { type: args.type } : {}), ...(args.file ? { file: args.file } : {}),
                });
                return JSON.stringify(results, null, 2);
            },
        }),
        defineTool({
            name: 'semantic_search_stats', description: 'Show the indexed chunk count for the current workspace.',
            parameters: { workspace: { type: 'string', description: 'Optional workspace directory.' } },
            output: { schema: { type: 'object', additionalProperties: false, properties: { indexed: { type: 'boolean', required: true }, chunks: { type: 'integer', required: true }, workspace: { type: 'string', required: true } } }, render: (_a, v) => [{ type: 'text', text: v.indexed ? `${v.chunks} chunks indexed in ${v.workspace}.` : `No index for ${v.workspace}.` }] },
            async execute(args, exec) {
                const root = await resolveRoot(ctx, args.workspace ?? exec.agent?.session.header.cwd ?? '.', exec);
                const pending = indexes.get(indexKey(root));
                const index = pending ? await pending : undefined;
                const stats = index ? await index.searcher.getStats() : { totalChunks: 0, cacheSize: 0 };
                return { indexed: Boolean(index), chunks: stats.totalChunks, workspace: root.displayPath };
            },
        }),
    ];
}
export async function apply(ctx, config) {
    const cfg = config;
    for (const [key, value] of Object.entries({ maxFiles: cfg.maxFiles, maxFileBytes: cfg.maxFileBytes, maxTotalBytes: cfg.maxTotalBytes })) {
        if (!Number.isSafeInteger(value) || value < 1)
            throw new Error(`${key} must be a positive integer`);
    }
    let current = () => config;
    const gate = createSemanticToolGate({
        getProvider: () => selectedProvider(current()),
        hasCredential: provider => hasCredential(ctx, provider),
        mount: () => {
            const disposers = [];
            try {
                for (const tool of createTools(ctx, current))
                    disposers.push(ctx.tools.register(tool));
                disposers.push(ctx.systemPrompt.section({
                    name: 'tool:semantic_search_code',
                    order: 104,
                    text: '语义代码搜索已启用。它会将本地代码片段发送到设置中选择的向量服务，用于生成向量并查找相关代码。需要先建立工作区索引，再调用语义搜索。',
                }));
                return disposers;
            }
            catch (error) {
                for (const dispose of disposers.reverse())
                    dispose();
                throw error;
            }
        },
        onReset: () => indexes.clear(),
    });
    const safeSynchronize = () => {
        void gate.synchronize().catch((error) => {
            ctx.logger.warn('semantic search: failed to update tool availability', error);
        });
    };
    installSettingsSection(ctx, SETTINGS_NAMESPACE, Config, config, {
        setSource: (source) => { current = source; },
        onChange: safeSynchronize,
    });
    ctx.on('credentials/reference-updated', (ref) => {
        if (ref !== CREDENTIAL_REFS[selectedProvider(current())])
            return;
        indexes.clear();
        safeSynchronize();
    });
    ctx.effect(() => () => gate.dispose());
    await gate.synchronize();
}
//# sourceMappingURL=index.js.map