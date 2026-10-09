import z from "@z/schemastery";
import { defineTool } from "@z/dsh-tools";
import { Buffer } from "node:buffer";
//#region lib/types/macos.js
/**
* macOS desktop backend: capture the screen and inject real input events
* (cursor, mouse, keyboard) through `osascript -l JavaScript` (JXA + the
* CoreGraphics/AppKit ObjC bridge) and `screencapture`. The whole OS boundary
* is behind an injectable `RunCommand` so REAL-composition tests can stub only
* this seam.
* @module @z/dsh-tool-desktop
*/
const JS_PREFIX = "ObjC.import(\"CoreGraphics\");ObjC.import(\"AppKit\");";
/** Turn a JXA expression that returns a JS string into an -e argument. */
function jxa(expression) {
	return `-l JavaScript -e '${JS_PREFIX}${expression}'`;
}
/** Quote one value as a POSIX shell single-quoted word. */
function shellSingleQuote(value) {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
/** Common keys to macOS virtual keycodes (ANSI layout). */
const KEYCODES = {
	return: 36,
	enter: 76,
	tab: 48,
	space: 49,
	delete: 51,
	escape: 53,
	"left": 123,
	right: 124,
	down: 125,
	up: 126,
	home: 115,
	end: 119,
	pageup: 116,
	pagedown: 121,
	a: 0,
	b: 11,
	c: 8,
	d: 2,
	e: 14,
	f: 3,
	g: 5,
	h: 4,
	j: 38,
	k: 40,
	l: 37,
	m: 46,
	n: 45,
	o: 31,
	p: 35,
	q: 12,
	r: 15,
	s: 1,
	t: 17,
	u: 32,
	v: 9,
	w: 13,
	x: 7,
	y: 16,
	z: 6,
	"0": 29,
	"1": 18,
	"2": 19,
	"3": 20,
	"4": 21,
	"5": 23,
	"6": 22,
	"7": 26,
	"8": 28,
	"9": 25
};
/** macOS CGEvent modifier-flag bits. */
function modifierFlags(mods) {
	let flags = 0;
	for (const m of mods) {
		if (m === "command") flags |= 1048576;
		if (m === "control") flags |= 262144;
		if (m === "option") flags |= 524288;
		if (m === "shift") flags |= 131072;
	}
	return flags;
}
/**
* macOS driver shelling out to `osascript` and `screencapture`.
* @param run - command runner (subprocess / ctx.shell), injected for testability
* @returns a desktop driver over the OS boundary
*/
function macosDriver(run) {
	const screenshot = async (path) => {
		await run(`screencapture -x ${shellSingleQuote(path)}`);
		const [width, height] = (await run(jxa("const id=$.CGMainDisplayID();String($.CGDisplayPixelsWide(id))+\",\"+String($.CGDisplayPixelsHigh(id));"))).split(",").map((s) => Math.round(Number(s)));
		return {
			path,
			width: width || 0,
			height: height || 0
		};
	};
	const cursorPosition = async () => {
		try {
			const parts = (await run(jxa("const e=$.CGEventCreate($());const l=$.CGEventGetLocation(e);String(l.x)+\",\"+String(l.y);"))).split(",");
			const x = Number(parts[0]);
			const y = Number(parts[1]);
			if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
			return {
				x,
				y
			};
		} catch {
			return null;
		}
	};
	const frontmostBundleId = async () => {
		try {
			return (await run(`-l JavaScript -e 'ObjC.import("AppKit");const ws=$.NSWorkspace.sharedWorkspace;ws.frontmostApplication.bundleIdentifier.js;'`)).trim() || null;
		} catch {
			return null;
		}
	};
	const mouse = async (plan) => {
		const target = plan.point;
		if (plan.gesture === "move" && target) {
			await run(jxa(`const t=$.CGPointMake(${target.x},${target.y});const m=$.CGEventCreateMouseEvent($(),$.kCGEventMouseMoved,t,$.kCGMouseButtonLeft);$.CGEventPost($.kCGHIDEventTap,m);`));
			return;
		}
		if ((plan.gesture === "click" || plan.gesture === "double_click") && target) {
			const count = plan.gesture === "double_click" ? 2 : 1;
			for (let i = 0; i < count; i++) await run(jxa(`const t=$.CGPointMake(${target.x},${target.y});const d=$.CGEventCreateMouseEvent($(),$.kCGEventLeftMouseDown,t,$.kCGMouseButtonLeft);const u=$.CGEventCreateMouseEvent($(),$.kCGEventLeftMouseUp,t,$.kCGMouseButtonLeft);$.CGEventPost($.kCGHIDEventTap,d);$.CGEventPost($.kCGHIDEventTap,u);`));
			return;
		}
		if (plan.gesture === "scroll") {
			await run(jxa(`const e=$.CGEventCreateScrollWheelEvent($(),$.kCGScrollEventUnitLine,1,${plan.deltaY ?? 0},0);$.CGEventPost($.kCGHIDEventTap,e);`));
			return;
		}
		if (plan.gesture === "drag" && target) {
			await run(jxa(`const t=$.CGPointMake(${target.x},${target.y});const m=$.CGEventCreateMouseEvent($(),$.kCGEventLeftMouseDragged,t,$.kCGMouseButtonLeft);$.CGEventPost($.kCGHIDEventTap,m);`));
			return;
		}
	};
	const keyboard = async (plan) => {
		if (plan.gesture === "type" && plan.text !== void 0) {
			await run(jxa(`const d=$.NSData.alloc.initWithBase64EncodedStringOptions('${Buffer.from(plan.text, "utf8").toString("base64")}',0);const s=$.NSString.alloc.initWithDataEncoding(d,4);const e=$.CGEventCreateKeyboardEvent($(),0,true);$.CGEventKeyboardSetUnicodeString(e,s.length,s);$.CGEventPost($.kCGHIDEventTap,e);const u=$.CGEventCreateKeyboardEvent($(),0,false);$.CGEventPost($.kCGHIDEventTap,u);`));
			return;
		}
		if ((plan.gesture === "key_combo" || plan.gesture === "shortcut") && plan.key !== void 0) {
			const keyCode = KEYCODES[plan.key.toLowerCase()];
			if (keyCode === void 0) throw new Error(`desktop: unsupported key "${plan.key}" for macOS key_combo`);
			const modFlags = modifierFlags(plan.modifiers ?? []);
			await run(jxa(`const d=$.CGEventCreateKeyboardEvent($(),${keyCode},true);d.setIntegerValueField($.kCGKeyboardEventKeycode,${keyCode});d.flags=${modFlags};$.CGEventPost($.kCGHIDEventTap,d);const u=$.CGEventCreateKeyboardEvent($(),${keyCode},false);u.setIntegerValueField($.kCGKeyboardEventKeycode,${keyCode});u.flags=${modFlags};$.CGEventPost($.kCGHIDEventTap,u);`));
			return;
		}
	};
	return {
		screenshot,
		cursorPosition,
		frontmostBundleId,
		mouse,
		keyboard
	};
}
//#endregion
//#region lib/types/motion.js
/**
* Humanized cursor-path generation: turn a straight move into a series of
* intermediate points that read like a person moving a mouse — a slight curve,
* ease-in-out pacing, and small sub-pixel wobble — each with a per-step delay.
* Pure functions over the primary display; a seeded RNG keeps output
* reproducible for tests.
* @module @z/dsh-tool-desktop
*/
/**
* Default RNG (mulberry32) with an injectable seed.
* @param seed - any 32-bit integer; the same seed replays the same sequence
* @returns a deterministic pseudo-random source over [0, 1)
*/
function mulberry32(seed) {
	let a = seed >>> 0;
	return { next() {
		a += 1831565813;
		let t = a;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	} };
}
/**
* Evaluate a cubic bezier at t in [0,1] given control points p1/p2 between the
* start and end anchors. The anchors come first so the curve is anchored on
* `start`/`end` while the controls only shape the interior.
* @param start - the fixed start anchor
* @param end - the fixed end anchor
* @param c1 - first control point
* @param c2 - second control point
* @param t - parametric position in [0,1]
* @returns the bezier point at parameter `t`
*/
function cubicBezier(start, end, c1, c2, t) {
	const u = 1 - t;
	const a = u * u * u;
	const b = 3 * u * u * t;
	const c = 3 * u * t * t;
	const d = t * t * t;
	return {
		x: a * start.x + b * c1.x + c * c2.x + d * end.x,
		y: a * start.y + b * c1.y + c * c2.y + d * end.y
	};
}
/**
* Ease-in-out (smoothstep) pacing for a parameter t in [0,1].
* @param t - linear parameter in [0,1]
* @returns the eased value, also in [0,1]
*/
function easeInOut(t) {
	return t * t * (3 - 2 * t);
}
/**
* Build two control points for a subtle natural curve: each sits near the
* straight-line midpoint, offset perpendicular by a random fraction of the
* chord length (a random split keeps the curve slightly asymmetric). The two
* points straddle the line in the same perpendicular direction so the cursor
* arcs rather than zig-zags.
*/
function controlPoints(start, end, rng) {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const len = Math.hypot(dx, dy);
	const px = len === 0 ? 0 : -dy / len;
	const py = len === 0 ? 0 : dx / len;
	const amp = len * (.08 + .07 * rng.next()) * (rng.next() < .5 ? -1 : 1);
	const midX = (start.x + end.x) / 2;
	const midY = (start.y + end.y) / 2;
	const split = .3 + .4 * rng.next();
	const c1 = {
		x: midX + px * amp,
		y: midY + py * amp
	};
	const c2 = {
		x: midX + px * amp,
		y: midY + py * amp
	};
	c1.x += (start.x - midX) * .2;
	c1.y += (start.y - midY) * .2;
	c2.x += (end.x - midX) * .2 * split;
	c2.y += (end.y - midY) * .2 * split;
	return [c1, c2];
}
/**
* Plan a humanized cursor move from `start` to `end`.
*
* The path is sampled at a fixed step interval so each returned step carries a
* per-step delay; pacing follows ease-in-out (slow start and end, faster
* middle) and each sample gets a sub-pixel jitter to read as a hand rather
* than a teleport. The final point is exactly `end`.
* @param start - the starting cursor position
* @param end - the destination
* @param durationMs - total move duration
* @param rng - random source for curve/jitter
* @returns ordered steps, each with its own delay before firing
*/
function planHumanizedMove(start, end, durationMs, rng) {
	const [c1, c2] = controlPoints(start, end, rng);
	const totalSteps = Math.max(1, Math.round(durationMs / 10));
	const steps = [];
	for (let i = 0; i < totalSteps; i++) {
		const raw = cubicBezier(start, end, c1, c2, easeInOut(i / totalSteps));
		const jitter = .5 * (rng.next() * 2 - 1);
		const x = i === totalSteps - 1 ? end.x : i === 0 ? start.x : raw.x + jitter;
		const y = i === totalSteps - 1 ? end.y : i === 0 ? start.y : raw.y + jitter;
		const delayMs = i === 0 ? 0 : i === totalSteps - 1 ? Math.max(0, durationMs - (totalSteps - 2) * 10) : 10;
		steps.push({
			x,
			y,
			delayMs
		});
	}
	return steps;
}
//#endregion
//#region lib/types/desktop.js
/**
* Desktop orchestration: turn a model-facing action into a policy-checked,
* approval-gated, humanized series of injected OS events. The motion planning
* is pure; the approver (policy + approval waterfall) and the driver (OS) are
* injected seams, so tests stub only those two boundaries.
* @module @z/dsh-tool-desktop
*/
/**
* Build the desktop service over a driver, an approver, and a seeded RNG for
* reproducible humanized motion. Every action first resolves the frontmost
* bundle id, asks the approver (on behalf of `agent`), and only on approval
* drives the OS.
* @param driver - the OS backend
* @param approver - resolves policy + approval for a target action
* @param agent - the agent on whose behalf actions are approved and audited
* @param durationMs - default humanized move duration
* @param seed - RNG seed for reproducible paths
* @returns the desktop service bound to `agent`
*/
function createDesktopService(driver, approver, agent, durationMs = 400, seed = 1) {
	const rng = mulberry32(seed);
	const audit = (kind, bundleId, outcome) => {
		agent.session.append("desktop/action", {
			kind,
			...bundleId !== null ? { bundleId } : {},
			outcome
		});
	};
	const authorize = async (bundleId, action) => {
		const decision = await approver(agent, bundleId, action);
		if (!decision.ok) return decision;
		return { ok: true };
	};
	const move = async (target) => {
		const bundleId = await driver.frontmostBundleId();
		const auth = await authorize(bundleId, "move");
		if (!auth.ok) {
			audit("move", bundleId, "denied");
			return {
				kind: "denied",
				reason: auth.reason
			};
		}
		const start = await driver.cursorPosition();
		const path = start ? planHumanizedMove(start, target, durationMs, rng) : [{
			...target,
			delayMs: 0
		}];
		for (const step of path) {
			if (step.delayMs > 0) await new Promise((r) => setTimeout(r, step.delayMs));
			await driver.mouse({
				gesture: "move",
				point: {
					x: step.x,
					y: step.y
				}
			});
		}
		audit("move", bundleId, "applied");
		return { kind: "ok" };
	};
	const click = async (point, double = false) => {
		const kind = double ? "double_click" : "click";
		const bundleId = await driver.frontmostBundleId();
		const auth = await authorize(bundleId, kind);
		if (!auth.ok) {
			audit(kind, bundleId, "denied");
			return {
				kind: "denied",
				reason: auth.reason
			};
		}
		await move(point);
		await driver.mouse({
			gesture: kind,
			point
		});
		audit(kind, bundleId, "applied");
		return { kind: "ok" };
	};
	const scroll = async (deltaY) => {
		const bundleId = await driver.frontmostBundleId();
		const auth = await authorize(bundleId, "scroll");
		if (!auth.ok) {
			audit("scroll", bundleId, "denied");
			return {
				kind: "denied",
				reason: auth.reason
			};
		}
		await driver.mouse({
			gesture: "scroll",
			deltaY
		});
		audit("scroll", bundleId, "applied");
		return { kind: "ok" };
	};
	const type = async (text) => {
		const bundleId = await driver.frontmostBundleId();
		const auth = await authorize(bundleId, "type");
		if (!auth.ok) {
			audit("type", bundleId, "denied");
			return {
				kind: "denied",
				reason: auth.reason
			};
		}
		await driver.keyboard({
			gesture: "type",
			text
		});
		audit("type", bundleId, "applied");
		return { kind: "ok" };
	};
	const keyCombo = async (key, modifiers) => {
		const bundleId = await driver.frontmostBundleId();
		const auth = await authorize(bundleId, "key_combo");
		if (!auth.ok) {
			audit("key_combo", bundleId, "denied");
			return {
				kind: "denied",
				reason: auth.reason
			};
		}
		await driver.keyboard({
			gesture: "key_combo",
			key,
			...modifiers !== void 0 ? { modifiers } : {}
		});
		audit("key_combo", bundleId, "applied");
		return { kind: "ok" };
	};
	const screenshot = async (path) => {
		const bundleId = await driver.frontmostBundleId();
		const auth = await authorize(bundleId, "screenshot");
		if (!auth.ok) {
			audit("screenshot", bundleId, "denied");
			throw new Error(auth.reason);
		}
		const plan = await driver.screenshot(path);
		audit("screenshot", bundleId, "applied");
		return plan;
	};
	return {
		screenshot,
		cursorPosition: () => driver.cursorPosition(),
		frontmostBundleId: () => driver.frontmostBundleId(),
		move,
		click,
		scroll,
		type,
		keyCombo
	};
}
//#endregion
//#region lib/types/policy.js
/**
* App-level desktop access policy: decide whether an action targeting a macOS
* bundle id is allowed, denied, or deferred, by matching per-app rules and a
* default. Mirrors Codex's computer-use allow/deny model.
* @module @z/dsh-tool-desktop
*/
/**
* Classify a target bundle id against the policy. Rules are matched in order;
* the first matching bundle id decides. Apps with no matching rule fall back
* to `policy.default`: an `allow` default allows directly, a `deny` default
* defers to the approval waterfall (so an unmatched app is asked, not silently
* denied). An explicit rule is always authoritative.
* @param policy - the active access policy
* @param bundleId - the macOS bundle id of the target app
* @returns the access verdict: `allow`, `deny`, or `defer` (needs approval)
*/
function classifyDesktopAccess(policy, bundleId) {
	for (const rule of policy.rules) if (rule.bundleId === bundleId) return rule.access;
	return policy.default === "allow" ? "allow" : "defer";
}
//#endregion
//#region lib/types/approval.js
/**
* The desktop approver: resolve a policy verdict into a go/no-go by consulting
* the `approval/request` waterfall for anything not already allowed, with an
* in-process persistent-approval cache per bundle id. Enforcement stays with
* the approval service — the approver only asks and interprets outcomes.
* @module @z/dsh-tool-desktop
*/
/** A persistent grant cache shared across approver instances in one process. */
var PersistentGrantCache = class {
	granted = /* @__PURE__ */ new Set();
	/**
	* Record a grant for a bundle id.
	* @param bundleId - the granted macOS bundle id
	*/
	grant(bundleId) {
		this.granted.add(bundleId);
	}
	/**
	* Whether a grant is currently held for a bundle id.
	* @param bundleId - the bundle id to query
	* @returns true when a grant is currently held
	*/
	has(bundleId) {
		return this.granted.has(bundleId);
	}
};
/**
* Build an approver that decides a desktop action for a target bundle id on
* behalf of an agent. A `deny` policy verdict is final and never prompts.
* Anything else consults the approval waterfall; `rejected` denies,
* `allowed-once` grants (and is cached when `persist`), and any other outcome
* fails closed to deny.
* @param options - policy, dispatcher, and gating/persistence options
* @param cache - shared persistent-grant cache (may be a fresh one)
* @returns an approver keyed on agent, bundle id, and action
*/
function createApprover(options, cache = new PersistentGrantCache()) {
	return async (agent, bundleId, action) => {
		if (!bundleId) {
			const outcome = await options.approval.request({
				agent,
				toolName: "desktop_" + action,
				reason: "No frontmost application to scope desktop access; confirm the action."
			});
			if (outcome === "allowed-once") return { ok: true };
			return {
				ok: false,
				reason: `desktop: not approved (${outcome})`
			};
		}
		const verdict = classifyDesktopAccess(options.policy, bundleId);
		if (verdict === "deny") return {
			ok: false,
			reason: `desktop: access denied by policy for ${bundleId}`
		};
		if (options.persist && cache.has(bundleId)) return { ok: true };
		if (verdict === "allow" && !options.gateAllow) {
			if (options.persist) cache.grant(bundleId);
			return { ok: true };
		}
		const outcome = await options.approval.request({
			agent,
			toolName: "desktop_" + action,
			reason: `Desktop action on ${bundleId}`
		});
		if (outcome === "allowed-once") {
			if (options.persist) cache.grant(bundleId);
			return { ok: true };
		}
		return {
			ok: false,
			reason: `desktop: not approved for ${bundleId} (${outcome})`
		};
	};
}
//#endregion
//#region lib/types/index.js
/**
* Model-facing macOS desktop-control tools over a driver + approval seam:
* `desktop_screenshot`, `desktop_mouse`, `desktop_keyboard`. Every action is
* scoped to the frontmost app's bundle id, gated by an app-level access policy
* and the `approval/request` waterfall, and (for cursor moves) humanized with a
* seeded bezier path. Enforcement stays with the approval service; these tools
* only propose and interpret.
* @module @z/dsh-tool-desktop
*/
const name = "tool-desktop";
const inject = [
	"tools",
	"approval",
	"shell"
];
/** Runtime configuration schema for the desktop tool plugin. */
const Config = z.object({
	policy: z.object({
		rules: z.array(z.object({
			bundleId: z.string(),
			access: z.union([z.const("allow"), z.const("deny")])
		})),
		default: z.union([z.const("allow"), z.const("deny")]).default("deny")
	}),
	gateAllow: z.boolean().default(false),
	persistApproval: z.boolean().default(false),
	moveDurationMs: z.number().default(400)
});
/** Map a desktop outcome to a model-safe result object. */
function outcomeResult(outcome) {
	if (outcome.kind === "denied") return {
		ok: false,
		reason: outcome.reason
	};
	return { ok: true };
}
/** Build the per-call desktop service bound to the current agent. */
function serviceFor(ctx, config, agent, run, cache) {
	return createDesktopService(macosDriver(run), createApprover({
		policy: config.policy,
		approval: ctx.approval,
		...config.gateAllow === true ? { gateAllow: true } : {},
		...config.persistApproval === true ? { persist: true } : {}
	}, cache), agent, config.moveDurationMs);
}
/** A runnable command backed by the shell capability. */
function shellRunner(ctx) {
	return async (script) => {
		return (await ctx.shell.run(ctx.shell.resolve({
			command: script,
			workdir: process.cwd(),
			timeoutMs: 15e3,
			stdoutMaxBytes: 64 * 1024
		}))).stdout.text;
	};
}
function apply(ctx, config) {
	const run = shellRunner(ctx);
	const cache = new PersistentGrantCache();
	ctx.tools.register(defineTool({
		name: "desktop_screenshot",
		description: "Capture the primary display and report where the PNG was written. Use before clicking so you can see the screen.",
		parameters: { path: {
			type: "string",
			description: "Absolute path to write the PNG to, e.g. a workspace file you can read_image.",
			required: true
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					path: { type: "string" },
					width: { type: "number" },
					height: { type: "number" }
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value)
			}]
		},
		async execute(args, exec) {
			if (!exec.agent) throw new Error("desktop_screenshot requires an agent context");
			const shot = await serviceFor(ctx, config, exec.agent, run, cache).screenshot(args.path);
			return {
				path: shot.path,
				width: shot.width,
				height: shot.height
			};
		}
	}));
	ctx.tools.register(defineTool({
		name: "desktop_mouse",
		description: "Move, click, or scroll the macOS cursor. Moves are humanized (a slight curve with ease-in-out).",
		parameters: {
			action: {
				type: "string",
				required: true,
				description: "One of: move, click, double_click, scroll."
			},
			x: {
				type: "number",
				description: "Target x (display pixels). Required for move/click/double_click."
			},
			y: {
				type: "number",
				description: "Target y (display pixels). Required for move/click/double_click."
			},
			delta_y: {
				type: "number",
				description: "Vertical scroll ticks (negative = down). Required for scroll."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: { type: "boolean" },
					reason: { type: "string" }
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value)
			}]
		},
		async execute(args, exec) {
			if (!exec.agent) throw new Error("desktop_mouse requires an agent context");
			const service = serviceFor(ctx, config, exec.agent, run, cache);
			if (args.action === "move" || args.action === "click" || args.action === "double_click") {
				if (args.x === void 0 || args.y === void 0) throw new Error(`desktop_mouse ${args.action} requires x and y`);
				return outcomeResult(args.action === "move" ? await service.move({
					x: args.x,
					y: args.y
				}) : await service.click({
					x: args.x,
					y: args.y
				}, args.action === "double_click"));
			}
			if (args.action === "scroll") {
				if (args.delta_y === void 0) throw new Error("desktop_mouse scroll requires delta_y");
				return outcomeResult(await service.scroll(args.delta_y));
			}
			throw new Error(`desktop_mouse: unknown action ${args.action}`);
		}
	}));
	ctx.tools.register(defineTool({
		name: "desktop_keyboard",
		description: "Type text or send a key combo (with optional modifiers) at the focused field.",
		parameters: {
			action: {
				type: "string",
				required: true,
				description: "One of: type, key_combo."
			},
			text: {
				type: "string",
				description: "Text to type (required for type)."
			},
			key: {
				type: "string",
				description: "Key for a combo (required for key_combo). Common keys: return, tab, escape, arrow keys, a-z, 0-9."
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
				},
				description: "Modifier keys held during a key_combo."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: { type: "boolean" },
					reason: { type: "string" }
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value)
			}]
		},
		async execute(args, exec) {
			if (!exec.agent) throw new Error("desktop_keyboard requires an agent context");
			const service = serviceFor(ctx, config, exec.agent, run, cache);
			if (args.action === "type") {
				if (args.text === void 0) throw new Error("desktop_keyboard type requires text");
				return outcomeResult(await service.type(args.text));
			}
			if (args.action === "key_combo") {
				if (args.key === void 0) throw new Error("desktop_keyboard key_combo requires key");
				return outcomeResult(await service.keyCombo(args.key, args.modifiers));
			}
			throw new Error(`desktop_keyboard: unknown action ${args.action}`);
		}
	}));
}
//#endregion
export { Config, apply, inject, name };
