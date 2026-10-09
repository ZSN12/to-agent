import { deepEqualJson, installSettingsSection, settingsNamespace } from "@z/dsh-settings";
import { installDefaultBridgeBackends, installTaskWeaverTransportBackends, streamThroughBridge } from "@z/dsh-bridge-core";
import { LlmAdapter, LlmError } from "@z/dsh-llm";
import { resolveDshHome } from "@z/dsh-home-paths";
import z from "@z/schemastery";
//#region lib/types/adapter.js
/**
* @module @z/dsh-llm-taskweaver-bridge/adapter
*/
function modelInfo(provider, entry) {
	return {
		provider,
		id: entry.id,
		name: entry.name ?? entry.id,
		...entry.contextWindow === void 0 ? {} : { contextWindow: entry.contextWindow }
	};
}
var TaskWeaverBridgeAdapter = class extends LlmAdapter {
	config;
	constructor(config) {
		super();
		this.config = config;
	}
	providerInfo(provider) {
		return {
			id: provider,
			name: this.config.options().providers.get(provider)?.displayName ?? provider
		};
	}
	listModels(provider) {
		const profile = this.config.options().providers.get(provider);
		if (!profile) return Promise.resolve([]);
		return Promise.resolve(profile.models.map((entry) => modelInfo(provider, entry)));
	}
	resolveModel(provider, model) {
		const entry = this.config.options().providers.get(provider)?.models.find((row) => row.id === model);
		const contextWindow = entry?.contextWindow;
		return Promise.resolve({
			provider,
			id: model,
			name: entry?.name ?? model,
			inputModalities: ["text"],
			...contextWindow === void 0 ? {} : { context: { contextWindow } },
			...entry?.maxTokens === void 0 ? {} : { defaultMaxTokens: entry.maxTokens }
		});
	}
	async prepareCall(provider, model) {
		return {
			model: await this.resolveModel(provider, model),
			stream: (options) => this.streamFor(provider, options)
		};
	}
	async *stream(options) {
		yield* this.streamFor(options.provider, options);
	}
	async *streamFor(provider, options) {
		const profile = this.config.options().providers.get(provider);
		if (!profile) throw new LlmError(`taskweaver-bridge: unknown provider route "${provider}"`, "INVALID_PROVIDER");
		yield* streamThroughBridge({
			providerId: provider,
			profile,
			options,
			harnessHome: resolveDshHome()
		});
	}
};
//#endregion
//#region lib/types/config.js
/**
* @module @z/dsh-llm-taskweaver-bridge/config
*/
const catalogModel = z.object({
	id: z.string().required(),
	name: z.string(),
	contextWindow: z.number().step(1).min(1),
	maxTokens: z.number().step(1).min(1),
	reasoning: z.boolean(),
	thinkingLevelMap: z.dict(z.string()),
	defaultThinkingLevel: z.string(),
	compat: z.dict(z.any())
});
const providerProfile = z.object({
	bridgeKind: z.string().required(),
	displayName: z.string().required(),
	models: z.array(catalogModel).default([]),
	loopbackBaseURL: z.string(),
	relayBaseURL: z.string()
});
const ConfigSchema = z.object({ providers: z.dict(providerProfile).default({}) });
function resolveBridgeOptions(raw) {
	const providers = /* @__PURE__ */ new Map();
	for (const [id, profile] of Object.entries(raw.providers ?? {})) {
		if (!profile?.bridgeKind?.trim()) continue;
		providers.set(id, profile);
	}
	return { providers };
}
//#endregion
//#region lib/types/index.js
/**
* Register TaskWeaver in-process model bridge routes on `ctx.llm`.
* @module @z/dsh-llm-taskweaver-bridge
*/
const name = "llm-taskweaver-bridge";
const inject = ["llm"];
const NS = settingsNamespace("llm-taskweaver-bridge");
const apply = async (ctx) => {
	installDefaultBridgeBackends();
	try {
		await installTaskWeaverTransportBackends();
	} catch (error) {
		ctx.logger.warn?.("llm-taskweaver-bridge: transport backends not loaded");
		ctx.logger.warn?.(error);
	}
	let readSettings = () => ({});
	let lastGood = resolveBridgeOptions({});
	const options = () => {
		try {
			const resolved = resolveBridgeOptions(readSettings());
			lastGood = resolved;
			return resolved;
		} catch (error) {
			if (lastGood.providers.size === 0) throw error;
			ctx.logger.error("llm-taskweaver-bridge: keeping last good provider map after invalid settings");
			ctx.logger.error(error);
			return lastGood;
		}
	};
	const adapter = new TaskWeaverBridgeAdapter({ options });
	let registration;
	let registeredRoutes = [];
	const ensureRegistration = () => {
		const routes = [...options().providers.keys()].sort();
		if (deepEqualJson(routes, registeredRoutes)) return;
		if (registration === void 0) {
			if (!routes.length) {
				registeredRoutes = routes;
				return;
			}
			registration = ctx.llm.registerAdapter(routes, adapter);
		} else registration.replace(routes);
		registeredRoutes = routes;
		const entries = routes.flatMap((id) => {
			const profile = options().providers.get(id);
			if (!profile) return [];
			return [{
				provider: id,
				displayName: profile.displayName,
				settingsNs: NS,
				settingsPath: ["providers", id]
			}];
		});
		if (entries.length) ctx.llm.registerConfigurableProviders(entries);
	};
	options();
	ensureRegistration();
	installSettingsSection(ctx, NS, ConfigSchema, {}, {
		setSource: (source) => {
			readSettings = source;
		},
		onChange: () => {
			try {
				ensureRegistration();
			} catch (error) {
				ctx.logger.error("llm-taskweaver-bridge: keeping previous routes after refused update");
				ctx.logger.error(error);
			}
		}
	});
};
//#endregion
export { ConfigSchema, TaskWeaverBridgeAdapter, apply, inject, name, resolveBridgeOptions };
