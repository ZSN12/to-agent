import fs from 'node:fs/promises'
import path from 'node:path'
import { isWorkspacePath } from './workspace-index.mjs'

/** 单个指令文件最大读取字节（防止误读几百 KB 大文件撑爆上下文） */
export const DEFAULT_FILE_RULE_LIMIT_BYTES = 8 * 1024
/** 所有工作区指令合并后的默认字节硬顶 */
export const DEFAULT_TOTAL_RULES_BUDGET_BYTES = 12 * 1024

const RULE_CANDIDATE_PATHS = [
  'TASKWEAVER.md',
  '.taskweaver/rules.md',
  '.taskweaver/instructions.md',
  'AGENTS.md',
  'CLAUDE.md',
  '.cursorrules',
]

/**
 * 缓存：key 为 `${workspaceRoot}\0${budgetBytes}`
 * { mtimeSignature, result, at }
 */
const rulesCache = new Map()
const CACHE_TTL_MS = 60 * 1000

function utf8Bytes(str) {
  return Buffer.byteLength(String(str ?? ''), 'utf8')
}

function truncateUtf8(value, maxBytes) {
  let result = ''
  let used = 0
  for (const char of String(value)) {
    const charBytes = utf8Bytes(char)
    if (used + charBytes > maxBytes) break
    result += char
    used += charBytes
  }
  return result
}

/**
 * 递归收集 .cursor/rules 目录下的规则文件
 */
async function collectCursorRules(workspaceRoot) {
  const dir = path.join(workspaceRoot, '.cursor', 'rules')
  const collected = []
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (ext === '.md' || ext === '.mdc' || ext === '.txt') {
        collected.push(path.join('.cursor', 'rules', entry.name))
      }
    }
  } catch {
    // 目录不存在则跳过
  }
  return collected
}

/**
 * 探测并收集工作区中定义的所有规则指令文件
 * @param {string} workspaceRoot
 * @returns {Promise<string[]>} 相对文件路径列表
 */
export async function discoverWorkspaceRuleFiles(workspaceRoot) {
  if (!workspaceRoot || typeof workspaceRoot !== 'string') return []
  const resolvedRoot = path.resolve(workspaceRoot)
  const matched = []

  // 1. 检查根级标准指令文件
  for (const relPath of RULE_CANDIDATE_PATHS) {
    const absPath = path.join(resolvedRoot, relPath)
    try {
      const stat = await fs.lstat(absPath)
      if (stat.isFile() || stat.isSymbolicLink()) {
        if (isWorkspacePath(resolvedRoot, absPath)) {
          matched.push(relPath)
        }
      }
    } catch {
      // 文件不存在
    }
  }

  // 2. 检查 .cursor/rules/*
  const cursorFiles = await collectCursorRules(resolvedRoot)
  for (const relPath of cursorFiles) {
    const absPath = path.join(resolvedRoot, relPath)
    if (isWorkspacePath(resolvedRoot, absPath)) {
      matched.push(relPath)
    }
  }

  return matched
}

/**
 * 加载工作区指令规则
 * @param {string} workspaceRoot
 * @param {object} [options]
 * @param {number} [options.budgetBytes=DEFAULT_TOTAL_RULES_BUDGET_BYTES]
 * @returns {Promise<{ text: string, files: Array<{ relativePath: string, bytes: number, truncated: boolean }>, bytes: number }>}
 */
export async function loadWorkspaceRules(workspaceRoot, { budgetBytes = DEFAULT_TOTAL_RULES_BUDGET_BYTES } = {}) {
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    return { text: '', files: [], bytes: 0 }
  }

  const resolvedRoot = path.resolve(workspaceRoot)
  const candidateFiles = await discoverWorkspaceRuleFiles(resolvedRoot)
  if (!candidateFiles.length) {
    return { text: '', files: [], bytes: 0 }
  }

  // 计算文件签名以校验缓存
  let mtimeSignature = ''
  const fileStats = []
  for (const rel of candidateFiles) {
    const abs = path.join(resolvedRoot, rel)
    try {
      const stat = await fs.stat(abs)
      mtimeSignature += `${rel}:${stat.mtimeMs}:${stat.size};`
      fileStats.push({ rel, abs, stat })
    } catch {
      // 读取状态失败
    }
  }

  const cacheKey = `${resolvedRoot}\0${budgetBytes}`
  const cached = rulesCache.get(cacheKey)
  if (cached && cached.mtimeSignature === mtimeSignature && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.result
  }

  const fileResults = []
  let consumedBytes = 0
  const blocks = []

  // 按优先级顺序装载，直到消耗完总预算
  for (const { rel, abs } of fileStats) {
    if (consumedBytes >= budgetBytes) break

    let content = ''
    try {
      content = await fs.readFile(abs, 'utf8')
    } catch {
      continue
    }

    if (content.includes('\0')) {
      // 忽略二进制内容
      continue
    }

    const availableBudgetForFile = Math.min(DEFAULT_FILE_RULE_LIMIT_BYTES, budgetBytes - consumedBytes)
    const contentBytes = utf8Bytes(content)
    let fileText = content
    let truncated = false

    if (contentBytes > availableBudgetForFile) {
      fileText = truncateUtf8(content, availableBudgetForFile)
      truncated = true
    }

    const blockHeader = `\n<taskweaver_project_rules source="${rel}">\n`
    const blockFooter = truncated
      ? '\n…（规则内容因单文件/总上下文预算上限已截断）\n</taskweaver_project_rules>'
      : '\n</taskweaver_project_rules>'

    const fullBlock = `${blockHeader}${fileText.trim()}${blockFooter}`
    const blockBytes = utf8Bytes(fullBlock)

    consumedBytes += blockBytes
    blocks.push(fullBlock)
    fileResults.push({
      relativePath: rel,
      bytes: blockBytes,
      truncated,
    })
  }

  if (!blocks.length) {
    return { text: '', files: [], bytes: 0 }
  }

  const intro = '\n\n以下是当前代码库的项目指令与规范约定（来自工作区规则文件）。在执行代码生成、架构修改或测试自检时必须优先遵守：'
  let mergedText = `${intro}${blocks.join('')}\n`
  if (utf8Bytes(mergedText) > budgetBytes) {
    mergedText = truncateUtf8(mergedText, budgetBytes)
  }

  const result = {
    text: mergedText,
    files: fileResults,
    bytes: utf8Bytes(mergedText),
  }

  rulesCache.set(cacheKey, {
    mtimeSignature,
    result,
    at: Date.now(),
  })

  return result
}

/** 清理缓存（单测或工作区切换时使用） */
export function clearWorkspaceRulesCache() {
  rulesCache.clear()
}
