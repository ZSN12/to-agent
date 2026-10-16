import { Command } from "commander";
import { parseCmdline } from "@taskweaver/dsh-cmdline";
//#region lib/types/startup.js
/**
* Parse the TaskWeaver API Host's WebServer bind and `/api` trust options.
* @module @taskweaver/dsh-taskweaver/startup
*/
/** Stable Cordis plugin name. */
const name = "web-startup";
/** Service required before the flags can be resolved. */
const inject = ["cmdlineArgs"];
/** Service provided to the WebServer and API Host rows. */
const WEB_STARTUP_SERVICE = "webStartup";
function webCommand() {
	return new Command().name("dsh --profile web").description("Start the TaskWeaver API Host.").helpOption("-h, --help", "show this help").option("--host <host>", "WebServer bind host").option("--port <port>", "WebServer port; pass 0 to let the OS pick a free one").option("--trusted-host <authority...>", "extra authority accepted by the /api trust fence; repeatable").addHelpText("after", `
Examples:
  dsh --profile web                       start on the composed host and port
  dsh --profile web --host 127.0.0.1 --port 0
  dsh --profile web --trusted-host app.internal
`);
}
/** Parse and provide the Web invocation as an ordinary Cordis service. */
function apply(ctx) {
	const program = webCommand();
	program.action(() => {
		const options = program.opts();
		if (options.host === "0.0.0.0") program.error("error: --host 0.0.0.0 is intentionally not supported yet for safety; use 127.0.0.1 instead");
		if (options.port !== void 0 && !/^\d+$/u.test(options.port)) program.error(`error: --port must be a number, got ${JSON.stringify(options.port)}`);
		ctx.provide(WEB_STARTUP_SERVICE, {
			...options.host !== void 0 && { host: options.host },
			...options.port !== void 0 && { port: Number(options.port) },
			trustedHosts: options.trustedHost ?? []
		});
	});
	parseCmdline(ctx, program);
}
//#endregion
export { WEB_STARTUP_SERVICE, apply, inject, name };
