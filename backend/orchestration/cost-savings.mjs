const TOKEN_FIELDS = Object.freeze([
  ['inputTokens', 'input', 'promptTokens'],
  ['outputTokens', 'output', 'completionTokens'],
  ['cacheReadTokens', 'cacheRead', null],
  ['cacheWriteTokens', 'cacheWrite', null],
])

const PRICE_MAX_AGE_MS = 48 * 60 * 60 * 1000
const ALLOWED_PRICE_CONFIDENCE = new Set(['high', 'medium', 'curated', 'official', 'verified'])
const WARNING_MESSAGES = Object.freeze({
  invalid_records: '用量记录格式无效，无法完整估算。',
  invalid_usage: '部分调用的 Token 用量无效，相关成本未计入。',
  missing_model_key: '部分调用缺少模型标识，无法估算其路由成本。',
  missing_model_price: '部分调用没有对应模型的价格快照。',
  missing_price_metadata: '部分模型缺少价格可信度元数据。',
  stale_price: '价格快照包含过期价格，无法将其用于完整对比。',
  low_confidence_price: '价格快照包含低置信度价格，无法将其用于完整对比。',
  unknown_price_confidence: '部分模型的价格可信度未知，无法将其用于完整对比。',
  missing_currency: '部分模型没有有效币种，无法完整汇总成本。',
  missing_price: '部分调用所需的 Token 单价缺失；缺失价格未按免费处理。',
  missing_flagship_reference: '没有可用的旗舰参考模型，无法计算反事实基线。',
  missing_flagship_price: '旗舰参考模型缺少可信价格，无法计算完整基线。',
  mixed_currency: '价格快照包含多种币种，未合并币种或计算节省比例。',
  comparison_currency_mismatch: '路由成本与旗舰基线币种不一致，未计算节省比例。',
  zero_flagship_baseline: '旗舰基线为零，节省比例没有定义。',
  no_usage_records: '本轮没有可估算的模型调用记录。',
})

function finiteNonNegativeInteger(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : null
}

function tokenValue(usage, primary, fallback) {
  const raw = usage?.[primary] ?? (fallback ? usage?.[fallback] : undefined) ?? 0
  return finiteNonNegativeInteger(raw)
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return { valid: false, values: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }
  }

  const values = {}
  let valid = TOKEN_FIELDS.some(([field, , fallback]) => usage[field] != null || (fallback && usage[fallback] != null))
  for (const [field, , fallback] of TOKEN_FIELDS) {
    const value = tokenValue(usage, field, fallback)
    if (value === null) {
      valid = false
      values[field] = 0
    } else {
      values[field] = value
    }
  }
  return { valid, values }
}

function normalizeCurrency(value) {
  if (typeof value !== 'string') return null
  const currency = value.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(currency) ? currency : null
}

function priceIsStale(meta, capturedAt) {
  if (meta.stale === true) return true
  const staleDays = Number(meta.stale_days ?? meta.staleDays)
  if (Number.isFinite(staleDays) && staleDays > 2) return true
  const capturedTimestamp = Date.parse(capturedAt ?? '')
  const syncedTimestamp = Date.parse(meta.synced_at ?? meta.syncedAt ?? '')
  return Number.isFinite(capturedTimestamp)
    && Number.isFinite(syncedTimestamp)
    && capturedTimestamp - syncedTimestamp > PRICE_MAX_AGE_MS
}

function resolveModelPrice(model, { reference = false, capturedAt = null } = {}) {
  if (!model || typeof model !== 'object') return { ok: false, reason: reference ? 'missing_flagship_price' : 'missing_model_price' }
  const meta = model.priceMeta
  if (!meta || typeof meta !== 'object') return { ok: false, reason: 'missing_price_metadata' }
  if (priceIsStale(meta, capturedAt)) return { ok: false, reason: 'stale_price' }
  if (String(meta.confidence ?? '').toLowerCase() === 'low') return { ok: false, reason: 'low_confidence_price' }
  if (!ALLOWED_PRICE_CONFIDENCE.has(String(meta.confidence ?? '').toLowerCase())) {
    return { ok: false, reason: 'unknown_price_confidence' }
  }

  const currency = normalizeCurrency(meta.currency ?? model.currency)
  if (!currency) return { ok: false, reason: 'missing_currency' }
  const rates = model.costPerMillion ?? model.ratesPerMillion
  if (!rates || typeof rates !== 'object') return { ok: false, reason: reference ? 'missing_flagship_price' : 'missing_model_price' }

  return { ok: true, currency, rates, meta }
}

function readRate(price, field) {
  const { rates, meta } = price
  const rate = rates[field]
  if (rate === null || rate === undefined || (typeof rate === 'string' && rate.trim() === '')) return null
  const number = Number(rate)
  if (!Number.isFinite(number) || number < 0) return null

  const presenceKey = {
    input: 'hasInputPrice',
    output: 'hasOutputPrice',
    cacheRead: 'hasCacheReadPrice',
    cacheWrite: 'hasCacheWritePrice',
  }[field]
  const declared = meta[presenceKey]
  if (declared === false) return null
  // Input/output need explicit price evidence. Cache prices predate presence
  // flags in the model catalog: a positive rate is evidence, while a zero rate
  // must be explicitly declared so a default zero cannot masquerade as free.
  if (field === 'input' || field === 'output') return declared === true ? number : null
  if (declared === true || number > 0) return number
  return null
}

function priceUsage(usageValues, price) {
  let amount = 0
  for (const [tokenField, priceField] of TOKEN_FIELDS) {
    const tokens = usageValues[tokenField]
    if (tokens === 0) continue
    const rate = readRate(price, priceField)
    if (rate === null) return { ok: false, reason: 'missing_price' }
    const component = tokens * rate / 1_000_000
    if (!Number.isFinite(component)) return { ok: false, reason: 'missing_price' }
    amount += component
  }
  return Number.isFinite(amount) ? { ok: true, amount, currency: price.currency } : { ok: false, reason: 'missing_price' }
}

function aggregateCosts(items, totalCalls, warn) {
  const amounts = new Map()
  let pricedCalls = 0
  for (const item of items) {
    if (!item.ok) {
      warn(item.reason, item.modelKey ? { modelKey: item.modelKey } : undefined)
      continue
    }
    pricedCalls += 1
    amounts.set(item.currency, (amounts.get(item.currency) ?? 0) + item.amount)
  }

  const byCurrency = Object.fromEntries([...amounts.entries()].map(([currency, amount]) => [currency, amount]))
  const complete = totalCalls > 0 && pricedCalls === totalCalls && amounts.size === 1
  const mixedCurrency = amounts.size > 1
  if (mixedCurrency) warn('mixed_currency')
  const currency = amounts.size === 1 ? amounts.keys().next().value : null
  return {
    amount: complete ? amounts.get(currency) : null,
    currency,
    byCurrency,
    pricedCalls,
    totalCalls,
    coverageRatio: totalCalls > 0 ? pricedCalls / totalCalls : 0,
    complete,
  }
}

/**
 * Capture only public model pricing metadata for a stable per-run comparison.
 * The reference model is the most expensive available strong-tier model in
 * the same catalog snapshot, which keeps the counterfactual explicit and
 * repeatable instead of assuming that a provider name implies a flagship.
 */
export function createRunPricingSnapshot(catalog, capturedAt = new Date().toISOString()) {
  const catalogModels = [
    ...(Array.isArray(catalog?.models) ? catalog.models : []),
    ...(Array.isArray(catalog?.candidateModels) ? catalog.candidateModels : []),
  ]
  const uniqueModels = new Map()
  for (const model of catalogModels) {
    if (typeof model?.key !== 'string' || !model.key) continue
    const previous = uniqueModels.get(model.key)
    if (!previous || (previous.available !== true && model.available === true)) uniqueModels.set(model.key, model)
  }

  const models = Object.fromEntries([...uniqueModels.values()].map((model) => [model.key, {
    costPerMillion: model.costPerMillion ?? model.ratesPerMillion ?? {},
    priceMeta: model.priceMeta ?? null,
  }]))
  const strongModels = [...uniqueModels.values()]
    .filter((model) => {
      const tier = typeof model.capabilityTier === 'string' ? model.capabilityTier : model.capabilityTier?.tier
      if (tier !== 'strong' || model.available !== true) return false
      const price = resolveModelPrice(models[model.key], { reference: true, capturedAt })
      return price.ok && readRate(price, 'input') !== null && readRate(price, 'output') !== null
    })
    .sort((left, right) => {
      const outputDelta = (Number(right.costPerMillion?.output) || 0) - (Number(left.costPerMillion?.output) || 0)
      if (outputDelta !== 0) return outputDelta
      const inputDelta = (Number(right.costPerMillion?.input) || 0) - (Number(left.costPerMillion?.input) || 0)
      if (inputDelta !== 0) return inputDelta
      const contextDelta = (Number(right.contextWindow) || 0) - (Number(left.contextWindow) || 0)
      if (contextDelta !== 0) return contextDelta
      return String(left.key).localeCompare(String(right.key))
    })

  return {
    capturedAt: typeof capturedAt === 'string' ? capturedAt : new Date().toISOString(),
    flagshipModelKey: strongModels[0]?.key ?? null,
    models,
  }
}

/**
 * Estimate one DAG run using the immutable model price snapshot captured for
 * that run. Missing prices never count as zero. Runtime-supplied `costUsd` is
 * intentionally ignored here so routed and flagship costs use the same rates.
 *
 * @param {Array<{taskId?: string, modelKey?: string, usage?: object}>} records UsageLedger records for one run.
 * @param {{capturedAt?: string|null, flagshipModelKey?: string|null, models?: Record<string, object>}} pricingSnapshot
 */
export function calculateCostSavings(records, pricingSnapshot = {}) {
  const warnings = []
  const warningKeys = new Set()
  const warn = (code, detail = undefined) => {
    const key = `${code}:${detail?.modelKey ?? ''}`
    if (warningKeys.has(key)) return
    warningKeys.add(key)
    warnings.push({
      code,
      message: WARNING_MESSAGES[code] ?? '成本估算不完整。',
      ...(detail?.modelKey ? { modelKey: detail.modelKey } : {}),
    })
  }

  const safeRecords = Array.isArray(records) ? records : []
  if (!Array.isArray(records)) warn('invalid_records')
  if (safeRecords.length === 0) warn('no_usage_records')

  const tokenTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
  }
  const models = pricingSnapshot?.models && typeof pricingSnapshot.models === 'object'
    ? pricingSnapshot.models
    : {}
  const flagshipModelKey = typeof pricingSnapshot?.flagshipModelKey === 'string'
    ? pricingSnapshot.flagshipModelKey
    : null
  const capturedAt = typeof pricingSnapshot?.capturedAt === 'string' ? pricingSnapshot.capturedAt : null
  const flagship = flagshipModelKey
    ? resolveModelPrice(models[flagshipModelKey], { reference: true, capturedAt })
    : null
  if (!flagshipModelKey) warn('missing_flagship_reference')
  else if (!flagship.ok) warn(flagship.reason, { modelKey: flagshipModelKey })

  const routedItems = []
  const flagshipItems = []

  for (const record of safeRecords) {
    const normalized = normalizeUsage(record?.usage)
    const usage = normalized.values
    for (const [field] of TOKEN_FIELDS) tokenTotals[field] += usage[field]
    if (!normalized.valid) warn('invalid_usage', record?.modelKey ? { modelKey: record.modelKey } : undefined)

    const modelKey = typeof record?.modelKey === 'string' && record.modelKey.length > 0 ? record.modelKey : null
    if (!modelKey) {
      warn('missing_model_key')
      routedItems.push({ ok: false, reason: 'missing_model_key' })
    } else {
      const routePrice = resolveModelPrice(models[modelKey], { capturedAt })
      if (!routePrice.ok) {
        routedItems.push({ ok: false, reason: routePrice.reason, modelKey })
      } else if (!normalized.valid) {
        routedItems.push({ ok: false, reason: 'invalid_usage', modelKey })
      } else {
        routedItems.push({ ...priceUsage(usage, routePrice), modelKey })
      }
    }

    if (!flagship?.ok) {
      flagshipItems.push({ ok: false, reason: 'missing_flagship_price', ...(flagshipModelKey ? { modelKey: flagshipModelKey } : {}) })
    } else if (!normalized.valid) {
      flagshipItems.push({ ok: false, reason: 'invalid_usage', modelKey: flagshipModelKey })
    } else {
      flagshipItems.push({ ...priceUsage(usage, flagship), modelKey: flagshipModelKey })
    }
  }

  tokenTotals.totalTokens = tokenTotals.inputTokens
    + tokenTotals.outputTokens
    + tokenTotals.cacheReadTokens
    + tokenTotals.cacheWriteTokens

  const routedCost = aggregateCosts(routedItems, safeRecords.length, warn)
  const flagshipBaseline = aggregateCosts(flagshipItems, safeRecords.length, warn)
  const savings = { amount: null, amountUsd: null, percent: null, currency: null }
  if (routedCost.complete && flagshipBaseline.complete) {
    if (routedCost.currency !== flagshipBaseline.currency) {
      warn('comparison_currency_mismatch')
    } else if (flagshipBaseline.amount === 0) {
      warn('zero_flagship_baseline')
    } else {
      const amount = flagshipBaseline.amount - routedCost.amount
      savings.amount = amount
      savings.currency = flagshipBaseline.currency
      savings.amountUsd = savings.currency === 'USD' ? amount : null
      savings.percent = amount / flagshipBaseline.amount * 100
    }
  }

  return {
    schemaVersion: 1,
    capturedAt: typeof pricingSnapshot?.capturedAt === 'string' ? pricingSnapshot.capturedAt : null,
    tokenTotals,
    routedCost,
    flagshipBaseline: { ...flagshipBaseline, modelKey: flagshipModelKey },
    savings,
    coverage: {
      totalCalls: safeRecords.length,
      routedPricedCalls: routedCost.pricedCalls,
      routedRatio: routedCost.coverageRatio,
      routedComplete: routedCost.complete,
      flagshipPricedCalls: flagshipBaseline.pricedCalls,
      flagshipRatio: flagshipBaseline.coverageRatio,
      flagshipComplete: flagshipBaseline.complete,
      complete: routedCost.complete && flagshipBaseline.complete && savings.percent !== null,
    },
    warnings,
  }
}
