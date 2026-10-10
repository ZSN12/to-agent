/**
 * Native directory picker composition for TaskWeaver's Electron-owned UI.
 * Mounts the native Host backend and, for non-embedded Clients, the native
 * client surface as ordinary Loader entries in the in-memory root tree.
 * @module @taskweaver/dsh-host-directory-picker-auto
 */
import { taskweaverEmbeddedFromEnv } from '@taskweaver/dsh-home-paths';
/** Cordis plugin name. */
export const name = 'directory-picker-auto';
/** Required service: the entry tree the native interaction mounts into. */
export const inject = ['loader'];
/**
 * Native Host backend package — fixed composition vocabulary, not a tunable.
 * Exported because the reference is a runtime string the static config gate
 * cannot see in a yml row.
 */
export const BACKEND_PACKAGE = '@taskweaver/dsh-host-directory-picker-native';
/**
 * Native client surface mounted with the Host backend for non-embedded clients.
 * Only the specifier is referenced here; the package belongs to the Client
 * program and is discovered by the loader.
 */
export const SURFACE_PACKAGE = '@taskweaver/dsh-client-ui-directory-picker-native';
/**
 * Mount the native interaction as Loader entries; the effect's disposer
 * removes both entries and joins their fibers' teardown.
 * @param ctx - cordis context carrying the injected `loader`.
 */
export async function apply(ctx) {
    await ctx.effect(async () => {
        // Root-tree create: the Loader root is in-memory (write() is a no-op), so
        // the mounted rows can never be persisted back into a config file. The
        // backend lands first so the client surface sees its registered capability.
        const ids = [];
        const unmount = async () => {
            for (const id of [...ids].reverse()) {
                // Tree teardown (group.stop) can have removed the entry already;
                // nothing is left to unmount or await then.
                if (ctx.loader.store[id] === undefined)
                    continue;
                // remove() disposes the entry transactionally, so the chooser's unload
                // signals completion only after that face quiesced.
                await ctx.loader.remove(id);
            }
        };
        try {
            const packages = [BACKEND_PACKAGE];
            // TaskWeaver Electron owns the UI and invokes its native dialog directly.
            if (!taskweaverEmbeddedFromEnv())
                packages.push(SURFACE_PACKAGE);
            for (const name of packages) {
                ids.push(await ctx.loader.create({ name }));
            }
        }
        catch (cause) {
            // Setup owns the entries it created until it returns the disposer: leaving
            // the backend mounted would make a retry collide with its own
            // directoryPicker registration.
            await unmount();
            throw cause;
        }
        return unmount;
    }, 'directory-picker-auto: native interaction entries');
}
//# sourceMappingURL=index.js.map