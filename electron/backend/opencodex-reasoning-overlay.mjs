/**
 * Align OpenCodex pi export with DSH `llm-pi-ai` cursor-ocx profile (~/.dsh/settings.yaml).
 * Without `reasoning` + `thinkingLevelMap` + provider compat, pi-ai omits `reasoning_effort`
 * and OpenCodex swallows thinking traces — TaskWeaver Think row stays empty.
 */

/** @typedef {{ id?: string; reasoning?: boolean; thinkingLevelMap?: Record<string, string | null> }} PiModelEntry */
/** @typedef {{ baseUrl?: string; compat?: Record<string, unknown>; models?: PiModelEntry[] }} PiProviderBlock */

const DSH_CURSOR_COMPAT = Object.freeze({
  thinkingFormat: 'openai',
  supportsDeveloperRole: false,
  supportsReasoningEffort: true,
})

/** DSH cursor/composer-2.5 & grok-4.6* reasoningEfforts → pi thinkingLevelMap */
const DSH_CURSOR_EFFORT_MAP = Object.freeze({
  off: null,
  minimal: null,
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: null,
})

/** Models that DSH explicitly lists with reasoningEfforts (not the -fast variants). */
const DSH_EXPLICIT_REASONING_MODEL_IDS = new Set([
  'cursor/composer-2.5',
  'cursor/grok-4.6',
  'cursor/grok-4.6-fast',
])

function isOpenCodexProvider(providerId, block) {
  if (providerId === 'opencodex') return true
  const base = typeof block?.baseUrl === 'string' ? block.baseUrl : ''
  return base.includes('127.0.0.1:10100') || base.includes('localhost:10100')
}

function cloneEffortMap() {
  return { ...DSH_CURSOR_EFFORT_MAP }
}

/**
 * @param {PiModelEntry} model
 */
function applyModelReasoningOverlay(model) {
  if (!model?.id || !DSH_EXPLICIT_REASONING_MODEL_IDS.has(model.id)) return
  model.reasoning = true
  model.thinkingLevelMap = cloneEffortMap()
}

const TIER_SUFFIX_REGEX = /^(.+)-(minimal|low|medium|high|xhigh|max)$/i

/**
 * 自动将代理暴露出的 -low, -medium, -high 等假模型折叠合并为带思考强度的单一基础模型
 * @param {PiModelEntry[]} models
 * @returns {PiModelEntry[]}
 */
export function normalizeTierSuffixModels(models) {
  if (!Array.isArray(models)) return models

  const groups = new Map()
  const standalone = []

  for (const model of models) {
    if (!model || typeof model !== 'object' || !model.id) continue
    const match = String(model.id).match(TIER_SUFFIX_REGEX)
    if (match) {
      const baseId = match[1]
      const tier = match[2].toLowerCase()
      if (!groups.has(baseId)) {
        groups.set(baseId, { variants: new Map() })
      }
      groups.get(baseId).variants.set(tier, model)
    } else {
      standalone.push(model)
    }
  }

  for (const model of standalone) {
    if (groups.has(model.id)) {
      groups.get(model.id).baseEntry = model
    }
  }

  const result = []

  for (const [baseId, { baseEntry, variants }] of groups.entries()) {
    const rep =
      variants.get('medium') ||
      variants.get('high') ||
      variants.get('low') ||
      [...variants.values()][0]
    const cleanName = String(rep.name || baseId)
      .replace(/-(minimal|low|medium|high|xhigh|max)\b/gi, '')
      .trim()

    const tierVariants = {}
    for (const [lvl, entry] of variants.entries()) {
      tierVariants[lvl] = entry.id
    }

    const thinkingLevelMap = {
      off: variants.has('low') ? 'low' : null,
      minimal: variants.has('minimal')
        ? 'minimal'
        : variants.has('low')
          ? 'low'
          : null,
      low: variants.has('low') ? 'low' : null,
      medium: variants.has('medium') ? 'medium' : null,
      high: variants.has('high') ? 'high' : null,
      xhigh: variants.has('xhigh')
        ? 'xhigh'
        : variants.has('high')
          ? 'high'
          : null,
      max: variants.has('max') ? 'max' : variants.has('high') ? 'high' : null,
    }

    const consolidated = {
      ...(baseEntry || rep),
      id: baseId,
      name: cleanName,
      reasoning: true,
      thinkingLevelMap,
      tierVariants,
    }
    result.push(consolidated)

    // 原变体打上 isTierVariant 标记，供底层映射使用，但列表层不展示
    for (const entry of variants.values()) {
      if (entry !== baseEntry) {
        result.push({
          ...entry,
          isTierVariant: true,
        })
      }
    }
  }

  for (const model of standalone) {
    if (!groups.has(model.id)) {
      result.push(model)
    }
  }

  return result
}

/**
 * @param {Record<string, unknown>} exportDoc
 * @returns {Record<string, unknown>}
 */
export function applyOpenCodexDshReasoningOverlay(exportDoc) {
  if (!exportDoc || typeof exportDoc !== 'object') return exportDoc
  const providers = exportDoc.providers
  if (!providers || typeof providers !== 'object') return exportDoc

  for (const [providerId, block] of Object.entries(providers)) {
    if (!block || typeof block !== 'object') continue
    /** @type {PiProviderBlock} */
    const provider = block
    if (!isOpenCodexProvider(providerId, provider)) continue

    provider.compat = {
      ...(provider.compat && typeof provider.compat === 'object' ? provider.compat : {}),
      ...DSH_CURSOR_COMPAT,
    }

    if (!Array.isArray(provider.models)) continue
    for (const model of provider.models) {
      if (model && typeof model === 'object') applyModelReasoningOverlay(model)
    }

    // 归一化折叠代理层多余的思考等级后缀变体
    provider.models = normalizeTierSuffixModels(provider.models)
  }

  return exportDoc
}
