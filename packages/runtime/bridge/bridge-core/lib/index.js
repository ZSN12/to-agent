import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { LlmError } from "@taskweaver/dsh-llm";
//#region lib/types/types.js
/**
* TaskWeaver model bridge — shared types for in-process provider backends.
* @module @taskweaver/dsh-bridge-core/types
*/
const BUILTIN_BRIDGE_KINDS = Object.freeze({
	CURSOR: "cursor",
	GOOGLE_ANTIGRAVITY: "google-antigravity",
	OPENAI_COMPAT_RELAY: "openai-compat-relay"
});
//#endregion
//#region lib/types/backends/pending.js
/**
* Placeholder backend until opencodex transport is wired in-process per kind.
* @module @taskweaver/dsh-bridge-core/backends/pending
*/
function createPendingBridgeBackend(kind) {
	return {
		kind,
		async *stream(_context) {
			throw new LlmError(`TaskWeaver 模型桥「${kind}」的内置传输尚未接入（方案 C 进行中）。 过渡期请继续使用 models.json 中的 loopback 提供方（如 opencodex + baseUrl）， 或配置 api: "openai-compat" 的直连 API。`, "BRIDGE_BACKEND_PENDING");
		}
	};
}
//#endregion
//#region lib/types/registry.js
/**
* @module @taskweaver/dsh-bridge-core/registry
*/
var __rewriteRelativeImportExtension = function(path, preserveJsx) {
	if (typeof path === "string" && /^\.\.?\//.test(path)) return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
		return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
	});
	return path;
};
const backends = /* @__PURE__ */ new Map();
const warnedLegacyRuntimeEnv = /* @__PURE__ */ new Set();
/** Resolve the runtime root while keeping the former env spellings read-only for one release. */
function resolveBridgeRuntimeRoot(env = process.env, warn = (message) => console.warn(message)) {
	const canonical = env.TASKWEAVER_RUNTIME?.trim();
	let fallback;
	for (const legacyName of ["TASKWEAVER_Z_RUNTIME", "TASKWEAVER_DSH_RUNTIME"]) {
		const value = env[legacyName]?.trim();
		if (!value) continue;
		if (!warnedLegacyRuntimeEnv.has(legacyName)) {
			warnedLegacyRuntimeEnv.add(legacyName);
			warn(`[TaskWeaver] ${legacyName} 已弃用，请改用 TASKWEAVER_RUNTIME。`);
		}
		fallback ??= value;
	}
	return canonical || fallback;
}
function registerBridgeBackend(backend) {
	backends.set(backend.kind, backend);
}
function getBridgeBackend(kind) {
	const hit = backends.get(kind);
	if (hit) return hit;
	return createPendingBridgeBackend(kind);
}
async function* streamThroughBridge(context) {
	yield* getBridgeBackend(context.profile.bridgeKind).stream(context);
}
function installDefaultBridgeBackends() {
	for (const kind of [
		"cursor",
		"google-antigravity",
		"openai-compat-relay"
	]) if (!backends.has(kind)) registerBridgeBackend(createPendingBridgeBackend(kind));
}
function transportModuleCandidates() {
	const fromEnv = process.env.TASKWEAVER_BRIDGE_TRANSPORT?.trim();
	if (fromEnv) return [fromEnv];
	const runtimeRoot = resolveBridgeRuntimeRoot();
	if (runtimeRoot) {
		const staged = join(runtimeRoot, "electron-vendor", "taskweaver-bridge-transport", "index.mjs");
		return [pathToFileURL(staged).href];
	}
	return [
		"../../../../../../packages/provider-bridge-transport/index.mjs",
		"../../../../../../../packages/provider-bridge-transport/index.mjs",
		"../../../../../electron-vendor/taskweaver-bridge-transport/index.mjs",
		"../../../../electron-vendor/taskweaver-bridge-transport/index.mjs"
	];
}
/** Best-effort load of repo-root transport package; returns false when absent. */
async function installTaskWeaverTransportBackends() {
	for (const rel of transportModuleCandidates()) try {
		const mod = await import(__rewriteRelativeImportExtension(new URL(rel, import.meta.url).href));
		if (typeof mod.installBridgeTransportBackends === "function") {
			mod.installBridgeTransportBackends({ registerBridgeBackend });
			return true;
		}
	} catch {}
	return false;
}
//#endregion
export { BUILTIN_BRIDGE_KINDS, createPendingBridgeBackend, getBridgeBackend, installDefaultBridgeBackends, installTaskWeaverTransportBackends, registerBridgeBackend, streamThroughBridge };
