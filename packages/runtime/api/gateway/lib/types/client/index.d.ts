/**
 * Client projection of generated Typert Remote descriptors. Contributions
 * install traced `remote.<namespace>` services; no JavaScript Proxy
 * participates in method lookup, invocation, or type exposure.
 */
import type { Context } from '@z/cordis';
import type { TypertClientRemote } from '@z/dsh-typert-protocol';
/** Typed Remote service augmented by generated direct namespaces. */
export type ClientRemote = TypertClientRemote;
declare module '@z/cordis' {
    interface Context {
        /** Generated Remote namespaces selected by the Client assembly. */
        remote: ClientRemote;
    }
}
/** Required Client services: the Typert registry and the existing Connection carrier. */
export declare const inject: string[];
/**
 * Install the typed Client Remote service.
 * @param ctx - Client Cordis root.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map