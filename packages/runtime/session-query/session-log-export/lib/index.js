//#region \0rolldown/runtime.js
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
//#endregion
//#region lib/types/index.js
var require_types = /* @__PURE__ */ __commonJSMin(((exports) => {
	/** Web Session-log download command over the host endpoint owned by ApiProxy. */
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.inject = exports.name = void 0;
	exports.apply = apply;
	exports.name = "session-log-download";
	exports.inject = ["commands"];
	var REQUESTED = {
		kind: "success",
		text: "Session log download requested."
	};
	/**
	* Register the Web-only `/export` command that the browser download plugin observes.
	* @param ctx - Host context carrying the human-command registry.
	*/
	function apply(ctx) {
		ctx.effect(function() {
			return ctx.commands.register({
				name: "export",
				description: "Download this Session log as a ZIP archive",
				handler: function(invocation) {
					return Promise.resolve(invocation.rawInput.trim() === "" ? REQUESTED : {
						kind: "error",
						text: "The Web /export command does not accept a path."
					});
				}
			});
		}, "session-log-download: command");
	}
}));
//#endregion
export default require_types();
export {};
