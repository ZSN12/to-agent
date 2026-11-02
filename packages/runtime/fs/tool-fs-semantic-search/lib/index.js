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
		const imports = this.extractImports(content);
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
							imports: [...imports]
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
const MAX_EMBEDDING_CACHE_ENTRIES = 1024;
function getCachedEmbedding(cache, key) {
	const embedding = cache.get(key);
	if (!embedding) return void 0;
	cache.delete(key);
	cache.set(key, embedding);
	return embedding;
}
function setCachedEmbedding(cache, key, embedding) {
	cache.delete(key);
	if (cache.size >= MAX_EMBEDDING_CACHE_ENTRIES) {
		const oldestKey = cache.keys().next().value;
		if (oldestKey !== void 0) cache.delete(oldestKey);
	}
	cache.set(key, embedding);
}
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
		const cached = getCachedEmbedding(this.cache, hash);
		if (cached) return cached;
		const embedding = await this.underlying.embed(text);
		setCachedEmbedding(this.cache, hash, embedding);
		return embedding;
	}
	async embedBatch(texts) {
		const results = [];
		const toEmbed = [];
		const toEmbedIndices = [];
		for (let i = 0; i < texts.length; i++) {
			const hash = this.hash(texts[i]);
			const cached = getCachedEmbedding(this.cache, hash);
			if (cached) results[i] = cached;
			else {
				toEmbed.push(texts[i]);
				toEmbedIndices.push(i);
			}
		}
		if (toEmbed.length > 0) {
			const embeddings = await this.underlying.embedBatch(toEmbed);
			for (let i = 0; i < toEmbed.length; i++) {
				const hash = this.hash(toEmbed[i]);
				setCachedEmbedding(this.cache, hash, embeddings[i]);
				results[toEmbedIndices[i]] = embeddings[i];
			}
		}
		return results;
	}
	hash(text) {
		return createHash("sha256").update(text).digest("hex");
	}
	getCacheSize() {
		return this.cache.size;
	}
	clearCache() {
		this.cache.clear();
	}
};
const STOP_WORDS = /* @__PURE__ */ new Set([
	"a",
	"about",
	"above",
	"after",
	"again",
	"against",
	"all",
	"am",
	"an",
	"and",
	"any",
	"are",
	"as",
	"at",
	"be",
	"because",
	"been",
	"before",
	"being",
	"below",
	"between",
	"both",
	"but",
	"by",
	"can",
	"could",
	"did",
	"do",
	"does",
	"doing",
	"down",
	"during",
	"each",
	"few",
	"for",
	"from",
	"further",
	"had",
	"has",
	"have",
	"having",
	"he",
	"her",
	"here",
	"hers",
	"herself",
	"him",
	"himself",
	"his",
	"how",
	"if",
	"in",
	"into",
	"is",
	"it",
	"its",
	"itself",
	"just",
	"me",
	"more",
	"most",
	"my",
	"myself",
	"no",
	"nor",
	"not",
	"now",
	"of",
	"off",
	"on",
	"once",
	"only",
	"or",
	"other",
	"our",
	"ours",
	"ourselves",
	"out",
	"over",
	"own",
	"same",
	"she",
	"should",
	"so",
	"some",
	"such",
	"than",
	"that",
	"the",
	"their",
	"theirs",
	"them",
	"themselves",
	"then",
	"there",
	"these",
	"they",
	"this",
	"those",
	"through",
	"to",
	"too",
	"under",
	"until",
	"up",
	"very",
	"was",
	"we",
	"were",
	"what",
	"when",
	"where",
	"which",
	"while",
	"who",
	"whom",
	"why",
	"with",
	"would",
	"you",
	"your",
	"yours",
	"yourself",
	"yourselves",
	"const",
	"let",
	"var",
	"function",
	"return",
	"import",
	"export",
	"from",
	"class",
	"interface",
	"type",
	"async",
	"await",
	"true",
	"false",
	"null",
	"undefined",
	"void",
	"this",
	"self"
]);
/**
* 内置本地代码向量化服务（参考 Claude Code 开箱即用架构）
* 零外部 API 依赖，基于代码符号大纲、语法结构与特征哈希生成稠密向量，
* 毫秒级响应，与内存向量存储及余弦相似度无缝兼容。
*/
var BuiltinLocalEmbeddingService = class {
	dimension = 384;
	cache = /* @__PURE__ */ new Map();
	async embed(text) {
		const key = this.hashKey(text);
		const cached = getCachedEmbedding(this.cache, key);
		if (cached) return cached;
		const vector = this.computeEmbedding(text);
		setCachedEmbedding(this.cache, key, vector);
		return vector;
	}
	async embedBatch(texts) {
		return Promise.all(texts.map((text) => this.embed(text)));
	}
	getCacheSize() {
		return this.cache.size;
	}
	clearCache() {
		this.cache.clear();
	}
	hashKey(text) {
		return createHash("sha256").update(text).digest("hex");
	}
	computeEmbedding(text) {
		const vector = new Float64Array(this.dimension);
		const tokens = this.extractTokens(text);
		if (tokens.length === 0) return Array.from(vector);
		const tfMap = /* @__PURE__ */ new Map();
		for (const { token, weight } of tokens) tfMap.set(token, (tfMap.get(token) ?? 0) + weight);
		for (const [token, weightedTf] of tfMap) {
			const slot = this.tokenHash(token) % this.dimension;
			const sign = (this.tokenHash(token + "_sign") & 1) === 0 ? 1 : -1;
			vector[slot] += sign * Math.log1p(weightedTf);
		}
		let norm = 0;
		for (let i = 0; i < this.dimension; i++) norm += vector[i] * vector[i];
		norm = Math.sqrt(norm);
		if (norm > 0) for (let i = 0; i < this.dimension; i++) vector[i] /= norm;
		return Array.from(vector);
	}
	extractTokens(text) {
		const lines = text.split("\n");
		const result = [];
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			let lineWeight = 1;
			if (trimmed.startsWith("Symbol:")) lineWeight = 3.5;
			else if (trimmed.startsWith("Comments:") || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("#")) lineWeight = 2;
			else if (trimmed.startsWith("export ") || trimmed.startsWith("export default ")) lineWeight = 2.2;
			else if (trimmed.startsWith("import ")) lineWeight = 1.2;
			const matches = trimmed.match(/[a-zA-Z_0-9$]+|[\u4e00-\u9fa5]{1,2}/g) || [];
			for (const tokenStr of matches) {
				if (/^[\u4e00-\u9fa5]+$/.test(tokenStr)) {
					result.push({
						token: tokenStr,
						weight: lineWeight * 1.5
					});
					continue;
				}
				const lower = tokenStr.toLowerCase();
				if (STOP_WORDS.has(lower)) {
					result.push({
						token: lower,
						weight: lineWeight * .2
					});
					continue;
				}
				result.push({
					token: lower,
					weight: lineWeight
				});
				const subWords = tokenStr.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_\-$]/g, " ").split(/\s+/);
				if (subWords.length > 1) for (const sub of subWords) {
					const subLower = sub.toLowerCase();
					if (subLower.length > 1 && !STOP_WORDS.has(subLower)) result.push({
						token: subLower,
						weight: lineWeight * 1.3
					});
				}
			}
		}
		return result;
	}
	tokenHash(str) {
		let hash = 2166136261;
		for (let i = 0; i < str.length; i++) {
			hash ^= str.charCodeAt(i);
			hash = Math.imul(hash, 16777619);
		}
		return Math.abs(hash);
	}
};
//#endregion
//#region lib/types/performance-utils.js
/**
* 性能优化工具 - 用于语义搜索加速
*/
/**
* MinHeap - 用于高效 Top-K 选择
* 时间复杂度: O(n log k) vs O(n log n) 全排序
*/
var MinHeap = class {
	k;
	compareFn;
	items = [];
	constructor(k, compareFn) {
		this.k = k;
		this.compareFn = compareFn;
	}
	push(item) {
		if (this.items.length < this.k) {
			this.items.push(item);
			this.bubbleUp(this.items.length - 1);
		} else if (this.compareFn(item, this.items[0]) > 0) {
			this.items[0] = item;
			this.bubbleDown(0);
		}
	}
	toSortedArray() {
		return [...this.items].sort((a, b) => -this.compareFn(a, b));
	}
	size() {
		return this.items.length;
	}
	bubbleUp(index) {
		const item = this.items[index];
		while (index > 0) {
			const parentIndex = Math.floor((index - 1) / 2);
			const parent = this.items[parentIndex];
			if (this.compareFn(item, parent) >= 0) break;
			this.items[index] = parent;
			index = parentIndex;
		}
		this.items[index] = item;
	}
	bubbleDown(index) {
		const length = this.items.length;
		const item = this.items[index];
		while (true) {
			const leftIndex = 2 * index + 1;
			const rightIndex = 2 * index + 2;
			if (leftIndex >= length) break;
			let smallestIndex = leftIndex;
			if (rightIndex < length && this.compareFn(this.items[rightIndex], this.items[smallestIndex]) < 0) smallestIndex = rightIndex;
			if (this.compareFn(this.items[smallestIndex], item) >= 0) break;
			this.items[index] = this.items[smallestIndex];
			index = smallestIndex;
		}
		this.items[index] = item;
	}
};
/**
* BM25 排序算法 - 关键词精确匹配
* 用于补充向量语义搜索，提升精确关键词的召回
*/
var BM25Scorer = class {
	k1 = 1.5;
	b = .75;
	maxCachedDocuments = 512;
	docCount = 0;
	avgDocLength = 0;
	idfCache = /* @__PURE__ */ new Map();
	documentStats = /* @__PURE__ */ new Map();
	seenDocuments = /* @__PURE__ */ new Map();
	/**
	* 计算文档集合的 IDF（逆文档频率）
	* @param documents 所有文档内容
	*/
	buildIndex(documents) {
		this.idfCache.clear();
		this.documentStats.clear();
		this.seenDocuments.clear();
		this.avgDocLength = 0;
		this.docCount = documents.length;
		if (this.docCount === 0) return;
		let totalLength = 0;
		const termDocCount = /* @__PURE__ */ new Map();
		for (const doc of documents) {
			const tokens = this.tokenize(doc);
			totalLength += tokens.length;
			const uniqueTokens = new Set(tokens);
			for (const token of uniqueTokens) termDocCount.set(token, (termDocCount.get(token) || 0) + 1);
		}
		this.avgDocLength = totalLength / this.docCount;
		for (const [term, df] of termDocCount) this.idfCache.set(term, Math.log((this.docCount - df + .5) / (df + .5) + 1));
	}
	/**
	* 计算查询与文档的 BM25 分数
	*/
	score(query, document) {
		return this.scoreMany(query, [document])[0] ?? 0;
	}
	/**
	* Score multiple candidate documents while tokenizing the query only once.
	* Candidate token frequencies use a bounded second-hit cache: one-off search
	* results are scored without retaining their token maps, while repeated
	* candidates are promoted into the LRU cache.
	*/
	scoreMany(query, documents) {
		return this.scoreManyTokens(this.tokenizeQuery(query), documents);
	}
	tokenizeQuery(query) {
		return this.tokenize(query);
	}
	scoreManyTokens(queryTokens, documents) {
		return this.scoreManyCandidates(queryTokens, documents.map((document) => ({
			key: document,
			document
		})));
	}
	scoreManyCandidates(queryTokens, candidates) {
		if (this.avgDocLength === 0) return candidates.map(() => 0);
		const queryTermSet = new Set(queryTokens);
		return candidates.map(({ key, document }) => {
			const cached = this.documentStats.get(key);
			if (cached) {
				this.documentStats.delete(key);
				this.documentStats.set(key, cached);
				return this.scoreTokens(queryTokens, cached);
			}
			const shouldCache = this.maxCachedDocuments > 0 && this.seenDocuments.has(key);
			const stats = this.buildDocumentStats(document, shouldCache ? void 0 : queryTermSet);
			if (shouldCache) {
				this.seenDocuments.delete(key);
				if (this.documentStats.size >= this.maxCachedDocuments) {
					const oldestDocument = this.documentStats.keys().next().value;
					if (oldestDocument !== void 0) this.documentStats.delete(oldestDocument);
				}
				this.documentStats.set(key, stats);
			} else if (this.maxCachedDocuments > 0) this.rememberSeenDocument(key);
			return this.scoreTokens(queryTokens, stats);
		});
	}
	rememberSeenDocument(key) {
		if (this.seenDocuments.size >= this.maxCachedDocuments) {
			const oldestDocument = this.seenDocuments.keys().next().value;
			if (oldestDocument !== void 0) this.seenDocuments.delete(oldestDocument);
		}
		this.seenDocuments.set(key, true);
	}
	scoreTokens(queryTokens, document) {
		let score = 0;
		for (const queryToken of queryTokens) {
			const tf = document.termFrequency.get(queryToken) || 0;
			const idf = this.idfCache.get(queryToken) || 0;
			const numerator = tf * (this.k1 + 1);
			const denominator = tf + this.k1 * (1 - this.b + this.b * (document.length / this.avgDocLength));
			score += idf * (numerator / denominator);
		}
		return score;
	}
	buildDocumentStats(document, relevantTerms) {
		const tokens = this.tokenize(document);
		const termFrequency = /* @__PURE__ */ new Map();
		for (const token of tokens) {
			if (relevantTerms && !relevantTerms.has(token)) continue;
			termFrequency.set(token, (termFrequency.get(token) || 0) + 1);
		}
		return {
			length: tokens.length,
			termFrequency
		};
	}
	/**
	* 分词 - 提取有意义的 token
	*/
	tokenize(text) {
		return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_\-$/.]/g, " ").toLowerCase().split(/\s+/).filter((token) => token.length > 1 && /[a-z0-9\u4e00-\u9fff]/.test(token));
	}
};
//#endregion
//#region lib/types/searcher.js
var SemanticSearcher = class {
	embedding;
	store;
	bm25 = new BM25Scorer();
	allDocuments = [];
	documentByChunkId = /* @__PURE__ */ new Map();
	indexing = Promise.resolve();
	constructor(embedding, store) {
		this.embedding = embedding;
		this.store = store;
	}
	indexChunks(chunks) {
		const pending = this.indexing.then(() => this.replaceChunks(chunks));
		this.indexing = pending.catch(() => {});
		return pending;
	}
	async replaceChunks(chunks) {
		const documents = chunks.map((chunk) => [
			chunk.name ? `Symbol: ${chunk.name} (${chunk.type})` : "",
			chunk.metadata.comments ? `Comments: ${chunk.metadata.comments}` : "",
			chunk.content
		].filter(Boolean).join("\n\n"));
		const vectors = chunks.length ? await this.embedding.embedBatch(documents) : [];
		if (vectors.length !== chunks.length) throw new Error("Embedding result count did not match input");
		await this.store.clear();
		if (chunks.length) await this.store.add(chunks, vectors);
		this.allDocuments = documents;
		this.documentByChunkId = new Map(chunks.map((chunk, index) => [chunk.id, documents[index]]));
		this.bm25.buildIndex(this.allDocuments);
	}
	async search(query, topK = 10, filters) {
		if (!Number.isFinite(topK) || topK <= 0) return [];
		const resultLimit = Math.max(1, Math.floor(topK));
		await this.indexing;
		const queryTokens = this.bm25.tokenizeQuery(query);
		if (queryTokens.length === 0) return [];
		const vector = await this.embedding.embed(query);
		const filteredResults = (await this.store.search(query, vector, Math.min(Number.MAX_SAFE_INTEGER, resultLimit * 3), filters)).filter(({ score }) => Number.isFinite(score)).filter(({ chunk }) => (!filters?.language || chunk.language === filters.language) && (!filters?.type || chunk.type === filters.type) && (!filters?.file || chunk.file.includes(filters.file)));
		const bm25Scores = this.allDocuments.length > 0 ? this.bm25.scoreManyCandidates(queryTokens, filteredResults.map(({ chunk }) => ({
			key: chunk.id,
			document: this.documentByChunkId.get(chunk.id) ?? this.formatDocument(chunk)
		}))) : [];
		const maxBm25Score = bm25Scores.reduce((maximum, score) => Number.isFinite(score) ? Math.max(maximum, score) : maximum, 0);
		return filteredResults.map(({ chunk, score }, index) => {
			let enhancedScore = Number.isFinite(score) ? score : 0;
			const lowerName = (chunk.name || "").toLowerCase();
			const lowerFile = (chunk.file || "").toLowerCase();
			const lowerComments = (chunk.metadata.comments || "").toLowerCase();
			let keywordBoost = 0;
			for (const token of queryTokens) {
				if (lowerName === token) keywordBoost += .35;
				else if (lowerName.includes(token)) keywordBoost += .15;
				if (lowerFile.includes(token)) keywordBoost += .1;
				if (lowerComments.includes(token)) keywordBoost += .08;
			}
			enhancedScore += queryTokens.length > 0 ? keywordBoost / queryTokens.length : 0;
			if (this.allDocuments.length > 0) {
				const bm25Score = bm25Scores[index] ?? 0;
				const normalizedBm25Score = maxBm25Score > 0 && Number.isFinite(bm25Score) ? Math.max(0, Math.min(1, bm25Score / maxBm25Score)) : 0;
				enhancedScore = enhancedScore * .7 + normalizedBm25Score * .3;
			}
			return {
				chunk,
				score: enhancedScore
			};
		}).filter(({ score }) => Number.isFinite(score)).sort((a, b) => b.score - a.score).slice(0, resultLimit);
	}
	formatDocument(chunk) {
		return [
			chunk.name ? `Symbol: ${chunk.name} (${chunk.type})` : "",
			chunk.metadata.comments ? `Comments: ${chunk.metadata.comments}` : "",
			chunk.content
		].filter(Boolean).join("\n\n");
	}
	async getStats() {
		await this.indexing;
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
	norms = [];
	async init() {}
	async add(chunks, embeddings) {
		this.chunks.push(...chunks);
		this.embeddings.push(...embeddings);
		for (const emb of embeddings) this.norms.push(this.computeNorm(emb));
	}
	async search(_query, queryEmbedding, topK, filters) {
		if (!Number.isFinite(topK) || topK <= 0 || this.chunks.length === 0) return [];
		const heap = new MinHeap(Math.min(this.chunks.length, Math.max(1, Math.floor(topK))), (a, b) => a.score - b.score || b.index - a.index);
		const queryNorm = this.computeNorm(queryEmbedding);
		if (!Number.isFinite(queryNorm) || queryNorm <= 0) return [];
		for (let i = 0; i < this.embeddings.length; i++) {
			const chunk = this.chunks[i];
			if (filters?.language && chunk.language !== filters.language || filters?.type && chunk.type !== filters.type || filters?.file && !chunk.file.includes(filters.file)) continue;
			const score = this.cosineSimilarity(queryEmbedding, this.embeddings[i], queryNorm, this.norms[i]);
			if (Number.isFinite(score)) heap.push({
				score,
				index: i
			});
		}
		return heap.toSortedArray().map(({ score, index }) => ({
			chunk: this.chunks[index],
			score
		}));
	}
	async clear() {
		this.chunks = [];
		this.embeddings = [];
		this.norms = [];
	}
	async count() {
		return this.chunks.length;
	}
	/**
	* 计算向量范数
	*/
	computeNorm(vec) {
		let sum = 0;
		for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
		return Math.sqrt(sum);
	}
	/**
	* 优化的余弦相似度计算 - 使用预计算的范数
	* 对于归一化向量（norm = 1），直接返回点积
	*/
	cosineSimilarity(a, b, normA, normB) {
		if (!Number.isFinite(normA) || !Number.isFinite(normB) || normA <= 0 || normB <= 0) return 0;
		let dotProduct = 0;
		for (let i = 0; i < a.length; i++) {
			if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return 0;
			dotProduct += a[i] * b[i];
		}
		if (!Number.isFinite(dotProduct)) return 0;
		if (Math.abs(normA - 1) < .001 && Math.abs(normB - 1) < .001) return Math.max(-1, Math.min(1, dotProduct));
		const similarity = dotProduct / (normA * normB);
		return Number.isFinite(similarity) ? Math.max(-1, Math.min(1, similarity)) : 0;
	}
};
function validateIndexCapacity(capacity) {
	if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error("maxIndexedWorkspaces must be a positive integer");
}
/** Owns completed and in-flight indexes; entries never re-register after completion. */
var WorkspaceIndexCache = class {
	capacity;
	entries = /* @__PURE__ */ new Map();
	disposed = false;
	constructor(capacity = 2) {
		this.capacity = capacity;
		this.setCapacity(capacity);
	}
	setCapacity(capacity) {
		validateIndexCapacity(capacity);
		this.capacity = capacity;
		while (this.entries.size > capacity) this.evictOldest();
	}
	get(key) {
		const entry = this.entries.get(key);
		if (!entry) return void 0;
		this.entries.delete(key);
		this.entries.set(key, entry);
		return entry.pending;
	}
	replace(key, build, signal) {
		if (this.disposed) return Promise.reject(/* @__PURE__ */ new Error("Semantic index cache is disposed"));
		if (signal?.aborted) return Promise.reject(signal.reason);
		this.remove(key, /* @__PURE__ */ new Error("Semantic index build was replaced"));
		while (this.entries.size >= this.capacity) this.evictOldest();
		const controller = new AbortController();
		const buildSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
		const entry = { controller };
		entry.pending = new Promise((resolve, reject) => {
			const forget = () => {
				if (this.entries.get(key) === entry) this.entries.delete(key);
			};
			const onAbort = () => {
				forget();
				reject(buildSignal.reason);
			};
			buildSignal.addEventListener("abort", onAbort, { once: true });
			Promise.resolve().then(() => {
				buildSignal.throwIfAborted();
				return build(buildSignal);
			}).then((value) => {
				if (buildSignal.aborted) reject(buildSignal.reason);
				else resolve(value);
			}, (error) => {
				forget();
				reject(error);
			}).finally(() => buildSignal.removeEventListener("abort", onAbort));
		});
		entry.pending.catch(() => {});
		this.entries.set(key, entry);
		return entry.pending;
	}
	clear() {
		for (const key of this.entries.keys()) this.remove(key, /* @__PURE__ */ new Error("Semantic index was reset"));
	}
	dispose() {
		this.disposed = true;
		this.clear();
	}
	evictOldest() {
		const key = this.entries.keys().next().value;
		if (key !== void 0) this.remove(key, /* @__PURE__ */ new Error("Semantic index was evicted; call index_project_for_semantic_search again"));
	}
	remove(key, reason) {
		const entry = this.entries.get(key);
		if (!entry) return;
		this.entries.delete(key);
		entry.controller.abort(reason);
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
	embeddingProvider: z.union([
		"builtin-local",
		"jina",
		"openai"
	]).default("builtin-local"),
	maxFiles: z.number().default(500),
	maxFileBytes: z.number().default(262144),
	maxTotalBytes: z.number().default(8388608),
	maxIndexedWorkspaces: z.number().min(1).step(1).default(2)
});
const SETTINGS_NAMESPACE = settingsNamespace(name);
const CREDENTIAL_REFS = {
	jina: credentialRef("JINA_API_KEY"),
	openai: credentialRef("OPENAI_API_KEY")
};
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
	if (config.embeddingProvider === "openai") return "openai";
	if (config.embeddingProvider === "jina") return "jina";
	return "builtin-local";
}
async function hasCredential(ctx, provider) {
	if (provider === "builtin-local") return true;
	const ref = CREDENTIAL_REFS[provider];
	if (!ref) return false;
	const credentials = ctx.get("credentials");
	if (credentials) return (await credentials.describe(ref)).configured;
	const ambient = launchEnvironmentOf(ctx).get(ref);
	return Boolean(ambient?.value?.trim());
}
async function embeddingFor(ctx, provider) {
	if (provider === "builtin-local") return new BuiltinLocalEmbeddingService();
	const ref = CREDENTIAL_REFS[provider];
	if (!ref) return new BuiltinLocalEmbeddingService();
	const credentials = ctx.get("credentials");
	const key = (credentials ? await credentials.resolve(ref) : void 0)?.value ?? launchEnvironmentOf(ctx).get(ref)?.value;
	if (!key?.trim()) return new BuiltinLocalEmbeddingService();
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
		signal?.throwIfAborted();
		for (const entry of await ctx.fs.listDir(dir, signal)) {
			signal?.throwIfAborted();
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
		signal?.throwIfAborted();
		const info = await ctx.fs.stat(file.target, signal);
		if (!info || info.type !== "file" || (info.size ?? 0) > config.maxFileBytes) continue;
		if (totalBytes + (info.size ?? 0) > config.maxTotalBytes) break;
		const content = await ctx.fs.readText(file.target, signal);
		signal?.throwIfAborted();
		const size = new TextEncoder().encode(content).byteLength;
		if (size > config.maxFileBytes || totalBytes + size > config.maxTotalBytes) continue;
		totalBytes += size;
		chunks.push(...await chunker.chunk(file.target.displayPath, content, file.language));
	}
	return chunks;
}
async function resolveEffectiveProvider(ctx, provider) {
	if (provider === "jina" || provider === "openai") {
		if (await hasCredential(ctx, provider)) return provider;
	}
	return "builtin-local";
}
function createTools(ctx, getConfig, indexes) {
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
				const effective = await resolveEffectiveProvider(ctx, provider);
				const key = `${indexKey(root)}:${effective}`;
				const index = await indexes.replace(key, async (signal) => {
					const chunks = await readCode(ctx, root, config, signal);
					signal.throwIfAborted();
					const embedding = await embeddingFor(ctx, effective);
					signal.throwIfAborted();
					const searcher = new SemanticSearcher(embedding, new InMemoryVectorStore());
					await searcher.indexChunks(chunks);
					signal.throwIfAborted();
					return {
						root,
						searcher,
						files: new Set(chunks.map((c) => c.file)).size,
						chunks: chunks.length
					};
				}, exec.signal);
				return {
					files: index.files,
					chunks: index.chunks,
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
				const effective = await resolveEffectiveProvider(ctx, selectedProvider(getConfig()));
				const key = `${indexKey(root)}:${effective}`;
				const pending = indexes.get(key);
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
				const effective = await resolveEffectiveProvider(ctx, selectedProvider(getConfig()));
				const key = `${indexKey(root)}:${effective}`;
				const pending = indexes.get(key);
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
	const indexes = new WorkspaceIndexCache(config.maxIndexedWorkspaces ?? 2);
	let current = () => config;
	let effectiveProvider = "builtin-local";
	const refreshEffectiveProvider = async () => {
		indexes.setCapacity(current().maxIndexedWorkspaces ?? 2);
		effectiveProvider = await resolveEffectiveProvider(ctx, selectedProvider(current()));
	};
	const gate = createSemanticToolGate({
		getProvider: () => effectiveProvider,
		hasCredential: (provider) => hasCredential(ctx, provider),
		mount: (provider) => {
			const disposers = [];
			try {
				for (const tool of createTools(ctx, current, indexes)) disposers.push(ctx.tools.register(tool));
				const isCloud = provider === "jina" || provider === "openai";
				disposers.push(ctx.systemPrompt.section({
					name: "tool:semantic_search_code",
					order: 104,
					text: isCloud ? `语义代码搜索已启用（云端向量增强模式：${provider === "jina" ? "Jina AI" : "OpenAI"}）。代码片段将用于生成向量并查找相关实现。需要先建立工作区索引，再调用语义搜索。` : "代码搜索已启用（内置本地检索模式，基于代码符号大纲与本地切片权重，无需外部网络与 API 密钥）。需要先建立工作区索引，再调用语义搜索。"
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
		(async () => {
			await refreshEffectiveProvider();
			await gate.synchronize();
		})().catch((error) => {
			ctx.logger.warn("semantic search: failed to update tool availability", error);
		});
	};
	installSettingsSection(ctx, SETTINGS_NAMESPACE, Config, config, {
		setSource: (source) => {
			current = source;
		},
		onChange: safeSynchronize,
		validate: (value) => validateIndexCapacity(value.maxIndexedWorkspaces ?? 2)
	});
	ctx.on("credentials/reference-updated", (ref) => {
		const active = selectedProvider(current());
		if (active === "builtin-local" || ref !== CREDENTIAL_REFS[active]) return;
		indexes.clear();
		safeSynchronize();
	});
	ctx.effect(() => () => {
		indexes.dispose();
		gate.dispose();
	});
	await refreshEffectiveProvider();
	await gate.synchronize();
}
//#endregion
export { Config, SETTINGS_NAMESPACE, apply, inject, name };
