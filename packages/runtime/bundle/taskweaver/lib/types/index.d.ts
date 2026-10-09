/**
 * TaskWeaver's API-only Host glue: expose the explicit `/api` trust list and
 * publish `z web:` only after the complete Loader tree is ready.
 * @module @z/dsh-taskweaver
 */
import type { Context } from '@z/cordis';
import z from '@z/schemastery';
/** Stable Cordis plugin name. */
export declare const name = "taskweaver-api-host";
/** Service consumed by the `/api` connection row. */
export declare const WEB_RUNTIME_SERVICE = "webRuntime";
/** Wait for the API route owner and other boot rows before announcing readiness. */
export declare const inject: string[];
/** Explicit non-loopback authorities accepted by the `/api` trust fence. */
export interface Config {
    trustedHosts: string[];
}
export declare const Config: z<Config>;
/** Values shared with the `/api` connection service after bind. */
export interface WebRuntimeValues {
    trustedHosts: string[];
}
/**
 * Publish the API trust list and announce the loopback endpoint once every
 * loader row has mounted. The supervisor treats this line as `/api` readiness.
 * @param ctx - Host context containing the bound WebServer.
 * @param config - explicit authorities forwarded to the `/api` trust fence.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map