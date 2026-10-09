import { mergeRegistryCost } from '../price-registry.mjs'
import { reasoningCatalogFromHostModel } from '../reasoning-effort-catalog.mjs'

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
    return {
      key,
      provider: provider.id,
      id: model.id,
      name: registryEntry?.name || model.name || model.id,
      api: registryEntry?.api || 'dsh',
      reasoning: reasoningCatalog.reasoning,
      reasoningEfforts: reasoningCatalog.reasoningEfforts,
      supportedThinkingLevels: reasoningCatalog.supportedThinkingLevels.length
        ? reasoningCatalog.supportedThinkingLevels
        : undefined,
      contextWindow: Number(registryEntry?.contextWindow) || 0,
      maxTokens: Number(registryEntry?.maxTokens) || 0,
      costPerMillion: { input: cost.input, output: cost.output, cacheRead: cost.cacheRead, cacheWrite: cost.cacheWrite },
      priceMeta: priceMeta ?? getCatalogPriceMeta(),
      available: availableKeys.has(key),
      isTierVariant: false,
      defaultThinkingLevel: reasoningCatalog.defaultThinkingLevel,
      profile,
      source,
      deprecated: Boolean(registryEntry?.deprecated),
      replacementModelKey: registryEntry?.replacementModel || null,
      capabilityCompleteness: registryEntry
        ? ['contextWindow', 'maxTokens', 'api'].filter((field) => registryEntry[field]).length / 3
        : 0,
      registryVersion,
      capabilitySummary: registryEntry?.capabilitySummary || '',
      taskTags: Array.isArray(registryEntry?.taskTags) ? registryEntry.taskTags : [],
      verificationStatus: registryEntry ? 'verified' : (source === 'bundled' ? 'bundled' : 'unverified'),
      routeRegistered,
    }
  }
}
