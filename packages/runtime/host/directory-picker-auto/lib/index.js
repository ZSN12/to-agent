import { taskweaverEmbeddedFromEnv } from "@taskweaver/dsh-home-paths";

/** Cordis plugin name. */
const name = "directory-picker-auto";
/** Required service: the entry tree the native interaction mounts into. */
const inject = ["loader"];
/** Native Host backend selected by TaskWeaver's desktop bundle. */
const BACKEND_PACKAGE = "@taskweaver/dsh-host-directory-picker-native";
/** Native Client surface used when the Host is not embedded in Electron. */
const SURFACE_PACKAGE = "@taskweaver/dsh-client-ui-directory-picker-native";

/**
 * Mount the native interaction as Loader entries; the effect's disposer
 * removes both entries and joins their fibers' teardown.
 * @param {import('@taskweaver/cordis').Context} ctx
 */
async function apply(ctx) {
	await ctx.effect(async () => {
		const ids = [];
		const unmount = async () => {
			for (const id of [...ids].reverse()) {
				if (ctx.loader.store[id] === void 0) continue;
				await ctx.loader.remove(id);
			}
		};
		try {
			const packages = [BACKEND_PACKAGE];
			if (!taskweaverEmbeddedFromEnv()) packages.push(SURFACE_PACKAGE);
			for (const name of packages) ids.push(await ctx.loader.create({ name }));
		} catch (cause) {
			await unmount();
			throw cause;
		}
		return unmount;
	}, "directory-picker-auto: native interaction entries");
}

export { BACKEND_PACKAGE, SURFACE_PACKAGE, apply, inject, name };
