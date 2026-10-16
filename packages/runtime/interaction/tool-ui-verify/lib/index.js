import { readFileSync, realpathSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import z from "@taskweaver/schemastery";
import { defineTool } from "@taskweaver/dsh-tools";
import { UiVerifySession, assertTaskWeaverProject } from "@taskweaver/ui-verify";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
//#region lib/types/native/macos.js
const execFileAsync = promisify(execFile);
const NATIVE_KEY_CODES = {
	enter: 36,
	return: 36,
	tab: 48,
	escape: 53,
	delete: 51,
	space: 49,
	left: 123,
	right: 124,
	down: 125,
	up: 126,
	a: 0
};
const jxaPrefix = "ObjC.import(\"AppKit\");ObjC.import(\"CoreGraphics\");ObjC.import(\"ApplicationServices\");";
function validatePid(pid) {
	if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Native UI verification requires the isolated TaskWeaver process id");
}
function validatePoint(point) {
	if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0) throw new Error("Native point must use non-negative window-relative coordinates in points");
}
function scriptNumber(value) {
	if (!Number.isFinite(value)) throw new Error("Native coordinate must be finite");
	return String(Math.round(value * 100) / 100);
}
/** Execute only argv-based native helpers; no command string is interpreted by a shell. */
const defaultRunner = async (file, args) => {
	const result = await execFileAsync(file, [...args], {
		encoding: "utf8",
		timeout: 15e3,
		maxBuffer: 262144
	});
	return String(result.stdout).trim();
};
/**
* macOS-only fallback, bound to one live TaskWeaver Electron PID. It cannot
* activate an app, enumerate arbitrary app windows, or click outside the
* current on-screen TaskWeaver window. Native point coordinates are window
* relative; screenshots are captured by window id and resized to point size.
*/
var MacNativeUiFallback = class {
	run;
	pid;
	constructor(pid, runner = defaultRunner) {
		validatePid(pid);
		this.pid = pid;
		this.run = runner;
	}
	async jxa(expression) {
		return await this.run("/usr/bin/osascript", [
			"-l",
			"JavaScript",
			"-e",
			`${jxaPrefix}${expression}`
		]);
	}
	async permissions() {
		if (process.platform !== "darwin") return {
			accessibility: false,
			screenRecording: false
		};
		const result = await this.jxa("JSON.stringify({accessibility:$.AXIsProcessTrusted(),screenRecording:$.CGPreflightScreenCaptureAccess()})");
		const value = JSON.parse(result);
		return {
			accessibility: value.accessibility === true,
			screenRecording: value.screenRecording === true
		};
	}
	async targetWindow() {
		if (process.platform !== "darwin") throw new Error("Native UI fallback is macOS-only");
		const expression = `const pid=${this.pid};const rows=ObjC.deepUnwrap($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly,$.kCGNullWindowID));const w=rows.find(x=>Number(x.kCGWindowOwnerPID)===pid&&Number(x.kCGWindowLayer)===0&&Number(x.kCGWindowAlpha)>0);if(!w)throw new Error("TaskWeaver window is not on screen");const b=w.kCGWindowBounds;JSON.stringify({id:Number(w.kCGWindowNumber),x:Number(b.X),y:Number(b.Y),width:Number(b.Width),height:Number(b.Height)});`;
		const window = JSON.parse(await this.jxa(expression));
		if (!Number.isSafeInteger(window.id) || window.id <= 0 || !Number.isFinite(window.x) || !Number.isFinite(window.y) || !Number.isFinite(window.width) || !Number.isFinite(window.height) || window.width <= 0 || window.height <= 0) throw new Error("Could not identify an on-screen window for the TaskWeaver verification instance");
		return window;
	}
	frontmostGuard() {
		return `const pid=${this.pid};const front=Number($.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier);if(front!==pid)throw new Error("Native UI action refused: the isolated TaskWeaver window is not frontmost");`;
	}
	async screenshot(outputPath) {
		if (process.platform !== "darwin") throw new Error("Native UI fallback is macOS-only");
		const window = await this.targetWindow();
		const output = path.resolve(outputPath);
		const raw = `${output}.retina.png`;
		try {
			await this.run("/usr/sbin/screencapture", [
				"-x",
				"-l",
				String(window.id),
				raw
			]);
			await this.run("/usr/bin/sips", [
				"-z",
				String(Math.max(1, Math.round(window.height))),
				String(Math.max(1, Math.round(window.width))),
				raw,
				"--out",
				output
			]);
			return output;
		} finally {
			await rm(raw, { force: true }).catch(() => void 0);
		}
	}
	async click(point) {
		validatePoint(point);
		if (process.platform !== "darwin") throw new Error("Native UI fallback is macOS-only");
		const guard = this.frontmostGuard();
		const x = scriptNumber(point.x);
		const y = scriptNumber(point.y);
		const expression = `${guard}const rows=ObjC.deepUnwrap($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly,$.kCGNullWindowID));const w=rows.find(x=>Number(x.kCGWindowOwnerPID)===pid&&Number(x.kCGWindowLayer)===0&&Number(x.kCGWindowAlpha)>0);if(!w)throw new Error("TaskWeaver window is not on screen");const b=w.kCGWindowBounds;if(${x}>=Number(b.Width)||${y}>=Number(b.Height))throw new Error("Native point is outside the TaskWeaver window bounds");const p=$.CGPointMake(Number(b.X)+${x},Number(b.Y)+${y});const d=$.CGEventCreateMouseEvent($(),$.kCGEventLeftMouseDown,p,$.kCGMouseButtonLeft);const u=$.CGEventCreateMouseEvent($(),$.kCGEventLeftMouseUp,p,$.kCGMouseButtonLeft);$.CGEventPost($.kCGHIDEventTap,d);$.CGEventPost($.kCGHIDEventTap,u);`;
		await this.jxa(expression);
	}
	async fill(point, text) {
		validatePoint(point);
		if (text.length > 16e3) throw new Error("Native text input is limited to 16000 characters");
		await this.click(point);
		await this.press("a", ["command"]);
		await this.press("delete");
		await this.typeFocused(text);
	}
	async type(point, text) {
		validatePoint(point);
		if (text.length > 16e3) throw new Error("Native text input is limited to 16000 characters");
		await this.click(point);
		await this.typeFocused(text);
	}
	async typeFocused(text) {
		const characters = Array.from(text);
		for (let offset = 0; offset < characters.length; offset += 128) {
			const encoded = Buffer.from(characters.slice(offset, offset + 128).join(""), "utf8").toString("base64");
			const expression = `${this.frontmostGuard()}const d=$.NSData.alloc.initWithBase64EncodedStringOptions("${encoded}",0);const s=$.NSString.alloc.initWithDataEncoding(d,4);const e=$.CGEventCreateKeyboardEvent($(),0,true);$.CGEventKeyboardSetUnicodeString(e,s.length,s);$.CGEventPost($.kCGHIDEventTap,e);const u=$.CGEventCreateKeyboardEvent($(),0,false);$.CGEventPost($.kCGHIDEventTap,u);`;
			await this.jxa(expression);
		}
	}
	async press(key, modifiers = []) {
		if (process.platform !== "darwin") throw new Error("Native UI fallback is macOS-only");
		const keyCode = NATIVE_KEY_CODES[key.toLowerCase()];
		if (keyCode === void 0) throw new Error(`Native key is not supported: ${key}`);
		const masks = {
			command: 1048576,
			control: 262144,
			option: 524288,
			shift: 131072
		};
		const flags = modifiers.reduce((value, modifier) => value | masks[modifier], 0);
		const expression = `${this.frontmostGuard()}const code=${keyCode};const flags=${flags};const d=$.CGEventCreateKeyboardEvent($(),code,true);$.CGEventSetFlags(d,flags);$.CGEventPost($.kCGHIDEventTap,d);const u=$.CGEventCreateKeyboardEvent($(),code,false);$.CGEventSetFlags(u,flags);$.CGEventPost($.kCGHIDEventTap,u);`;
		await this.jxa(expression);
	}
};
//#endregion
//#region lib/types/index.js
const name = "tool-ui-verify";
const inject = [
	"tools",
	"approval",
	"attachments",
	"uiVerifyPolicy"
];
const Config = z.object({ nativeFallbackEnabled: z.boolean().default(false) });
const TARGET_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		testId: {
			type: "string",
			description: "Exact data-testid value."
		},
		role: {
			type: "string",
			description: "Accessible role, such as button, textbox, dialog, or region."
		},
		name: {
			type: "string",
			description: "Exact accessible name; required when role is supplied."
		}
	}
};
const RESULT_SCHEMA = {
	type: "object",
	additionalProperties: true,
	properties: {
		ok: {
			type: "boolean",
			required: true
		},
		message: { type: "string" },
		path: { type: "string" },
		snapshot: { type: "string" },
		errors: {
			type: "array",
			items: { type: "string" }
		},
		results: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: true
			}
		},
		passed: { type: "boolean" }
	}
};
const sessions = /* @__PURE__ */ new Map();
const approvedSessionRoots = /* @__PURE__ */ new Map();
function isTaskWeaverRepository(root) {
	if (typeof root !== "string" || !path.isAbsolute(root)) return false;
	try {
		const canonicalRoot = realpathSync(root);
		const manifest = JSON.parse(readFileSync(path.join(canonicalRoot, "package.json"), "utf8"));
		return manifest?.name === "taskweaver-desktop" && manifest.main === "desktop/main.cjs";
	} catch {
		return false;
	}
}
function sessionKey(agent) {
	return String(agent.session.id);
}
function requireAgent(agent) {
	if (!agent) throw new Error("tool-ui-verify requires a live agent session");
	return agent;
}
async function getWorkspacePolicy(ctx, agent) {
	const policy = ctx.uiVerifyPolicy;
	if (!policy) throw new Error("UI verification is unavailable: the TaskWeaver Host did not inject uiVerifyPolicy");
	const workspace = await policy.getWorkspace(agent);
	if (!workspace || workspace.trusted !== true) throw new Error("UI verification is unavailable: the active workspace is not trusted");
	if (!workspace.root || !workspace.artifactsDir) throw new Error("UI verification is unavailable: the Host did not provide a workspace root and artifact directory");
	const canonicalRoot = await assertTaskWeaverProject(workspace.root);
	return {
		...workspace,
		root: canonicalRoot,
		artifactsDir: path.resolve(workspace.artifactsDir)
	};
}
async function requestLaunchApproval(ctx, agent, workspace) {
	const key = sessionKey(agent);
	if (approvedSessionRoots.get(key) === workspace.root) return;
	if (workspace.trusted && workspace.autoAllow === true) {
		approvedSessionRoots.set(key, workspace.root);
		return;
	}
	const result = await ctx.approval.request({
		agent,
		toolName: "ui_launch",
		reason: "启动 TaskWeaver 开发构建的隔离实例做 UI 验证"
	});
	if (result !== "allowed-once") throw new Error(`UI verification launch was not approved (${result})`);
	approvedSessionRoots.set(key, workspace.root);
}
function requireSession(agent) {
	const session = sessions.get(sessionKey(agent));
	if (!session) throw new Error("No isolated UI verification instance is running; call ui_launch first");
	return session;
}
async function requireTrustedSession(ctx, agent) {
	const session = requireSession(agent);
	if ((await getWorkspacePolicy(ctx, agent)).root !== session.root) throw new Error("UI verification workspace changed; close the isolated instance and launch again");
	return session;
}
async function closeSession(agent) {
	const key = sessionKey(agent);
	const session = sessions.get(key);
	if (!session) return void 0;
	sessions.delete(key);
	try {
		await session.close();
	} finally {
		agent.session.append("ui-verify/lifecycle", {
			action: "close",
			root: session.root,
			artifactsDir: session.artifactsDir
		});
	}
	return session;
}
function contentWithImage(pathName, image) {
	return [{
		type: "text",
		text: `TaskWeaver UI verification screenshot: ${pathName}`
	}, {
		type: "image",
		attachment: image
	}];
}
async function attachScreenshot(ctx, screenshotPath) {
	const attachments = ctx.get("attachments");
	if (!attachments) throw new Error("Screenshot attachment service is unavailable");
	return await attachments.saveImage({
		data: await readFile(screenshotPath),
		mediaType: "image/png",
		name: path.basename(screenshotPath)
	});
}
async function nativeFallbackForSession(config, session) {
	if (config.nativeFallbackEnabled !== true) throw new Error("Native UI fallback is disabled by Host policy");
	if (process.platform !== "darwin") throw new Error("Native UI fallback is macOS-only");
	const pid = session.processId();
	if (!pid) throw new Error("Native UI fallback cannot identify the isolated TaskWeaver process");
	const native = new MacNativeUiFallback(pid);
	const permissions = await native.permissions();
	if (!permissions.accessibility || !permissions.screenRecording) throw new Error(`Native UI fallback requires macOS Accessibility and Screen Recording permissions (accessibility=${permissions.accessibility}, screenRecording=${permissions.screenRecording})`);
	return native;
}
function parseTarget(target) {
	if (target.testId !== void 0) {
		if (target.role !== void 0 || target.name !== void 0) throw new Error("Use either testId or role/name, not both");
		return { testId: target.testId };
	}
	if (!target.role || target.name === void 0) throw new Error("UI target requires a testId or both role and name");
	if (!(/* @__PURE__ */ new Set([
		"alert",
		"alertdialog",
		"application",
		"article",
		"banner",
		"blockquote",
		"button",
		"caption",
		"cell",
		"checkbox",
		"code",
		"columnheader",
		"combobox",
		"complementary",
		"contentinfo",
		"definition",
		"deletion",
		"dialog",
		"directory",
		"document",
		"emphasis",
		"feed",
		"figure",
		"form",
		"generic",
		"grid",
		"gridcell",
		"group",
		"heading",
		"img",
		"insertion",
		"link",
		"list",
		"listbox",
		"listitem",
		"log",
		"main",
		"marquee",
		"math",
		"meter",
		"menu",
		"menubar",
		"menuitem",
		"menuitemcheckbox",
		"menuitemradio",
		"navigation",
		"none",
		"note",
		"option",
		"paragraph",
		"presentation",
		"progressbar",
		"radio",
		"radiogroup",
		"region",
		"row",
		"rowgroup",
		"rowheader",
		"scrollbar",
		"search",
		"searchbox",
		"separator",
		"slider",
		"spinbutton",
		"status",
		"strong",
		"subscript",
		"superscript",
		"switch",
		"tab",
		"table",
		"tablist",
		"tabpanel",
		"term",
		"textbox",
		"time",
		"timer",
		"toolbar",
		"tooltip",
		"tree",
		"treegrid",
		"treeitem"
	])).has(target.role)) throw new Error(`Unsupported accessible role: ${target.role}`);
	return {
		role: target.role,
		name: target.name
	};
}
function apply(ctx, config) {
	if (!ctx.agent || !isTaskWeaverRepository(ctx.agent.session.header.cwd)) return;
	ctx.tools.register(defineTool({
		name: "ui_launch",
		description: "Start one isolated TaskWeaver development instance for UI verification. The Host supplies the active workspace root; the model cannot provide paths, URLs, or commands.",
		parameters: {},
		output: {
			schema: RESULT_SCHEMA,
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value)
			}]
		},
		async execute(_args, exec) {
			const agent = requireAgent(exec.agent);
			const key = sessionKey(agent);
			const workspace = await getWorkspacePolicy(ctx, agent);
			const existing = sessions.get(key);
			if (existing) {
				if (existing.root !== workspace.root) throw new Error("UI verification workspace changed; close the isolated instance and launch again");
				return {
					ok: true,
					message: "TaskWeaver UI verification instance is already running.",
					artifactsDir: existing.artifactsDir
				};
			}
			await requestLaunchApproval(ctx, agent, workspace);
			const session = await UiVerifySession.launch({
				root: workspace.root,
				artifactsDir: workspace.artifactsDir
			});
			sessions.set(key, session);
			try {
				agent.session.append("ui-verify/lifecycle", {
					action: "launch",
					root: workspace.root,
					artifactsDir: session.artifactsDir
				});
			} catch (error) {
				sessions.delete(key);
				await session.close();
				throw error;
			}
			return {
				ok: true,
				message: "Isolated TaskWeaver development instance started.",
				artifactsDir: session.artifactsDir
			};
		}
	}));
	ctx.tools.register(defineTool({
		name: "ui_snapshot",
		description: "Read the isolated TaskWeaver window accessibility tree as YAML. Use this as the primary UI observation surface.",
		parameters: {},
		output: {
			schema: RESULT_SCHEMA,
			render: (_args, value) => [{
				type: "text",
				text: String(value.snapshot ?? "")
			}]
		},
		async execute(_args, exec) {
			return {
				ok: true,
				snapshot: await (await requireTrustedSession(ctx, requireAgent(exec.agent))).snapshot()
			};
		}
	}));
	ctx.tools.register(defineTool({
		name: "ui_act",
		description: "Click, fill, or press using only a data-testid or exact accessible role/name. The optional native fallback is host-disabled by default and accepts only window-relative coordinates for the isolated TaskWeaver window.",
		parameters: {
			action: {
				type: "string",
				enum: [
					"click",
					"fill",
					"press"
				],
				required: true
			},
			target: TARGET_SCHEMA,
			value: {
				type: "string",
				description: "Value for fill."
			},
			key: {
				type: "string",
				description: "Playwright key name for press."
			},
			native: {
				type: "boolean",
				description: "Use the opt-in narrow macOS native-dialog fallback."
			},
			point: {
				type: "object",
				additionalProperties: false,
				properties: {
					x: {
						type: "number",
						required: true
					},
					y: {
						type: "number",
						required: true
					}
				},
				description: "Only for native fallback: coordinates relative to the isolated TaskWeaver window, in points."
			},
			modifiers: {
				type: "array",
				items: {
					type: "string",
					enum: [
						"command",
						"control",
						"option",
						"shift"
					]
				}
			}
		},
		output: {
			schema: RESULT_SCHEMA,
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value)
			}]
		},
		async execute(args, exec) {
			const session = await requireTrustedSession(ctx, requireAgent(exec.agent));
			if (args.native === true) {
				const native = await nativeFallbackForSession(config, session);
				if (args.action === "click") {
					if (!args.point) throw new Error("Native click requires a window-relative point");
					await native.click(args.point);
				} else if (args.action === "fill") {
					if (!args.point || typeof args.value !== "string") throw new Error("Native fill requires a window-relative point and value");
					await native.fill(args.point, args.value);
				} else {
					if (typeof args.key !== "string") throw new Error("Native press requires key");
					await native.press(args.key, args.modifiers ?? []);
				}
				return {
					ok: true,
					message: `Completed native ${args.action} inside the isolated TaskWeaver window.`
				};
			}
			if (!args.target) throw new Error("Playwright UI actions require a testId or role/name target");
			const target = parseTarget(args.target);
			if (args.action === "click") await session.click(target);
			else if (args.action === "fill") {
				if (typeof args.value !== "string") throw new Error("ui_act fill requires value");
				await session.fill(target, args.value);
			} else {
				if (typeof args.key !== "string") throw new Error("ui_act press requires key");
				await session.press(target, args.key);
			}
			return {
				ok: true,
				message: `Completed ${args.action} on the selected TaskWeaver UI element.`
			};
		}
	}));
	ctx.tools.register(defineTool({
		name: "ui_screenshot",
		description: "Capture only the isolated TaskWeaver window and attach the PNG image to this result.",
		parameters: { native: {
			type: "boolean",
			description: "Capture using the opt-in macOS window-only native fallback for native dialogs."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					path: {
						type: "string",
						required: true
					},
					image: {
						type: "object",
						additionalProperties: false,
						properties: {
							attachmentId: {
								type: "string",
								required: true
							},
							mediaType: {
								type: "string",
								required: true
							},
							bytes: {
								type: "integer",
								required: true
							},
							width: {
								type: "integer",
								required: true
							},
							height: {
								type: "integer",
								required: true
							}
						}
					}
				}
			},
			render: (_args, value) => contentWithImage(value.path, value.image)
		},
		async execute(args, exec) {
			const session = await requireTrustedSession(ctx, requireAgent(exec.agent));
			let screenshotPath;
			if (args.native === true) {
				const native = await nativeFallbackForSession(config, session);
				screenshotPath = session.screenshotPath("native-window");
				await native.screenshot(screenshotPath);
			} else screenshotPath = await session.screenshot();
			const image = await attachScreenshot(ctx, screenshotPath);
			return {
				path: screenshotPath,
				image
			};
		}
	}));
	ctx.tools.register(defineTool({
		name: "ui_check",
		description: "Run up to 20 visible/text assertions against the isolated TaskWeaver UI and capture evidence screenshots for each step.",
		parameters: { assertions: {
			type: "array",
			required: true,
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					kind: {
						type: "string",
						enum: ["visible", "text"],
						required: true
					},
					target: {
						...TARGET_SCHEMA,
						required: true
					},
					text: {
						type: "string",
						description: "Expected substring for text assertion."
					}
				}
			}
		} },
		output: {
			schema: RESULT_SCHEMA,
			render: (_args, value) => {
				const results = Array.isArray(value.results) ? value.results : [];
				const passed = results.filter((result) => result.passed === true).length;
				const failed = results.length - passed;
				const content = [{
					type: "text",
					text: `TaskWeaver UI 验证${value.passed === true ? "通过" : "失败"}：${passed} 项通过，${failed} 项失败。\n` + results.map((result, index) => `${index + 1}. ${result.kind ?? "断言"} ${result.passed === true ? "通过" : `失败：${String(result.error ?? "未知错误")}`}`).join("\n") + (Array.isArray(value.errors) && value.errors.length > 0 ? `\n控制台错误：\n${value.errors.map(String).join("\n")}` : "")
				}];
				for (const result of results) if (result.image && typeof result.image === "object" && "attachmentId" in result.image) content.push({
					type: "image",
					attachment: result.image
				});
				return content;
			}
		},
		async execute(args, exec) {
			const session = await requireTrustedSession(ctx, requireAgent(exec.agent));
			const assertions = args.assertions.map((assertion) => ({
				kind: assertion.kind,
				target: parseTarget(assertion.target),
				...assertion.text === void 0 ? {} : { text: assertion.text }
			}));
			const results = await session.check(assertions);
			const attachedResults = await Promise.all(results.map(async (result) => {
				if (!result.screenshot) return result;
				try {
					return {
						...result,
						image: await attachScreenshot(ctx, result.screenshot)
					};
				} catch (error) {
					return {
						...result,
						attachmentError: error instanceof Error ? error.message : String(error)
					};
				}
			}));
			return {
				ok: attachedResults.every((result) => result.passed),
				passed: attachedResults.every((result) => result.passed),
				results: attachedResults,
				errors: session.consoleErrors()
			};
		}
	}));
	ctx.tools.register(defineTool({
		name: "ui_close",
		description: "Close the isolated TaskWeaver UI verification process and record its output directory.",
		parameters: {},
		output: {
			schema: RESULT_SCHEMA,
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value)
			}]
		},
		async execute(_args, exec) {
			const session = await closeSession(requireAgent(exec.agent));
			if (!session) return {
				ok: true,
				message: "No UI verification instance is running."
			};
			return {
				ok: true,
				message: "Isolated TaskWeaver UI verification instance closed.",
				artifactsDir: session.artifactsDir
			};
		}
	}));
	ctx.on("agent/disposed", ({ agent }) => {
		approvedSessionRoots.delete(sessionKey(agent));
		closeSession(agent).catch((error) => {
			ctx.logger("tool-ui-verify").warn("Failed to close UI verification app during agent disposal", error);
		});
	});
}
//#endregion
export { Config, apply, inject, name };
