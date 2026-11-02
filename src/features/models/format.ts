import type { CatalogModel } from '../../shared/model-api'
import type { ModelOption } from '../../types'

const MODEL_ID_PREFIXES = [
  'opencodex/cursor/',
  'opencodex/',
  'google-antigravity/',
  'antigravity/',
  'openai-codex/',
  'openai/',
  'bridge-antigravity/',
  'bridge-composer/',
  'cursor/',
  'anthropic/',
  'deepseek/',
  'workbuddy/',
]

/**
 * Providers whose model IDs carry a namespace only to tell apart models that
 * would otherwise share an ID (WorkBuddy uses `workbuddy-ai/<id>` when two of
 * its local endpoints list the same model), so the namespace must stay visible.
 */
const NAMESPACE_SIGNIFICANT_PROVIDERS = new Set(['workbuddy'])

/** Hide transport/provider namespaces in UI labels while keeping route IDs intact. */
export function getCleanModelId(modelId: string, providerId?: string): string {
  let cleanId = modelId || ''
  if (providerId && NAMESPACE_SIGNIFICANT_PROVIDERS.has(providerId)) return cleanId
  const prefixes = [
    ...(providerId ? [`${providerId}/`] : []),
    ...(providerId === 'bridge-antigravity' ? ['google-antigravity/'] : []),
    ...(providerId === 'bridge-composer' ? ['opencodex/cursor/', 'opencodex/'] : []),
    ...MODEL_ID_PREFIXES,
  ]
  for (const prefix of prefixes) {
    if (cleanId.startsWith(prefix)) {
      cleanId = cleanId.slice(prefix.length)
      break
    }
  }
  return cleanId
}

/**
 * 将底层 modelKey 转为干净、易读且不暴露渠道经济学的用户展示名称 (displayName)
 * 如 "google-antigravity/gemini-3.8-flash-medium" -> "Gemini 3.8 Flash"
 */
export function getCleanModelName(modelKey: string, rawName?: string): string {
  const prettyMap: Record<string, string> = {
    'composer-2.5': 'Composer 2.5',
    'grok-4.6': 'Grok 4.6',
    'gpt-5.5': 'GPT-5.5',
    'gpt-5.3-codex-spark': 'Codex Spark',
    'gemini-3.8-flash-medium': 'Gemini 3.8 Flash',
    'gemini-3.8-pro': 'Gemini 3.8 Pro',
    'deepseek-chat': 'DeepSeek V3',
    'deepseek-reasoner': 'DeepSeek R1',
  }

  const cleanKey = getCleanModelId(modelKey)

  if (prettyMap[cleanKey]) return prettyMap[cleanKey]
  if (rawName && !rawName.includes('/')) return rawName
  return cleanKey
    .split(/[-_/]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function catalogModelToOption(model: CatalogModel): ModelOption {
  const displayName = getCleanModelName(model.key, model.name)
  return {
    id: model.key,
    name: displayName,
    contextWindow: model.contextWindow,
    displayName,
    quality: '', // 彻底移除面向用户的低/中/高文案
    reasoning: model.reasoning,
    thinkingLevel: model.profile?.thinkingLevel,
    supportedThinkingLevels: model.supportedThinkingLevels,
    reasoningEfforts: model.reasoningEfforts,
    defaultThinkingLevel: model.defaultThinkingLevel,
    vision: model.vision,
  }
}

/** Keep identical model names distinguishable when multiple providers expose them. */
export function catalogModelsToOptions(models: CatalogModel[]): ModelOption[] {
  const options = models.map(catalogModelToOption)
  const counts = new Map<string, number>()
  for (const option of options) counts.set(option.displayName ?? option.name, (counts.get(option.displayName ?? option.name) ?? 0) + 1)

  return options.map((option, index) => {
    const baseName = option.displayName ?? option.name
    if ((counts.get(baseName) ?? 0) < 2) return option
    const provider = models[index]?.provider
    const source = provider === 'bridge-composer'
      ? 'Cursor'
      : provider === 'bridge-antigravity'
        ? 'Antigravity'
        : provider === 'openai-codex'
          ? 'Codex'
          : provider
    if (!source) return option
    const displayName = `${baseName} · ${source}`
    return { ...option, name: displayName, displayName }
  })
}

export function formatCostPerMillion(value: number): string {
  if (value === 0) return '—'
  if (value < 1) return `$${value.toFixed(2)}/M`
  return `$${value.toFixed(1)}/M`
}
