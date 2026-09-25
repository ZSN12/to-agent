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
  }

  return exportDoc
}
