import { TASKWEAVER_NATIVE_OAUTH } from './constants.mjs'

export function dshValue(response, operation) {
  const result = response?.result ?? response
  if (result?.ok === false) throw new Error(result.error?.message || `${operation}失败`)
  return result?.value ?? result
}

export function atPath(value, pathParts) {
  return pathParts.reduce((current, key) => current && typeof current === 'object' ? current[key] : undefined, value)
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function normalizeSettingsNs(value) {
  return String(value ?? '').trim()
}

export function findSettingsNamespace(namespaces, settingsNs) {
  const target = normalizeSettingsNs(settingsNs)
  if (!target) return undefined
  return (namespaces ?? []).find((item) => normalizeSettingsNs(item?.ns) === target)
}

export function providerSettings(directory, provider) {
  const ns = findSettingsNamespace(directory.namespaces, provider.settingsNs)
  return { namespace: ns, value: atPath(ns?.value, provider.settingsPath ?? []) }
}

export function registryModels(registry) {
  return Object.entries(registry?.models ?? {}).flatMap(([key, value]) => {
    if (!value || typeof value !== 'object') return []
    const slash = key.indexOf('/')
    const provider = value.provider || (slash > 0 ? key.slice(0, slash) : '')
    const id = value.id || (slash > 0 ? key.slice(slash + 1) : '')
    return provider && id ? [{ ...value, key: `${provider}/${id}`, provider, id }] : []
  })
}

export function registryModelProfile(model) {
  const profile = { id: model.id, name: model.name || model.id }
  if (Number.isInteger(model.contextWindow) && model.contextWindow > 0) profile.contextWindow = model.contextWindow
  if (Number.isInteger(model.maxTokens) && model.maxTokens > 0) profile.maxTokens = model.maxTokens
  if (Array.isArray(model.input) && model.input.length) profile.input = model.input
  if (model.reasoningEfforts === false) profile.reasoningEfforts = false
  else if (model.reasoningEfforts && typeof model.reasoningEfforts === 'object') {
    profile.reasoningEfforts = model.reasoningEfforts
  }
  return profile
}

export function schemaValuesAtPath(schema, pathParts) {
  const refs = schema?.refs ?? {}
  let node = refs[String(schema?.uid)]
  const resolve = (value) => typeof value === 'number' || typeof value === 'string'
    ? (refs[String(value)] ?? value)
    : value
  node = resolve(node)
  for (const part of pathParts) {
    node = resolve(node)
    let child = node?.dict?.[part] ?? node?.fields?.[part]
    if (child === undefined && node?.type === 'dict') child = node.inner
    if (child === undefined) return []
    node = resolve(child)
  }
  const values = new Set()
  const visit = (current, seen = new Set()) => {
    current = resolve(current)
    if (!current || typeof current !== 'object' || seen.has(current)) return
    seen.add(current)
    if (current.type === 'const' && typeof current.value === 'string') values.add(current.value)
    for (const ref of current.list ?? []) visit(ref, seen)
    for (const ref of Object.values(current.dict ?? {})) visit(ref, seen)
    if (current.inner !== undefined) visit(current.inner, seen)
  }
  visit(node)
  return [...values]
}

export function formatOAuthError(error) {
  const message = error instanceof Error ? error.message : String(error)
  if (/unsupported_country_region_territory/i.test(message)) {
    return message
  }
  if (/fetch failed/i.test(message)) {
    return '无法连接 OpenAI 授权服务器（fetch failed）。请检查网络、系统代理或防火墙后重试；若浏览器能打开 openai.com，请开启系统代理使 TaskWeaver 与浏览器走同一路径。'
  }
  if (/授权兑换失败 \(403\)|授权兑换被拒绝 \(403\)/i.test(message)) {
    return message
  }
  return message
}

/** Custom gateways are probed on demand (「探测最新模型」); skip idle /v1/models on routine catalog reads. */
export function shouldLiveDiscoverProvider(providerId, addedModelKeys) {
  const id = String(providerId ?? '')
  if (!id.startsWith('custom-')) return true
  const prefix = `${id}/`
  return addedModelKeys.some((key) => String(key).startsWith(prefix))
}

export function hasPiAiSettingsNamespace(directory) {
  if (findSettingsNamespace(directory.namespaces, 'llm-pi-ai')) return true
  return (directory.providers ?? []).some((row) => row.settingsNs === 'llm-pi-ai')
}

export function defaultPiAiProviderRow(providerId, displayName = providerId) {
  return {
    provider: providerId,
    displayName: displayName || providerId,
    settingsNs: 'llm-pi-ai',
    settingsPath: ['providers', providerId],
    active: false,
  }
}

export function synthesizeProviderRowFromGroup(directory, group) {
  if (String(group.id).startsWith('custom-') || !hasPiAiSettingsNamespace(directory)) {
    return {
      provider: group.id,
      displayName: group.name || group.id,
      active: true,
      settingsNs: undefined,
      settingsPath: [],
    }
  }
  return { ...defaultPiAiProviderRow(group.id, group.name || group.id), active: true }
}

export function providerRowsForAuth(directory) {
  const byId = new Map()
  for (const provider of directory.providers ?? []) {
    byId.set(provider.provider, provider)
  }
  for (const group of directory.groups ?? []) {
    if (!byId.has(group.id)) {
      byId.set(group.id, synthesizeProviderRowFromGroup(directory, group))
    }
  }
  return [...byId.values()]
}

export function resolveProviderRow(directory, providerId) {
  const fromProviders = directory.providers?.find((item) => item.provider === providerId)
  if (fromProviders) {
    if (fromProviders.settingsNs || String(providerId).startsWith('custom-')) return fromProviders
    if (hasPiAiSettingsNamespace(directory)) {
      return {
        ...defaultPiAiProviderRow(providerId, fromProviders.displayName || providerId),
        ...fromProviders,
        settingsNs: 'llm-pi-ai',
        settingsPath: fromProviders.settingsPath?.length
          ? fromProviders.settingsPath
          : ['providers', providerId],
      }
    }
    return fromProviders
  }
  const fromDirectory = providerRowsForAuth(directory).find((item) => item.provider === providerId)
  if (fromDirectory) return fromDirectory
  if (!String(providerId).startsWith('custom-') && hasPiAiSettingsNamespace(directory)) {
    return defaultPiAiProviderRow(providerId)
  }
  return null
}

export { TASKWEAVER_NATIVE_OAUTH }
