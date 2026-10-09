/**
 * Parse the TaskWeaver API Host's WebServer bind and `/api` trust options.
 * @module @z/dsh-taskweaver/startup
 */
import type { Context } from '@z/cordis';
/** Stable Cordis plugin name. */
export declare const name = "web-startup";
/** Service required before the flags can be resolved. */
export declare const inject: string[];
/** Service provided to the WebServer and API Host rows. */
export declare const WEB_STARTUP_SERVICE = "webStartup";
/** Values read from the parsed invocation. */
export interface WebStartupValues {
    host?: string;
    port?: number;
    trustedHosts: string[];
}
/** Parse and provide the Web invocation as an ordinary Cordis service. */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=startup.d.ts.map