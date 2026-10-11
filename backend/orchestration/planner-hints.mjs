import fs from 'node:fs/promises'
import path from 'node:path'

const EMPTY_HINTS = Object.freeze({
  version: 1,
  ignoreDirectories: [],
  scopeRules: [],
  rankingRules: [],
  pathWeights: [],
})

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeRelativePath(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`planner-hints.json: ${label} 必须是非空工作区相对路径`)
  }
  const normalized = value.trim().replaceAll('\\', '/')
  const segments = normalized.split('/')
  if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || segments.includes('..') || /[\u0000-\u001f\u007f*?{}\[\]]/.test(normalized)) {
    throw new Error(`planner-hints.json: ${label} 不能是绝对路径、通配符或包含 ..`)
  }
  return segments.filter((segment) => segment && segment !== '.').join('/')
}

function normalizeTerms(value, label) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100 || value.some((term) => typeof term !== 'string' || term.trim() === '' || term.length > 120)) {
    throw new Error(`planner-hints.json: ${label} 必须是最多 100 项的非空文本数组`)
  }
  return [...new Set(value.map((term) => term.trim()))]
}

function normalizePathList(value, label) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100) {
    throw new Error(`planner-hints.json: ${label} 必须是最多 100 项的路径数组`)
  }
  return [...new Set(value.map((item) => normalizeRelativePath(item, label)))]
}

function normalizeDirectoryList(value) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100) throw new Error('planner-hints.json: ignoreDirectories 必须是最多 100 项的目录名数组')
  return [...new Set(value.map((item) => {
    const normalized = normalizeRelativePath(item, 'ignoreDirectories')
    if (normalized.includes('/')) throw new Error('planner-hints.json: ignoreDirectories 只能使用单个目录名')
    return normalized
  }))]
}

function normalizeWeightList(value, label) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 200) {
    throw new Error(`planner-hints.json: ${label} 必须是最多 200 项的数组`)
  }
  return value.map((entry) => {
    if (!isPlainObject(entry)) throw new Error(`planner-hints.json: ${label} 每项必须是对象`)
    const weight = Number(entry.weight)
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      throw new Error(`planner-hints.json: ${label} 权重必须在 0–100 之间`)
    }
    return { path: normalizeRelativePath(entry.path, label), weight }
  })
}

function normalizeScopeRules(value) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 50) throw new Error('planner-hints.json: scopeRules 必须是最多 50 项的数组')
  return value.map((rule, index) => {
    if (!isPlainObject(rule)) throw new Error(`planner-hints.json: scopeRules[${index}] 必须是对象`)
    const requestTermsAny = normalizeTerms(rule.requestTermsAny, `scopeRules[${index}].requestTermsAny`)
    const taskTermsAny = normalizeTerms(rule.taskTermsAny, `scopeRules[${index}].taskTermsAny`)
    if (requestTermsAny.length === 0 || taskTermsAny.length === 0) {
      throw new Error(`planner-hints.json: scopeRules[${index}] 必须定义 requestTermsAny 和 taskTermsAny`)
    }
    return {
      requestTermsAny,
      taskTermsAny,
      taskTermsNone: normalizeTerms(rule.taskTermsNone, `scopeRules[${index}].taskTermsNone`),
      requiredPaths: normalizePathList(rule.requiredPaths, `scopeRules[${index}].requiredPaths`),
    }
  })
}

function normalizeRankingRules(value) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 50) throw new Error('planner-hints.json: rankingRules 必须是最多 50 项的数组')
  return value.map((rule, index) => {
    if (!isPlainObject(rule)) throw new Error(`planner-hints.json: rankingRules[${index}] 必须是对象`)
    const queryTermsAny = normalizeTerms(rule.queryTermsAny, `rankingRules[${index}].queryTermsAny`)
    if (queryTermsAny.length === 0) throw new Error(`planner-hints.json: rankingRules[${index}] 必须定义 queryTermsAny`)
    return {
      queryTermsAny,
      boostPaths: normalizeWeightList(rule.boostPaths, `rankingRules[${index}].boostPaths`),
      preferredDirectories: normalizePathList(rule.preferredDirectories, `rankingRules[${index}].preferredDirectories`),
      prependPaths: normalizePathList(rule.prependPaths, `rankingRules[${index}].prependPaths`),
    }
  })
}

export function normalizePlannerHints(value) {
  if (!isPlainObject(value) || (value.version !== undefined && value.version !== 1)) {
    throw new Error('planner-hints.json: 根值必须是 version 1 的对象')
  }
  return {
    version: 1,
    ignoreDirectories: normalizeDirectoryList(value.ignoreDirectories),
    scopeRules: normalizeScopeRules(value.scopeRules),
    rankingRules: normalizeRankingRules(value.rankingRules),
    pathWeights: normalizeWeightList(value.pathWeights, 'pathWeights'),
  }
}

/** Load optional, workspace-owned planning hints. Missing files mean an empty config. */
export async function loadWorkspacePlannerHints(workspacePath, { disabled = false } = {}) {
  if (disabled || !workspacePath) return EMPTY_HINTS
  const file = path.join(workspacePath, '.taskweaver', 'planner-hints.json')
  let content
  try {
    content = await fs.readFile(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return EMPTY_HINTS
    throw error
  }
  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (error) {
    throw new Error(`无法解析 ${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return normalizePlannerHints(parsed)
}
