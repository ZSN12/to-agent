//#region lib/types/invariant.js
/** Package-owned session-event invariants for desktop control. @module @z/dsh-tool-desktop/invariant */
const PACKAGE_NAME = "@z/dsh-tool-desktop";
/** Cordis companion plugin name. */
const name = "tool-desktop-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
const KINDS = new Set([
	"move",
	"click",
	"double_click",
	"drag",
	"scroll",
	"type",
	"key_combo",
	"shortcut",
	"screenshot"
]);
const OUTCOMES = new Set(["applied", "denied"]);
/** Validate the package-owned event fields and ignore unrelated events. */
function validateEvent(event, fail) {
	if (event.type !== "desktop/action") return;
	if (!KINDS.has(event.data.kind)) fail(`desktop/action carries unknown kind ${JSON.stringify(event.data.kind)}`);
	if (!OUTCOMES.has(event.data.outcome)) fail(`desktop/action carries unknown outcome ${JSON.stringify(event.data.outcome)}`);
}
/** Install validation for loaded and newly appended desktop records. */
const install = Object.assign((ctx, fail) => {
	for (const session of ctx.sessions.list()) for (const event of session.events) validateEvent(event, fail);
	ctx.on("internal/dispatch", (_mode, eventName, args) => {
		if (eventName !== "session/event") return;
		const event = args[1];
		validateEvent(event, fail);
	}, { global: true });
}, { inject: ["sessions"] });
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
