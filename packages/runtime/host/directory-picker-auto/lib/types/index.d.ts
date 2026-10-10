/**
 * Native directory picker composition for TaskWeaver's Electron-owned UI.
 * Mounts the native Host backend and, for non-embedded Clients, the native
 * client surface as ordinary Loader entries in the in-memory root tree.
 * @module @taskweaver/dsh-host-directory-picker-auto
 */
import type { Context } from '@taskweaver/cordis';
/** Cordis plugin name. */
export declare const name = "directory-picker-auto";
/** Required service: the entry tree the native interaction mounts into. */
export declare const inject: string[];
/**
 * Native Host backend package — fixed composition vocabulary, not a tunable.
 * Exported because the reference is a runtime string the static config gate
 * cannot see in a yml row.
 */
export declare const BACKEND_PACKAGE = "@taskweaver/dsh-host-directory-picker-native";
/**
 * Native client surface mounted with the Host backend for non-embedded clients.
 * Only the specifier is referenced here; the package belongs to the Client
 * program and is discovered by the loader.
 */
export declare const SURFACE_PACKAGE = "@taskweaver/dsh-client-ui-directory-picker-native";
/**
 * Mount the native interaction as Loader entries; the effect's disposer
 * removes both entries and joins their fibers' teardown.
 * @param ctx - cordis context carrying the injected `loader`.
 */
export declare function apply(ctx: Context): Promise<void>;
//# sourceMappingURL=index.d.ts.map