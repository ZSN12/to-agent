/**
 * TaskWeaver's API-only Host glue: expose the explicit `/api` trust list and
 * publish `z web:` only after the complete Loader tree is ready.
 * @module @z/dsh-taskweaver
 */
import z from '@z/schemastery';
/** Stable Cordis plugin name. */
export const name = 'taskweaver-api-host';
/** Service consumed by the `/api` connection row. */
export const WEB_RUNTIME_SERVICE = 'webRuntime';
/** Wait for the API route owner and other boot rows before announcing readiness. */
export const inject = ['webServer'];
export const Config = z.object({
    trustedHosts: z.array(String).default([]),
});
/**
 * Publish the API trust list and announce the loopback endpoint once every
 * loader row has mounted. The supervisor treats this line as `/api` readiness.
 * @param ctx - Host context containing the bound WebServer.
 * @param config - explicit authorities forwarded to the `/api` trust fence.
 */
export function apply(ctx, config) {
    ctx.provide(WEB_RUNTIME_SERVICE, { trustedHosts: config.trustedHosts });
    const announceReady = () => {
        if (ctx.get('webServer') === undefined)
            return;
        console.log(`z web: http://127.0.0.1:${String(ctx.webServer.port)}`);
    };
    const settled = ctx.get('loader')?.await();
    if (settled === undefined) {
        announceReady();
    }
    else {
        void settled.then(announceReady, () => { });
    }
}
//# sourceMappingURL=index.js.map