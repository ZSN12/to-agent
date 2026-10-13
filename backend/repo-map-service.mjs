import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import { precomputeQueryTerms } from './text-relevance.mjs'
import { estimateTokens } from './token-estimate.mjs'

export { estimateTokens } from './token-estimate.mjs'

/**
 * 默认忽略的目录列表
 */
export const IGNORED_DIRS = new Set([
  '.git', '.svn', '.hg', 'node_modules', 'vendor', 'dist', 'build', 'release',
  '.next', '.nuxt', '.turbo', '.cache', 'coverage', 'target', 'out',
  '__pycache__', '.venv', 'venv', '.idea', '.vscode', '.gemini',
])

/**
 * 重点分析的源码文件扩展名
 */
export const CODE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.jsx',
  '.ts', '.mts', '.cts', '.tsx',
  '.vue', '.svelte',
  '.py', '.pyi',
  '.go',
  '.rs',
  '.java', '.kt', '.scala',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.lua',
  '.sh', '.bash', '.zsh',
  '.sql',
  '.graphql',
  '.proto',
])

/**
 * 额外支持的配置/文本扩展名
 */
export const TEXT_EXTENSIONS = new Set([
  '.json', '.yaml', '.yml', '.toml', '.md',
])

/**
 * 内存缓存：key 为绝对路径，value 只保留符号与引用索引，不保存源文件全文。
 * { mtimeMs, size, symbols, defs, refs }
 */
const fileOutlineCache = new Map()
const FILE_OUTLINE_CACHE_MAX = 4096
const REPO_MAP_OUTLINE_CACHE_SCHEMA = 1
const REPO_MAP_OUTLINE_CACHE_MAX_BYTES = 16 * 1024 * 1024
const persistentRepoMapCaches = new Map()

/** 同工作区快照 + 查询 + token 预算的 Repo Map 文本缓存。 */
const repoMapTextCache = new Map()
const REPO_MAP_TEXT_CACHE_TTL_MS = 120_000
const REPO_MAP_TEXT_CACHE_MAX = 48

/**
 * 允许外部注入或重置符号提取器
 */
let injectedSymbolExtractor = null
let injectedSymbolExtractorRevision = 0

export function setSymbolOutlineExtractor(extractor) {
  if (injectedSymbolExtractor !== extractor) {
    injectedSymbolExtractorRevision += 1
    fileOutlineCache.clear()
    repoMapTextCache.clear()
    persistentRepoMapCaches.clear()
  }
  injectedSymbolExtractor = extractor
}

export function clearRepoMapCache() {
  fileOutlineCache.clear()
  repoMapTextCache.clear()
  persistentRepoMapCaches.clear()
}

export function getRepoMapCacheSize() {
  return fileOutlineCache.size
}

function touchCacheEntry(cache, key, value) {
  cache.delete(key)
  cache.set(key, value)
}

function trimCache(cache, maxEntries) {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) break
    cache.delete(oldestKey)
  }
}

function workspaceOutlineCachePath(cacheDirectory, workspacePath, cacheVersion) {
  const workspaceKey = crypto.createHash('sha256').update(`${workspacePath}\0${cacheVersion}`).digest('hex')
  return path.join(cacheDirectory, `${workspaceKey}.json`)
}

function validRelativeCachePath(relativePath) {
  return typeof relativePath === 'string'
    && relativePath.length > 0
    && !path.isAbsolute(relativePath)
    && !relativePath.split(/[\\/]+/).includes('..')
}

async function loadPersistentOutlineCache(cacheDirectory, workspacePath, cacheVersion) {
  if (!cacheDirectory) return { entries: new Map(), cachePath: null, dirty: false }
  const cachePath = workspaceOutlineCachePath(path.resolve(cacheDirectory), workspacePath, cacheVersion)
  const loaded = persistentRepoMapCaches.get(cachePath)
  if (loaded) return loaded

  const result = { entries: new Map(), cachePath, dirty: false }
  try {
    const stat = await fs.stat(cachePath)
    if (stat.size <= REPO_MAP_OUTLINE_CACHE_MAX_BYTES) {
      const doc = JSON.parse(await fs.readFile(cachePath, 'utf8'))
      if (doc?.schema === REPO_MAP_OUTLINE_CACHE_SCHEMA
        && doc.workspacePath === workspacePath
        && doc.cacheVersion === cacheVersion
        && Array.isArray(doc.files)) {
        for (const item of doc.files.slice(0, FILE_OUTLINE_CACHE_MAX)) {
          if (!validRelativeCachePath(item?.relativePath)
            || !Number.isFinite(item.mtimeMs)
            || !Number.isFinite(item.size)
            || !Array.isArray(item.symbols)
            || !Array.isArray(item.defs)
            || !Array.isArray(item.refs)) continue
          result.entries.set(item.relativePath, {
            mtimeMs: item.mtimeMs,
            size: item.size,
            symbols: item.symbols,
            defs: new Set(item.defs.filter((value) => typeof value === 'string')),
            refs: new Set(item.refs.filter((value) => typeof value === 'string')),
          })
        }
      }
    }
  } catch {
    // A corrupt, missing, or inaccessible cache is a cold cache, never a chat error.
  }
  persistentRepoMapCaches.set(cachePath, result)
  return result
}

async function persistOutlineCache(cache) {
  if (!cache?.dirty || !cache.cachePath) return
  const doc = {
    schema: REPO_MAP_OUTLINE_CACHE_SCHEMA,
    workspacePath: cache.workspacePath,
    cacheVersion: cache.cacheVersion,
    files: [...cache.entries.entries()].slice(-FILE_OUTLINE_CACHE_MAX).map(([relativePath, entry]) => ({
      relativePath,
      mtimeMs: entry.mtimeMs,
      size: entry.size,
      symbols: entry.symbols,
      defs: [...entry.defs],
      refs: [...entry.refs],
    })),
  }
  let serialized
  try { serialized = JSON.stringify(doc) } catch { return }
  if (Buffer.byteLength(serialized, 'utf8') > REPO_MAP_OUTLINE_CACHE_MAX_BYTES) return

  let tempPath
  try {
    await fs.mkdir(path.dirname(cache.cachePath), { recursive: true, mode: 0o700 })
    tempPath = `${cache.cachePath}.${process.pid}.${crypto.randomUUID()}.tmp`
    await fs.writeFile(tempPath, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await fs.rename(tempPath, cache.cachePath)
    cache.dirty = false
  } catch {
    if (tempPath) await fs.rm(tempPath, { force: true }).catch(() => {})
    // The Repo Map is optional; cache I/O failures must not block the request.
  }
}

function sameFileMetadata(entry, file) {
  return Boolean(entry && entry.mtimeMs === file.mtimeMs && entry.size === file.size)
}

function tokenizeBm25(value) {
  const normalized = String(value ?? '').toLocaleLowerCase()
  const tokens = normalized.match(/[\p{L}\p{N}_]{2,}/gu) ?? []
  for (const [, sequence] of normalized.matchAll(/([\p{Script=Han}]+)/gu)) {
    if (sequence.length === 1) tokens.push(sequence)
    for (let index = 0; index < sequence.length - 1; index += 1) {
      tokens.push(sequence.slice(index, index + 2))
    }
  }
  return tokens
}

function scoreRepoMapBm25(queryTerms, fileNodes) {
  const scores = new Map(fileNodes.map((node) => [node.relativePath, 0]))
  if (!queryTerms.length || !fileNodes.length) return scores

  const documents = fileNodes.map((node) => {
    const text = `${node.relativePath} ${flattenSymbolOutline(node.symbols).join(' ')}`
    const tokens = tokenizeBm25(text)
    const termFrequencies = new Map()
    for (const token of tokens) termFrequencies.set(token, (termFrequencies.get(token) ?? 0) + 1)
    return { relativePath: node.relativePath, length: tokens.length, termFrequencies }
  })
  const documentFrequency = new Map()
  for (const term of queryTerms) {
    documentFrequency.set(term, documents.reduce((count, doc) => count + Number(doc.termFrequencies.has(term)), 0))
  }
  const averageLength = documents.reduce((total, doc) => total + doc.length, 0) / documents.length || 1
  const k1 = 1.2
  const b = 0.75
  for (const doc of documents) {
    let score = 0
    for (const term of queryTerms) {
      const frequency = doc.termFrequencies.get(term) ?? 0
      if (!frequency) continue
      const df = documentFrequency.get(term) ?? 0
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5))
      const lengthNorm = k1 * (1 - b + b * (doc.length / averageLength))
      score += idf * (frequency * (k1 + 1)) / (frequency + lengthNorm)
    }
    scores.set(doc.relativePath, score)
  }
  return scores
}

/**
 * 内置的轻量防御性符号大纲提取器（当 symbol-outline-extractor 模块不可用时作为 fallback）
 */
export function fallbackExtractSymbols(filePath, content) {
  if (!content || typeof content !== 'string') return []
  const ext = path.extname(filePath).toLowerCase()
  const symbols = []

  // 按行解析，提取常见语言的类、函数、接口等定义
  const lines = content.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('/*') || line.startsWith('*')) {
      continue
    }

    if (ext === '.py') {
      // Python: class Foo, def bar()
      const classMatch = line.match(/^class\s+([a-zA-Z0-9_]+)/)
      if (classMatch) {
        symbols.push({ name: classMatch[1], kind: 'class', line: i + 1 })
        continue
      }
      const defMatch = line.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\((.*?)\)/)
      if (defMatch) {
        const isMethod = lines[i].startsWith('    ') || lines[i].startsWith('\t')
        symbols.push({
          name: `${defMatch[1]}(${defMatch[2] ? '...' : ''})`,
          kind: isMethod ? 'method' : 'function',
          rawName: defMatch[1],
          line: i + 1,
        })
        continue
      }
    } else if (ext === '.go') {
      // Go: type Foo struct/interface, func Bar(), func (r Recv) Baz()
      const typeMatch = line.match(/^type\s+([a-zA-Z0-9_]+)\s+(?:struct|interface)/)
      if (typeMatch) {
        symbols.push({ name: typeMatch[1], kind: 'type', line: i + 1 })
        continue
      }
      const methodMatch = line.match(/^func\s+\([^)]+\)\s+([a-zA-Z0-9_]+)\s*\(/)
      if (methodMatch) {
        symbols.push({ name: `${methodMatch[1]}()`, kind: 'method', rawName: methodMatch[1], line: i + 1 })
        continue
      }
      const funcMatch = line.match(/^func\s+([a-zA-Z0-9_]+)\s*\(/)
      if (funcMatch) {
        symbols.push({ name: `${funcMatch[1]}()`, kind: 'function', rawName: funcMatch[1], line: i + 1 })
        continue
      }
    } else {
      // JS / TS / Java / C# / C++ 等常见语法
      // 类 / 接口
      const classMatch = line.match(/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_]+)/)
      if (classMatch) {
        symbols.push({ name: classMatch[1], kind: 'class', line: i + 1 })
        continue
      }
      const ifaceMatch = line.match(/^(?:export\s+)?interface\s+([a-zA-Z0-9_]+)/)
      if (ifaceMatch) {
        symbols.push({ name: ifaceMatch[1], kind: 'interface', line: i + 1 })
        continue
      }
      const typeMatch = line.match(/^(?:export\s+)?type\s+([a-zA-Z0-9_]+)\s*=/)
      if (typeMatch) {
        symbols.push({ name: typeMatch[1], kind: 'type', line: i + 1 })
        continue
      }

      // 普通函数 / 导出函数
      const fnMatch = line.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*([a-zA-Z0-9_]*)\s*\((.*?)\)/)
      if (fnMatch) {
        const fnName = fnMatch[1] || 'anonymous'
        symbols.push({
          name: `${fnName}()`,
          kind: 'function',
          rawName: fnName,
          line: i + 1,
        })
        continue
      }

      // const foo = (...) => ...
      const arrowMatch = line.match(/^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>/)
      if (arrowMatch) {
        symbols.push({
          name: `${arrowMatch[1]}()`,
          kind: 'function',
          rawName: arrowMatch[1],
          line: i + 1,
        })
        continue
      }

      // 类中的方法定义 (如 foo() {, async bar() {)
      const methodMatch = line.match(/^(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*([a-zA-Z0-9_]+)\s*\((.*?)\)\s*[{:]/)
      if (methodMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[1])) {
        symbols.push({
          name: `${methodMatch[1]}()`,
          kind: 'method',
          rawName: methodMatch[1],
          line: i + 1,
        })
        continue
      }
    }
  }

  return symbols
}

/**
 * 尝试动态获取符号提取器
 */
async function resolveSymbolExtractor() {
  if (injectedSymbolExtractor) return injectedSymbolExtractor
  try {
    const mod = await import('./symbol-outline-extractor.mjs')
    if (typeof mod.extractFileSymbols === 'function') {
      return mod.extractFileSymbols
    }
    if (typeof mod.default?.extractFileSymbols === 'function') {
      return mod.default.extractFileSymbols
    }
  } catch {
    // 忽略未找到模块的异常，退化为内置提取器
  }
  return fallbackExtractSymbols
}

/**
 * 规范化单个符号表示
 */
export function formatSymbolEntry(sym) {
  if (!sym) return ''
  if (typeof sym === 'string') return sym
  const kind = sym.kind ? `${sym.kind} ` : ''
  const name = sym.name || sym.rawName || 'anonymous'
  return `${kind}${name}`.trim()
}

/**
 * 从文本中提取词法标识符集合（用于构建定义与引用图）
 */
export function extractIdentifiers(content) {
  if (!content) return new Set()
  const matches = content.match(/[a-zA-Z_][a-zA-Z0-9_]*/g)
  return new Set(matches || [])
}

/**
 * 从文件符号大纲中提取纯符号名标识符
 */
export function extractDefinedNames(symbols) {
  const defs = new Set()
  if (!Array.isArray(symbols)) return defs

  for (const s of symbols) {
    if (!s) continue
    if (typeof s === 'string') {
      const match = s.match(/[a-zA-Z_][a-zA-Z0-9_]*/)
      if (match) defs.add(match[0])
    } else {
      const name = s.rawName || s.name
      if (name) {
        const match = String(name).match(/[a-zA-Z_][a-zA-Z0-9_]*/)
        if (match) defs.add(match[0])
      }
      if (Array.isArray(s.children)) {
        for (const childName of extractDefinedNames(s.children)) {
          defs.add(childName)
        }
      }
    }
  }
  return defs
}

/**
 * 递归收集工作区中的关键源码文件
 */
export async function scanWorkspaceFiles(workspacePath, { maxFiles = 1000 } = {}) {
  const root = await fs.realpath(workspacePath)
  const results = []
  const stack = [root]

  while (stack.length && results.length < maxFiles) {
    const currentDir = stack.pop()
    let entries
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true })
    } catch {
      continue
    }

    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      if (results.length >= maxFiles) break
      if (entry.name.startsWith('.') && entry.name !== '.env') {
        // 忽略绝大多数点开头的隐藏目录与文件
        continue
      }
      if (IGNORED_DIRS.has(entry.name)) {
        continue
      }

      const fullPath = path.join(currentDir, entry.name)
      let stat
      try {
        stat = await fs.lstat(fullPath)
      } catch {
        continue
      }

      if (stat.isSymbolicLink()) {
        continue
      }

      if (stat.isDirectory()) {
        stack.push(fullPath)
      } else if (stat.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (CODE_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(ext)) {
          // 限制单文件大小不超过 512KB，避免解析过大日志或打包产物
          if (stat.size <= 512 * 1024) {
            const relativePath = path.relative(root, fullPath).split(path.sep).join('/')
            results.push({
              absolutePath: fullPath,
              relativePath,
              mtimeMs: stat.mtimeMs,
              size: stat.size,
            })
          }
        }
      }
    }
  }

  return results
}

/**
 * 计算基于引用关系的 PageRank 权重
 * @param {Array<{ relativePath: string, defs: Set<string>, refs: Set<string> }>} fileNodes
 */
export function computePageRank(fileNodes, { damping = 0.85, iterations = 20 } = {}) {
  const n = fileNodes.length
  if (n === 0) return new Map()
  if (n === 1) return new Map([[fileNodes[0].relativePath, 1.0]])

  // 先建立“符号/模块名 -> 定义文件”反向索引。原实现对每个文件对
  // 扫描所有定义，最坏会做 O(文件数² × 每文件定义数) 次比较；反向索引
  // 后只遍历实际引用，复杂度接近 O(总定义数 + 总引用数 + 命中边数)。
  const outgoing = new Map()
  const incoming = new Map()
  const ownersByName = new Map()

  const addOwner = (name, nodeIndex) => {
    if (!name) return
    let owners = ownersByName.get(name)
    if (!owners) {
      owners = new Set()
      ownersByName.set(name, owners)
    }
    owners.add(nodeIndex)
  }

  for (let i = 0; i < n; i++) {
    const node = fileNodes[i]
    outgoing.set(node.relativePath, new Set())
    incoming.set(node.relativePath, new Set())
    for (const def of node.defs || []) addOwner(def, i)
    const baseName = path.basename(node.relativePath, path.extname(node.relativePath))
    addOwner(baseName, i)
  }

  for (let i = 0; i < n; i++) {
    const fileA = fileNodes[i]
    for (const ref of fileA.refs || []) {
      for (const ownerIndex of ownersByName.get(ref) || []) {
        if (ownerIndex === i) continue
        const fileB = fileNodes[ownerIndex]
        outgoing.get(fileA.relativePath).add(fileB.relativePath)
        incoming.get(fileB.relativePath).add(fileA.relativePath)
      }
    }
  }

  // 初始化 PageRank
  let ranks = new Map()
  const initialRank = 1.0 / n
  for (const node of fileNodes) {
    ranks.set(node.relativePath, initialRank)
  }

  for (let iter = 0; iter < iterations; iter++) {
    const nextRanks = new Map()
    let danglingSum = 0

    // 计算出度为 0 的悬挂节点贡献
    for (const node of fileNodes) {
      const outDeg = outgoing.get(node.relativePath).size
      if (outDeg === 0) {
        danglingSum += ranks.get(node.relativePath)
      }
    }

    const baseProb = (1.0 - damping) / n + (damping * danglingSum) / n

    for (const node of fileNodes) {
      let incomingShare = 0
      const inNodes = incoming.get(node.relativePath)
      for (const inNodePath of inNodes) {
        const outDeg = outgoing.get(inNodePath).size
        if (outDeg > 0) {
          incomingShare += ranks.get(inNodePath) / outDeg
        }
      }
      nextRanks.set(node.relativePath, baseProb + damping * incomingShare)
    }

    ranks = nextRanks
  }

  return ranks
}

/**
 * 展平并提取符号展示文本
 */
function flattenSymbolOutline(symbols) {
  if (!Array.isArray(symbols)) return []
  const items = []
  for (const sym of symbols) {
    if (!sym) continue
    if (typeof sym === 'string') {
      items.push(sym)
    } else {
      const formatted = formatSymbolEntry(sym)
      if (formatted) items.push(formatted)
      if (Array.isArray(sym.children) && sym.children.length > 0) {
        const childItems = flattenSymbolOutline(sym.children)
        for (const c of childItems) {
          items.push(`  ${c}`)
        }
      }
    }
  }
  return items
}

/**
 * 生成并剪裁 Repo Map
 *
 * @param {string} workspacePath 工作区路径
 * @param {object} options 配置选项
 * @param {string} [options.query=''] 检索意图/任务 Query
 * @param {number} [options.maxTokens=2000] 最大允许的 Token 预算
 * @param {object|null} [options.precomputedSymbols=null] 预计算的符号映射 { [relativePath]: symbols }
 * @returns {Promise<string>} 紧凑的 Repo Map 文本树
 */
export async function generateRepoMap(workspacePath, {
  query = '',
  maxTokens = 2000,
  precomputedSymbols = null,
  cacheDirectory = null,
} = {}) {
  if (!workspacePath) return ''
  const cacheVersion = injectedSymbolExtractor
    ? `injected-${injectedSymbolExtractorRevision}`
    : `builtin-${REPO_MAP_OUTLINE_CACHE_SCHEMA}`

  // Injected outlines are caller-owned input and are not represented in the
  // normal workspace/query cache key. Bypass the text cache so an earlier map
  // for the same query cannot hide a caller's precomputed symbol set.
  const cacheable = !precomputedSymbols || typeof precomputedSymbols !== 'object'
  const root = await fs.realpath(workspacePath)
  const extractor = await resolveSymbolExtractor()
  const files = await scanWorkspaceFiles(root)
  if (files.length === 0 && !precomputedSymbols) return ''

  // Include the filesystem inventory in the text-cache key. This still costs a
  // bounded directory walk, but avoids stale maps when a file is added,
  // removed, or changed during the short text-cache lifetime.
  const inventorySignature = crypto.createHash('sha256')
    .update(files.map((file) => `${file.relativePath}\0${file.mtimeMs}\0${file.size}`).join('\n'))
    .digest('hex')
  const cacheKey = `${root}\0${maxTokens}\0${String(query)}\0${inventorySignature}\0${cacheVersion}`
  const cachedMap = cacheable ? repoMapTextCache.get(cacheKey) : null
  if (cachedMap && Date.now() - cachedMap.at < REPO_MAP_TEXT_CACHE_TTL_MS) {
    touchCacheEntry(repoMapTextCache, cacheKey, cachedMap)
    return cachedMap.text
  }

  const precomputedTerms = query ? precomputeQueryTerms(query) : []
  const fileNodes = []
  const persistentCache = await loadPersistentOutlineCache(cacheDirectory, root, cacheVersion)
  persistentCache.workspacePath = root
  persistentCache.cacheVersion = cacheVersion

  // 1. 处理每个文件的符号与词法引用
  if (precomputedSymbols && typeof precomputedSymbols === 'object') {
    // 支持直接使用外部注入的符号
    for (const [relPath, symbols] of Object.entries(precomputedSymbols)) {
      const defs = extractDefinedNames(symbols)
      const refs = new Set()
      for (const d of defs) refs.add(d)
      fileNodes.push({
        relativePath: relPath.split(path.sep).join('/'),
        symbols: symbols || [],
        defs,
        refs,
      })
    }
  } else {
    const presentPaths = new Set(files.map((file) => file.relativePath))
    for (const file of files) {
      const cached = fileOutlineCache.get(file.absolutePath)
      let fileData = cached
      if (!sameFileMetadata(fileData, file)) {
        const persisted = persistentCache.entries.get(file.relativePath)
        fileData = sameFileMetadata(persisted, file) ? persisted : null
      }

      if (!fileData) {
        let content = ''
        try {
          content = await fs.readFile(file.absolutePath, 'utf8')
        } catch {
          if (persistentCache.entries.delete(file.relativePath)) persistentCache.dirty = true
          continue
        }

        let rawSymbols = []
        try {
          rawSymbols = await extractor(file.absolutePath, content)
        } catch {
          // 防御性 fallback
          rawSymbols = fallbackExtractSymbols(file.absolutePath, content)
        }

        const symbols = Array.isArray(rawSymbols) ? rawSymbols : []
        const defs = extractDefinedNames(symbols)
        const refs = extractIdentifiers(content)

        fileData = {
          mtimeMs: file.mtimeMs,
          size: file.size,
          symbols,
          defs,
          refs,
        }
      }

      const priorPersistent = persistentCache.entries.get(file.relativePath)
      if (!sameFileMetadata(priorPersistent, file)) {
        persistentCache.entries.set(file.relativePath, fileData)
        persistentCache.dirty = true
      }
      touchCacheEntry(fileOutlineCache, file.absolutePath, fileData)
      trimCache(fileOutlineCache, FILE_OUTLINE_CACHE_MAX)

      fileNodes.push({
        relativePath: file.relativePath,
        symbols: fileData.symbols,
        defs: fileData.defs,
        refs: fileData.refs,
      })
    }

    for (const relativePath of persistentCache.entries.keys()) {
      if (!presentPaths.has(relativePath)) {
        persistentCache.entries.delete(relativePath)
        persistentCache.dirty = true
      }
    }
    await persistOutlineCache(persistentCache)
  }

  if (fileNodes.length === 0) return ''

  // 2. 计算 PageRank 权重
  const pageRanks = computePageRank(fileNodes)

  // 3. 基于路径与符号大纲做 BM25 相关性排序，不保留或反复扫描文件全文。
  const relevanceScores = query ? scoreRepoMapBm25(precomputedTerms, fileNodes) : null

  // 4. 计算意图关联分与综合权重
  const scoredFiles = []
  for (const node of fileNodes) {
    const pr = pageRanks.get(node.relativePath) || 0
    const relevanceScore = relevanceScores?.get(node.relativePath) ?? 0

    // 权重融合公式：
    // 当存在 query 时，relevanceScore 起主导作用，PageRank 作为重要度辅助提权；
    // 当无 query 时，完全由 PageRank 决定。
    let finalScore = pr
    if (query) {
      finalScore = relevanceScore > 0
        ? (pr * 0.1) + (relevanceScore * 10)
        : (pr * 0.05)
    }

    scoredFiles.push({
      relativePath: node.relativePath,
      symbols: node.symbols,
      finalScore,
      relevanceScore,
      pr,
    })
  }

  // 5. 按综合权重降序排序
  scoredFiles.sort((a, b) => b.finalScore - a.finalScore)

  // 6. 贪心筛选与 Token 预算控制
  const selectedLines = []
  let accumulatedTokens = 0

  for (const file of scoredFiles) {
    const rawOutlines = flattenSymbolOutline(file.symbols)

    // 对单文件内部的符号，根据 query 关联度再次排序，把命中的符号置前
    if (query && rawOutlines.length > 1) {
      const lowerQuery = query.toLowerCase()
      rawOutlines.sort((s1, s2) => {
        const hit1 = lowerQuery.includes(s1.toLowerCase()) || s1.toLowerCase().includes(lowerQuery)
        const hit2 = lowerQuery.includes(s2.toLowerCase()) || s2.toLowerCase().includes(lowerQuery)
        if (hit1 && !hit2) return -1
        if (!hit1 && hit2) return 1
        return 0
      })
    }

    // 格式化为单行紧凑形式：path/to/file: sym1 | sym2
    let fileLine = ''
    if (rawOutlines.length === 0) {
      fileLine = `${file.relativePath}`
    } else {
      fileLine = `${file.relativePath}: ${rawOutlines.join(' | ')}`
    }

    let lineTokens = estimateTokens(fileLine + '\n')

    // 如果加入整行后超出最大预算
    if (accumulatedTokens + lineTokens > maxTokens) {
      // 尝试仅容纳部分符号
      if (rawOutlines.length > 1) {
        const keptSymbols = []
        for (const sym of rawOutlines) {
          const testLine = `${file.relativePath}: ${[...keptSymbols, sym, '...'].join(' | ')}`
          const testTokens = estimateTokens(testLine + '\n')
          if (accumulatedTokens + testTokens <= maxTokens) {
            keptSymbols.push(sym)
          } else {
            break
          }
        }

        if (keptSymbols.length > 0) {
          const partialLine = `${file.relativePath}: ${keptSymbols.join(' | ')} | ...`
          selectedLines.push(partialLine)
          accumulatedTokens += estimateTokens(partialLine + '\n')
        }
      }
      // 预算耗尽，跳出循环
      break
    } else {
      selectedLines.push(fileLine)
      accumulatedTokens += lineTokens
    }
  }

  let result = selectedLines.join('\n')

  // 双重保证：若由于边界原因最终输出依然略微超出预算，做硬截断
  if (estimateTokens(result) > maxTokens) {
    const lines = result.split('\n')
    const finalLines = []
    let currentTokens = 0
    for (const line of lines) {
      const lt = estimateTokens(line + '\n')
      if (currentTokens + lt <= maxTokens) {
        finalLines.push(line)
        currentTokens += lt
      } else {
        break
      }
    }
    result = finalLines.join('\n')
  }

  if (cacheable) {
    touchCacheEntry(repoMapTextCache, cacheKey, { text: result, at: Date.now() })
    trimCache(repoMapTextCache, REPO_MAP_TEXT_CACHE_MAX)
  }

  return result
}
