/**
 * @module @z/dsh-llm-taskweaver-bridge/adapter
 */

import { LlmAdapter, LlmError } from '@z/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  PreparedAdapterCall,
  StreamChunk,
} from '@z/dsh-llm'
import { streamThroughBridge } from '@z/dsh-bridge-core'
import type { BridgeCatalogModel, BridgeProviderProfile } from '@z/dsh-bridge-core'
import { resolveDshHome } from '@z/dsh-home-paths'
import type { ResolvedBridgeOptions } from './config.ts'

export interface TaskWeaverBridgeAdapterOptions {
  readonly options: () => ResolvedBridgeOptions
}

function modelInfo(provider: string, entry: BridgeProviderProfile['models'][number]): LlmModelInfo {
  return {
    provider,
    id: entry.id,
    name: entry.name ?? entry.id,
    ...entry.contextWindow === undefined ? {} : { contextWindow: entry.contextWindow },
  }
}

export class TaskWeaverBridgeAdapter extends LlmAdapter {
  constructor(private readonly config: TaskWeaverBridgeAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    const profile = this.config.options().providers.get(provider)
    return {
      id: provider,
      name: profile?.displayName ?? provider,
    }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const profile = this.config.options().providers.get(provider)
    if (!profile) return Promise.resolve([])
    return Promise.resolve(profile.models.map((entry: BridgeCatalogModel) => modelInfo(provider, entry)))
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const profile = this.config.options().providers.get(provider)
    const entry = profile?.models.find((row: BridgeCatalogModel) => row.id === model)
    const contextWindow = entry?.contextWindow
    return Promise.resolve({
      provider,
      id: model,
      name: entry?.name ?? model,
      inputModalities: ['text'],
      ...contextWindow === undefined ? {} : { context: { contextWindow } },
      ...(entry?.maxTokens === undefined ? {} : { defaultMaxTokens: entry.maxTokens }),
    })
  }

  override async prepareCall(provider: string, model: string): Promise<PreparedAdapterCall> {
    return {
      model: await this.resolveModel(provider, model),
      stream: (options) => this.streamFor(provider, options),
    }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield* this.streamFor(options.provider, options)
  }

  private async *streamFor(provider: string, options: GenerateOptions): AsyncIterable<StreamChunk> {
    const resolved = this.config.options()
    const profile = resolved.providers.get(provider)
    if (!profile) {
      throw new LlmError(
        `taskweaver-bridge: unknown provider route "${provider}"`,
        'INVALID_PROVIDER',
      )
    }
    const harnessHome = resolveDshHome()
    yield* streamThroughBridge({
      providerId: provider,
      profile,
      options,
      harnessHome,
    })
  }
}
