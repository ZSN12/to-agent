import { defineTool } from "@taskweaver/dsh-tools";
import { credentialRef } from "@taskweaver/dsh-credentials";
import { launchEnvironmentOf } from "@taskweaver/dsh-launch-environment";
import { installSettingsSection, settingsNamespace } from "@taskweaver/dsh-settings";
import { sessionResolveOptions } from "@taskweaver/dsh-tool-fs";
import z from "@taskweaver/schemastery";
import { createHash } from "node:crypto";
//#region lib/types/chunker.js
var CodeChunker = class {
	async chunk(file, content, language) {
		const chunks = [];
		switch (language) {
			case "typescript":
			case "javascript":
				chunks.push(...this.chunkJavaScript(file, content));
				break;
			case "python":
				chunks.push(...this.chunkPython(file, content));
				break;
			default: chunks.push(...this.chunkGeneric(file, content, language));
		}
		return chunks;
	}
	chunkJavaScript(file, content) {
		const chunks = [];
		const lines = content.split("\n");
		const functionRegex = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/;
		const classRegex = /^(?:export\s+)?class\s+(\w+)/;
		const methodRegex = /^\s+(?:async\s+)?(\w+)\s*\(/;
		const interfaceRegex = /^(?:export\s+)?interface\s+(\w+)/;
		let currentClass = null;
		let blockStart = -1;
		let blockType = "function";
		let blockName = "";
		let braceCount = 0;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const funcMatch = line.match(functionRegex);
			if (funcMatch && blockStart === -1) {
				blockStart = i;
				blockType = "function";
				blockName = funcMatch[1];
				braceCount = 0;
			}
			const classMatch = line.match(classRegex);
			if (classMatch && blockStart === -1) {
				blockStart = i;
				blockType = "class";
				blockName = classMatch[1];
				currentClass = classMatch[1];
				braceCount = 0;
			}
			const interfaceMatch = line.match(interfaceRegex);
			if (interfaceMatch && blockStart === -1) {
				blockStart = i;
				blockType = "interface";
				blockName = interfaceMatch[1];
				braceCount = 0;
			}
			if (currentClass && line.match(methodRegex) && blockStart === -1) {
				const methodMatch = line.match(methodRegex);
				if (methodMatch) {
					blockStart = i;
					blockType = "method";
					blockName = `${currentClass}.${methodMatch[1]}`;
					braceCount = 0;
				}
			}
			if (blockStart !== -1) {
				braceCount += (line.match(/\{/g) || []).length;
				braceCount -= (line.match(/\}/g) || []).length;
				if (braceCount === 0 && line.includes("}")) {
					const blockContent = lines.slice(blockStart, i + 1).join("\n");
					const comments = this.extractComments(lines, blockStart);
					chunks.push({
						id: `${file}:${blockName}:${blockStart + 1}`,
						file,
						language: "typescript",
						type: blockType,
						name: blockName,
						content: blockContent,
						startLine: blockStart + 1,
						endLine: i + 1,
						metadata: {
							comments,
							imports: this.extractImports(content)
						}
					});
					blockStart = -1;
					if (blockType !== "class") currentClass = null;
				}
			}
		}
		return chunks;
	}
	chunkPython(file, content) {
		const chunks = [];
		const lines = content.split("\n");
		const functionRegex = /^def\s+(\w+)/;
		const classRegex = /^class\s+(\w+)/;
		const methodRegex = /^\s+def\s+(\w+)/;
		let currentClass = null;
		let blockStart = -1;
		let blockType = "function";
		let blockName = "";
		let blockIndent = 0;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const indent = line.search(/\S/);
			const funcMatch = line.match(functionRegex);
			if (funcMatch && blockStart === -1) {
				blockStart = i;
				blockType = "function";
				blockName = funcMatch[1];
				blockIndent = indent;
			}
			const classMatch = line.match(classRegex);
			if (classMatch && blockStart === -1) {
				blockStart = i;
				blockType = "class";
				blockName = classMatch[1];
				currentClass = classMatch[1];
				blockIndent = indent;
			}
			if (currentClass && line.match(methodRegex) && blockStart === -1) {
				const methodMatch = line.match(methodRegex);
				if (methodMatch) {
					blockStart = i;
					blockType = "method";
					blockName = `${currentClass}.${methodMatch[1]}`;
					blockIndent = indent;
				}
			}
			if (blockStart !== -1 && i > blockStart) {
				if (line.trim() && indent <= blockIndent) {
					const blockContent = lines.slice(blockStart, i).join("\n");
					const comments = this.extractComments(lines, blockStart);
					chunks.push({
						id: `${file}:${blockName}:${blockStart + 1}`,
						file,
						language: "python",
						type: blockType,
						name: blockName,
						content: blockContent,
						startLine: blockStart + 1,
						endLine: i,
						metadata: { comments }
					});
					blockStart = -1;
					if (blockType !== "class") currentClass = null;
				}
			}
		}
		if (blockStart !== -1) {
			const blockContent = lines.slice(blockStart).join("\n");
			const comments = this.extractComments(lines, blockStart);
			chunks.push({
				id: `${file}:${blockName}:${blockStart + 1}`,
				file,
				language: "python",
				type: blockType,
				name: blockName,
				content: blockContent,
				startLine: blockStart + 1,
				endLine: lines.length,
				metadata: { comments }
			});
		}
		return chunks;
	}
	chunkGeneric(file, content, language) {
		const chunks = [];
		const lines = content.split("\n");
		let blockStart = 0;
		let blockLines = [];
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.trim() === "") {
				if (blockLines.length > 5) {
					const blockContent = blockLines.join("\n");
					const name = blockLines[0].trim().slice(0, 50);
					chunks.push({
						id: `${file}:${name}:${blockStart + 1}`,
						file,
						language,
						type: "block",
						name,
						content: blockContent,
						startLine: blockStart + 1,
						endLine: i,
						metadata: {}
					});
				}
				blockStart = i + 1;
				blockLines = [];
			} else blockLines.push(line);
		}
		if (blockLines.length > 5) {
			const blockContent = blockLines.join("\n");
			const name = blockLines[0].trim().slice(0, 50);
			chunks.push({
				id: `${file}:${name}:${blockStart + 1}`,
				file,
				language,
				type: "block",
				name,
				content: blockContent,
				startLine: blockStart + 1,
				endLine: lines.length,
				metadata: {}
			});
		}
		return chunks;
	}
	extractComments(lines, beforeLine) {
		const comments = [];
		for (let i = beforeLine - 1; i >= 0; i--) {
			const line = lines[i].trim();
			if (line.startsWith("//") || line.startsWith("#")) comments.unshift(line);
			else if (line.startsWith("/*") || line.startsWith("\"\"\"")) {
				comments.unshift(line);
				for (let j = i - 1; j >= 0; j--) {
					comments.unshift(lines[j].trim());
					if (lines[j].trim().endsWith("*/") || lines[j].trim().endsWith("\"\"\"")) break;
				}
				break;
			} else if (line !== "") break;
		}
		return comments.join("\n");
	}
	extractImports(content) {
		const imports = [];
		const lines = content.split("\n");
		for (const line of lines) if (line.trim().startsWith("import ") || line.trim().startsWith("from ")) imports.push(line.trim());
		return imports;
	}
};
//#endregion
//#region lib/types/embedding.js
async function readEmbeddings(response) {
	const payload = await response.json();
	if (!Array.isArray(payload.data) || payload.data.some((item) => !Array.isArray(item.embedding))) throw new Error("Embedding API returned an invalid response");
	return payload.data.map((item) => item.embedding);
}
var JinaEmbeddingService = class {
	apiKey;
	model = "jina-embeddings-v2-base-code";
	apiUrl = "https://api.jina.ai/v1/embeddings";
	constructor(apiKey) {
		this.apiKey = apiKey;
	}
	async embed(text) {
		const response = await fetch(this.apiUrl, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${this.apiKey}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				input: text,
				model: this.model
			})
		});
		if (!response.ok) throw new Error(`Jina API error: ${response.statusText}`);
		const [embedding] = await readEmbeddings(response);
		if (!embedding) throw new Error("Embedding API returned no embedding");
		return embedding;
	}
	async embedBatch(texts) {
		const chunks = [];
		for (let i = 0; i < texts.length; i += 100) chunks.push(texts.slice(i, i + 100));
		return (await Promise.all(chunks.map((chunk) => this.embedChunk(chunk)))).flat();
	}
	async embedChunk(texts) {
		const response = await fetch(this.apiUrl, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${this.apiKey}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				input: texts,
				model: this.model
			})
		});
		if (!response.ok) throw new Error(`Jina API error: ${response.statusText}`);
		return readEmbeddings(response);
	}
};
var OpenAIEmbeddingService = class {
	apiKey;
	model = "text-embedding-ada-002";
	apiUrl = "https://api.openai.com/v1/embeddings";
	constructor(apiKey) {
		this.apiKey = apiKey;
	}
	async embed(text) {
		const response = await fetch(this.apiUrl, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${this.apiKey}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				input: text,
				model: this.model
			})
		});
		if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
		const [embedding] = await readEmbeddings(response);
		if (!embedding) throw new Error("Embedding API returned no embedding");
		return embedding;
	}
	async embedBatch(texts) {
		const response = await fetch(this.apiUrl, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${this.apiKey}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				input: texts,
				model: this.model
			})
		});
		if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
		return readEmbeddings(response);
	}
};
var CachedEmbeddingService = class {
	cache = /* @__PURE__ */ new Map();
	underlying;
	constructor(underlying) {
		this.underlying = underlying;
	}
	async embed(text) {
		const hash = this.hash(text);
		if (this.cache.has(hash)) return this.cache.get(hash);
		const embedding = await this.underlying.embed(text);
		this.cache.set(hash, embedding);
		return embedding;
	}
	async embedBatch(texts) {
		const results = [];
		const toEmbed = [];
		const toEmbedIndices = [];
		for (let i = 0; i < texts.length; i++) {
			const hash = this.hash(texts[i]);
			if (this.cache.has(hash)) results[i] = this.cache.get(hash);
			else {
				toEmbed.push(texts[i]);
				toEmbedIndices.push(i);
			}
		}
		if (toEmbed.length > 0) {
			const embeddings = await this.underlying.embedBatch(toEmbed);
			for (let i = 0; i < toEmbed.length; i++) {
				const hash = this.hash(toEmbed[i]);
				this.cache.set(hash, embeddings[i]);
				results[toEmbedIndices[i]] = embeddings[i];
			}
		}
		return results;
	}
	hash(text) {
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			const char = text.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return hash.toString(36);
	}
	getCacheSize() {
		return this.cache.size;
	}
	clearCache() {
		this.cache.clear();
	}
};
//#endregion
//#region lib/types/searcher.js
var SemanticSearcher = class {
	embedding;
	store;
	chunker;
	constructor(embedding, store, chunker) {
		this.embedding = embedding;
		this.store = store;
		this.chunker = chunker;
	}
	async indexChunks(chunks) {
		if (!chunks.length) return;
		const vectors = await this.embedding.embedBatch(chunks.map((chunk) => [chunk.metadata.comments, chunk.content].filter(Boolean).join("\n\n")));
		if (vectors.length !== chunks.length) throw new Error("Embedding result count did not match input");
		await this.store.add(chunks, vectors);
	}
	chunkFile(file, text, language) {
		return this.chunker.chunk(file, text, language);
	}
	async search(query, topK = 10, filters) {
		const vector = await this.embedding.embed(query);
		return (await this.store.search(query, vector, topK * 3)).filter(({ chunk }) => (!filters?.language || chunk.language === filters.language) && (!filters?.type || chunk.type === filters.type) && (!filters?.file || chunk.file.includes(filters.file))).sort((a, b) => b.score - a.score).slice(0, topK);
	}
	async getStats() {
		return {
			totalChunks: await this.store.count?.() ?? 0,
			cacheSize: this.embedding.getCacheSize?.() ?? 0
		};
	}
};
//#endregion
//#region lib/types/tool-gate.js
/** Keeps optional tools and prompt guidance in sync with the active provider's credential. */
function createSemanticToolGate(options) {
	let mountedProvider = null;
	let disposers = [];
	let generation = 0;
	let disposed = false;
	const unmount = () => {
		const wasMounted = mountedProvider !== null || disposers.length > 0;
		for (const dispose of disposers.splice(0).reverse()) dispose();
		mountedProvider = null;
		if (wasMounted) options.onReset?.();
	};
	return {
		async synchronize() {
			const request = ++generation;
			const provider = options.getProvider();
			const configured = await options.hasCredential(provider);
			if (disposed || request !== generation) return;
			if (mountedProvider === provider && configured) return;
			unmount();
			if (!configured) return;
			disposers = options.mount(provider);
			mountedProvider = provider;
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			generation += 1;
			unmount();
		}
	};
}
//#endregion
//#region lib/types/vector-store.js
var InMemoryVectorStore = class {
	chunks = [];
	embeddings = [];
	async init() {}
	async add(chunks, embeddings) {
		this.chunks.push(...chunks);
		this.embeddings.push(...embeddings);
	}
	async search(_query, queryEmbedding, topK) {
		return this.embeddings.map((embedding) => this.cosineSimilarity(queryEmbedding, embedding)).map((score, index) => ({
			score,
			index
		})).sort((a, b) => b.score - a.score).slice(0, topK).map(({ score, index }) => ({
			chunk: this.chunks[index],
			score
		}));
	}
	async clear() {
		this.chunks = [];
		this.embeddings = [];
	}
	async count() {
		return this.chunks.length;
	}
	cosineSimilarity(a, b) {
		let dotProduct = 0;
		let normA = 0;
		let normB = 0;
		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}
		return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
	}
};
//#endregion
//#region lib/types/index.js
const name = "tool-fs-semantic-search";
const inject = [
	"tools",
	"fs",
	"systemPrompt"
];
const Config = z.object({
	embeddingProvider: z.union(["jina", "openai"]).default("jina"),
	maxFiles: z.number().default(500),
	maxFileBytes: z.number().default(262144),
	maxTotalBytes: z.number().default(8388608)
});
const SETTINGS_NAMESPACE = settingsNamespace(name);
const CREDENTIAL_REFS = {
	jina: credentialRef("JINA_API_KEY"),
	openai: credentialRef("OPENAI_API_KEY")
};
const indexes = /* @__PURE__ */ new Map();
const skipDirs = /* @__PURE__ */ new Set([
	".git",
	".hg",
	".svn",
	"node_modules",
	"vendor",
	"dist",
	"build",
	"coverage",
	".next",
	".turbo",
	"__pycache__",
	".venv",
	"runtime-packages"
]);
const languageByExt = {
	ts: "typescript",
	tsx: "typescript",
	js: "javascript",
	jsx: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	py: "python"
};
function selectedProvider(config) {
	return config.embeddingProvider === "openai" ? "openai" : "jina";
}
async function hasCredential(ctx, provider) {
	const ref = CREDENTIAL_REFS[provider];
	const credentials = ctx.get("credentials");
	if (credentials) return (await credentials.describe(ref)).configured;
	const ambient = launchEnvironmentOf(ctx).get(ref);
	return Boolean(ambient?.value.trim());
}
async function embeddingFor(ctx, provider) {
	const ref = CREDENTIAL_REFS[provider];
	const credentials = ctx.get("credentials");
	const key = (credentials ? await credentials.resolve(ref) : void 0)?.value ?? launchEnvironmentOf(ctx).get(ref)?.value;
	if (!key?.trim()) throw new Error(`请先在设置中配置 ${provider === "jina" ? "Jina" : "OpenAI"} Embedding API 密钥`);
	return new CachedEmbeddingService(provider === "jina" ? new JinaEmbeddingService(key) : new OpenAIEmbeddingService(key));
}
async function resolveRoot(ctx, path, exec) {
	const root = await ctx.fs.resolve(path, sessionResolveOptions(exec, path));
	if ((await ctx.fs.stat(root, exec.signal))?.type !== "directory") throw new Error(`Workspace is not a directory: ${root.displayPath}`);
	return root;
}
function indexKey(root) {
	return createHash("sha256").update(String(root.targetKey)).digest("hex").slice(0, 24);
}
async function readCode(ctx, root, config, signal) {
	const files = [];
	const visit = async (dir) => {
		for (const entry of await ctx.fs.listDir(dir, signal)) {
			if (files.length >= config.maxFiles) return;
			if (!ctx.fs.contains(root, entry.target)) continue;
			if (entry.type === "directory") {
				if (!entry.name.startsWith(".") && !skipDirs.has(entry.name)) await visit(entry.target);
			} else if (entry.type === "file") {
				const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
				if (languageByExt[ext]) files.push({
					target: entry.target,
					language: languageByExt[ext]
				});
			}
		}
	};
	await visit(root);
	const chunks = [];
	const chunker = new CodeChunker();
	let totalBytes = 0;
	for (const file of files) {
		const info = await ctx.fs.stat(file.target, signal);
		if (!info || info.type !== "file" || (info.size ?? 0) > config.maxFileBytes) continue;
		if (totalBytes + (info.size ?? 0) > config.maxTotalBytes) break;
		const content = await ctx.fs.readText(file.target, signal);
		const size = new TextEncoder().encode(content).byteLength;
		if (size > config.maxFileBytes || totalBytes + size > config.maxTotalBytes) continue;
		totalBytes += size;
		chunks.push(...await chunker.chunk(file.target.displayPath, content, file.language));
	}
	return chunks;
}
async function getIndex(ctx, root, provider) {
	const key = indexKey(root);
	let pending = indexes.get(key);
	if (!pending) {
		pending = embeddingFor(ctx, provider).then((embedding) => ({
			root,
			searcher: new SemanticSearcher(embedding, new InMemoryVectorStore(), new CodeChunker())
		}));
		indexes.set(key, pending);
	}
	try {
		return await pending;
	} catch (error) {
		if (indexes.get(key) === pending) indexes.delete(key);
		throw error;
	}
}
function createTools(ctx, getConfig) {
	return [
		defineTool({
			name: "index_project_for_semantic_search",
			description: "Create an in-memory semantic index for code in the current session workspace.",
			parameters: { workspace: {
				type: "string",
				description: "Optional workspace directory; defaults to the session cwd."
			} },
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						files: {
							type: "integer",
							required: true
						},
						chunks: {
							type: "integer",
							required: true
						},
						workspace: {
							type: "string",
							required: true
						}
					}
				},
				render: (_a, v) => [{
					type: "text",
					text: `Indexed ${v.files} files (${v.chunks} chunks) in ${v.workspace}.`
				}]
			},
			async execute(args, exec) {
				const config = getConfig();
				const provider = selectedProvider(config);
				const root = await resolveRoot(ctx, args.workspace ?? exec.agent?.session.header.cwd ?? ".", exec);
				const chunks = await readCode(ctx, root, config, exec.signal);
				await (await getIndex(ctx, root, provider)).searcher.indexChunks(chunks);
				return {
					files: new Set(chunks.map((c) => c.file)).size,
					chunks: chunks.length,
					workspace: root.displayPath
				};
			}
		}),
		defineTool({
			name: "semantic_search_code",
			description: "Search indexed code with a natural-language description.",
			parameters: {
				query: {
					type: "string",
					required: true,
					description: "Describe what the code does."
				},
				top_k: {
					type: "integer",
					description: "Maximum result count (default 10, max 30)."
				},
				language: {
					type: "string",
					description: "Optional language filter."
				},
				type: {
					type: "string",
					description: "Optional code element type filter."
				},
				file: {
					type: "string",
					description: "Optional file path substring."
				},
				workspace: {
					type: "string",
					description: "Optional workspace directory."
				}
			},
			output: {
				schema: { type: "string" },
				render: (_a, v) => [{
					type: "text",
					text: v
				}]
			},
			async execute(args, exec) {
				const root = await resolveRoot(ctx, args.workspace ?? exec.agent?.session.header.cwd ?? ".", exec);
				const pending = indexes.get(indexKey(root));
				if (!pending) throw new Error("Workspace is not indexed; call index_project_for_semantic_search first");
				const results = await (await pending).searcher.search(args.query, Math.max(1, Math.min(30, args.top_k ?? 10)), {
					...args.language ? { language: args.language } : {},
					...args.type ? { type: args.type } : {},
					...args.file ? { file: args.file } : {}
				});
				return JSON.stringify(results, null, 2);
			}
		}),
		defineTool({
			name: "semantic_search_stats",
			description: "Show the indexed chunk count for the current workspace.",
			parameters: { workspace: {
				type: "string",
				description: "Optional workspace directory."
			} },
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						indexed: {
							type: "boolean",
							required: true
						},
						chunks: {
							type: "integer",
							required: true
						},
						workspace: {
							type: "string",
							required: true
						}
					}
				},
				render: (_a, v) => [{
					type: "text",
					text: v.indexed ? `${v.chunks} chunks indexed in ${v.workspace}.` : `No index for ${v.workspace}.`
				}]
			},
			async execute(args, exec) {
				const root = await resolveRoot(ctx, args.workspace ?? exec.agent?.session.header.cwd ?? ".", exec);
				const pending = indexes.get(indexKey(root));
				const index = pending ? await pending : void 0;
				const stats = index ? await index.searcher.getStats() : {
					totalChunks: 0,
					cacheSize: 0
				};
				return {
					indexed: Boolean(index),
					chunks: stats.totalChunks,
					workspace: root.displayPath
				};
			}
		})
	];
}
async function apply(ctx, config) {
	const cfg = config;
	for (const [key, value] of Object.entries({
		maxFiles: cfg.maxFiles,
		maxFileBytes: cfg.maxFileBytes,
		maxTotalBytes: cfg.maxTotalBytes
	})) if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${key} must be a positive integer`);
	let current = () => config;
	const gate = createSemanticToolGate({
		getProvider: () => selectedProvider(current()),
		hasCredential: (provider) => hasCredential(ctx, provider),
		mount: () => {
			const disposers = [];
			try {
				for (const tool of createTools(ctx, current)) disposers.push(ctx.tools.register(tool));
				disposers.push(ctx.systemPrompt.section({
					name: "tool:semantic_search_code",
					order: 104,
					text: "语义代码搜索已启用。它会将本地代码片段发送到设置中选择的向量服务，用于生成向量并查找相关代码。需要先建立工作区索引，再调用语义搜索。"
				}));
				return disposers;
			} catch (error) {
				for (const dispose of disposers.reverse()) dispose();
				throw error;
			}
		},
		onReset: () => indexes.clear()
	});
	const safeSynchronize = () => {
		gate.synchronize().catch((error) => {
			ctx.logger.warn("semantic search: failed to update tool availability", error);
		});
	};
	installSettingsSection(ctx, SETTINGS_NAMESPACE, Config, config, {
		setSource: (source) => {
			current = source;
		},
		onChange: safeSynchronize
	});
	ctx.on("credentials/reference-updated", (ref) => {
		if (ref !== CREDENTIAL_REFS[selectedProvider(current())]) return;
		indexes.clear();
		safeSynchronize();
	});
	ctx.effect(() => () => gate.dispose());
	await gate.synchronize();
}
//#endregion
export { Config, SETTINGS_NAMESPACE, apply, inject, name };
