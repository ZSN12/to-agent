import type { CatalogModel, CustomProviderEntry, ProviderAuthStatus } from '../../../shared/model-api'

export type ModelSourceGroup = {
  id: string
  name: string
  kind: 'codex' | 'anthropic' | 'custom' | 'builtin'
  configured: boolean
  authType?: string | null
  writable?: boolean
  models: CatalogModel[]
  rawCustomEntry?: CustomProviderEntry
}

export function buildModelSourceGroups({
  auth,
  models,
  customList,
  query,
  isCodexConfigured,
}: {
  auth: ProviderAuthStatus[] | null | undefined
  models: CatalogModel[] | null | undefined
  customList: CustomProviderEntry[]
  query: string
  isCodexConfigured: boolean
}): ModelSourceGroup[] {
  const list: ModelSourceGroup[] = []

  // Safety checks for undefined props
  if (!auth || !models) return list

  const q = query.trim().toLowerCase()
  const seenProviderIds = new Set<string>()
  const modelsByProvider = new Map<string, CatalogModel[]>()
  let usesBuiltInBridge = false
  for (const model of models) {
    const providerId = model.provider
    const bucket = modelsByProvider.get(providerId)
    if (bucket) bucket.push(model)
    else modelsByProvider.set(providerId, [model])
    usesBuiltInBridge ||= providerId === 'bridge-composer' || model.key.startsWith('bridge-')
  }
  usesBuiltInBridge ||= auth.some((provider) => provider.id === 'bridge-composer')

  const matchesByProvider = new Map<string, CatalogModel[]>()
  const matchingModels = (providerId: string): CatalogModel[] => {
    const previous = matchesByProvider.get(providerId)
    if (previous) return previous
    const bucket = modelsByProvider.get(providerId) ?? []
    const matched = q ? bucket.filter((model) => `${model.name} ${model.id} ${model.key}`.toLowerCase().includes(q)) : bucket
    matchesByProvider.set(providerId, matched)
    return matched
  }

  // 1. OpenAI Codex
  if (isCodexConfigured || modelsByProvider.has('openai-codex')) {
    seenProviderIds.add('openai-codex')
    const matchedModels = matchingModels('openai-codex')
    const matchSource = !q || 'openai codex chatgpt 订阅'.includes(q)
    if (matchSource || matchedModels.length > 0) {
      list.push({
        id: 'openai-codex',
        name: 'ChatGPT 订阅 (Codex)',
        kind: 'codex',
        configured: isCodexConfigured,
        models: matchedModels,
      })
    }
  }

  // Anthropic's official Claude Pro/Max subscription uses the DSH/Pi OAuth flow.
  const anthropic = auth.find((provider) => provider.id === 'anthropic')
  if (anthropic && (anthropic.authorizationMethods?.some((method) => method.id === 'oauth') || anthropic.configured || modelsByProvider.has('anthropic'))) {
    seenProviderIds.add('anthropic')
    const matchedModels = matchingModels('anthropic')
    const matchSource = !q || 'anthropic claude 订阅'.includes(q)
    if (matchSource || matchedModels.length > 0) {
      list.push({
        id: 'anthropic', name: 'Claude 订阅 (Anthropic)', kind: 'anthropic',
        configured: anthropic.configured,
        models: matchedModels,
      })
    }
  }

  // 2. 自定义网关 (Custom Providers)
  for (const cp of customList) {
    seenProviderIds.add(cp.id)
    const matchedModels = matchingModels(cp.id)
    const matchSource = !q || `${cp.name} ${cp.id} ${cp.baseUrl}`.toLowerCase().includes(q)
    if (matchSource || matchedModels.length > 0) {
      list.push({
        id: cp.id,
        name: cp.name || cp.id,
        kind: 'custom',
        configured: true,
        models: matchedModels,
        rawCustomEntry: cp,
      })
    }
  }

  // 3. 已配置或已有模型的官方提供商
  const builtinProviders = auth.filter(
    (p) => (p.configured || modelsByProvider.has(p.id))
      && p.id !== 'openai-codex'
      && p.id !== 'anthropic'
      && !p.id.startsWith('custom-')
      && !(p.id === 'opencodex' && usesBuiltInBridge && !modelsByProvider.has('opencodex')),
  )
  for (const p of builtinProviders) {
    seenProviderIds.add(p.id)
    const matchedModels = matchingModels(p.id)
    const matchSource = !q || `${p.name} ${p.id}`.toLowerCase().includes(q)
    if (matchSource || matchedModels.length > 0) {
      list.push({
        id: p.id,
        name: p.name,
        kind: 'builtin',
        configured: p.configured,
        authType: p.authType,
        writable: p.writable,
        models: matchedModels,
      })
    }
  }

  // 4. 兜底：models 中如果有属于未被上面捕获的 provider（如本地扫描或外部注入）
  for (const providerId of modelsByProvider.keys()) {
    if (!seenProviderIds.has(providerId)) {
      seenProviderIds.add(providerId)
      const matchedModels = matchingModels(providerId)
      const matchSource = !q || providerId.toLowerCase().includes(q)
      if (matchSource || matchedModels.length > 0) {
        list.push({
          id: providerId,
          name: providerId,
          kind: 'builtin',
          configured: true,
          models: matchedModels,
        })
      }
    }
  }

  return list
}
