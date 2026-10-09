/**
 * @module @z/dsh-llm-taskweaver-bridge/adapter
 */
import { LlmAdapter, LlmError } from '@z/dsh-llm';
import { streamThroughBridge } from '@z/dsh-bridge-core';
import { resolveDshHome } from '@z/dsh-home-paths';
function modelInfo(provider, entry) {
    return {
        provider,
        id: entry.id,
        name: entry.name ?? entry.id,
        ...entry.contextWindow === undefined ? {} : { contextWindow: entry.contextWindow },
    };
}
export class TaskWeaverBridgeAdapter extends LlmAdapter {
    config;
    constructor(config) {
        super();
        this.config = config;
    }
    providerInfo(provider) {
        const profile = this.config.options().providers.get(provider);
        return {
            id: provider,
            name: profile?.displayName ?? provider,
        };
    }
    listModels(provider) {
        const profile = this.config.options().providers.get(provider);
        if (!profile)
            return Promise.resolve([]);
        return Promise.resolve(profile.models.map((entry) => modelInfo(provider, entry)));
    }
    resolveModel(provider, model) {
        const profile = this.config.options().providers.get(provider);
        const entry = profile?.models.find((row) => row.id === model);
        const contextWindow = entry?.contextWindow;
        return Promise.resolve({
            provider,
            id: model,
            name: entry?.name ?? model,
            inputModalities: ['text'],
            ...contextWindow === undefined ? {} : { context: { contextWindow } },
            ...(entry?.maxTokens === undefined ? {} : { defaultMaxTokens: entry.maxTokens }),
        });
    }
    async prepareCall(provider, model) {
        return {
            model: await this.resolveModel(provider, model),
            stream: (options) => this.streamFor(provider, options),
        };
    }
    async *stream(options) {
        yield* this.streamFor(options.provider, options);
    }
    async *streamFor(provider, options) {
        const resolved = this.config.options();
        const profile = resolved.providers.get(provider);
        if (!profile) {
            throw new LlmError(`taskweaver-bridge: unknown provider route "${provider}"`, 'INVALID_PROVIDER');
        }
        const harnessHome = resolveDshHome();
        yield* streamThroughBridge({
            providerId: provider,
            profile,
            options,
            harnessHome,
        });
    }
}
//# sourceMappingURL=adapter.js.map