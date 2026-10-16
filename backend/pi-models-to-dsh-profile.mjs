/**
 * Map pi `models.json` provider blocks to DSH `llm-pi-ai.providers.<id>` profiles.
 */

import { TASKWEAVER_NATIVE_OAUTH, TASKWEAVER_NATIVE_OAUTH_APIS } from './model/constants.mjs'

const DEFAULT_RETRYABLE_CODES = Object.freeze(['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT'])
const DEFAULT_MAX_PROVIDER_RETRIES = 2
const MAX_PROVIDER_RETRIES = 3

function boundedProviderRetryPolicy(policy) {
  if (!policy || typeof policy !== 'object') {
    return {
      mode: 'normal',
      maxRetries: DEFAULT_MAX_PROVIDER_RETRIES,
      retryableCodes: [...DEFAULT_RETRYABLE_CODES],
    }
  }

  // The shared Z Runtime supports `always`, which retries billable model
  // failures without an attempt limit. TaskWeaver intentionally keeps every
  // provider route finite, even when an imported models.json requests it.
  const mode = policy.mode === 'always' ? 'normal' : policy.mode
  const requestedRetries = policy.maxRetries ?? DEFAULT_MAX_PROVIDER_RETRIES
  const maxRetries = Number.isSafeInteger(requestedRetries) && requestedRetries >= 0
    ? Math.min(MAX_PROVIDER_RETRIES, requestedRetries)
    : requestedRetries

  return {
    ...policy,
    mode,
    maxRetries,
    retryableCodes: Array.isArray(policy.retryableCodes)
      ? policy.retryableCodes
      : [...DEFAULT_RETRYABLE_CODES],
  }
}

export function taskweaverApiKeyEnvRef(providerId) {
  return `TASKWEAVER_${String(providerId).toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_API_KEY`
}

function mapModelEntry(entry) {
  if (!entry || typeof entry !== 'object' || !entry.id) return null
  const row = {
    id: String(entry.id),
    name: String(entry.name ?? entry.id),
  }
  if (Number.isInteger(entry.contextWindow) && entry.contextWindow > 0) {
    row.contextWindow = entry.contextWindow
  }
  if (Number.isInteger(entry.maxTokens) && entry.maxTokens > 0) {
    row.maxTokens = entry.maxTokens
  }
  if (entry.reasoning === true && entry.thinkingLevelMap && typeof entry.thinkingLevelMap === 'object') {
    const efforts = {}
    for (const [level, wire] of Object.entries(entry.thinkingLevelMap)) {
      if (wire === null || wire === undefined || wire === '') {
        if (level === 'off') efforts.off = null
        continue
      }
      efforts[level] = String(wire)
    }
    if (Object.keys(efforts).length) {
      row.reasoningEfforts = efforts
      const defaultLevel = entry.defaultThinkingLevel
      if (typeof defaultLevel === 'string' && defaultLevel.trim()) {
        row.reasoning = { ...(row.reasoning ?? {}), defaultEffort: defaultLevel.trim() }
      }
    }
  } else if (entry.reasoning === false) {
    row.reasoningEfforts = false
  }
  if (entry.compat && typeof entry.compat === 'object') {
    row.compat = entry.compat
  }
  return row
}

/**
 * @param {string} providerId
 * @param {Record<string, unknown>} block
 */
export function piProviderBlockToDshProfile(providerId, block) {
  if (!block || typeof block !== 'object') {
    throw new Error(`提供方 ${providerId} 配置无效`)
  }
  const baseUrl = typeof block.baseUrl === 'string' ? block.baseUrl.trim() : ''
  const api = typeof block.api === 'string' ? block.api.trim() : ''
  const displayName = typeof block.name === 'string' && block.name.trim()
    ? block.name.trim()
    : providerId
  const models = Array.isArray(block.models)
    ? block.models.filter((m) => m && !m.isTierVariant).map(mapModelEntry).filter(Boolean)
    : []
  const modelApis = new Set(
    (Array.isArray(block.models) ? block.models : [])
      .filter((model) => model && typeof model === 'object' && model.id && !model.isTierVariant)
      .map((model) => typeof model.api === 'string' ? model.api.trim() : '')
      .filter(Boolean),
  )
  const nativeOAuthApi = Object.hasOwn(TASKWEAVER_NATIVE_OAUTH_APIS, providerId)
    ? TASKWEAVER_NATIVE_OAUTH_APIS[providerId]
    : undefined
  if (api && [...modelApis].some((modelApi) => modelApi !== api)) {
    throw new Error(`提供方 ${providerId} 的模型 API 与提供方 API 冲突；当前 profile 不支持逐模型 API。`)
  }
  if (!api && modelApis.size > 1) {
    throw new Error(`提供方 ${providerId} 包含多个模型 API；当前 profile 不支持逐模型 API。`)
  }
  if (nativeOAuthApi && ((api && api !== nativeOAuthApi)
    || [...modelApis].some((modelApi) => modelApi !== nativeOAuthApi))) {
    throw new Error(`提供方 ${providerId} 必须使用内置 OAuth 协议 ${nativeOAuthApi}。`)
  }
  // The generic profile schema intentionally excludes provider-specific OAuth
  // protocols. Keep the built-in route intact; its installed model catalog
  // supplies the protocol for models it has not learned by name yet.
  const effectiveApi = nativeOAuthApi && (!api || api === nativeOAuthApi)
    ? undefined
    : api || [...modelApis][0]

  const profile = {
    displayName,
    // OAuth-only routes must leave apiKeyEnv unset so pi-ai can use the
    // provider-native credential store instead of failing on a missing ref.
    ...(Object.hasOwn(TASKWEAVER_NATIVE_OAUTH, providerId)
      ? {}
      : { apiKeyEnv: taskweaverApiKeyEnvRef(providerId) }),
    // Match Z Runtime's pi-ai default so long reasoning turns are not cut off
    // by an application-only shorter timeout. Explicit per-provider timeouts
    // in models.json still win; pre-output timeouts can be retried safely.
    streamIdleTimeoutMs: Number.isFinite(block.streamIdleTimeoutMs) && block.streamIdleTimeoutMs > 0
      ? block.streamIdleTimeoutMs
      : 300_000,
    // Keep billable provider retries bounded. The default is one retry; an
    // explicit normal policy may request up to three. `always` is normalized
    // to normal so a provider config cannot create an unbounded retry loop.
    retryPolicy: boundedProviderRetryPolicy(block.retryPolicy),
  }
  if (effectiveApi) profile.api = effectiveApi
  if (baseUrl) profile.baseURL = baseUrl.replace(/\/+$/, '')
  if (block.compat && typeof block.compat === 'object') {
    profile.compat = block.compat
  }
  if (models.length) profile.models = models
  return profile
}

/**
 * @param {{ providers?: Record<string, unknown> }} modelsDoc
 * @param {string[]} [providerIds] subset; default all keys in doc when omitted
 */
export function profilesFromModelsDoc(modelsDoc, providerIds) {
  const providers = modelsDoc?.providers ?? {}
  const ids = Array.isArray(providerIds) ? providerIds : Object.keys(providers)
  const out = {}
  for (const id of ids) {
    const block = providers[id]
    if (!block || typeof block !== 'object') continue
    out[id] = piProviderBlockToDshProfile(id, block)
  }
  return out
}
