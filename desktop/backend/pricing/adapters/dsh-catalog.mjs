/**
 * DSH 运行时模型目录适配器
 * 从 DSH api.llm.models() 获取模型列表，提取价格信息作为 fallback
 */

/** @typedef {import('../types.mjs').PriceEntry} PriceEntry */

/**
 * 从 DSH 模型目录提取价格信息
 * @param {object} options
 * @param {Function} [options.getDshDirectory] - 获取 DSH 目录的函数（测试注入用）
 * @returns {Promise<Record<string, PriceEntry>>}
 */
export async function fetchDshCatalogPrices(options = {}) {
  const getDshDirectory = options.getDshDirectory
  if (!getDshDirectory) {
    throw new Error('Z Runtime 目录获取函数未提供（请先启动 Z Host）')
  }

  try {
    const directory = await getDshDirectory()
    const models = {}

    for (const group of directory.groups ?? []) {
      const provider = directory.providers?.find(p => p.provider === group.provider)
      if (!provider) continue

      for (const model of group.models ?? []) {
        const key = `${provider.provider}/${model.id}`

        // DSH 模型可能携带价格元数据，如果有则提取
        const pricing = model.pricing || model.cost
        if (pricing) {
          models[key] = {
            input_per_million: pricing.input ?? pricing.inputPerMillion ?? 0,
            output_per_million: pricing.output ?? pricing.outputPerMillion ?? 0,
            cache_read_per_million: pricing.cacheRead ?? pricing.cacheReadPerMillion ?? null,
            cache_write_per_million: pricing.cacheWrite ?? pricing.cacheWritePerMillion ?? null,
            currency: 'USD',
            source: 'adapter:dsh-catalog',
            confidence: 'low',
          }
        }
      }
    }

    return models
  } catch (error) {
    throw new Error(`Z Runtime 目录读取失败: ${error.message}`)
  }
}

export const dshCatalogAdapter = {
  id: 'dsh-catalog',
  fetchPrices: fetchDshCatalogPrices,
}
