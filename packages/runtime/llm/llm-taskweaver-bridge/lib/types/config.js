/**
 * @module @z/dsh-llm-taskweaver-bridge/config
 */
import z from '@z/schemastery';
const catalogModel = z.object({
    id: z.string().required(),
    name: z.string(),
    contextWindow: z.number().step(1).min(1),
    maxTokens: z.number().step(1).min(1),
    reasoning: z.boolean(),
    thinkingLevelMap: z.dict(z.string()),
    defaultThinkingLevel: z.string(),
    compat: z.dict(z.any()),
});
const providerProfile = z.object({
    bridgeKind: z.string().required(),
    displayName: z.string().required(),
    models: z.array(catalogModel).default([]),
    loopbackBaseURL: z.string(),
    relayBaseURL: z.string(),
});
export const ConfigSchema = z.object({
    providers: z.dict(providerProfile).default({}),
});
function asConfig(raw) {
    return raw;
}
export function resolveBridgeOptions(raw) {
    const providers = new Map();
    for (const [id, profile] of Object.entries(raw.providers ?? {})) {
        if (!profile?.bridgeKind?.trim())
            continue;
        providers.set(id, profile);
    }
    return { providers };
}
export function parseConfig(raw) {
    return asConfig(ConfigSchema(raw));
}
//# sourceMappingURL=config.js.map