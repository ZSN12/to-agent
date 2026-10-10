import fs from 'node:fs/promises'
import path from 'node:path'
import { scoreTextRelevance, precomputeQueryTerms } from './text-relevance.mjs'

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
 * 内存缓存：key 为绝对路径，value 为缓存对象
 * { mtimeMs, symbols, defs, refs }
 */
const fileOutlineCache = new Map()
const FILE_OUTLINE_CACHE_TTL_MS = 5 * 60 * 1000
const FILE_OUTLINE_CACHE_MAX = 4096

/** 同工作区 + 查询 + token 预算的 Repo Map 文本缓存（避免每轮用户消息全量重算 PageRank）。 */
const repoMapTextCache = new Map()
const REPO_MAP_TEXT_CACHE_TTL_MS = 120_000
const REPO_MAP_TEXT_CACHE_MAX = 48

/**
 * 允许外部注入或重置符号提取器
 */
let injectedSymbolExtractor = null

export function setSymbolOutlineExtractor(extractor) {
  injectedSymbolExtractor = extractor
}

export function clearRepoMapCache() {
  fileOutlineCache.clear()
  repoMapTextCache.clear()
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

/**
 * 估算文本所占用的 Token 数量
 * 中文字符按约 1 字符 1 Token，西文字符与符号按约 3.5 字符 1 Token。
 */
export function estimateTokens(text) {
  if (!text) return 0
  const cjkMatches = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)
  const cjkCount = cjkMatches ? cjkMatches.length : 0
  const nonCjkCount = text.length - cjkCount
  return cjkCount + Math.ceil(nonCjkCount / 3.5)
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

  // 构建图：file A 引用了 file B 的定义符号，则添加边 A -> B
  // outgoing[A] = set of files referenced by A
  // incoming[B] = set of files referencing B
  const outgoing = new Map()
  const incoming = new Map()

  for (const node of fileNodes) {
    outgoing.set(node.relativePath, new Set())
    incoming.set(node.relativePath, new Set())
  }

  for (let i = 0; i < n; i++) {
    const fileA = fileNodes[i]
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const fileB = fileNodes[j]
      let isReferenced = false

      // 检查 fileA 的标识符是否命中了 fileB 定义的任何符号
      for (const def of fileB.defs) {
        if (fileA.refs.has(def)) {
          isReferenced = true
          break
        }
      }

      // 或者检查 fileA 的文本是否显式 import 了 fileB 的相对路径或模块名
      if (!isReferenced) {
        const baseB = path.basename(fileB.relativePath, path.extname(fileB.relativePath))
        if (fileA.refs.has(baseB)) {
          isReferenced = true
        }
      }

      if (isReferenced) {
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
} = {}) {
  if (!workspacePath) return ''

  // Injected outlines are caller-owned input and are not represented in the
  // normal workspace/query cache key. Bypass the text cache so an earlier map
  // for the same query cannot hide a caller's precomputed symbol set.
  const cacheable = !precomputedSymbols || typeof precomputedSymbols !== 'object'
  const cacheKey = `${workspacePath}\0${maxTokens}\0${String(query).slice(0, 400)}`
  const cachedMap = cacheable ? repoMapTextCache.get(cacheKey) : null
  if (cachedMap && Date.now() - cachedMap.at < REPO_MAP_TEXT_CACHE_TTL_MS) {
    // Refresh LRU order but keep the generation timestamp so frequent prompts
    // cannot keep a stale map alive indefinitely.
    touchCacheEntry(repoMapTextCache, cacheKey, cachedMap)
    return cachedMap.text
  }

  const extractor = await resolveSymbolExtractor()
  const files = await scanWorkspaceFiles(workspacePath)
  if (files.length === 0 && !precomputedSymbols) return ''

  const precomputedTerms = query ? precomputeQueryTerms(query) : []
  const fileNodes = []

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
        content: '',
      })
    }
  } else {
    for (const file of files) {
      const cached = fileOutlineCache.get(file.absolutePath)
      let fileData = cached
      const now = Date.now()

      if (
        !fileData
        || fileData.mtimeMs !== file.mtimeMs
        || fileData.size !== file.size
        || now - fileData.at >= FILE_OUTLINE_CACHE_TTL_MS
      ) {
        let content = ''
        try {
          content = await fs.readFile(file.absolutePath, 'utf8')
        } catch {
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
          content,
          at: now,
        }
        touchCacheEntry(fileOutlineCache, file.absolutePath, fileData)
        trimCache(fileOutlineCache, FILE_OUTLINE_CACHE_MAX)
      } else {
        touchCacheEntry(fileOutlineCache, file.absolutePath, fileData)
      }

      fileNodes.push({
        relativePath: file.relativePath,
        symbols: fileData.symbols,
        defs: fileData.defs,
        refs: fileData.refs,
        content: fileData.content || '',
      })
    }
  }

  if (fileNodes.length === 0) return ''

  // 2. 计算 PageRank 权重
  const pageRanks = computePageRank(fileNodes)

  // 3. 计算意图关联分与综合权重
  const scoredFiles = []
  for (const node of fileNodes) {
    const pr = pageRanks.get(node.relativePath) || 0
    let relevanceScore = 0

    const symbolNamesText = Array.from(node.defs).join(' ')
    if (query && precomputedTerms.length > 0) {
      relevanceScore = scoreTextRelevance(query, node.content, {
        pathText: node.relativePath,
        titleText: symbolNamesText,
        precomputedTerms,
      })
    }

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

  // 4. 按综合权重降序排序
  scoredFiles.sort((a, b) => b.finalScore - a.finalScore)

  // 5. 贪心筛选与 Token 预算控制
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
