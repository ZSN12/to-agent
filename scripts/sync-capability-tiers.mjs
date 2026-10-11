#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalModelIdFromRoute } from '../backend/capability-tiers.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATASET_ID = 'lmarena-ai/leaderboard-dataset'
const DATASET_URL = `https://huggingface.co/datasets/${DATASET_ID}`
const ROWS_URL = 'https://datasets-server.huggingface.co/rows'
const BOARD_CONFIGS = Object.freeze([
  { id: 'webdev', config: 'webdev', anchor: 1775, strongGap: 160, mediumGap: 310 },
  { id: 'text', config: 'text_style_control', anchor: 1508, strongGap: 30, mediumGap: 60 },
])
const THRESHOLDS_VERSION = 'arena-2026-10-a'
const MINIMUM_VOTES = 1000
const PAGE_SIZE = 100
const PAGE_CONCURRENCY = 4
const TIER_RANK = Object.freeze({ weak: 0, medium: 1, strong: 2 })
const EFFORT_SUFFIX = /-(?:thinking-)?(?:ultra|xhigh|high|medium|low|max|large|reasoning)$/i
const DATE_SUFFIX = /-(?:20\d{6}|\d{4})$/i

function parseArgs(argv) {
  const options = {
    registryPath: path.join(ROOT, 'registry', 'model-registry.v1.json'),
    aliasesPath: path.join(ROOT, 'pricing', 'model-aliases.json'),
    outputPath: path.join(ROOT, 'pricing', 'capability-tiers.json'),
    dryRun: false,
    rowsApiUrl: ROWS_URL,
    now: new Date(),
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--dry-run') options.dryRun = true
    else if (argument === '--registry') options.registryPath = path.resolve(argv[++index])
    else if (argument === '--aliases') options.aliasesPath = path.resolve(argv[++index])
    else if (argument === '--output') options.outputPath = path.resolve(argv[++index])
    else if (argument === '--rows-api') options.rowsApiUrl = argv[++index]
    else if (argument === '--fetched-at') options.now = new Date(argv[++index])
    else throw new Error(`未知参数：${argument}`)
  }
  if (!Number.isFinite(options.now.getTime())) throw new Error('--fetched-at 必须是有效日期')
  return options
}

function normalizeBoardName(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/\s+/g, '-')
}

/**
 * Enumerate only documented name variants; matching later is exact against this
 * set. The unstripped name is first so a literal model suffix such as qwen3.8-max
 * wins before `-max` is considered a reasoning suffix.
 */
export function leaderboardNameForms(value) {
  const initial = normalizeBoardName(value)
  if (!initial) return []
  const forms = []
  const seen = new Set()
  const add = (name) => {
    const normalized = name.trim().replace(/^-|-$/g, '')
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      forms.push(normalized)
    }
  }

  let current = initial
  add(current)
  current = current.replace(DATE_SUFFIX, '')
  add(current)
  while (EFFORT_SUFFIX.test(current)) {
    current = current.replace(EFFORT_SUFFIX, '')
    add(current)
  }
  if (current.endsWith('-preview')) add(current.slice(0, -'-preview'.length))
  else if (current.endsWith('preview')) add(current.slice(0, -'preview'.length).replace(/-$/, ''))
  return forms
}

function routeModelName(routeKey) {
  const slash = String(routeKey).indexOf('/')
  return slash > 0 ? String(routeKey).slice(slash + 1) : String(routeKey)
}

function addNameCandidate(index, name, canonicalId) {
  for (const form of leaderboardNameForms(name)) {
    const values = index.get(form) ?? new Set()
    values.add(canonicalId)
    index.set(form, values)
  }
}

function makeModelNameIndex(registry, aliases) {
  const names = new Map()
  const canonicalIds = new Set()
  const modelAliases = aliases?.modelAliases ?? {}
  for (const [routeKey, entry] of Object.entries(registry?.models ?? {})) {
    const canonicalId = canonicalModelIdFromRoute(routeKey, aliases)
    if (!canonicalId) continue
    canonicalIds.add(canonicalId)
    addNameCandidate(names, routeModelName(routeKey), canonicalId)
    addNameCandidate(names, canonicalId.slice(canonicalId.indexOf('/') + 1), canonicalId)
    const routeEntryId = typeof entry?.id === 'string' ? entry.id : ''
    if (routeEntryId) addNameCandidate(names, routeEntryId, canonicalId)
    const configuredAliases = Array.isArray(modelAliases[canonicalId]) ? modelAliases[canonicalId] : []
    for (const alias of configuredAliases) addNameCandidate(names, alias, canonicalId)
  }
  return { names, canonicalIds }
}

function matchLeaderboardName(modelName, names) {
  for (const form of leaderboardNameForms(modelName)) {
    const ids = names.get(form)
    if (!ids) continue
    if (ids.size === 1) return { canonicalId: [...ids][0], form }
    return { ambiguous: [...ids].sort(), form }
  }
  return null
}

function tierForBoardScore(board, rating) {
  const gap = board.anchor - Number(rating)
  if (gap <= board.strongGap) return 'strong'
  if (gap <= board.mediumGap) return 'medium'
  return 'weak'
}

function normalizedBoardRow(row, board) {
  const rating = Number(row?.rating)
  const votes = Number(row?.vote_count)
  if (!Number.isFinite(rating) || !Number.isFinite(votes) || votes < MINIMUM_VOTES) return null
  if (row?.category && row.category !== 'overall') return null
  return {
    board: board.id,
    tier: tierForBoardScore(board, rating),
    rating,
    matchedName: String(row.model_name ?? ''),
    votes,
    publishDate: String(row.leaderboard_publish_date ?? ''),
  }
}

function isBetterBoardRow(candidate, current) {
  return !current
    || candidate.rating > current.rating
    || (candidate.rating === current.rating && candidate.votes > current.votes)
    || (candidate.rating === current.rating && candidate.votes === current.votes
      && candidate.matchedName.localeCompare(current.matchedName) < 0)
}

export function buildCapabilityTierSnapshot({ registry, aliases, boards, fetchedAt }) {
  const { names, canonicalIds } = makeModelNameIndex(registry, aliases)
  const snapshotFetchedAt = fetchedAt instanceof Date ? fetchedAt.toISOString() : new Date(fetchedAt).toISOString()
  const rowsByModel = new Map([...canonicalIds].map((canonicalId) => [canonicalId, {}]))
  const unmatched = []
  const ambiguous = []

  for (const board of BOARD_CONFIGS) {
    for (const sourceRow of boards?.[board.id] ?? []) {
      const row = normalizedBoardRow(sourceRow, board)
      if (!row) continue
      const match = matchLeaderboardName(sourceRow.model_name, names)
      if (!match) {
        unmatched.push({ board: board.id, model: String(sourceRow.model_name ?? '') })
        continue
      }
      if (match.ambiguous) {
        ambiguous.push({ board: board.id, model: String(sourceRow.model_name ?? ''), canonicalIds: match.ambiguous })
        continue
      }
      const modelRows = rowsByModel.get(match.canonicalId) ?? {}
      if (isBetterBoardRow(row, modelRows[board.id])) modelRows[board.id] = row
      rowsByModel.set(match.canonicalId, modelRows)
    }
  }

  const models = {}
  for (const canonicalId of [...canonicalIds].sort()) {
    const boardResults = rowsByModel.get(canonicalId) ?? {}
    const available = BOARD_CONFIGS
      .map((board) => boardResults[board.id])
      .filter(Boolean)
    let selected = null
    for (const result of available) {
      if (!selected || TIER_RANK[result.tier] > TIER_RANK[selected.tier]) selected = result
    }
    const status = available.length === 0 ? 'unrated' : available.length === 1 ? 'single-board' : 'rated'
    models[canonicalId] = {
      canonicalId,
      tier: selected?.tier ?? 'medium',
      status,
      board: selected?.board ?? null,
      rating: selected?.rating ?? null,
      matchedName: selected?.matchedName ?? null,
      votes: selected?.votes ?? null,
      publishDate: selected?.publishDate || null,
      fetchedAt: snapshotFetchedAt,
      thresholdsVersion: THRESHOLDS_VERSION,
      boards: boardResults,
    }
  }

  return {
    schemaVersion: 1,
    thresholdsVersion: THRESHOLDS_VERSION,
    fetchedAt: snapshotFetchedAt,
    source: {
      name: 'LMArena Leaderboard Dataset',
      dataset: DATASET_ID,
      url: DATASET_URL,
      apiUrl: ROWS_URL,
      license: 'CC BY 4.0',
      attribution: 'LMArena Leaderboard Dataset (lmarena-ai/leaderboard-dataset), used under CC BY 4.0.',
      boards: {
        webdev: { config: 'webdev', category: 'overall', anchor: 1775 },
        text: { config: 'text_style_control', category: 'overall', anchor: 1508 },
      },
    },
    thresholds: {
      webdev: { anchor: 1775, strongMaxGap: 160, mediumMaxGap: 310 },
      text: { anchor: 1508, strongMaxGap: 30, mediumMaxGap: 60 },
      minimumVotes: MINIMUM_VOTES,
      combine: 'best-tier',
    },
    models,
    diagnostics: {
      unmatchedRows: unmatched.length,
      ambiguousRows: ambiguous.length,
      ambiguous: ambiguous.slice(0, 50),
    },
  }
}

async function fetchJson(url, { fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    timer.unref?.()
    try {
      const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: controller.signal })
      if (!response.ok) {
        const error = new Error(`获取榜单数据失败：HTTP ${response.status}`)
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          const retryAfter = Number(response.headers?.get?.('retry-after'))
          const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(30_000, retryAfter * 1000)
            : (attempt + 1) * 1_000
          lastError = error
          await new Promise((resolve) => setTimeout(resolve, delayMs))
          continue
        }
        throw error
      }
      return await response.json()
    } catch (error) {
      lastError = error
      if (attempt >= 2) throw error
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1_000))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError ?? new Error('获取榜单数据失败')
}

async function fetchBoardRows(config, rowsApiUrl, fetchImpl) {
  const query = new URLSearchParams({ dataset: DATASET_ID, config: config.config, split: 'latest', offset: '0', length: String(PAGE_SIZE) })
  const firstPage = await fetchJson(`${rowsApiUrl}?${query}`, { fetchImpl })
  const totalRows = Number(firstPage.num_rows_total)
  if (!Number.isFinite(totalRows) || !Array.isArray(firstPage.rows)) throw new Error(`榜单 ${config.id} 返回格式无效`)
  const pages = Array.from({ length: Math.ceil(totalRows / PAGE_SIZE) - 1 }, (_, index) => (index + 1) * PAGE_SIZE)
  const remaining = new Array(pages.length)
  let cursor = 0
  async function worker() {
    while (cursor < pages.length) {
      const position = cursor
      cursor += 1
      const offset = pages[position]
      const params = new URLSearchParams({ dataset: DATASET_ID, config: config.config, split: 'latest', offset: String(offset), length: String(PAGE_SIZE) })
      const page = await fetchJson(`${rowsApiUrl}?${params}`, { fetchImpl })
      if (!Array.isArray(page.rows)) throw new Error(`榜单 ${config.id} 第 ${offset} 行返回格式无效`)
      remaining[position] = page.rows.map((item) => item.row)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, pages.length) }, () => worker()))
  return [...firstPage.rows.map((item) => item.row), ...remaining.flat()]
}

export async function syncCapabilityTiers({
  registryPath = path.join(ROOT, 'registry', 'model-registry.v1.json'),
  aliasesPath = path.join(ROOT, 'pricing', 'model-aliases.json'),
  outputPath = path.join(ROOT, 'pricing', 'capability-tiers.json'),
  rowsApiUrl = ROWS_URL,
  fetchImpl = globalThis.fetch,
  fetchedAt = new Date(),
  dryRun = false,
} = {}) {
  const [registry, aliases] = await Promise.all([
    fs.readFile(registryPath, 'utf8').then(JSON.parse),
    fs.readFile(aliasesPath, 'utf8').then(JSON.parse),
  ])
  const boardRows = Object.fromEntries(await Promise.all(BOARD_CONFIGS.map(async (board) => [
    board.id,
    await fetchBoardRows(board, rowsApiUrl, fetchImpl),
  ])))
  const snapshot = buildCapabilityTierSnapshot({ registry, aliases, boards: boardRows, fetchedAt })
  const counts = Object.values(snapshot.models).reduce((result, item) => {
    result[item.status] += 1
    return result
  }, { rated: 0, 'single-board': 0, unrated: 0 })
  if (!dryRun) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    const temporaryPath = `${outputPath}.${process.pid}.tmp`
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
      await fs.rename(temporaryPath, outputPath)
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => {})
    }
  }
  return { snapshot, counts }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const result = await syncCapabilityTiers(options)
    console.log(JSON.stringify({
      path: options.dryRun ? null : options.outputPath,
      thresholdsVersion: result.snapshot.thresholdsVersion,
      fetchedAt: result.snapshot.fetchedAt,
      modelCount: Object.keys(result.snapshot.models).length,
      ...result.counts,
      diagnostics: result.snapshot.diagnostics,
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
