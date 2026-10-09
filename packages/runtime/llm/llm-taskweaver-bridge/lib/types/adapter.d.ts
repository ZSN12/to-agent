/**
 * @module @z/dsh-llm-taskweaver-bridge/adapter
 */
import { LlmAdapter } from '@z/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, PreparedAdapterCall, StreamChunk } from '@z/dsh-llm';
import type { ResolvedBridgeOptions } from './config.ts';
export interface TaskWeaverBridgeAdapterOptions {
    readonly options: () => ResolvedBridgeOptions;
}
export declare class TaskWeaverBridgeAdapter extends LlmAdapter {
    private readonly config;
    constructor(config: TaskWeaverBridgeAdapterOptions);
    providerInfo(provider: string): LlmProviderInfo;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    prepareCall(provider: string, model: string): Promise<PreparedAdapterCall>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    private streamFor;
}
//# sourceMappingURL=adapter.d.ts.map