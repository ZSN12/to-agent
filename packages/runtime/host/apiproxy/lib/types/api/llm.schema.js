"use strict";
/**
 * llm domain zod schemas (names derived from map keys: llmProvidersRequestSchema /
 * llmProvidersValueSchema / llmModelsRequestSchema / llmModelsValueSchema).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmDiscoverModelsValueSchema = exports.llmDiscoverModelsRequestSchema = exports.discoveredModelViewSchema = exports.llmModelsValueSchema = exports.llmModelsRequestSchema = exports.llmProvidersValueSchema = exports.llmProvidersRequestSchema = exports.configurableProviderViewSchema = void 0;
var zod_1 = require("zod");
var sessions_schema_ts_1 = require("./sessions.schema.ts");
/** ConfigurableProviderView row of llm.providers. */
exports.configurableProviderViewSchema = zod_1.z.object({
    provider: zod_1.z.string().min(1),
    displayName: zod_1.z.string().min(1),
    settingsNs: zod_1.z.string(),
    settingsPath: zod_1.z.array(zod_1.z.string()),
    active: zod_1.z.boolean(),
    declared: zod_1.z.boolean().optional(),
});
/** llm.providers request payload. */
exports.llmProvidersRequestSchema = zod_1.z.object({});
/** llm.providers response value. */
exports.llmProvidersValueSchema = zod_1.z.object({
    providers: zod_1.z.array(exports.configurableProviderViewSchema),
});
/** llm.models request payload. */
exports.llmModelsRequestSchema = zod_1.z.object({});
/** llm.models response value. */
exports.llmModelsValueSchema = zod_1.z.object({
    groups: zod_1.z.array(sessions_schema_ts_1.modelProviderGroupSchema),
    failures: zod_1.z.array(sessions_schema_ts_1.modelCatalogFailureSchema),
});
/** DiscoveredModelView row of llm.discoverModels. */
exports.discoveredModelViewSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1).optional(),
    contextWindow: zod_1.z.number().int().positive().optional(),
    maxTokens: zod_1.z.number().int().positive().optional(),
});
/** llm.discoverModels request payload. */
exports.llmDiscoverModelsRequestSchema = zod_1.z.object({
    settingsNs: zod_1.z.string().min(1),
    provider: zod_1.z.string().min(1).optional(),
    baseURL: zod_1.z.string().min(1).optional(),
    api: zod_1.z.string().min(1).optional(),
    // Write-only at the host: used for this one interrogation, never stored and
    // never returned. It does ride the client's outgoing envelope like every
    // other secret-bearing payload (`credentials.set`, `settings.update`), which
    // `subscribeEnvelopes()` observers can see — redacting that tap is a
    // configuration-plane-wide change, not this method's to make alone.
    apiKey: zod_1.z.string().min(1).optional(),
});
/** llm.discoverModels response value. */
exports.llmDiscoverModelsValueSchema = zod_1.z.object({
    models: zod_1.z.array(exports.discoveredModelViewSchema),
});
