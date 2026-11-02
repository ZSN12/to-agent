import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { taskweaverApiKeyEnvRef } from '../pi-models-to-dsh-profile.mjs'
import { detectWorkBuddyInstallations, isWorkBuddyInstallation } from './workbuddy-installation.mjs'

const WORKBUDDY_MULTIPLIER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000
const workBuddyProductCatalogCache = new Map()

/**
 * 获取 WorkBuddy 本地 models.json 配置文件路径
 * 默认路径为 ~/.workbuddy/models.json
 */
export function resolveWorkBuddyModelsPath(customPath) {
  if (typeof customPath === 'string' && customPath.trim()) {
    return path.resolve(customPath.trim())
  }
  return path.join(os.homedir(), '.workbuddy', 'models.json')
}

function workBuddyModelsPaths(customPath) {
  if (typeof customPath === 'string' && customPath.trim()) return [resolveWorkBuddyModelsPath(customPath)]
  const home = os.homedir()
  return [
    path.join(home, '.workbuddy', 'models.json'),
    // WorkBuddy documents ~/.codebuddy/models.json as a legacy config location.
    path.join(home, '.codebuddy', 'models.json'),
  ]
}

/**
 * 读取并解析 ~/.workbuddy/models.json
 * @param {string} [customPath]
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function loadWorkBuddyRawModels(customPath) {
  for (const filePath of workBuddyModelsPaths(customPath)) {
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    } catch (error) {
      if (error?.code !== 'ENOENT') return []
    }
  }
  return []
}

function isLoopbackHostname(hostname) {
  const host = String(hostname ?? '').toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true
  if (net.isIP(host) !== 4) return false
  const firstOctet = Number(host.split('.')[0])
  return firstOctet === 127
}

function endpointBaseUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    if (parsed.username || parsed.password) return null
    if ([...parsed.searchParams.keys()].some((key) => /(?:api.?key|token|secret|authorization)/i.test(key))) return null
    parsed.pathname = parsed.pathname.replace(/\/chat\/completions\/?$/i, '').replace(/\/+$/, '')
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

/** Return the one credential the current provider route can safely share. */
export function workBuddyCredentialFromModels(rawModels) {
  const keys = new Set((Array.isArray(rawModels) ? rawModels : [])
    .map((model) => String(model?.apiKey ?? '').trim())
    .filter(Boolean))
  if (keys.size > 1) return { key: '', ambiguous: true }
  return { key: keys.values().next().value ?? '', ambiguous: false }
}

function modelsProbeUrl(value) {
  const base = endpointBaseUrl(value)
  if (!base) return null
  try {
    const parsed = new URL(base)
    if (!isLoopbackHostname(parsed.hostname)) return null
    parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/models` || '/models'
    return parsed.toString()
  } catch {
    return null
  }
}

function catalogModelIdentity(value) {
  const id = String(value ?? '').trim()
  for (const prefix of ['workbuddy-ai/', 'workbuddy/']) {
    if (id.startsWith(prefix) && id.length > prefix.length) {
      return { id, canonicalId: id.slice(prefix.length), prefix }
    }
  }
  return { id, canonicalId: id, prefix: '' }
}

function displayWorkBuddyModelName(id) {
  return catalogModelIdentity(id).canonicalId
    .replace(/[._-]+/g, ' ')
    .replace(/\b(gpt|glm|api)\b/gi, (token) => token.toUpperCase())
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function normalizeWorkBuddyMultiplier(value) {
  const multiplier = String(value ?? '').trim()
  if (!/^x(?:\d+(?:\.\d+)?|\.\d+)$/i.test(multiplier)) return ''
  return Number.isFinite(Number(multiplier.slice(1))) ? multiplier : ''
}

function positiveSafeInteger(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function normalizeWorkBuddyName(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+\((?:workbuddy oauth|国内 oauth)\)$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim()
}

function normalizeMultiplierMetadata(value) {
  if (typeof value === 'string') {
    const multiplier = normalizeWorkBuddyMultiplier(value)
    return multiplier ? { multiplier, status: 'unknown', updatedAt: null } : null
  }
  if (!value || typeof value !== 'object') return null
  const multiplier = normalizeWorkBuddyMultiplier(value.multiplier)
  if (!multiplier) return null
  const status = ['fresh', 'stale', 'unknown'].includes(value.status) ? value.status : 'unknown'
  const updatedAt = typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
    ? new Date(value.updatedAt).toISOString()
    : null
  return { multiplier, status, updatedAt, source: value.source ?? 'product-cache' }
}

export function workBuddyMultiplierForModel(model, multiplierById = new Map(), multiplierByName = new Map(), now = Date.now()) {
  const canonicalId = catalogModelIdentity(model?.id).canonicalId
  const idValue = normalizeMultiplierMetadata(multiplierById.get(canonicalId))
  if (idValue) return idValue
  const namedValue = normalizeMultiplierMetadata(multiplierByName.get(normalizeWorkBuddyName(
    model?.name || displayWorkBuddyModelName(canonicalId),
  )))
  if (namedValue) return namedValue
  const baseId = canonicalId.replace(/-(?:b|c|x|ctrl|exp|f)$/i, '')
  const baseValue = normalizeMultiplierMetadata(multiplierById.get(baseId))
  if (baseValue) return baseValue

  const own = normalizeWorkBuddyMultiplier(model?.workBuddyMultiplier)
  if (!own) return null
  const updatedAt = typeof model?.workBuddyMultiplierUpdatedAt === 'string'
    && Number.isFinite(Date.parse(model.workBuddyMultiplierUpdatedAt))
    ? new Date(model.workBuddyMultiplierUpdatedAt).toISOString()
    : null
  let status = ['fresh', 'stale', 'unknown'].includes(model?.workBuddyMultiplierStatus)
    ? model.workBuddyMultiplierStatus
    : 'unknown'
  if (updatedAt && workBuddyMultiplierFreshness({ mtimeMs: Date.parse(updatedAt) }, now) === 'stale') {
    status = 'stale'
  }
  return { multiplier: own, status, updatedAt, source: model?.workBuddyMultiplierSource ?? 'catalog' }
}

function workBuddyModelFromProductConfig(model) {
  const id = String(model?.id ?? '').trim()
  const name = String(model?.name ?? '').trim()
  const multiplier = normalizeWorkBuddyMultiplier(model?.credits)
  if (!id || id.length > 256 || !name || !multiplier) return null
  if (id.startsWith('custom-local:') || model?.disabled === true || model?.supportsToolCall === false || model?.videoGeneration === true) return null
  if (/(?:^|[-_.])(?:image|video)(?:[-_.]|$)/i.test(id)) return null

  const contextWindow = positiveSafeInteger(model?.contextWindow?.defaultLength)
    ?? positiveSafeInteger(model?.maxInputTokens)
  const maxOutputTokens = positiveSafeInteger(model?.maxOutputTokens)
  return {
    id,
    name,
    multiplier,
    ...(contextWindow ? { maxInputTokens: contextWindow } : {}),
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
    supportsImages: model?.supportsImages === true,
    supportsReasoning: model?.supportsReasoning === true || model?.reasoning === true,
  }
}

function workBuddyProductConfigPaths(customPath) {
  const fileName = path.join('cache', 'acc-product-config-v3.json')
  if (typeof customPath === 'string' && customPath.trim()) {
    return [path.join(path.dirname(resolveWorkBuddyModelsPath(customPath)), fileName)]
  }
  const home = os.homedir()
  return [
    path.join(home, '.workbuddy', fileName),
    path.join(home, '.codebuddy', fileName),
  ]
}

function workBuddyMultiplierFreshness(stat, now) {
  const modifiedAt = Number(stat?.mtimeMs)
  if (!Number.isFinite(modifiedAt) || modifiedAt <= 0 || modifiedAt > now + 5 * 60 * 1_000) {
    return 'stale'
  }
  return now - modifiedAt <= WORKBUDDY_MULTIPLIER_MAX_AGE_MS ? 'fresh' : 'stale'
}

function parseWorkBuddyProductCatalog(config) {
  if (!Array.isArray(config?.models)) return null
  const multiplierById = new Map()
  const multiplierByName = new Map()
  const productModels = new Map()
  for (const model of config.models) {
    const productModel = workBuddyModelFromProductConfig(model)
    if (!productModel) continue
    const id = catalogModelIdentity(productModel.id).canonicalId
    if (id && !multiplierById.has(id)) multiplierById.set(id, productModel.multiplier)
    const nameKey = normalizeWorkBuddyName(productModel.name)
    if (!multiplierByName.has(nameKey)) multiplierByName.set(nameKey, productModel.multiplier)
    // WorkBuddy's product config contains multiple experiment IDs for a few
    // visible products. Keep one entry per displayed product.
    if (!productModels.has(nameKey)) productModels.set(nameKey, productModel)
  }
  return {
    models: [...productModels.values()],
    multiplierById,
    multiplierByName,
  }
}

function freshWorkBuddyProductMetadata(catalog, stat, now, fingerprint) {
  const status = workBuddyMultiplierFreshness(stat, now)
  const updatedAt = Number.isFinite(Number(stat?.mtimeMs))
    ? new Date(stat.mtimeMs).toISOString()
    : null
  const annotate = (multiplier) => ({
    multiplier,
    status,
    updatedAt,
    source: 'product-cache',
  })
  const multiplierById = new Map([...catalog.multiplierById]
    .map(([id, multiplier]) => [id, annotate(multiplier)]))
  const multiplierByName = new Map([...catalog.multiplierByName]
    .map(([name, multiplier]) => [name, annotate(multiplier)]))
  const models = catalog.models.map((model) => ({
    ...model,
    workBuddyMultiplier: model.multiplier,
    workBuddyMultiplierStatus: status,
    ...(updatedAt ? { workBuddyMultiplierUpdatedAt: updatedAt } : {}),
  }))
  return {
    models,
    multiplierById,
    multiplierByName,
    status,
    updatedAt,
    fingerprint,
  }
}

export async function loadWorkBuddyProductCatalogMetadata({
  customPath,
  productConfigPaths,
  now = Date.now(),
} = {}) {
  const configPaths = productConfigPaths ?? workBuddyProductConfigPaths(customPath)
  for (const filePath of configPaths) {
    try {
      const stat = await fs.stat(filePath)
      const cached = workBuddyProductCatalogCache.get(filePath)
      let catalog = cached?.catalog
      let contentHash = cached?.contentHash
      if (!cached
        || cached.mtimeMs !== stat.mtimeMs
        || cached.ctimeMs !== stat.ctimeMs
        || cached.size !== stat.size) {
        const raw = await fs.readFile(filePath, 'utf8')
        contentHash = crypto.createHash('sha256').update(raw).digest('hex')
        try {
          catalog = parseWorkBuddyProductCatalog(JSON.parse(raw))
        } catch {
          catalog = null
        }
        if (!catalog) continue
        workBuddyProductCatalogCache.set(filePath, {
          mtimeMs: stat.mtimeMs,
          ctimeMs: stat.ctimeMs,
          size: stat.size,
          contentHash,
          catalog,
        })
      }
      if (!catalog || !contentHash) continue
      const freshness = workBuddyMultiplierFreshness(stat, now)
      const fingerprint = crypto.createHash('sha256')
        .update(`${path.resolve(filePath)}\0${stat.mtimeMs}\0${stat.ctimeMs}\0${stat.size}\0${contentHash}\0${freshness}`)
        .digest('hex')
      return freshWorkBuddyProductMetadata(catalog, stat, now, fingerprint)
    } catch {
      // The product cache is optional metadata; a missing or unreadable copy
      // falls through to the next location.
    }
  }
  return {
    models: [],
    multiplierById: new Map(),
    multiplierByName: new Map(),
    status: 'unknown',
    updatedAt: null,
    fingerprint: 'missing',
  }
}

/**
 * Read the loopback WorkBuddy proxy's /models listing. `available` means the
 * proxy answered; `listed` means it returned a parseable model listing.
 */
async function fetchWorkBuddyCatalog(urlOrBaseUrl, timeoutMs = 2500, signal, apiKey = '') {
  const catalogUrl = modelsProbeUrl(urlOrBaseUrl)
  if (!catalogUrl) return { available: false, listed: false, models: [] }
  try {
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs)
    const response = await fetch(catalogUrl, {
      signal: requestSignal,
      cache: 'no-store',
      redirect: 'manual',
      // modelsProbeUrl only accepts loopback hosts, so the key never leaves this machine.
      ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
    })
    if (!response.ok) {
      return { available: response.status === 401 || response.status === 403, listed: false, models: [] }
    }
    let payload
    try {
      payload = await response.json()
    } catch {
      return { available: true, listed: false, models: [] }
    }
    const rows = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : null
    if (!rows) return { available: true, listed: false, models: [] }
    const models = rows.flatMap((row) => {
      const id = String(row?.id ?? row?.name ?? '').trim()
      if (!id || id.length > 256 || /[\r\n\0]/.test(id)) return []
      return [{ id, name: String(row?.name ?? '').trim() }]
    })
    return { available: true, listed: true, models }
  } catch {
    return { available: false, listed: false, models: [] }
  }
}

function expandWorkBuddyCatalogModels(rawModels, catalogsByUrl, productModels = []) {
  const expanded = rawModels.map((model) => ({ ...model }))
  const usedIds = new Map()
  for (const model of expanded) {
    const id = String(model?.id ?? '').trim()
    const base = endpointBaseUrl(model?.url || model?.baseURL || model?.baseUrl)
    if (id && !usedIds.has(id)) usedIds.set(id, base)
    else if (id && usedIds.get(id) !== base) usedIds.set(id, null)
  }

  for (const [baseURL, catalog] of catalogsByUrl) {
    const groups = new Map()
    for (const row of catalog.models) {
      const identity = catalogModelIdentity(row.id)
      if (!identity.id || !identity.canonicalId) continue
      const entries = groups.get(identity.canonicalId) ?? []
      entries.push({ ...row, ...identity })
      groups.set(identity.canonicalId, entries)
    }

    for (const [canonicalId, entries] of groups) {
      const configuredHere = expanded.some((model) => {
        const modelBase = endpointBaseUrl(model?.url || model?.baseURL || model?.baseUrl)
        return modelBase === baseURL && catalogModelIdentity(model?.id).canonicalId === canonicalId
      })
      if (configuredHere) continue

      let id = canonicalId
      const existingBase = usedIds.get(id)
      if (usedIds.has(id) && existingBase !== baseURL) {
        const namespaced = entries.find((entry) => entry.prefix && !usedIds.has(entry.id))
        if (!namespaced) continue
        id = namespaced.id
      }
      if (usedIds.has(id)) continue

      const name = entries.find((entry) => entry.name)?.name || displayWorkBuddyModelName(canonicalId)
      expanded.push({ id, name, url: baseURL, workBuddyCatalogListed: true })
      usedIds.set(id, baseURL)
    }
  }

  const productNameForModel = (model) => {
    const canonicalId = catalogModelIdentity(model?.id).canonicalId
    const exact = productModels.find((product) => product.id === canonicalId)
    if (exact) return exact
    // WorkBuddy has used short API aliases for some catalog models while its
    // account metadata keeps the canonical product ID (e.g. kimi-k3 / kimi-k3-1).
    const displayName = normalizeWorkBuddyName(model?.name || displayWorkBuddyModelName(canonicalId))
    return productModels.find((product) => normalizeWorkBuddyName(product.name) === displayName)
      ?? productModels.find((product) => product.id === canonicalId.replace(/-(?:b|c|x|ctrl|exp|f)$/i, ''))
      ?? null
  }
  // Cache products remain addable when a proxy cannot list them. Keep their
  // listing evidence separate so they are not presented as invocation-verified.
  const configuredBaseURL = rawModels
    .map((model) => endpointBaseUrl(model?.url || model?.baseURL || model?.baseUrl))
    .find(Boolean) ?? null
  const routeBaseURL = [...catalogsByUrl.entries()].find(([, catalog]) => catalog.listed)?.[0]
    ?? configuredBaseURL
  const listedProductIdsByUrl = new Map([...catalogsByUrl].map(([url, catalog]) => [
    url,
    new Set(catalog.models.map((row) => catalogModelIdentity(row.id).canonicalId)),
  ]))
  const configuredCount = rawModels.length
  const matchedByProduct = new Map()
  for (let index = 0; index < expanded.length; index += 1) {
    const product = productNameForModel(expanded[index])
    if (!product) continue
    const nameKey = normalizeWorkBuddyName(product.name)
    const matches = matchedByProduct.get(nameKey) ?? []
    matches.push(index)
    matchedByProduct.set(nameKey, matches)
  }

  const matchedIndexes = new Set()
  for (const product of productModels) {
    const nameKey = normalizeWorkBuddyName(product.name)
    const matches = matchedByProduct.get(nameKey) ?? []
    if (!matches.length) continue
    const preferredIndex = [...matches].sort((left, right) => {
      const score = (index) => {
        const model = expanded[index]
        const id = catalogModelIdentity(model?.id).canonicalId
        const baseURL = endpointBaseUrl(model?.url || model?.baseURL || model?.baseUrl)
        const available = catalogsByUrl.get(baseURL)?.available === true
        const exactId = id === product.id
        const experimentAlias = id.replace(/-(?:b|c|x|ctrl|exp|f)$/i, '') === product.id
        const configured = index < configuredCount
        return (configured ? 8 : 0) + (available ? 4 : 0) + (exactId ? 2 : experimentAlias ? 1 : 0)
      }
      return score(right) - score(left)
    })[0]
    // Only collapse discovered duplicates; models from the user's WorkBuddy
    // config are always kept, even when several map to one product.
    for (const index of matches) {
      if (index !== preferredIndex && index >= configuredCount) matchedIndexes.add(index)
    }
    const preferredConfigured = preferredIndex < configuredCount
    const preferredBaseURL = endpointBaseUrl(
      expanded[preferredIndex]?.url || expanded[preferredIndex]?.baseURL || expanded[preferredIndex]?.baseUrl,
    )
    expanded[preferredIndex] = {
      ...expanded[preferredIndex],
      name: preferredConfigured && String(expanded[preferredIndex]?.name ?? '').trim()
        ? expanded[preferredIndex].name
        : product.name,
      credits: product.multiplier,
      workBuddyMultiplier: product.workBuddyMultiplier ?? product.multiplier,
      workBuddyMultiplierStatus: product.workBuddyMultiplierStatus ?? 'unknown',
      ...(product.workBuddyMultiplierUpdatedAt
        ? { workBuddyMultiplierUpdatedAt: product.workBuddyMultiplierUpdatedAt }
        : {}),
      ...(product.maxInputTokens ? { maxInputTokens: product.maxInputTokens } : {}),
      ...(product.maxOutputTokens ? { maxOutputTokens: product.maxOutputTokens } : {}),
      supportsImages: product.supportsImages,
      supportsReasoning: product.supportsReasoning,
      workBuddyCatalogListed: listedProductIdsByUrl.get(preferredBaseURL)?.has(product.id) === true,
    }
  }

  const dedupedExpanded = expanded.filter((_, index) => !matchedIndexes.has(index))
  const representedProducts = new Set(dedupedExpanded
    .map((model) => productNameForModel(model))
    .filter(Boolean)
    .map((model) => normalizeWorkBuddyName(model.name)))
  if (routeBaseURL) {
    for (const product of productModels) {
      const nameKey = normalizeWorkBuddyName(product.name)
      if (representedProducts.has(nameKey)) continue
      if (usedIds.has(product.id)) continue
      dedupedExpanded.push({
        id: product.id,
        name: product.name,
        url: routeBaseURL,
        credits: product.multiplier,
        workBuddyMultiplier: product.workBuddyMultiplier ?? product.multiplier,
        workBuddyMultiplierStatus: product.workBuddyMultiplierStatus ?? 'unknown',
        ...(product.workBuddyMultiplierUpdatedAt
          ? { workBuddyMultiplierUpdatedAt: product.workBuddyMultiplierUpdatedAt }
          : {}),
        workBuddyCatalogListed: listedProductIdsByUrl.get(routeBaseURL)?.has(product.id) === true,
        ...(product.maxInputTokens ? { maxInputTokens: product.maxInputTokens } : {}),
        ...(product.maxOutputTokens ? { maxOutputTokens: product.maxOutputTokens } : {}),
        supportsImages: product.supportsImages,
        supportsReasoning: product.supportsReasoning,
      })
      representedProducts.add(nameKey)
      usedIds.set(product.id, routeBaseURL)
    }
  }

  return dedupedExpanded
}

/**
 * 探测 WorkBuddy 本地 HTTP 反代是否存活
 * @param {string} urlOrBaseUrl
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
export async function probeWorkBuddyAvailable(urlOrBaseUrl, timeoutMs = 2500) {
  return (await fetchWorkBuddyCatalog(urlOrBaseUrl, timeoutMs)).available
}

/**
 * 将 WorkBuddy raw 模型数组转换为 TaskWeaver models.json 中的 provider 块
 * @param {Array<Record<string, unknown>>} rawModels
 * @returns {Record<string, unknown> | null}
 */
export function buildWorkBuddyProviderBlock(rawModels) {
  if (!Array.isArray(rawModels) || !rawModels.length) return null
  const models = rawModels.map((m) => {
    const id = String(m?.id ?? '').trim()
    if (!id) return null
    const baseURL = endpointBaseUrl(m?.url || m?.baseURL || m?.baseUrl)
    if (!baseURL) return null
    const supportsReasoning = m.supportsReasoning === true
    const supportsImages = m.supportsImages === true
    return {
      id,
      name: String(m.name ?? id).trim() || id,
      baseURL,
      api: 'openai-completions',
      reasoning: supportsReasoning,
      input: supportsImages ? ['text', 'image'] : ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: positiveSafeInteger(m.maxInputTokens) ?? 200000,
      maxTokens: positiveSafeInteger(m.maxOutputTokens) ?? 65536,
      compat: { supportsReasoningEffort: supportsReasoning },
    }
  }).filter(Boolean)

  if (!models.length) return null

  return {
    name: 'WorkBuddy',
    baseUrl: models[0].baseURL,
    api: 'openai-completions',
    authHeader: true,
    apiKeyEnv: taskweaverApiKeyEnvRef('workbuddy'),
    models,
  }
}

/**
 * 将 WorkBuddy raw 模型映射为扫描展示条目 ScannedLocalModel
 * @param {Array<Record<string, unknown>>} rawModels
 * @param {{ addedKeys?: Set<string>, isAvailable?: boolean, multiplierById?: Map<string, string> }} [options]
 * @returns {Array<Record<string, unknown>>}
 */
export function mapWorkBuddyScannedModels(rawModels, {
  addedKeys = new Set(),
  isAvailable = true,
  multiplierById = new Map(),
  multiplierByName = new Map(),
} = {}) {
  if (!Array.isArray(rawModels)) return []
  return rawModels.map((m) => {
    const id = String(m?.id ?? '').trim()
    if (!id) return null
    const url = endpointBaseUrl(m?.url || m?.baseURL || m?.baseUrl)
    if (!url) return null
    const key = `workbuddy/${id}`
    const multiplierMetadata = workBuddyMultiplierForModel(m, multiplierById, multiplierByName)
    return {
      key,
      name: String(m.name ?? id).trim() || id,
      id,
      provider: 'workbuddy',
      source: 'workbuddy',
      available: isAvailable,
      alreadyAdded: addedKeys.has(key),
      url,
      supportsImages: Boolean(m.supportsImages),
      supportsReasoning: Boolean(m.supportsReasoning),
      maxInputTokens: positiveSafeInteger(m.maxInputTokens) ?? 200000,
      maxOutputTokens: positiveSafeInteger(m.maxOutputTokens) ?? 65536,
      ...(m.workBuddyCatalogListed === false ? { verificationStatus: 'unverified' } : {}),
      ...(multiplierMetadata
        ? {
            workBuddyMultiplier: multiplierMetadata.multiplier,
            workBuddyMultiplierStatus: multiplierMetadata.status,
            ...(multiplierMetadata.updatedAt
              ? { workBuddyMultiplierUpdatedAt: multiplierMetadata.updatedAt }
              : {}),
          }
        : { workBuddyMultiplierStatus: 'unknown' }),
    }
  }).filter(Boolean)
}

/**
 * 完整执行 WorkBuddy 扫描并返回 Provider 配置块与待展示模型
 * @param {{ customPath?: string, addedKeys?: Set<string>, probe?: boolean, discoverCatalog?: boolean, timeoutMs?: number, signal?: AbortSignal, productConfigPaths?: string[], detectInstallations?: () => Promise<Array<{ name: string, bundleIdentifier: string, bundlePath: string }>> }} [options]
 */
export async function scanWorkBuddy({
  customPath,
  addedKeys = new Set(),
  probe = true,
  discoverCatalog = probe,
  timeoutMs = 2500,
  signal,
  productConfigPaths,
  detectInstallations = detectWorkBuddyInstallations,
} = {}) {
  // This scanner imports the classic WorkBuddy `~/.workbuddy/models.json`
  // route. WorkBuddy AI is a separate app with a separate catalog and must not
  // be reported as the source of these models.
  const detectedInstallations = await detectInstallations()
  const installations = (Array.isArray(detectedInstallations) ? detectedInstallations : [])
    .filter(isWorkBuddyInstallation)
  const raw = await loadWorkBuddyRawModels(customPath)
  if (!raw.length) {
    return { block: null, models: [], raw: [], isAvailable: false, installations }
  }
  const credential = workBuddyCredentialFromModels(raw)
  if (credential.ambiguous) {
    return {
      block: null,
      models: [],
      raw,
      isAvailable: false,
      installations,
      warning: 'WorkBuddy 中的模型使用了不同 API Key；当前 TaskWeaver 提供方无法安全共用这些凭据，未自动导入。',
    }
  }
  const configuredBlock = buildWorkBuddyProviderBlock(raw)
  if (!configuredBlock) {
    return {
      block: null,
      models: [],
      raw: [],
      isAvailable: false,
      installations,
      warning: '没有找到包含有效 URL 的 WorkBuddy 模型。',
    }
  }
  const catalogsByUrl = new Map()
  if (probe || discoverCatalog) {
    const localUrls = [...new Set(configuredBlock.models
      .map((model) => model.baseURL)
      .filter((url) => modelsProbeUrl(url)))]
    await Promise.all(localUrls.map(async (url) => {
      catalogsByUrl.set(url, await fetchWorkBuddyCatalog(url, timeoutMs, signal, credential.key))
    }))
  }
  const productCatalog = await loadWorkBuddyProductCatalogMetadata({ customPath, productConfigPaths })
  const expandedRaw = discoverCatalog
    ? expandWorkBuddyCatalogModels(raw, catalogsByUrl, productCatalog.models)
    : raw
  const block = buildWorkBuddyProviderBlock(expandedRaw)
  if (!block) {
    return {
      block: null,
      models: [],
      raw: [],
      isAvailable: false,
      installations,
      warning: 'WorkBuddy 模型目录没有可用的模型。',
    }
  }
  const reachableByUrl = new Map([...catalogsByUrl].map(([url, catalog]) => [url, catalog.available]))
  const models = mapWorkBuddyScannedModels(expandedRaw, {
    addedKeys,
    multiplierById: productCatalog.multiplierById,
    multiplierByName: productCatalog.multiplierByName,
  })
    .map((model) => {
      if (!probe) return model
      const rawModel = expandedRaw.find((row) => String(row?.id ?? '').trim() === model.id
        && endpointBaseUrl(row?.url || row?.baseURL || row?.baseUrl) === model.url)
      const base = endpointBaseUrl(rawModel?.url || rawModel?.baseURL || rawModel?.baseUrl)
      return base && reachableByUrl.has(base) ? { ...model, available: reachableByUrl.get(base) } : model
    })
  return { block, models, raw: expandedRaw, isAvailable: models.some((model) => model.available), installations }
}
