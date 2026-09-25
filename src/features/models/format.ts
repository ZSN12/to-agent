import type { CatalogModel, ModelTier } from '../../shared/model-api'
import type { ModelOption } from '../../types'

const tierQuality: Record<ModelTier, string> = {
  cheap: '低',
  balanced: '中',
  strong: '高',
}

export function catalogModelToOption(model: CatalogModel): ModelOption {
  const tier = model.profile?.tier ?? inferTierFromCost(model)
  return {
    id: model.key,
    name: model.name,
    quality: tierQuality[tier],
    reasoning: model.reasoning,
    thinkingLevel: model.profile?.thinkingLevel,
  }
}

function inferTierFromCost(model: CatalogModel): ModelTier {
  const out = model.costPerMillion.output
  if (out <= 1) return 'cheap'
  if (out >= 15) return 'strong'
  return 'balanced'
}

export function formatCostPerMillion(value: number): string {
  if (value === 0) return '—'
  if (value < 1) return `$${value.toFixed(2)}/M`
  return `$${value.toFixed(1)}/M`
}
