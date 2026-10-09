/**
 * Register TaskWeaver in-process model bridge routes on `ctx.llm`.
 * @module @z/dsh-llm-taskweaver-bridge
 */
import { deepEqualJson, installSettingsSection, settingsNamespace } from '@z/dsh-settings';
import { installDefaultBridgeBackends, installTaskWeaverTransportBackends } from '@z/dsh-bridge-core';
import { TaskWeaverBridgeAdapter } from "./adapter.js";
import { ConfigSchema, resolveBridgeOptions } from "./config.js";
export const name = 'llm-taskweaver-bridge';
export const inject = ['llm'];
const NS = settingsNamespace('llm-taskweaver-bridge');
export { TaskWeaverBridgeAdapter } from "./adapter.js";
export { ConfigSchema, resolveBridgeOptions } from "./config.js";
export const apply = async (ctx) => {
    installDefaultBridgeBackends();
    try {
        await installTaskWeaverTransportBackends();
    }
    catch (error) {
        ctx.logger.warn?.('llm-taskweaver-bridge: transport backends not loaded');
        ctx.logger.warn?.(error);
    }
    let readSettings = () => ({});
    let lastGood = resolveBridgeOptions({});
    const options = () => {
        try {
            // Settings scopes return frozen, schema-resolved snapshots. Re-running
            // ConfigSchema here attempts to mutate that frozen object and silently
            // leaves every bridge route dormant; validation already happened when
            // the settings section was registered or updated.
            const raw = readSettings();
            const resolved = resolveBridgeOptions(raw);
            lastGood = resolved;
            return resolved;
        }
        catch (error) {
            if (lastGood.providers.size === 0)
                throw error;
            ctx.logger.error('llm-taskweaver-bridge: keeping last good provider map after invalid settings');
            ctx.logger.error(error);
            return lastGood;
        }
    };
    const adapter = new TaskWeaverBridgeAdapter({ options });
    let registration;
    let registeredRoutes = [];
    const ensureRegistration = () => {
        const routes = [...options().providers.keys()].sort();
        if (deepEqualJson(routes, registeredRoutes))
            return;
        if (registration === undefined) {
            if (!routes.length) {
                registeredRoutes = routes;
                return;
            }
            registration = ctx.llm.registerAdapter(routes, adapter);
        }
        else {
            registration.replace(routes);
        }
        registeredRoutes = routes;
        const entries = routes.flatMap((id) => {
            const profile = options().providers.get(id);
            if (!profile)
                return [];
            return [{
                    provider: id,
                    displayName: profile.displayName,
                    settingsNs: NS,
                    settingsPath: ['providers', id],
                }];
        });
        if (entries.length)
            ctx.llm.registerConfigurableProviders(entries);
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
            }
            catch (error) {
                ctx.logger.error('llm-taskweaver-bridge: keeping previous routes after refused update');
                ctx.logger.error(error);
            }
        },
    });
};
//# sourceMappingURL=index.js.map