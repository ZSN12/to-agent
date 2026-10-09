//#region lib/types/invariant.js
/** Package-owned session-event invariants for auto-review. @module @z/dsh-auto-review/invariant */
const PACKAGE_NAME = "@z/dsh-auto-review";
/** Cordis companion plugin name. */
const name = "auto-review-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
const RISKS = [
	"low",
	"medium",
	"high",
	"critical"
];
const DECISIONS = [
	"allow",
	"deny",
	"defer"
];
const VERDICTS = [
	"allow",
	"deny",
	"defer"
];
/** Validate the package-owned event fields and ignore unrelated events. */
function validateEvent(event, fail) {
	if (event.type !== "approval/review") return;
	if (!RISKS.includes(event.data.risk)) fail(`approval/review carries unknown risk ${JSON.stringify(event.data.risk)}`);
	if (!DECISIONS.includes(event.data.decision)) fail(`approval/review carries unknown decision ${JSON.stringify(event.data.decision)}`);
	if (!VERDICTS.includes(event.data.verdict)) fail(`approval/review carries unknown verdict ${JSON.stringify(event.data.verdict)}`);
}
/** Install validation for loaded and newly appended review records. */
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
