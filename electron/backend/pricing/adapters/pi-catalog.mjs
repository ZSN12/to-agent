import { ModelRuntime } from '../../../agent/agent-runtime.mjs'

function modelKey(model) {
  return `${model.provider}/${model.id}`
}

/** @returns {Promise<Record<string, import('../types.mjs').PriceEntry>>} */
export async function fetchPiCatalogPrices() {
  const runtime = await ModelRuntime.create({ allowModelNetwork: false })
  const models = runtime.getModels()
  const out = {}
  for (const model of models) {
    if (!model.cost) continue
    const key = modelKey(model)
    out[key] = {
      input_per_million: model.cost.input,
      output_per_million: model.cost.output,
      cache_read_per_million: model.cost.cacheRead ?? null,
      cache_write_per_million: model.cost.cacheWrite ?? null,
      currency: 'USD',
      source: 'adapter:runtime-catalog',
      confidence: 'medium',
    }
  }
  return out
}

export const piCatalogAdapter = {
  id: 'runtime-catalog',
  officialUrls: [],
  fetchPrices: fetchPiCatalogPrices,
}
