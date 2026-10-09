/**
 * @module @z/dsh-llm-taskweaver-bridge/config
 */

import z from '@z/schemastery'
import type { BridgeProviderProfile } from '@z/dsh-bridge-core'

const catalogModel = z.object({
  id: z.string().required(),
  name: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  reasoning: z.boolean(),
  thinkingLevelMap: z.dict(z.string()),
  defaultThinkingLevel: z.string(),
  compat: z.dict(z.any()),
})

const providerProfile = z.object({
  bridgeKind: z.string().required(),
  displayName: z.string().required(),
  models: z.array(catalogModel).default([]),
  loopbackBaseURL: z.string(),
  relayBaseURL: z.string(),
})

/** Settings document shape (schema output is cast at runtime boundaries). */
export interface Config {
  providers?: Record<string, BridgeProviderProfile>
}

export const ConfigSchema = z.object({
  providers: z.dict(providerProfile).default({}),
})

export interface ResolvedBridgeOptions {
  readonly providers: ReadonlyMap<string, BridgeProviderProfile>
}

function asConfig(raw: unknown): Config {
  return raw as Config
}

export function resolveBridgeOptions(raw: Config): ResolvedBridgeOptions {
  const providers = new Map<string, BridgeProviderProfile>()
  for (const [id, profile] of Object.entries(raw.providers ?? {})) {
    if (!profile?.bridgeKind?.trim()) continue
    providers.set(id, profile)
  }
  return { providers }
}

export function parseConfig(raw: unknown): Config {
  return asConfig(ConfigSchema(raw as never))
}
