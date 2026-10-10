//#region \0rolldown/runtime.js
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
//#endregion
//#region lib/types/invariant.js
var require_invariant = /* @__PURE__ */ __commonJSMin(((exports) => {
	/** Package invariant companion for `@taskweaver/dsh-session-log-export`. */
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.apply = exports.inject = exports.name = void 0;
	var PACKAGE_NAME = "@taskweaver/dsh-session-log-export";
	exports.name = "session-export-invariant";
	exports.inject = ["invariants"];
	/** No runtime invariant: the command registry owns lifecycle pairing and ApiProxy owns ZIP integrity. */
	var install = function() {};
	/**
	* Register this package's invariant companion.
	* @param ctx - Host context carrying the invariant registry.
	* @returns the registration disposer after setup succeeds.
	*/
	var apply = function(ctx) {
		return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
	};
	exports.apply = apply;
}));
//#endregion
export default require_invariant();
export {};
