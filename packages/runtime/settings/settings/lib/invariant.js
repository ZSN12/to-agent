import { Service } from "@taskweaver/cordis";
//#endregion
//#region lib/types/index.js
/**
* Service Definition for the user-settings capability seam (`ctx.settings`). Providers store one raw document of
* per-namespace sections; plugins register a namespace schema and read the
* resolved value, which layers schema defaults, the registrant's composition
* `base`, and the user document section, in that order.
* @module @taskweaver/dsh-settings
*/
/**
* Deep equality over JSON-compatible data (objects, arrays, primitives) — the
* Service Definition's single change-detection predicate, exported so the invariant
* companion checks exactly the implementation's relation.
* @param a - one JSON-compatible value.
* @param b - the other JSON-compatible value.
* @returns whether the two values are structurally equal.
*/
function deepEqualJson(a, b) {
	if (a === b) return true;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
		return a.every((entry, index) => deepEqualJson(entry, b[index]));
	}
	const left = a;
	const right = b;
	const keys = Object.keys(left);
	if (keys.length !== Object.keys(right).length) return false;
	return keys.every((key) => key in right && deepEqualJson(left[key], right[key]));
}
Service.init;
//#endregion
//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@taskweaver/dsh-settings`.
* @module @taskweaver/dsh-settings/invariant
*/
const PACKAGE_NAME = "@taskweaver/dsh-settings";
/** Cordis companion plugin name. */
const name = "settings-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* Install the commit-event contract: `settings/updated` fires only for a
* currently registered namespace, only when the resolved value changed, and
* only with the service's authoritative resolved value — all judged with the
* seam's own equality predicate.
*/
const install = (ctx, fail) => {
	ctx.on("settings/updated", (ns, next, prev) => {
		const settings = ctx.get("settings");
		if (settings === void 0) fail(`settings/updated for "${ns}" emitted without a live settings service`);
		const current = settings.get(ns);
		if (current === void 0) fail(`settings/updated for "${ns}" emitted while the namespace is unregistered`);
		if (!deepEqualJson(current, next)) fail(`settings/updated for "${ns}" does not match the authoritative resolved value`);
		if (deepEqualJson(next, prev)) fail(`settings/updated for "${ns}" emitted without a resolved-value change`);
	});
};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
