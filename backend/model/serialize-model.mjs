import { mergeRegistryCost } from '../price-registry.mjs'
import { reasoningCatalogFromHostModel } from '../reasoning-effort-catalog.mjs'

function positiveSafeInteger(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function firstPositiveSafeInteger(...values) {
  for (const value of values) {
    const parsed = positiveSafeInteger(value)
    if (parsed !== null) return parsed
  }
  return 0
}

function normalizeWorkBuddyMultiplier(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!/^x(?:\d+(?:\.\d+)?|\.\d+)$/i.test(normalized)) return null
  return Number.isFinite(Number(normalized.slice(1))) ? normalized : null
}

export function createSerializeDshModel({ getPriceRegistry, getCatalogPriceMeta }) {
  return function serializeDshModel(
    provider,
    model,
    availableKeys,
    profile = null,
    registryEntry = null,
    source = 'bundled',
    registryVersion = null,
    routeRegistered = true,
  ) {
    const key = `${provider.id}/${model.id}`
    const defaultCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    const remotePricing = registryEntry?.pricing ?? registryEntry?.costPerMillion
    const bundledPrice = mergeRegistryCost(key, defaultCost, getPriceRegistry())
    const cost = remotePricing && typeof remotePricing === 'object'
      ? {
          input: Number(remotePricing.input) || 0,
          output: Number(remotePricing.output) || 0,
          cacheRead: Number(remotePricing.cacheRead) || 0,
          cacheWrite: Number(remotePricing.cacheWrite) || 0,
        }
      : bundledPrice.cost
    const priceMeta = remotePricing
      ? {
          source: 'taskweaver-remote-registry',
          synced_at: registryEntry?.updatedAt ?? null,
          confidence: registryEntry?.confidence ?? 'curated',
          currency: remotePricing.currency ?? 'USD',
          hasInputPrice: remotePricing.input != null && Number.isFinite(Number(remotePricing.input)),
          hasOutputPrice: remotePricing.output != null && Number.isFinite(Number(remotePricing.output)),
        }
      : bundledPrice.priceMeta
    const reasoningCatalog = reasoningCatalogFromHostModel(model)
    const declaredInput = [model.inputModalities, model.input, registryEntry?.input]
      .find((modalities) => Array.isArray(modalities) && modalities.length > 0)
    const vision = declaredInput
      ? declaredInput.includes('image')
      : typeof registryEntry?.vision === 'boolean'
        ? registryEntry.vision
        : typeof model.vision === 'boolean'
          ? model.vision
          : Array.isArray(model.features) && model.features.includes('vision')
            ? true
            : undefined
    // DSH's live directory describes the configured route and takes priority
    // over the signed registry snapshot. Fall back to the registry when the
    // Host omitted a value or supplied a malformed boundary value.
    const contextWindow = firstPositiveSafeInteger(
      model.contextWindow,
      model.maxInputTokens,
      registryEntry?.contextWindow,
    )
    const maxTokens = firstPositiveSafeInteger(
      model.maxTokens,
      model.maxOutputTokens,
      registryEntry?.maxTokens,
    )
    const api = registryEntry?.api || model.api || 'dsh'
    const workBuddyMultiplier = provider.id === 'workbuddy'
      ? normalizeWorkBuddyMultiplier(model.workBuddyMultiplier)
        ?? normalizeWorkBuddyMultiplier(registryEntry?.workBuddyMultiplier)
      : null
    const workBuddyMultiplierStatus = workBuddyMultiplier === null
      ? null
      : ['fresh', 'stale', 'unknown'].includes(model.workBuddyMultiplierStatus)
        ? model.workBuddyMultiplierStatus
        : ['fresh', 'stale', 'unknown'].includes(registryEntry?.workBuddyMultiplierStatus)
          ? registryEntry.workBuddyMultiplierStatus
          : 'unknown'
    const workBuddyMultiplierUpdatedAt = typeof model.workBuddyMultiplierUpdatedAt === 'string'
      && Number.isFinite(Date.parse(model.workBuddyMultiplierUpdatedAt))
      ? new Date(model.workBuddyMultiplierUpdatedAt).toISOString()
      : typeof registryEntry?.workBuddyMultiplierUpdatedAt === 'string'
        && Number.isFinite(Date.parse(registryEntry.workBuddyMultiplierUpdatedAt))
        ? new Date(registryEntry.workBuddyMultiplierUpdatedAt).toISOString()
        : null
    return {
      key,
      provider: provider.id,
      id: model.id,
      name: registryEntry?.name || model.name || model.id,
      api,
      reasoning: reasoningCatalog.reasoning,
      reasoningEfforts: reasoningCatalog.reasoningEfforts,
      supportedThinkingLevels: reasoningCatalog.supportedThinkingLevels.length
        ? reasoningCatalog.supportedThinkingLevels
        : undefined,
      contextWindow,
      maxTokens,
      costPerMillion: { input: cost.input, output: cost.output, cacheRead: cost.cacheRead, cacheWrite: cost.cacheWrite },
      priceMeta: priceMeta ?? getCatalogPriceMeta(),
      available: availableKeys.has(key),
      isTierVariant: false,
      defaultThinkingLevel: reasoningCatalog.defaultThinkingLevel,
      profile,
      source,
      deprecated: Boolean(registryEntry?.deprecated),
      replacementModelKey: registryEntry?.replacementModel || null,
      capabilityCompleteness: [contextWindow, maxTokens, api]
        .filter((value) => Boolean(value)).length / 3,
      registryVersion,
      capabilitySummary: registryEntry?.capabilitySummary || '',
      ...(vision === undefined ? {} : { vision }),
      taskTags: Array.isArray(registryEntry?.taskTags) ? registryEntry.taskTags : [],
      verificationStatus: registryEntry ? 'verified' : (source === 'bundled' ? 'bundled' : 'unverified'),
      routeRegistered,
      ...(workBuddyMultiplier === null
        ? {}
        : {
            workBuddyMultiplier,
            workBuddyMultiplierStatus,
            ...(workBuddyMultiplierUpdatedAt ? { workBuddyMultiplierUpdatedAt } : {}),
          }),
    }
  }
}
