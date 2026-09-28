import type { CatalogModel } from '../../shared/model-api'
import type { ModelOption } from '../../types'

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

  let cleanKey = modelKey || ''
  const prefixes = [
    'opencodex/cursor/',
    'opencodex/',
    'google-antigravity/',
    'antigravity/',
    'openai-codex/',
    'openai/',
    'cursor/',
    'anthropic/',
    'deepseek/',
  ]

  for (const prefix of prefixes) {
    if (cleanKey.startsWith(prefix)) {
      cleanKey = cleanKey.slice(prefix.length)
      break
    }
  }

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
    displayName,
    quality: '', // 彻底移除面向用户的低/中/高文案
    reasoning: model.reasoning,
    thinkingLevel: model.profile?.thinkingLevel,
    supportedThinkingLevels: model.supportedThinkingLevels,
    defaultThinkingLevel: model.defaultThinkingLevel,
  }
}

export function formatCostPerMillion(value: number): string {
  if (value === 0) return '—'
  if (value < 1) return `$${value.toFixed(2)}/M`
  return `$${value.toFixed(1)}/M`
}
